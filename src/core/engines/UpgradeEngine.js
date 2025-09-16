const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { pipeline } = require('stream');
const { InterceptorResult } = require('../../types/InterceptorTypes');
const ConnectionPoolManager = require('../proxy/ConnectionPoolManager');

/**
 * 升级处理引擎
 * 负责处理WebSocket升级请求的核心逻辑
 */
class UpgradeEngine {
    constructor(options = {}) {
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        this.middlewareManager = options.middlewareManager;
        this.interceptorManager = options.interceptorManager;
        this.tlsManager = options.tlsManager;
        
        // 升级选项
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
        
        // 获取优化的HTTP/HTTPS代理
        this.httpAgent = this.connectionPool.getHttpAgent();
        this.httpsAgent = this.connectionPool.getHttpsAgent();
        
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
        this.activeConnections = new Set();
        
        // WebSocket魔法字符串
        this.WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    }
    
    /**
     * 处理升级请求
     */
    async handle(context) {
        const startTime = Date.now();
        
        try {
            // 验证WebSocket升级请求
            if (!this._isValidWebSocketUpgrade(context.request)) {
                throw new Error('Invalid WebSocket upgrade request');
            }
            
            // 解析目标URL
            const target = this._parseTarget(context.request);
            if (!target) {
                throw new Error('Invalid upgrade target');
            }
            
            context.target = target;
            
            // 执行中间件（升级前）
            if (this.middlewareManager) {
                await this.middlewareManager.executeBeforeUpgrade(context);
                if (context.stopped) return;
            }
            
            // 检查拦截器
            if (this.interceptorManager) {
                const shouldIntercept = await this.interceptorManager.shouldInterceptUpgrade(context);
                if (shouldIntercept) {
                    await this.interceptorManager.interceptUpgrade(context);
                    
                    if (this.logger) {
                        this.logger.debug('After interceptor execution', {
                            hasInterceptorResult: !!context.interceptorResult,
                            interceptorResultType: typeof context.interceptorResult,
                            contextKeys: Object.keys(context)
                        });
                    }
                    
                    // 处理拦截器响应
                    if (context.interceptorResult) {
                        const result = context.interceptorResult;
                        
                        if (this.logger) {
                            this.logger.debug('Interceptor result details', {
                                hasResult: !!result,
                                resultType: typeof result,
                                hasShouldDirectResponse: result && typeof result.shouldDirectResponse === 'function',
                                hasShouldModifyAndForward: result && typeof result.shouldModifyAndForward === 'function',
                                shouldDirectResponse: result && result.shouldDirectResponse ? result.shouldDirectResponse() : false,
                                shouldModifyAndForward: result && result.shouldModifyAndForward ? result.shouldModifyAndForward() : false,
                                resultData: result ? result.result : null
                            });
                        }
                        
                        if (result && typeof result.shouldDirectResponse === 'function') {
                            if (result.shouldDirectResponse()) {
                                // 直接返回拦截器内容
                                await this._handleDirectUpgradeResponse(context, result);
                                context.intercepted = true;
                                if (context.stopped) return;
                            } else if (result.shouldModifyAndForward()) {
                                // 修改升级请求后转发
                                this._applyUpgradeModifications(context, result);
                                context.intercepted = true;
                                context.shouldForward = true;
                            }
                        } else {
                            // 兼容旧的拦截方式
                            context.intercepted = true;
                        }
                    } else {
                        // 兼容旧的拦截方式
                        context.intercepted = true;
                    }
                    
                    if (context.stopped) return;
                }
            }
            
            // 转发升级请求（如果没有直接响应）
            if (this.logger) {
                this.logger.debug('Checking forward conditions', {
                    intercepted: context.intercepted,
                    shouldForward: context.shouldForward,
                    willForward: !context.intercepted || context.shouldForward
                });
            }
            
            if (!context.intercepted || context.shouldForward) {
                await this._forwardUpgrade(context);
            } else {
                if (this.logger) {
                    this.logger.debug('Skipping forward - request was intercepted without forward flag');
                }
            }
            
            // 执行中间件（升级后）
            if (this.middlewareManager) {
                await this.middlewareManager.executeAfterUpgrade(context);
            }
            
        } catch (error) {
            context.error = error;
            await this._handleError(context, error);
        } finally {
            // 记录处理时间
            const duration = Date.now() - startTime;
            if (this.logger) {
                this.logger.debug('Upgrade processed', {
                    target: context.target ? `${context.target.protocol}//${context.target.host}${context.target.path}` : 'unknown',
                    duration,
                    intercepted: context.intercepted
                });
            }
        }
    }
    
