const net = require('net');
const tls = require('tls');
const url = require('url');
const http = require('http');
const https = require('https');
const { pipeline } = require('stream');
const { InterceptorResult } = require('../../types/InterceptorTypes');
const ConnectionPoolManager = require('../proxy/ConnectionPoolManager');

/**
 * 连接处理引擎
 * 负责处理HTTPS CONNECT请求的核心逻辑
 */
class ConnectEngine {
    constructor(options = {}) {
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        this.middlewareManager = options.middlewareManager;
        this.interceptorManager = options.interceptorManager;
        this.tlsManager = options.tlsManager;
        
        // 连接选项
        this.timeout = options.timeout || 30000;
        this.keepAlive = options.keepAlive !== false;
        
        // 连接池管理器
        this.connectionPool = new ConnectionPoolManager({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            maxSockets: options.maxSockets || 256,
            maxFreeSockets: options.maxFreeSockets || 256,
            timeout: this.timeout,
            keepAlive: this.keepAlive,
            keepAliveMsecs: options.keepAliveMsecs || 1000,
            proxy: options.proxy,
            proxyAuth: options.proxyAuth
        });
        
        // 代理转发配置
        this.proxyConfig = null;
        if (options.proxy) {
            try {
                const proxyUrl = new URL(options.proxy);
                this.proxyConfig = {
                    url: options.proxy,
                    hostname: proxyUrl.hostname,
                    port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
                    protocol: proxyUrl.protocol,
                    auth: options.proxyAuth || proxyUrl.username ? 
                        `${proxyUrl.username}:${proxyUrl.password}` : null,
                    enabled: true
                };
            } catch (error) {
                this.logger.warn('Invalid proxy URL, proxy disabled', { proxy: options.proxy, error: error.message });
                this.proxyConfig = null;
            }
        }
        this.proxyAuth = options.proxyAuth;
        
        // 活跃连接跟踪
        this.activeConnections = new Map();
        this.connectionId = 0;
    }
    
    /**
     * 处理CONNECT请求
     */
    async handle(context) {
        const startTime = Date.now();
        
        try {
            // 解析目标地址
            const target = this._parseTarget(context.request.url);
            if (!target) {
                throw new Error('Invalid CONNECT target');
            }
            
            context.target = target;
            
            // 执行中间件（连接前）
            if (this.middlewareManager) {
                await this.middlewareManager.executeBeforeConnect(context);
                if (context.stopped) return;
            }
            
            // 检查拦截器
            if (this.interceptorManager) {
                const shouldIntercept = await this.interceptorManager.shouldInterceptConnect(context);
                if (shouldIntercept) {
                    await this.interceptorManager.interceptConnect(context);
                    
                    // 处理拦截器响应
                    if (context.interceptorResult) {
                        const result = context.interceptorResult;
                        
                        if (result.shouldDirectResponse()) {
                            // 直接返回拦截器内容
                            await this._handleDirectConnectResponse(context, result);
                            context.markIntercepted();
                            return;
                        } else if (result.shouldModifyAndForward()) {
                            // 修改连接参数后转发
                            this._applyConnectModifications(context, result);
                            context.markIntercepted();
                        }
                    } else {
                        // 兼容旧的拦截方式
                        await this._handleInterceptedConnect(context);
                        return;
                    }
                    
                    if (context.stopped) return;
                }
            }
            
            // 建立隧道连接
            await this._establishTunnel(context);
            
            // 执行中间件（连接后）
            if (this.middlewareManager) {
                await this.middlewareManager.executeAfterConnect(context);
            }
            
        } catch (error) {
            context.error = error;
            await this._handleError(context, error);
        } finally {
            // 记录处理时间
            const duration = Date.now() - startTime;
            if (this.logger) {
                this.logger.debug('CONNECT processed', {
                    target: context.target ? `${context.target.hostname}:${context.target.port}` : 'unknown',
                    duration,
                    intercepted: context.intercepted
                });
            }
        }
    }
    
