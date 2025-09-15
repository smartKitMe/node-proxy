const net = require('net');
const url = require('url');
const colors = require('colors');

const localIP = '127.0.0.1';

// 性能优化：连接池管理
class ConnectionPool {
    constructor() {
        this.pools = new Map(); // hostname:port -> socket数组
        this.maxPoolSize = 20;
        this.maxIdleTime = 30000; // 30秒空闲超时
        this.cleanupInterval = 60000; // 1分钟清理一次
        
        // 定期清理空闲连接
        setInterval(() => this.cleanup(), this.cleanupInterval);
    }
    
    getKey(hostname, port) {
        return `${hostname}:${port}`;
    }
    
    getConnection(hostname, port) {
        const key = this.getKey(hostname, port);
        const pool = this.pools.get(key);
        
        if (pool && pool.length > 0) {
            // 查找可用的连接
            for (let i = pool.length - 1; i >= 0; i--) {
                const socket = pool[i];
                if (socket.readyState === 'open' && !socket.destroyed && !socket.busy) {
                    socket.busy = true;
                    socket.lastUsed = Date.now();
                    return socket;
                }
            }
        }
        
        return null;
    }
    
    releaseConnection(socket, hostname, port) {
        if (socket.destroyed || socket.readyState !== 'open') {
            return;
        }
        
        socket.busy = false;
        socket.lastUsed = Date.now();
        
        const key = this.getKey(hostname, port);
        let pool = this.pools.get(key);
        
        if (!pool) {
            pool = [];
            this.pools.set(key, pool);
        }
        
        // 限制池大小
        if (pool.length < this.maxPoolSize) {
            pool.push(socket);
        } else {
            socket.destroy();
        }
    }
    
    cleanup() {
        const now = Date.now();
        
        for (const [key, pool] of this.pools.entries()) {
            for (let i = pool.length - 1; i >= 0; i--) {
                const socket = pool[i];
                
                // 清理过期或损坏的连接
                if (socket.destroyed || 
                    socket.readyState !== 'open' || 
                    (now - socket.lastUsed) > this.maxIdleTime) {
                    
                    if (!socket.destroyed) {
                        socket.destroy();
                    }
                    pool.splice(i, 1);
                }
            }
            
            // 清理空池
            if (pool.length === 0) {
                this.pools.delete(key);
            }
        }
    }
    
    getStats() {
        let totalConnections = 0;
        let activeConnections = 0;
        
        for (const pool of this.pools.values()) {
            totalConnections += pool.length;
            activeConnections += pool.filter(s => s.busy).length;
        }
        
        return {
            totalPools: this.pools.size,
            totalConnections,
            activeConnections,
            idleConnections: totalConnections - activeConnections
        };
    }
}

// 性能优化：URL解析缓存
const urlCache = new Map();
const maxUrlCacheSize = 1000;

function parseUrlCached(urlStr) {
    if (urlCache.has(urlStr)) {
        return urlCache.get(urlStr);
    }
    
    const parsed = url.parse(`https://${urlStr}`);
    
    // 限制缓存大小
    if (urlCache.size >= maxUrlCacheSize) {
        const firstKey = urlCache.keys().next().value;
        urlCache.delete(firstKey);
    }
    
    urlCache.set(urlStr, parsed);
    return parsed;
}

// 性能优化：错误处理优化
const connectErrorHandlers = {
    ECONNREFUSED: (cltSocket, hostname, port) => {
        cltSocket.write('HTTP/1.1 502 Bad Gateway\r\n' +
                       'Content-Type: text/plain\r\n' +
                       'Connection: close\r\n\r\n' +
                       `Cannot connect to ${hostname}:${port}`);
        cltSocket.end();
    },
    
    ETIMEDOUT: (cltSocket, hostname, port) => {
        cltSocket.write('HTTP/1.1 504 Gateway Timeout\r\n' +
                       'Content-Type: text/plain\r\n' +
                       'Connection: close\r\n\r\n' +
                       `Connection timeout to ${hostname}:${port}`);
        cltSocket.end();
    },
    
    EHOSTUNREACH: (cltSocket, hostname, port) => {
        cltSocket.write('HTTP/1.1 502 Bad Gateway\r\n' +
                       'Content-Type: text/plain\r\n' +
                       'Connection: close\r\n\r\n' +
                       `Host unreachable: ${hostname}:${port}`);
        cltSocket.end();
    },
    
    default: (cltSocket, error, hostname, port) => {
        cltSocket.write('HTTP/1.1 500 Internal Server Error\r\n' +
                       'Content-Type: text/plain\r\n' +
                       'Connection: close\r\n\r\n' +
                       `Proxy error: ${error.message}`);
        cltSocket.end();
    }
};

