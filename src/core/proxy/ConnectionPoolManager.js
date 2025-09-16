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
        
        // 连接池配置
        this.maxSockets = options.maxSockets || 256;
        this.maxFreeSockets = options.maxFreeSockets || 256;
        this.timeout = options.timeout || 30000;
        this.keepAlive = options.keepAlive !== false;
        this.keepAliveMsecs = options.keepAliveMsecs || 1000;
        
        // 代理配置
        this.proxyConfig = options.proxy || null;
        this.proxyAuth = options.proxyAuth || null;
        
        // 连接池
        this.httpPools = new Map(); // 按目标主机分组的HTTP连接池
        this.httpsPools = new Map(); // 按目标主机分组的HTTPS连接池
        this.tcpPools = new Map(); // 按目标主机分组的TCP连接池
        
        // 统计信息
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            poolHits: 0,
            poolMisses: 0,
            connectionsCreated: 0,
            connectionsDestroyed: 0
        };
        
        // 创建HTTP/HTTPS代理
        this._createAgents();
        
        // 定期清理过期连接
        this.cleanupInterval = setInterval(() => {
            this._cleanupExpiredConnections();
        }, 30000);
    }
    
    /**
     * 创建HTTP/HTTPS代理
     */
    _createAgents() {
        const agentOptions = {
            keepAlive: this.keepAlive,
            keepAliveMsecs: this.keepAliveMsecs,
            maxSockets: this.maxSockets,
            maxFreeSockets: this.maxFreeSockets,
            timeout: this.timeout
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
            // 直连Agent
            this.httpAgent = new http.Agent(agentOptions);
            this.httpsAgent = new https.Agent({
                ...agentOptions,
                rejectUnauthorized: false
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
     * 获取HTTP请求Agent
     */
    getHttpAgent(target) {
        return this.httpAgent;
    }
    
    /**
     * 获取HTTPS请求Agent
     */
    getHttpsAgent(target) {
        return this.httpsAgent;
    }
    
    /**
     * 创建TCP连接（用于CONNECT隧道）
     */
    async createTcpConnection(target, options = {}) {
        const poolKey = `${target.hostname}:${target.port}`;
        const pool = this.tcpPools.get(poolKey) || [];
        
        // 尝试从连接池获取可用连接
        const availableSocket = pool.find(item => 
            !item.socket.destroyed && 
            !item.socket.connecting && 
            item.socket.readyState === 'open' &&
            Date.now() - item.lastUsed < 60000 // 1分钟内使用过
        );
        
        if (availableSocket) {
            this.stats.poolHits++;
            availableSocket.lastUsed = Date.now();
            
            if (this.logger) {
                this.logger.debug('TCP connection pool hit', { target: poolKey });
            }
            
            return availableSocket.socket;
        }
        
        // 创建新连接
        this.stats.poolMisses++;
        this.stats.connectionsCreated++;
        
        const socket = await this._createTcpSocket(target, options);
        
        // 添加到连接池
        const poolItem = {
            socket,
            created: Date.now(),
            lastUsed: Date.now()
        };
        
        pool.push(poolItem);
        this.tcpPools.set(poolKey, pool);
        
        // 监听连接关闭事件
        socket.on('close', () => {
            this._removeFromPool(poolKey, socket, this.tcpPools);
            this.stats.connectionsDestroyed++;
        });
        
        if (this.logger) {
            this.logger.debug('TCP connection created', { target: poolKey });
        }
        
        return socket;
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
            
            socket.on('connect', () => {
                this.stats.activeConnections++;
                resolve(socket);
            });
            
            socket.on('error', reject);
            
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
            
            socket.on('close', () => {
                this.stats.activeConnections--;
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
                    proxySocket.emit('error', new Error('Proxy connection failed'));
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
     * 清理过期连接
     */
    _cleanupExpiredConnections() {
        const now = Date.now();
        const maxAge = 300000; // 5分钟
        
        [this.tcpPools].forEach(poolMap => {
            for (const [poolKey, pool] of poolMap.entries()) {
                const validConnections = pool.filter(item => {
                    const isExpired = now - item.lastUsed > maxAge;
                    const isDestroyed = item.socket.destroyed;
                    
                    if (isExpired || isDestroyed) {
                        if (!isDestroyed) {
                            item.socket.destroy();
                        }
                        return false;
                    }
                    return true;
                });
                
                if (validConnections.length === 0) {
                    poolMap.delete(poolKey);
                } else if (validConnections.length !== pool.length) {
                    poolMap.set(poolKey, validConnections);
                }
            }
        });
        
        if (this.logger) {
            this.logger.debug('Connection pool cleanup completed', {
                stats: this.getStats()
            });
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
                tcp: Array.from(this.tcpPools.values()).reduce((sum, pool) => sum + pool.length, 0)
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