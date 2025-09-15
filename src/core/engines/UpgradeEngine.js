const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { pipeline } = require('stream');

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
        
        // 升级选项
        this.timeout = options.timeout || 30000;
        
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
                    context.markIntercepted();
                    if (context.stopped) return;
                }
            }
            
            // 如果没有被拦截，则转发升级请求
            if (!context.intercepted) {
                await this._forwardUpgrade(context);
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
                // 绝对URL
                targetUrl = request.url;
            } else {
                // 相对URL，从Host头构建
                const host = request.headers.host;
                if (!host) {
                    return null;
                }
                
                const protocol = request.connection.encrypted ? 'wss:' : 'ws:';
                targetUrl = `${protocol}//${host}${request.url}`;
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
            const options = {
                hostname: target.hostname,
                port: target.port,
                path: target.path,
                method: 'GET',
                headers: this._prepareUpgradeHeaders(request.headers),
                timeout: this.timeout
            };
            
            // 选择HTTP模块
            const httpModule = target.protocol === 'wss:' ? https : http;
            
            // 创建升级请求
            const upgradeRequest = httpModule.request(options);
            
            // 处理升级响应
            upgradeRequest.on('upgrade', (res, targetSocket, targetHead) => {
                this._handleUpgradeResponse(context, res, targetSocket, targetHead, resolve, reject);
            });
            
            // 处理普通HTTP响应（升级失败）
            upgradeRequest.on('response', (res) => {
                reject(new Error(`Upgrade failed with status ${res.statusCode}`));
            });
            
            // 设置超时
            upgradeRequest.setTimeout(this.timeout, () => {
                upgradeRequest.destroy();
                reject(new Error('Upgrade timeout'));
            });
            
            // 处理错误
            upgradeRequest.on('error', (error) => {
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
            
            // 如果有head数据，先写入
            if (head && head.length > 0) {
                socket.write(head);
            }
            
            if (targetHead && targetHead.length > 0) {
                targetSocket.write(targetHead);
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
        pipeline(
            clientSocket,
            targetSocket,
            (error) => {
                if (error && this.logger) {
                    this.logger.debug('Client to target WebSocket pipe error', { error: error.message });
                }
                this._cleanupWebSocketConnection(clientSocket, targetSocket);
            }
        );
        
        // 目标服务器到客户端
        pipeline(
            targetSocket,
            clientSocket,
            (error) => {
                if (error && this.logger) {
                    this.logger.debug('Target to client WebSocket pipe error', { error: error.message });
                }
                this._cleanupWebSocketConnection(clientSocket, targetSocket);
            }
        );
        
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
     * 销毁引擎
     */
    destroy() {
        this.closeAllConnections();
    }
}

module.exports = UpgradeEngine;