// 性能监控
const connectMetrics = {
    connectionCount: 0,
    successCount: 0,
    errorCount: 0,
    totalConnectTime: 0,
    poolHits: 0,
    
    recordConnection(connectTime, fromPool = false) {
        this.connectionCount++;
        this.successCount++;
        this.totalConnectTime += connectTime;
        if (fromPool) this.poolHits++;
    },
    
    recordError() {
        this.connectionCount++;
        this.errorCount++;
    },
    
    getStats() {
        return {
            totalConnections: this.connectionCount,
            successRate: this.connectionCount > 0 ? this.successCount / this.connectionCount : 0,
            avgConnectTime: this.successCount > 0 ? this.totalConnectTime / this.successCount : 0,
            poolHitRate: this.connectionCount > 0 ? this.poolHits / this.connectionCount : 0
        };
    },
    
    reset() {
        this.connectionCount = 0;
        this.successCount = 0;
        this.errorCount = 0;
        this.totalConnectTime = 0;
        this.poolHits = 0;
    }
};

// 连接性能统计定时器（根据配置决定是否启用）
let connectStatsInterval = null;

function initConnectStats(enabled) {
    if (enabled && !connectStatsInterval) {
        connectStatsInterval = setInterval(() => {
            const stats = connectMetrics.getStats();
            const poolStats = connectionPool.getStats();
            
            if (connectMetrics.connectionCount > 0) {
                console.log('Connect Performance Stats:', {
                    connections: connectMetrics.connectionCount,
                    successRate: `${(stats.successRate * 100).toFixed(2)}%`,
                    avgConnectTime: `${stats.avgConnectTime.toFixed(2)}ms`,
                    poolHitRate: `${(stats.poolHitRate * 100).toFixed(2)}%`,
                    poolStats: poolStats
                });
            }
            connectMetrics.reset();
        }, 60000);
    } else if (!enabled && connectStatsInterval) {
        clearInterval(connectStatsInterval);
        connectStatsInterval = null;
    }
}

const connectionPool = new ConnectionPool();

// create connectHandler function
module.exports = function createConnectHandler(sslConnectInterceptor, fakeServerCenter, enablePerformanceMetrics = false) {
    
    // 初始化连接性能统计
    initConnectStats(enablePerformanceMetrics);
    
    // 性能优化：预编译拦截器检查
    const hasInterceptor = typeof sslConnectInterceptor === 'function';
    
    return function connectHandler(req, cltSocket, head) {
        const startTime = enablePerformanceMetrics ? process.hrtime.bigint() : null;
        
        try {
            // 性能优化：使用缓存的URL解析
            const srvUrl = parseUrlCached(req.url);
            
            if (hasInterceptor && sslConnectInterceptor.call(null, req, cltSocket, head)) {
                // SSL拦截模式
                fakeServerCenter.getServerPromise(srvUrl.hostname, srvUrl.port)
                    .then((serverObj) => {
                        if (enablePerformanceMetrics && startTime) {
                            const endTime = process.hrtime.bigint();
                            const connectTime = Number(endTime - startTime) / 1000000;
                            connectMetrics.recordConnection(connectTime, false);
                        }
                        
                        connect(req, cltSocket, head, localIP, serverObj.port, false, enablePerformanceMetrics);
                    })
                    .catch((error) => {
                        if (enablePerformanceMetrics) {
                            connectMetrics.recordError();
                        }
                        console.error('SSL server creation error:', error);
                        const handler = connectErrorHandlers.default;
                        handler(cltSocket, error, srvUrl.hostname, srvUrl.port);
                    });
            } else {
                // 直接代理模式
                let connectTime = 0;
                if (enablePerformanceMetrics && startTime) {
                    const endTime = process.hrtime.bigint();
                    connectTime = Number(endTime - startTime) / 1000000;
                }
                
                connect(req, cltSocket, head, srvUrl.hostname, srvUrl.port, true, connectTime, enablePerformanceMetrics);
            }
        } catch (error) {
            if (enablePerformanceMetrics) {
                connectMetrics.recordError();
            }
            console.error('Connect handler error:', error);
            const handler = connectErrorHandlers.default;
            handler(cltSocket, error, 'unknown', 'unknown');
        }
    };
};

