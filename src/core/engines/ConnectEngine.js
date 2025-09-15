const net = require('net');
const tls = require('tls');
const { pipeline } = require('stream');

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
        
        // 活跃连接跟踪
        this.activeConnections = new Set();
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
                    await this._handleInterceptedConnect(context);
                    return;
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
            // 创建到目标服务器的连接
            const targetSocket = net.createConnection({
                host: context.target.hostname,
                port: context.target.port,
                timeout: this.timeout
            });
            
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
     * 销毁引擎
     */
    destroy() {
        this.closeAllConnections();
    }
}

module.exports = ConnectEngine;