    /**
     * 验证WebSocket升级请求
     */
    _isValidWebSocketUpgrade(request) {
        const headers = request.headers;
        
        return (
            request.method === 'GET' &&
            headers.upgrade && headers.upgrade.toLowerCase() === 'websocket' &&
            headers.connection && headers.connection.toLowerCase().includes('upgrade') &&
            headers['sec-websocket-key'] &&
            headers['sec-websocket-version']
        );
    }
    
    /**
     * 解析升级目标
     */
    _parseTarget(request) {
        try {
            let targetUrl;
            
            if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) {
                // 绝对WebSocket URL
                targetUrl = request.url;
            } else if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
                // 绝对HTTP URL，转换为WebSocket URL
                targetUrl = request.url.replace(/^http/, 'ws');
            } else {
                // 相对URL，从Host头构建
                const host = request.headers.host;
                if (!host) {
                    if (this.logger) {
                        this.logger.debug('No host header found in WebSocket upgrade request', {
                            url: request.url,
                            headers: Object.keys(request.headers)
                        });
                    }
                    return null;
                }
                
                const protocol = request.connection.encrypted ? 'wss:' : 'ws:';
                targetUrl = `${protocol}//${host}${request.url}`;
            }
            
            if (this.logger) {
                this.logger.debug('Parsing WebSocket target URL', {
                    originalUrl: request.url,
                    targetUrl: targetUrl,
                    host: request.headers.host
                });
            }
            
