const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');

/**
 * 连接池管理器
 * 提供高性能的连接复用和代理转发功能
 */
class ConnectionPoolManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config || {};
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        // 连接池配置 - 优化：增加连接池大小以支持更多并发连接
        this.maxSockets = options.maxSockets || 1024;  // 增加到1024
        this.maxFreeSockets = options.maxFreeSockets || 512;  // 增加到512
        this.timeout = options.timeout || 30000;
        this.keepAlive = options.keepAlive !== false;
        this.keepAliveMsecs = options.keepAliveMsecs || 1000;
        
        // 连接池优化配置
        this.maxConnectionAge = options.maxConnectionAge || 300000; // 5分钟
        this.connectionRetryAttempts = options.connectionRetryAttempts || 3;
        this.connectionRetryDelay = options.connectionRetryDelay || 100; // 100ms
        
        // 代理配置
        this.proxyConfig = options.proxy || null;
        this.proxyAuth = options.proxyAuth || null;
        
        // 连接池
        this.httpPools = new Map(); // 按目标主机分组的HTTP连接池
        this.httpsPools = new Map(); // 按目标主机分组的HTTPS连接池
        this.tcpPools = new Map(); // 按目标主机分组的TCP连接池
        
        // 连接池缓存 - 优化：添加LRU缓存机制
        this.poolCache = new Map();
        this.maxCacheSize = options.maxCacheSize || 1000;
        
        // 统计信息
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            poolHits: 0,
            poolMisses: 0,
            connectionsCreated: 0,
            connectionsDestroyed: 0,
            connectionErrors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        
        // 创建HTTP/HTTPS代理
        this._createAgents();
        
        // 定期清理过期连接 - 优化：调整清理间隔
        this.cleanupInterval = setInterval(() => {
            this._cleanupExpiredConnections();
        }, 60000); // 每分钟清理一次
        
        // 连接健康检查
        this.healthCheckInterval = setInterval(() => {
            this._healthCheckConnections();
        }, 300000); // 每5分钟检查一次
    }
    
    /**
     * 创建HTTP/HTTPS代理 - 优化：更好地利用连接池
     */
    _createAgents() {
        const agentOptions = {
            keepAlive: this.keepAlive,
            keepAliveMsecs: this.keepAliveMsecs,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.timeout,
            // 优化：添加更多连接池选项
            scheduling: 'lifo', // 后进先出，使用最近创建的连接
            freeSocketTimeout: 30000, // 空闲连接超时时间
            socketActiveTTL: 600000 // 连接活跃时间限制（10分钟）
        };
        
        // 如果配置了代理，创建代理Agent
        if (this.proxyConfig) {
            // 尝试创建代理Agent
            const httpProxyAgent = this._createProxyAgent('http', agentOptions);
            const httpsProxyAgent = this._createProxyAgent('https', agentOptions);
            
            // 如果代理Agent创建成功，使用代理Agent，否则使用普通Agent
            this.httpAgent = httpProxyAgent || new http.Agent(agentOptions);
            this.httpsAgent = httpsProxyAgent || new https.Agent({
                ...agentOptions,
                rejectUnauthorized: false
            });
        } else {
            // 直连Agent - 优化：使用更好的连接池配置
            this.httpAgent = new http.Agent({
                ...agentOptions,
                // 优化：添加连接池统计
                name: 'http-pool'
            });
            
            this.httpsAgent = new https.Agent({
                ...agentOptions,
                rejectUnauthorized: false,
                // 优化：添加连接池统计
                name: 'https-pool'
            });
        }
    }
    
    /**
     * 创建代理Agent
     */
    _createProxyAgent(protocol, baseOptions) {
        const proxyUrl = this._buildProxyUrl();
        
        // 如果没有代理配置，返回null
        if (!proxyUrl) {
            return null;
        }
        
        try {
            const { HttpProxyAgent } = require('http-proxy-agent');
            const { HttpsProxyAgent } = require('https-proxy-agent');
            
            const options = {
                ...baseOptions,
                proxy: proxyUrl
            };
            
            if (protocol === 'https') {
                options.rejectUnauthorized = false;
                return new HttpsProxyAgent(proxyUrl, options);
            } else {
                return new HttpProxyAgent(proxyUrl, options);
            }
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to create proxy agent', { error: error.message });
            }
            return null;
        }
    }
    
    /**
     * 构建代理URL
     */
    _buildProxyUrl() {
        if (!this.proxyConfig) {
            return null;
        }
        
        // 如果proxyConfig已经是完整的URL字符串，直接返回
        if (typeof this.proxyConfig === 'string') {
            return this.proxyConfig;
        }
        
        // 如果proxyConfig是对象，构建URL
        const { host, hostname, port, protocol = 'http:', username, password, url: proxyUrl } = this.proxyConfig;
        
        // 如果有完整的URL，直接使用
        if (proxyUrl) {
            return proxyUrl;
        }
        
        // 构建URL
        const targetHost = hostname || host;
        if (!targetHost) {
            return null;
        }
        
        let auth = '';
        if (username && password) {
            auth = `${username}:${password}@`;
        } else if (this.proxyAuth) {
            auth = `${this.proxyAuth}@`;
        }
        
        const cleanProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`;
        return `${cleanProtocol}//${auth}${targetHost}:${port}`;
    }
    
    /**
     * 获取HTTP请求Agent - 优化：改进连接复用策略
     */
    getHttpAgent(target) {
        // 优化：使用缓存提高性能
        const cacheKey = `http:${target}`;
        if (this.poolCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.poolCache.get(cacheKey);
        }
        
        this.stats.cacheMisses++;
        const agent = this.httpAgent;
        
        // 缓存结果
        this._cacheAgent(cacheKey, agent);
        
        return agent;
    }
    
    /**
     * 获取HTTPS请求Agent - 优化：改进连接复用策略
     */
    getHttpsAgent(target) {
        // 优化：使用缓存提高性能
        const cacheKey = `https:${target}`;
        if (this.poolCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.poolCache.get(cacheKey);
        }
        
        this.stats.cacheMisses++;
        const agent = this.httpsAgent;
        
        // 缓存结果
        this._cacheAgent(cacheKey, agent);
        
        return agent;
    }
    
    /**
     * 缓存Agent实例 - 优化：LRU缓存机制
     */
    _cacheAgent(key, agent) {
        // 如果缓存已满，删除最旧的条目
        if (this.poolCache.size >= this.maxCacheSize) {
            const firstKey = this.poolCache.keys().next().value;
            if (firstKey) {
                this.poolCache.delete(firstKey);
            }
        }
        
        this.poolCache.set(key, agent);
    }
    
    /**
     * 创建TCP连接（用于CONNECT隧道） - 优化：增加重试机制
     */
    async createTcpConnection(target, options = {}) {
        const poolKey = `${target.hostname}:${target.port}`;
        
        // 尝试从连接池获取可用连接 - 优化：改进连接复用策略
        const pool = this.tcpPools.get(poolKey) || [];
        const now = Date.now();
        
        // 查找可用连接
        let availableSocket = null;
        const validConnections = [];
        
        for (const item of pool) {
            // 检查连接是否有效
            if (!item.socket.destroyed && 
                !item.socket.connecting && 
                item.socket.readyState === 'open' &&
                now - item.lastUsed < this.maxConnectionAge && // 使用连接年龄限制
                (!item.errorCount || item.errorCount < 3)) { // 错误次数限制
                
                validConnections.push(item);
                
                // 优先选择最近使用过的连接
                if (!availableSocket || item.lastUsed > availableSocket.lastUsed) {
                    availableSocket = item;
                }
            }
        }
        
        // 更新连接池，只保留有效连接
        if (validConnections.length !== pool.length) {
            this.tcpPools.set(poolKey, validConnections);
        }
        
        if (availableSocket) {
            this.stats.poolHits++;
            availableSocket.lastUsed = now;
            
            if (this.logger) {
                this.logger.debug('TCP connection pool hit', { 
                    target: poolKey,
                    connectionAge: now - availableSocket.created
                });
            }
            
            return availableSocket.socket;
        }
        
        // 创建新连接 - 优化：增加重试机制
        this.stats.poolMisses++;
        
        let lastError;
        for (let attempt = 0; attempt <= this.connectionRetryAttempts; attempt++) {
            try {
                const socket = await this._createTcpSocket(target, options);
                
                // 添加到连接池
                const poolItem = {
                    socket,
                    created: now,
                    lastUsed: now,
                    errorCount: 0
                };
                
                const pool = this.tcpPools.get(poolKey) || [];
                pool.push(poolItem);
                this.tcpPools.set(poolKey, pool);
                
                this.stats.connectionsCreated++;
                
                // 监听连接事件
                this._attachSocketListeners(socket, poolKey, poolItem);
                
                if (this.logger) {
                    this.logger.debug('TCP connection created', { 
                        target: poolKey,
                        attempt: attempt + 1
                    });
                }
                
                return socket;
            } catch (error) {
                lastError = error;
                this.stats.connectionErrors++;
                
                if (this.logger) {
                    this.logger.warn('TCP connection attempt failed', {
                        target: poolKey,
                        attempt: attempt + 1,
                        error: error.message
                    });
                }
                
                // 如果不是最后一次尝试，等待后重试
                if (attempt < this.connectionRetryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.connectionRetryDelay * Math.pow(2, attempt)));
                }
            }
        }
        
        // 所有尝试都失败了
        throw new Error(`Failed to create TCP connection to ${poolKey} after ${this.connectionRetryAttempts + 1} attempts: ${lastError.message}`);
    }
    
    /**
     * 附加Socket监听器
     */
    _attachSocketListeners(socket, poolKey, poolItem) {
        socket.on('close', () => {
            this._removeFromPool(poolKey, socket, this.tcpPools);
            this.stats.connectionsDestroyed++;
            
            if (this.logger) {
                this.logger.debug('TCP connection closed', { target: poolKey });
            }
        });
        
        socket.on('error', (error) => {
            // 记录错误次数
            if (!poolItem.errorCount) {
                poolItem.errorCount = 0;
            }
            poolItem.errorCount++;
            
            if (this.logger) {
                this.logger.warn('TCP connection error', {
                    target: poolKey,
                    error: error.message,
                    errorCount: poolItem.errorCount
                });
            }
        });
        
        socket.on('timeout', () => {
            if (this.logger) {
                this.logger.warn('TCP connection timeout', { target: poolKey });
            }
        });
    }
    
    /**
     * 创建TCP Socket
     */
    async _createTcpSocket(target, options) {
        return new Promise((resolve, reject) => {
            let socket;
            
            if (this.proxyConfig) {
                // 通过代理创建连接
                socket = this._createProxyTcpConnection(target, options);
            } else {
                // 直连
                socket = net.createConnection({
                    host: target.hostname,
                    port: target.port,
                    timeout: this.timeout,
                    ...options
                });
            }
            
            // 设置socket选项
            socket.setKeepAlive(this.keepAlive, this.keepAliveMsecs);
            socket.setTimeout(this.timeout);
            
            socket.on('connect', () => {
                this.stats.activeConnections++;
                resolve(socket);
            });
            
            socket.on('error', (error) => {
                this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
                reject(error);
            });
            
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
            
            socket.on('close', () => {
                this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
            });
        });
    }
    
    /**
     * 通过代理创建TCP连接
     */
    _createProxyTcpConnection(target, options) {
        const proxySocket = net.createConnection({
            host: this.proxyConfig.host,
            port: this.proxyConfig.port,
            timeout: this.timeout
        });
        
        // 设置socket选项
        proxySocket.setKeepAlive(this.keepAlive, this.keepAliveMsecs);
        proxySocket.setTimeout(this.timeout);
        
        proxySocket.on('connect', () => {
            // 发送CONNECT请求到代理服务器
            const connectRequest = this._buildConnectRequest(target);
            proxySocket.write(connectRequest);
        });
        
        // 处理代理响应
        let headerReceived = false;
        proxySocket.on('data', (data) => {
            if (!headerReceived) {
                const response = data.toString();
                if (response.includes('200 Connection established')) {
                    headerReceived = true;
                    proxySocket.emit('connect');
                } else {
                    proxySocket.emit('error', new Error('Proxy connection failed: ' + response));
                }
            }
        });
        
        return proxySocket;
    }
    
    /**
     * 构建CONNECT请求
     */
    _buildConnectRequest(target) {
        let request = `CONNECT ${target.hostname}:${target.port} HTTP/1.1\r\n`;
        request += `Host: ${target.hostname}:${target.port}\r\n`;
        
        if (this.proxyAuth) {
            const auth = Buffer.from(this.proxyAuth).toString('base64');
            request += `Proxy-Authorization: Basic ${auth}\r\n`;
        }
        
        request += 'Connection: keep-alive\r\n';
        request += 'Proxy-Connection: keep-alive\r\n';
        request += '\r\n';
        return request;
    }
    
    /**
     * 创建TLS连接（用于HTTPS CONNECT隧道）
     */
    async createTlsConnection(target, options = {}) {
        const tcpSocket = await this.createTcpConnection(target, options);
        
        return new Promise((resolve, reject) => {
            const tlsSocket = tls.connect({
                socket: tcpSocket,
                servername: target.hostname,
                rejectUnauthorized: false,
                ...options
            });
            
            tlsSocket.on('secureConnect', () => {
                resolve(tlsSocket);
            });
            
            tlsSocket.on('error', reject);
        });
    }
    
    /**
     * 从连接池中移除连接
     */
    _removeFromPool(poolKey, socket, poolMap) {
        const pool = poolMap.get(poolKey);
        if (pool) {
            const index = pool.findIndex(item => item.socket === socket);
            if (index !== -1) {
                pool.splice(index, 1);
                if (pool.length === 0) {
                    poolMap.delete(poolKey);
                }
            }
        }
    }
    
    /**
     * 清理过期连接 - 优化：改进清理策略
     */
    _cleanupExpiredConnections() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // 清理TCP连接池
        for (const [poolKey, pool] of this.tcpPools.entries()) {
            const validConnections = pool.filter(item => {
                // 保留条件：
                // 1. 连接未被销毁
                // 2. 连接年龄未超过最大限制
                // 3. 错误次数未超过限制
                const isDestroyed = item.socket.destroyed;
                const isExpired = now - item.lastUsed > this.maxConnectionAge;
                const hasTooManyErrors = item.errorCount && item.errorCount >= 3;
                
                if (isDestroyed || isExpired || hasTooManyErrors) {
                    if (!isDestroyed) {
                        item.socket.destroy();
                    }
                    cleanedCount++;
                    return false;
                }
                return true;
            });
            
            if (validConnections.length === 0) {
                this.tcpPools.delete(poolKey);
            } else if (validConnections.length !== pool.length) {
                this.tcpPools.set(poolKey, validConnections);
            }
        }
        
        // 清理缓存
        if (this.poolCache.size > this.maxCacheSize * 0.8) { // 当缓存使用超过80%时清理
            // 删除最旧的一半缓存
            const keys = Array.from(this.poolCache.keys());
            const keysToRemove = keys.slice(0, Math.floor(keys.length / 2));
            
            for (const key of keysToRemove) {
                this.poolCache.delete(key);
            }
        }
        
        if (cleanedCount > 0 && this.logger) {
            this.logger.debug('Connection pool cleanup completed', {
                cleaned: cleanedCount,
                stats: this.getStats()
            });
        }
    }
    
    /**
     * 连接健康检查 - 优化：新增功能
     */
    _healthCheckConnections() {
        const now = Date.now();
        
        // 检查TCP连接池中的连接
        for (const [poolKey, pool] of this.tcpPools.entries()) {
            for (const item of pool) {
                // 检查长时间未使用的连接
                if (now - item.lastUsed > this.maxConnectionAge / 2) {
                    // 发送一个简单的健康检查包（如果协议支持）
                    try {
                        if (item.socket && !item.socket.destroyed && item.socket.readyState === 'open') {
                            // 对于HTTP/HTTPS连接，可以发送一个简单的PING请求
                            // 这里我们只是记录，不实际发送数据以避免干扰
                            if (this.logger) {
                                this.logger.debug('Connection health check', {
                                    target: poolKey,
                                    connectionAge: now - item.created
                                });
                            }
                        }
                    } catch (error) {
                        // 忽略健康检查错误
                    }
                }
            }
        }
    }
    
    /**
     * 获取代理Agent（兼容性方法）
     * @param {boolean} isHttps - 是否为HTTPS
     * @param {string} hostname - 目标主机名
     * @param {number} port - 目标端口
     * @returns {Object} Agent实例
     */
    getAgent(isHttps = false, hostname = null, port = null) {
        return isHttps ? this.httpsAgent : this.httpAgent;
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            poolSizes: {
                tcp: Array.from(this.tcpPools.values()).reduce((sum, pool) => sum + pool.length, 0),
                cache: this.poolCache.size
            },
            config: {
                maxSockets: this.maxSockets,
                maxFreeSockets: this.maxFreeSockets,
                timeout: this.timeout,
                keepAlive: this.keepAlive,
                maxConnectionAge: this.maxConnectionAge
            }
        };
    }
    
    /**
     * 设置代理配置
     */
    setProxyConfig(proxyConfig) {
        this.proxyConfig = proxyConfig;
        this._createAgents();
        
        if (this.logger) {
            this.logger.info('Proxy configuration updated', {
                proxy: proxyConfig ? `${proxyConfig.host}:${proxyConfig.port}` : 'disabled'
            });
        }
    }
    
    /**
     * 关闭所有连接
     */
    closeAllConnections() {
        // 关闭TCP连接池
        for (const pool of this.tcpPools.values()) {
            for (const item of pool) {
                if (!item.socket.destroyed) {
                    item.socket.destroy();
                }
            }
        }
        
        this.tcpPools.clear();
        
        // 清理缓存
        this.poolCache.clear();
        
        if (this.logger) {
            this.logger.info('All connections closed');
        }
    }
    
    /**
     * 销毁连接池管理器
     */
    destroy() {
        // 清理定时器
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        // 关闭所有连接
        this.closeAllConnections();
        
        // 销毁Agent
        if (this.httpAgent && this.httpAgent.destroy) {
            this.httpAgent.destroy();
        }
        if (this.httpsAgent && this.httpsAgent.destroy) {
            this.httpsAgent.destroy();
        }
        
        this.emit('destroyed');
    }
}

module.exports = ConnectionPoolManager;