// 性能优化：连接函数
function connect(req, cltSocket, head, hostname, port, usePool = true, baseConnectTime = 0, enablePerformanceMetrics = false) {
    let proxySocket = null;
    let fromPool = false;
    
    // 尝试从连接池获取连接
    if (usePool) {
        proxySocket = connectionPool.getConnection(hostname, port);
        if (proxySocket) {
            fromPool = true;
            // 立即建立隧道
            establishTunnel(cltSocket, proxySocket, head, hostname, port, baseConnectTime, fromPool, enablePerformanceMetrics);
            return proxySocket;
        }
    }
    
    // 创建新连接
    const connectStart = enablePerformanceMetrics ? process.hrtime.bigint() : null;
    
    proxySocket = net.connect({
        port: port,
        host: hostname,
        // 性能优化：连接选项
        keepAlive: true,
        keepAliveInitialDelay: 30000,
        noDelay: true
    }, () => {
        let connectTime = baseConnectTime;
        if (enablePerformanceMetrics && connectStart) {
            const connectEnd = process.hrtime.bigint();
            connectTime = baseConnectTime + Number(connectEnd - connectStart) / 1000000;
            connectMetrics.recordConnection(connectTime, fromPool);
        }
        
        establishTunnel(cltSocket, proxySocket, head, hostname, port, connectTime, fromPool, enablePerformanceMetrics);
    });
    
    // 性能优化：错误处理
    proxySocket.on('error', (error) => {
        if (enablePerformanceMetrics) {
            connectMetrics.recordError();
        }
        console.log(colors.red(`Connection error to ${hostname}:${port}:`, error.message));
        
        const handler = connectErrorHandlers[error.code] || connectErrorHandlers.default;
        handler(cltSocket, error, hostname, port);
    });
    
    // 连接超时处理
    proxySocket.setTimeout(30000, () => {
        if (enablePerformanceMetrics) {
            connectMetrics.recordError();
        }
        proxySocket.destroy();
        connectErrorHandlers.ETIMEDOUT(cltSocket, hostname, port);
    });
    
    return proxySocket;
}

// 性能优化：建立隧道
function establishTunnel(cltSocket, proxySocket, head, hostname, port, connectTime, fromPool, enablePerformanceMetrics = false) {
    // 发送连接建立响应
    let response = 'HTTP/1.1 200 Connection Established\r\n' +
                   'Proxy-agent: node-mitmproxy-optimized\r\n';
    
    if (enablePerformanceMetrics) {
        response += `X-Connect-Time: ${connectTime.toFixed(2)}ms\r\n` +
                   `X-From-Pool: ${fromPool}\r\n`;
    }
    
    response += '\r\n';
    cltSocket.write(response);
    
    // 转发初始数据
    if (head && head.length > 0) {
        proxySocket.write(head);
    }
    
    // 建立双向数据流
    proxySocket.pipe(cltSocket);
    cltSocket.pipe(proxySocket);
    
    // 性能优化：连接清理处理
    const cleanup = () => {
        if (proxySocket && !proxySocket.destroyed) {
            if (fromPool) {
                // 释放回连接池
                connectionPool.releaseConnection(proxySocket, hostname, port);
            } else {
                // 尝试加入连接池
                connectionPool.releaseConnection(proxySocket, hostname, port);
            }
        }
    };
    
    cltSocket.on('close', cleanup);
    cltSocket.on('error', (error) => {
        console.log(colors.yellow(`Client socket error: ${error.message}`));
        cleanup();
    });
    
    proxySocket.on('close', () => {
        if (!cltSocket.destroyed) {
            cltSocket.end();
        }
    });
    
    proxySocket.on('error', (error) => {
        console.log(colors.yellow(`Proxy socket error: ${error.message}`));
        if (!cltSocket.destroyed) {
            cltSocket.end();
        }
    });
}

// 导出性能指标和连接池统计
module.exports.getConnectMetrics = () => connectMetrics.getStats();
module.exports.getPoolStats = () => connectionPool.getStats();
module.exports.resetConnectMetrics = () => connectMetrics.reset();
module.exports.cleanupConnectionPool = () => connectionPool.cleanup();