            const url = new URL(targetUrl);
            return {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || (url.protocol === 'wss:' ? 443 : 80),
                path: url.pathname + url.search,
                host: url.host
            };
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to parse WebSocket target URL', {
                    url: request.url,
                    host: request.headers.host,
                    error: error.message
                });
            }
            return null;
        }
    }
    
    /**
     * 转发升级请求
     */
    async _forwardUpgrade(context) {
        return new Promise((resolve, reject) => {
            const { request, socket, head, target } = context;
            
            // 准备升级请求选项
            const preparedHeaders = this._prepareUpgradeHeaders(request.headers);
            const options = {
                hostname: target.hostname,
                port: target.port,
                path: target.path,
                method: 'GET',
                headers: preparedHeaders,
                timeout: this.timeout
            };
            
            // 调试日志：记录转发的请求头
            if (this.logger) {
                this.logger.debug('Forwarding WebSocket upgrade with headers', {
                    target: `${target.protocol}//${target.host}${target.path}`,
                    headers: preparedHeaders
                });
            }
            
            // 如果配置了代理转发，修改请求选项
            if (this.proxyConfig) {
                const proxyUrl = new URL(this.proxyConfig);
                options.hostname = proxyUrl.hostname;
                options.port = proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80);
                options.path = `${target.protocol}//${target.host}${target.path}`; // 使用完整URL作为路径
                
                // 添加代理认证
                if (this.proxyAuth) {
                    options.headers['Proxy-Authorization'] = `Basic ${Buffer.from(this.proxyAuth).toString('base64')}`;
                }
                
                // 添加代理相关头部
                options.headers['Host'] = target.host;
                options.headers['Proxy-Connection'] = 'keep-alive';
                
                // 记录代理转发信息
                if (this.logger) {
                    this.logger.debug('Proxy forwarding WebSocket upgrade', {
                        target: `${target.protocol}//${target.host}${target.path}`,
                        proxy: this.proxyConfig
                    });
                }
            }
            
            // 获取连接池优化的代理
            const isHttps = (this.proxyConfig && new URL(this.proxyConfig).protocol === 'https:') || (!this.proxyConfig && target.protocol === 'wss:');
            options.agent = isHttps ? this.httpsAgent : this.httpAgent;
            
            // 选择HTTP模块
            const httpModule = isHttps ? https : http;
            
            // 创建升级请求
            const upgradeRequest = httpModule.request(options);
            
            // 处理升级响应
            upgradeRequest.on('upgrade', (res, targetSocket, targetHead) => {
                // 记录性能指标
                if (this.metrics) {
                    this.metrics.incrementCounter('websocket_upgrades_total', {
                        status: res.statusCode,
                        proxy_used: this.proxyConfig ? 'true' : 'false'
                    });
                }
                
                this._handleUpgradeResponse(context, res, targetSocket, targetHead, resolve, reject);
            });
            
            // 处理普通HTTP响应（升级失败）
            upgradeRequest.on('response', (res) => {
                reject(new Error(`Upgrade failed with status ${res.statusCode}`));
            });
            
            // 设置超时
            upgradeRequest.setTimeout(this.timeout, () => {
                upgradeRequest.destroy();
                if (this.metrics) {
                    this.metrics.incrementCounter('websocket_timeouts_total');
                }
                reject(new Error('Upgrade timeout'));
            });
            
            // 处理错误
            upgradeRequest.on('error', (error) => {
                if (this.metrics) {
                    this.metrics.incrementCounter('websocket_errors_total', {
                        error_type: error.code || 'unknown',
                        proxy_used: this.proxyConfig ? 'true' : 'false'
                    });
                }
                reject(error);
            });
            
            // 发送升级请求
            upgradeRequest.end();
        });
    }
    
    /**
     * 处理升级响应
     */
    _handleUpgradeResponse(context, res, targetSocket, targetHead, resolve, reject) {
        try {
            const { socket, head } = context;
            
            // 跟踪连接
            this.activeConnections.add(socket);
            this.activeConnections.add(targetSocket);
            
            // 转发升级响应
            const responseLines = [
                `HTTP/1.1 ${res.statusCode} ${res.statusMessage}`,
                ...Object.entries(res.headers).map(([key, value]) => `${key}: ${value}`),
                '',
                ''
            ];
            
            socket.write(responseLines.join('\r\n'));
            
            // 如果有head数据，写入到客户端
            if (head && head.length > 0) {
                socket.write(head);
            }
            
            // 如果有targetHead数据，写入到客户端（这是来自目标服务器的数据）
            if (targetHead && targetHead.length > 0) {
                socket.write(targetHead);
            }
            
            // 建立双向数据转发
            this._setupWebSocketPipes(socket, targetSocket);
            
            resolve();
            
        } catch (error) {
            reject(error);
        }
    }
    
    /**
     * 设置WebSocket管道
     */
    _setupWebSocketPipes(clientSocket, targetSocket) {
        // 客户端到目标服务器
        clientSocket.pipe(targetSocket);
        
        // 目标服务器到客户端
        targetSocket.pipe(clientSocket);
        
        // 处理管道错误
        clientSocket.on('pipe', () => {
            if (this.logger) {
                this.logger.debug('Client to target WebSocket pipe established');
            }
        });
        
        targetSocket.on('pipe', () => {
            if (this.logger) {
                this.logger.debug('Target to client WebSocket pipe established');
            }
        });
        
        // 设置超时
        clientSocket.setTimeout(this.timeout);
        targetSocket.setTimeout(this.timeout);
        
        // 处理连接事件
        clientSocket.on('error', (error) => {
            if (this.logger) {
                this.logger.debug('Client WebSocket error', { error: error.message });
            }
            this._cleanupWebSocketConnection(clientSocket, targetSocket);
        });
        
        targetSocket.on('error', (error) => {
            if (this.logger) {
                this.logger.debug('Target WebSocket error', { error: error.message });
            }
            this._cleanupWebSocketConnection(clientSocket, targetSocket);
        });
        
        clientSocket.on('timeout', () => {
            if (this.logger) {
                this.logger.debug('Client WebSocket timeout');
            }
            this._cleanupWebSocketConnection(clientSocket, targetSocket);
        });
        
        targetSocket.on('timeout', () => {
            if (this.logger) {
                this.logger.debug('Target WebSocket timeout');
            }
            this._cleanupWebSocketConnection(clientSocket, targetSocket);
        });
    }
    
    /**
     * 准备升级请求头
     */
    _prepareUpgradeHeaders(headers) {
        const newHeaders = { ...headers };
        
        // 移除代理相关头部
        delete newHeaders['proxy-connection'];
        delete newHeaders['proxy-authorization'];
        
        // 确保必要的WebSocket头部存在
        if (!newHeaders['sec-websocket-version']) {
            newHeaders['sec-websocket-version'] = '13';
        }
        
        return newHeaders;
    }
    
    /**
     * 生成WebSocket接受密钥
     */
    _generateAcceptKey(key) {
        return crypto
            .createHash('sha1')
            .update(key + this.WS_MAGIC_STRING)
            .digest('base64');
    }
    
    /**
     * 清理WebSocket连接
     */
    _cleanupWebSocketConnection(clientSocket, targetSocket) {
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
     * 处理直接升级响应
     */
    async _handleDirectUpgradeResponse(context, result) {
        const socket = context.socket;
        const head = context.head;
        
        if (socket.destroyed) {
            if (this.logger) {
                this.logger.warn('Cannot send direct upgrade response, socket destroyed');
            }
            return;
        }
        
        try {
            // 设置响应状态和头部
            const statusCode = result.statusCode || 101;
            const statusText = result.statusText || 'Switching Protocols';
            const headers = result.headers || {};
            
            // 如果是WebSocket升级成功响应，添加必要的头部
            if (statusCode === 101) {
                const wsKey = context.request.headers['sec-websocket-key'];
                if (wsKey && !headers['sec-websocket-accept']) {
                    headers['sec-websocket-accept'] = this._generateAcceptKey(wsKey);
                }
                
                if (!headers['upgrade']) {
                    headers['upgrade'] = 'websocket';
                }
                
                if (!headers['connection']) {
                    headers['connection'] = 'Upgrade';
                }
            }
            
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
            
            // 如果不是成功的升级响应，关闭连接
            if (statusCode !== 101) {
                socket.end();
            } else {
                // 跟踪WebSocket连接
                this.activeConnections.add(socket);
                
                socket.on('close', () => {
                    this._cleanupConnection(socket);
                });
                
                socket.on('error', (error) => {
                    if (this.logger) {
                        this.logger.debug('WebSocket socket error', { error: error.message });
                    }
                    this._cleanupConnection(socket);
                });
            }
            
            if (this.logger) {
                this.logger.debug('Direct upgrade response sent', {
                    statusCode,
                    headers: Object.keys(headers)
                });
            }
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to send direct upgrade response', {
                    error: error.message
                });
            }
            socket.destroy();
        }
    }
    
    /**
     * 应用升级修改
     */
    _applyUpgradeModifications(context, result) {
        const request = context.request;
        const data = result.data || {};
        
        // 修改请求头
        if (data.modifiedHeaders) {
            Object.assign(request.headers, data.modifiedHeaders);
            
            if (this.logger) {
                this.logger.debug('Upgrade request headers modified', {
                    modified: Object.keys(data.modifiedHeaders)
                });
            }
        }
        
        // 修改目标URL
        if (data.modifiedUrl) {
            const target = this._parseTarget({ url: data.modifiedUrl });
            if (target) {
                context.target = target;
                
                if (this.logger) {
                    this.logger.debug('Upgrade target URL modified', {
                        original: context.request.url,
                        modified: data.modifiedUrl
                    });
                }
            }
        }
        
        // 修改WebSocket协议
        if (data.modifiedProtocol) {
            request.headers['sec-websocket-protocol'] = data.modifiedProtocol;
            
            if (this.logger) {
                this.logger.debug('WebSocket protocol modified', {
                    protocol: data.modifiedProtocol
                });
            }
        }
        
        // 修改WebSocket版本
        if (data.modifiedVersion) {
            request.headers['sec-websocket-version'] = data.modifiedVersion;
            
            if (this.logger) {
                this.logger.debug('WebSocket version modified', {
                    version: data.modifiedVersion
                });
            }
        }
        
        // 存储其他修改
        if (data.modifications) {
            context.modifications = { ...context.modifications, ...data.modifications };
        }
    }
    
    /**
     * 处理错误
     */
    async _handleError(context, error) {
        if (this.logger) {
            this.logger.error('Upgrade engine error', {
                error: error.message,
                target: context.target ? `${context.target.protocol}//${context.target.host}${context.target.path}` : 'unknown'
            });
        }
        
        // 发送错误响应
        if (context.socket && !context.socket.destroyed) {
            try {
                let statusCode = 502;
                let message = 'Bad Gateway';
                
                if (error.code === 'ENOTFOUND') {
                    statusCode = 404;
                    message = 'Not Found';
                } else if (error.code === 'ECONNREFUSED') {
                    statusCode = 503;
                    message = 'Service Unavailable';
                } else if (error.code === 'ETIMEDOUT') {
                    statusCode = 504;
                    message = 'Gateway Timeout';
                } else if (error.message.includes('Invalid WebSocket')) {
                    statusCode = 400;
                    message = 'Bad Request';
                }
                
                const response = [
                    `HTTP/1.1 ${statusCode} ${message}`,
                    'Content-Type: text/plain',
                    'Connection: close',
                    '',
                    message
                ].join('\r\n');
                
                context.socket.write(response);
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
        
        // 关闭所有活跃连接
        for (const connection of this.activeConnections) {
            if (connection && !connection.destroyed) {
                connection.destroy();
            }
        }
        this.activeConnections.clear();
        
        // 销毁HTTP代理
        if (this.httpAgent) {
            this.httpAgent.destroy();
        }
        
        if (this.httpsAgent) {
            this.httpsAgent.destroy();
        }
    }
}

module.exports = UpgradeEngine;