    /**
     * 解析CONNECT目标
     */
    _parseTarget(url) {
        try {
            if (!url || typeof url !== 'string') {
                return null;
            }
            const [hostname, port] = url.split(':');
            return {
                hostname: hostname.trim(),
                port: parseInt(port) || 443
            };
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 处理被拦截的CONNECT请求
     */
    async _handleInterceptedConnect(context) {
        try {
            if (!this.tlsManager) {
                throw new Error('TLS manager not available for HTTPS interception');
            }
            
            // 获取或创建伪造证书
            const serverOptions = await this.tlsManager.getServerOptions(context.target.hostname);
            
            // 发送连接成功响应
            context.socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            
            // 创建TLS服务器
            const tlsServer = tls.createServer(serverOptions);
            
            // 处理TLS连接
            tlsServer.on('secureConnection', (tlsSocket) => {
                this._handleSecureConnection(context, tlsSocket);
            });
            
            tlsServer.on('error', (error) => {
                if (this.logger) {
                    this.logger.error('TLS server error', { error: error.message });
                }
                context.socket.destroy();
            });
            
            // 将客户端socket连接到TLS服务器
            tlsServer.emit('connection', context.socket);
            
            context.markIntercepted();
            
        } catch (error) {
            throw new Error(`Failed to intercept HTTPS connection: ${error.message}`);
        }
    }
    
    /**
     * 处理安全连接
     */
    _handleSecureConnection(context, tlsSocket) {
        // 跟踪连接
        this.activeConnections.add(tlsSocket);
        
        // 设置超时
        tlsSocket.setTimeout(this.timeout);
        
        // 处理TLS socket上的HTTP请求
        tlsSocket.on('data', (data) => {
            this._handleTlsData(context, tlsSocket, data);
        });
        
        tlsSocket.on('error', (error) => {
            if (this.logger) {
                this.logger.debug('TLS socket error', { error: error.message });
            }
            this._cleanupConnection(tlsSocket);
        });
        
        tlsSocket.on('close', () => {
            this._cleanupConnection(tlsSocket);
        });
        
        tlsSocket.on('timeout', () => {
            if (this.logger) {
                this.logger.debug('TLS socket timeout');
            }
            tlsSocket.destroy();
        });
    }
    
    /**
     * 处理TLS数据
     */
    _handleTlsData(context, tlsSocket, data) {
        try {
            // 这里可以解析HTTP请求并进行拦截处理
            // 简化实现：直接转发到目标服务器
            this._forwardTlsData(context, tlsSocket, data);
        } catch (error) {
            if (this.logger) {
                this.logger.error('Error handling TLS data', { error: error.message });
            }
            tlsSocket.destroy();
        }
    }
    
    /**
     * 转发TLS数据
     */
    _forwardTlsData(context, clientSocket, data) {
        // 创建到目标服务器的连接
        if (!context.targetSocket) {
            context.targetSocket = tls.connect({
                host: context.target.hostname,
                port: context.target.port,
                rejectUnauthorized: false
            });
            
            context.targetSocket.on('connect', () => {
                // 建立双向数据转发
                pipeline(clientSocket, context.targetSocket, () => {});
                pipeline(context.targetSocket, clientSocket, () => {});
            });
            
            context.targetSocket.on('error', (error) => {
                if (this.logger) {
                    this.logger.error('Target socket error', { error: error.message });
                }
                clientSocket.destroy();
            });
        }
        
        // 转发数据
        if (context.targetSocket.writable) {
            context.targetSocket.write(data);
        }
    }
    
    /**
     * 建立隧道连接
     */
    async _establishTunnel(context) {
        return new Promise((resolve, reject) => {
            let targetSocket;
            
            // 如果配置了代理转发，通过代理建立连接
            if (this.proxyConfig) {
                this._establishProxyTunnel(context)
                    .then((socket) => {
                        targetSocket = socket;
                        this._setupTunnelConnection(context, targetSocket, resolve, reject);
                    })
                    .catch(reject);
            } else {
                // 直接连接到目标服务器
                targetSocket = net.createConnection({
                    host: context.target.hostname,
                    port: context.target.port,
                    timeout: this.timeout
                });
                
                this._setupTunnelConnection(context, targetSocket, resolve, reject);
            }
        });
    }
    
    /**
     * 建立代理隧道连接
     */
    async _establishProxyTunnel(context) {
        return new Promise((resolve, reject) => {
            const proxySocket = net.createConnection({
                host: this.proxyConfig.host,
                port: this.proxyConfig.port,
                timeout: this.timeout
            });
            
            proxySocket.on('connect', () => {
                // 发送CONNECT请求到代理服务器
                let connectRequest = `CONNECT ${context.target.hostname}:${context.target.port} HTTP/1.1\r\n`;
                connectRequest += `Host: ${context.target.hostname}:${context.target.port}\r\n`;
                
                // 添加代理认证
                if (this.proxyAuth) {
                    const auth = Buffer.from(`${this.proxyAuth.username}:${this.proxyAuth.password}`).toString('base64');
                    connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
                }
                
                connectRequest += '\r\n';
                proxySocket.write(connectRequest);
            });
            
            proxySocket.on('data', (data) => {
                const response = data.toString();
                if (response.startsWith('HTTP/1.1 200')) {
                    // 代理连接成功
                    resolve(proxySocket);
                } else {
                    // 代理连接失败
                    proxySocket.destroy();
                    reject(new Error(`Proxy connection failed: ${response.split('\r\n')[0]}`));
                }
            });
            
            proxySocket.on('error', (error) => {
                reject(new Error(`Proxy connection error: ${error.message}`));
            });
            
            proxySocket.on('timeout', () => {
                proxySocket.destroy();
                reject(new Error('Proxy connection timeout'));
            });
        });
    }
    
    /**
     * 设置隧道连接
     */
    _setupTunnelConnection(context, targetSocket, resolve, reject) {
        // 跟踪连接
        this.activeConnections.add(targetSocket);
        this.activeConnections.add(context.socket);
        
        targetSocket.on('connect', () => {
            try {
                // 发送连接成功响应
                context.socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                
                // 建立双向数据转发
                this._setupTunnelPipes(context.socket, targetSocket);
                
                resolve();
            } catch (error) {
                reject(error);
            }
        });
        
        targetSocket.on('error', (error) => {
            this._cleanupConnection(targetSocket);
            reject(error);
        });
        
        targetSocket.on('timeout', () => {
            targetSocket.destroy();
            reject(new Error('Connection timeout'));
        });
        
        // 处理客户端socket错误
        context.socket.on('error', (error) => {
            this._cleanupConnection(context.socket);
            targetSocket.destroy();
        });
        
        context.socket.on('close', () => {
            this._cleanupConnection(context.socket);
            targetSocket.destroy();
        });
    }
    
    /**
     * 设置隧道管道
     */
    _setupTunnelPipes(clientSocket, targetSocket) {
        // 客户端到目标服务器
        pipeline(
            clientSocket,
            targetSocket,
            (error) => {
                if (error && this.logger) {
                    this.logger.debug('Client to target pipe error', { error: error.message });
                }
                this._cleanupTunnel(clientSocket, targetSocket);
            }
        );
        
        // 目标服务器到客户端
        pipeline(
            targetSocket,
            clientSocket,
            (error) => {
                if (error && this.logger) {
                    this.logger.debug('Target to client pipe error', { error: error.message });
                }
                this._cleanupTunnel(clientSocket, targetSocket);
            }
        );
    }
    
    /**
     * 清理隧道连接
     */
    _cleanupTunnel(clientSocket, targetSocket) {
        this._cleanupConnection(clientSocket);
        this._cleanupConnection(targetSocket);
    }
    
    /**
     * 清理连接
     */
    _cleanupConnection(socket) {
        if (socket) {
            this.activeConnections.delete(socket);
            if (!socket.destroyed) {
                socket.destroy();
            }
        }
    }
    
    /**
     * 处理直接连接响应
     */
    async _handleDirectConnectResponse(context, result) {
        const socket = context.socket;
        
        if (socket.destroyed) {
            if (this.logger) {
                this.logger.warn('Cannot send direct connect response, socket destroyed');
            }
            return;
        }
        
        try {
            // 设置响应状态和头部
            const statusCode = result.statusCode || 200;
            const statusText = result.statusText || (statusCode === 200 ? 'Connection Established' : 'OK');
            const headers = result.headers || {};
            
            // 构建响应
            let response = `HTTP/1.1 ${statusCode} ${statusText}\r\n`;
            
            // 添加头部
            for (const [key, value] of Object.entries(headers)) {
                response += `${key}: ${value}\r\n`;
            }
            
            response += '\r\n';
            
            // 发送响应
            socket.write(response);
            
            // 如果有响应体，发送响应体
            if (result.body) {
                if (typeof result.body === 'string') {
                    socket.write(result.body);
                } else if (Buffer.isBuffer(result.body)) {
                    socket.write(result.body);
                } else {
                    socket.write(JSON.stringify(result.body));
                }
            }
            
            // 根据状态码决定是否关闭连接
            if (statusCode !== 200) {
                socket.end();
            }
            
            if (this.logger) {
                this.logger.debug('Direct connect response sent', {
                    statusCode,
                    headers: Object.keys(headers)
                });
            }
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to send direct connect response', {
                    error: error.message
                });
            }
            socket.destroy();
        }
    }
    
    /**
     * 应用连接修改
     */
    _applyConnectModifications(context, result) {
        // 修改目标主机和端口
        if (result.modifiedHost) {
            context.target.hostname = result.modifiedHost;
            
            if (this.logger) {
                this.logger.debug('Connect target host modified', {
                    host: result.modifiedHost
                });
            }
        }
        
        if (result.modifiedPort) {
            context.target.port = result.modifiedPort;
            
            if (this.logger) {
                this.logger.debug('Connect target port modified', {
                    port: result.modifiedPort
                });
            }
        }
        
        // 修改连接选项
        if (result.modifiedOptions) {
            context.connectOptions = { ...context.connectOptions, ...result.modifiedOptions };
            
            if (this.logger) {
                this.logger.debug('Connect options modified', {
                    options: Object.keys(result.modifiedOptions)
                });
            }
        }
        
        // 存储其他修改
        if (result.modifications) {
            context.modifications = { ...context.modifications, ...result.modifications };
        }
    }
    
    /**
     * 处理错误
     */
    async _handleError(context, error) {
        if (this.logger) {
            this.logger.error('Connect engine error', {
                error: error.message,
                target: context.target ? `${context.target.hostname}:${context.target.port}` : 'unknown'
            });
        }
        
        // 发送错误响应
        if (context.socket && !context.socket.destroyed) {
            try {
                let statusCode = '502 Bad Gateway';
                
                if (error.code === 'ENOTFOUND') {
                    statusCode = '404 Not Found';
                } else if (error.code === 'ECONNREFUSED') {
                    statusCode = '503 Service Unavailable';
                } else if (error.code === 'ETIMEDOUT') {
                    statusCode = '504 Gateway Timeout';
                }
                
                context.socket.write(`HTTP/1.1 ${statusCode}\r\n\r\n`);
                context.socket.end();
            } catch (responseError) {
                // 强制关闭连接
                context.socket.destroy();
            }
        }
    }
    
    /**
     * 获取活跃连接数
     */
    getActiveConnectionCount() {
        return this.activeConnections.size;
    }
    
    /**
     * 关闭所有连接
     */
    closeAllConnections() {
        for (const socket of this.activeConnections) {
            try {
                socket.destroy();
            } catch (error) {
                // 忽略关闭错误
            }
        }
        this.activeConnections.clear();
    }
    
    /**
     * 获取代理统计信息
     */
    getProxyStats() {
        return {
            proxyConfig: this.proxyConfig,
            proxyAuth: this.proxyAuth ? '***' : null,
            connectionPool: this.connectionPool ? this.connectionPool.getStats() : null,
            timeout: this.timeout,
            keepAlive: this.keepAlive,
            activeConnections: this.activeConnections.size
        };
    }
    
    /**
     * 销毁引擎
     */
    destroy() {
        // 销毁连接池
        if (this.connectionPool) {
            this.connectionPool.destroy();
        }
        
        this.closeAllConnections();
    }
}

module.exports = ConnectEngine;