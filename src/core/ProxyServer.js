const http = require('http');
const https = require('https');
const EventEmitter = require('events');
const { RequestContext, ConnectContext, UpgradeContext } = require('../types/ProxyTypes');
const ObjectPool = require('../foundation/utils/ObjectPool');

/**
 * 代理服务器主类
 * 新架构的核心组件，负责协调各个模块
 */
class ProxyServer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // 配置管理器
        this.config = options.config;
        
        // 日志记录器
        this.logger = options.logger;
        
        // 性能监控器
        this.metrics = options.metrics;
        
        // 中间件管理器
        this.middlewareManager = options.middlewareManager;
        
        // 拦截器管理器
        // this.interceptorManager = options.interceptorManager;
        
        // TLS管理器
        // this.tlsManager = options.tlsManager;
        
        // 处理引擎管理器
        this.engineManager = options.engineManager;
        
        // HTTP服务器实例
        this.server = null;
        
        // 服务器状态
        this.isRunning = false;
        this.activeConnections = new Set();
        
        // 对象池
        this._initObjectPools();
        
        // 初始化固定证书中间件（如果配置了固定证书）
        if (options.fixedCert || options.fixedCertPath || options.fixedCertString) {
            const FixedCertMiddleware = require('./middleware/FixedCertMiddleware');
            const fixedCertMiddleware = new FixedCertMiddleware({
                fixedCert: options.fixedCert,
                fixedKey: options.fixedKey,
                fixedCertPath: options.fixedCertPath,
                fixedKeyPath: options.fixedKeyPath,
                fixedCertString: options.fixedCertString,
                fixedKeyString: options.fixedKeyString
            });
            this.middlewareManager.register(fixedCertMiddleware);
        }
        
        // 性能统计
        this.stats = {
            startTime: null,
            requests: 0,
            connections: 0,
            errors: 0
        };
        
        // 绑定事件处理器
        this._bindEventHandlers();
    }
    
    /**
     * 初始化对象池
     */
    _initObjectPools() {
        const poolSize = this.config ? this.config.get('performance.poolSize', 100) : 100;
        
        // 请求上下文对象池
        this.requestContextPool = new ObjectPool(
            () => new RequestContext(),
            (ctx) => ctx.reset(),
            Math.floor(poolSize / 4),
            poolSize
        );
        
        // 连接上下文对象池
        this.connectContextPool = new ObjectPool(
            () => new ConnectContext(),
            (ctx) => ctx.reset(),
            Math.floor(poolSize / 10),
            Math.floor(poolSize / 4)
        );
        
        // 升级上下文对象池
        this.upgradeContextPool = new ObjectPool(
            () => new UpgradeContext(),
            (ctx) => ctx.reset(),
            Math.floor(poolSize / 20),
            Math.floor(poolSize / 10)
        );
    }
    
    /**
     * 绑定事件处理器
     */
    _bindEventHandlers() {
        // 监听配置变化
        if (this.config) {
            this.config.watch('proxy', (newConfig) => {
                this._handleConfigChange(newConfig);
            });
        }
        
        // 监听性能指标
        if (this.metrics) {
            this.metrics.on('metrics', (data) => {
                this.emit('metrics', data);
            });
        }
    }
    
    /**
     * 处理配置变化
     */
    _handleConfigChange(newConfig) {
        if (this.logger) {
            this.logger.info('Proxy configuration changed', { config: newConfig });
        }
        
        // 这里可以实现热重载逻辑
        this.emit('configChanged', newConfig);
    }
    
    /**
     * 启动代理服务器
     */
    async start(port, host) {
        if (this.isRunning) {
            throw new Error('Proxy server is already running');
        }
        
        try {
            // 获取配置，优先使用传入的参数
            const finalPort = port || (this.config ? this.config.get('port', this.config.get('proxy.port', 6789)) : 6789);
            const finalHost = host || (this.config ? this.config.get('host', this.config.get('proxy.host', '0.0.0.0')) : '0.0.0.0');
            
            // 创建HTTP服务器
            this.server = http.createServer();
            
            // 设置服务器事件处理器
            this._setupServerHandlers();
            
            // 启动服务器
            await new Promise((resolve, reject) => {
                this.server.listen(finalPort, finalHost, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            
            this.isRunning = true;
            this.stats.startTime = Date.now();
            
            if (this.logger) {
                this.logger.info('Proxy server started', { port: finalPort, host: finalHost });
            }
            
            this.emit('started', { port: finalPort, host: finalHost });
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to start proxy server', { error: error.message });
            }
            
            if (this.metrics) {
                this.metrics.recordError(error, 'server_start');
            }
            
            throw error;
        }
    }
    
    /**
     * 停止代理服务器
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        try {
            // 停止接受新连接
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
            }
            
            // 关闭所有活跃连接
            for (const connection of this.activeConnections) {
                try {
                    connection.destroy();
                } catch (error) {
                    // 忽略连接关闭错误
                }
            }
            this.activeConnections.clear();
            
            // 停止性能监控
            if (this.metrics) {
                this.metrics.stop();
            }
            
            this.isRunning = false;
            this.server = null;
            
            if (this.logger) {
                this.logger.info('Proxy server stopped');
            }
            
            this.emit('stopped');
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Error stopping proxy server', { error: error.message });
            }
            
            throw error;
        }
    }
    
    /**
     * 设置服务器事件处理器
     */
    _setupServerHandlers() {
        // 请求处理
        this.server.on('request', (req, res) => {
            this._handleRequest(req, res);
        });
        
        // CONNECT请求处理（HTTPS代理）
        this.server.on('connect', (req, socket, head) => {
            this._handleConnect(req, socket, head);
        });
        
        // 升级请求处理（WebSocket）
        this.server.on('upgrade', (req, socket, head) => {
            this._handleUpgrade(req, socket, head);
        });
        
        // 连接管理
        this.server.on('connection', (socket) => {
            this._handleConnection(socket);
        });
        
        // 错误处理
        this.server.on('error', (error) => {
            this._handleServerError(error);
        });
        
        // 客户端错误处理
        this.server.on('clientError', (error, socket) => {
            this._handleClientError(error, socket);
        });
    }
    
    /**
     * 处理HTTP请求
     */
    async _handleRequest(req, res) {
        const context = this.requestContextPool.acquire();
        context.request = req;
        context.response = res;
        context.logger = this.logger;
        context.metrics = this.metrics;
        
        this.stats.requests++;
        
        try {
            if (this.engineManager) {
                await this.engineManager.handleRequest(context);
            } else {
                // 默认处理逻辑
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Proxy server not properly configured');
            }
            
        } catch (error) {
            this._handleRequestError(error, context);
        } finally {
            // 记录性能指标
            if (this.metrics) {
                this.metrics.recordRequest(context);
            }
            
            // 释放上下文对象
            this.requestContextPool.release(context);
        }
    }
    
    /**
     * 处理CONNECT请求
     */
    async _handleConnect(req, socket, head) {
        const context = this.connectContextPool.acquire();
        context.request = req;
        context.socket = socket;
        context.head = head;
        context.logger = this.logger;
        context.metrics = this.metrics;
        
        this.stats.connections++;
        
        try {
            if (this.connectEngine) {
                // await this.connectEngine.handle(context);
                await this.engineManager.handleConnect(context);
            } else {
                // 默认拒绝CONNECT请求
                socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                socket.end();
            }
            
        } catch (error) {
            this._handleConnectError(error, context);
        } finally {
            // 记录性能指标
            if (this.metrics) {
                this.metrics.recordConnection('ssl', context.startTime ? Date.now() - context.startTime : 0);
            }
            
            // 释放上下文对象
            this.connectContextPool.release(context);
        }
    }
    
    /**
     * 处理升级请求
     */
    async _handleUpgrade(req, socket, head) {
        const context = this.upgradeContextPool.acquire();
        context.request = req;
        context.socket = socket;
        context.head = head;
        context.logger = this.logger;
        context.metrics = this.metrics;
        
        try {
            if (this.engineManager) {
                await this.engineManager.handleUpgrade(context);
            } else {
                // 默认拒绝升级请求
                socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                socket.end();
            }
            
        } catch (error) {
            this._handleUpgradeError(error, context);
        } finally {
            // 记录性能指标
            if (this.metrics) {
                this.metrics.recordConnection('websocket', context.startTime ? Date.now() - context.startTime : 0);
            }
            
            // 释放上下文对象
            this.upgradeContextPool.release(context);
        }
    }
    
    /**
     * 处理新连接
     */
    _handleConnection(socket) {
        this.activeConnections.add(socket);
        
        // 更新活跃连接数
        if (this.metrics) {
            this.metrics.updateActiveConnections(this.activeConnections.size);
        }
        
        // 连接关闭时清理
        socket.on('close', () => {
            this.activeConnections.delete(socket);
            if (this.metrics) {
                this.metrics.updateActiveConnections(this.activeConnections.size);
            }
        });
        
        // 连接错误处理
        socket.on('error', (error) => {
            if (this.logger) {
                this.logger.debug('Socket error', { error: error.message });
            }
        });
    }
    
    /**
     * 处理服务器错误
     */
    _handleServerError(error) {
        this.stats.errors++;
        
        if (this.logger) {
            this.logger.error('Server error', { error: error.message, stack: error.stack });
        }
        
        if (this.metrics) {
            this.metrics.recordError(error, 'server');
        }
        
        this.emit('error', error);
    }
    
    /**
     * 处理客户端错误
     */
    _handleClientError(error, socket) {
        if (this.logger) {
            this.logger.debug('Client error', { error: error.message });
        }
        
        if (this.metrics) {
            this.metrics.recordError(error, 'client');
        }
        
        // 关闭有问题的连接
        if (socket && !socket.destroyed) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        }
    }
    
    /**
     * 处理请求错误
     */
    _handleRequestError(error, context) {
        this.stats.errors++;
        context.error = error;
        
        if (this.logger) {
            this.logger.error('Request error', {
                error: error.message,
                url: context.getUrl(),
                method: context.getMethod()
            });
        }
        
        if (this.metrics) {
            this.metrics.recordError(error, 'request');
        }
        
        // 发送错误响应
        if (context.response && !context.response.headersSent) {
            try {
                context.response.writeHead(500, { 'Content-Type': 'text/plain' });
                context.response.end('Internal Server Error');
            } catch (responseError) {
                // 忽略响应错误
            }
        }
    }
    
    /**
     * 处理连接错误
     */
    _handleConnectError(error, context) {
        this.stats.errors++;
        context.error = error;
        
        if (this.logger) {
            this.logger.error('Connect error', {
                error: error.message,
                target: context.getTargetHost()
            });
        }
        
        if (this.metrics) {
            this.metrics.recordError(error, 'connect');
        }
        
        // 关闭连接
        if (context.socket && !context.socket.destroyed) {
            try {
                context.socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                context.socket.end();
            } catch (socketError) {
                // 忽略socket错误
            }
        }
    }
    
    /**
     * 处理升级错误
     */
    _handleUpgradeError(error, context) {
        this.stats.errors++;
        context.error = error;
        
        if (this.logger) {
            this.logger.error('Upgrade error', {
                error: error.message,
                url: context.request ? context.request.url : 'unknown'
            });
        }
        
        if (this.metrics) {
            this.metrics.recordError(error, 'upgrade');
        }
        
        // 关闭连接
        if (context.socket && !context.socket.destroyed) {
            try {
                context.socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                context.socket.end();
            } catch (socketError) {
                // 忽略socket错误
            }
        }
    }
    
    /**
     * 获取服务器状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeConnections: this.activeConnections.size,
            stats: Object.assign({}, this.stats),
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
            pools: {
                requestContext: this.requestContextPool.getStats(),
                connectContext: this.connectContextPool.getStats(),
                upgradeContext: this.upgradeContextPool.getStats()
            }
        };
    }
    
    /**
     * 获取服务器地址信息
     */
    getAddress() {
        if (!this.server) return null;
        
        const address = this.server.address();
        if (!address) return null;
        
        // 如果地址是127.0.0.1，但配置中指定了localhost，则返回localhost
        if (address.address === '127.0.0.1' && this.config) {
            const configHost = this.config.get('host', this.config.get('proxy.host'));
            if (configHost === 'localhost') {
                return {
                    ...address,
                    address: 'localhost'
                };
            }
        }
        
        return address;
    }
}

module.exports = ProxyServer;