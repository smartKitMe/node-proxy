const EventEmitter = require('events');
const url = require('url');

/**
 * 代理配置管理器
 * 负责管理代理转发配置和性能监控
 */
class ProxyConfigManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        // 代理配置
        this.proxyConfig = {
            // 代理服务器配置
            proxy: options.proxy || null,
            proxyAuth: options.proxyAuth || null,
            
            // 连接池配置
            connectionPool: {
                maxSockets: options.maxSockets || 256,
                maxFreeSockets: options.maxFreeSockets || 256,
                timeout: options.timeout || 30000,
                keepAlive: options.keepAlive !== false,
                keepAliveMsecs: options.keepAliveMsecs || 1000,
                maxCachedSessions: options.maxCachedSessions || 100,
                cleanupInterval: options.cleanupInterval || 60000
            },
            
            // 性能优化配置
            performance: {
                enableMetrics: options.enableMetrics !== false,
                enableConnectionReuse: options.enableConnectionReuse !== false,
                enableProxyChaining: options.enableProxyChaining || false,
                retryAttempts: options.retryAttempts || 3,
                retryDelay: options.retryDelay || 1000
            },
            
            // 安全配置
            security: {
                rejectUnauthorized: options.rejectUnauthorized !== false,
                enableSNI: options.enableSNI !== false,
                ciphers: options.ciphers || 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS',
                secureProtocol: options.secureProtocol || 'TLSv1_2_method'
            }
        };
        
        // 性能统计
        this.stats = {
            connections: {
                total: 0,
                active: 0,
                reused: 0,
                failed: 0
            },
            proxy: {
                requests: 0,
                successes: 0,
                failures: 0,
                timeouts: 0
            },
            performance: {
                avgResponseTime: 0,
                totalResponseTime: 0,
                requestCount: 0
            }
        };
        
        // 启动监控
        this._startMonitoring();
    }
    
    /**
     * 获取代理配置
     */
    getProxyConfig() {
        return { ...this.proxyConfig };
    }
    
    /**
     * 更新代理配置
     */
    updateProxyConfig(newConfig) {
        const oldConfig = { ...this.proxyConfig };
        
        // 合并配置
        this.proxyConfig = {
            ...this.proxyConfig,
            ...newConfig,
            connectionPool: {
                ...this.proxyConfig.connectionPool,
                ...(newConfig.connectionPool || {})
            },
            performance: {
                ...this.proxyConfig.performance,
                ...(newConfig.performance || {})
            },
            security: {
                ...this.proxyConfig.security,
                ...(newConfig.security || {})
            }
        };
        
        // 验证配置
        this._validateConfig();
        
        // 发出配置更新事件
        this.emit('configUpdated', {
            oldConfig,
            newConfig: this.proxyConfig
        });
        
        if (this.logger) {
            this.logger.info('代理配置已更新', {
                proxy: this.proxyConfig.proxy,
                connectionPool: this.proxyConfig.connectionPool
            });
        }
    }
    
    /**
     * 获取代理服务器信息
     */
    getProxyInfo() {
        if (!this.proxyConfig.proxy) {
            return null;
        }
        
        try {
            const proxyUrl = url.parse(this.proxyConfig.proxy);
            return {
                protocol: proxyUrl.protocol,
                hostname: proxyUrl.hostname,
                port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
                auth: this.proxyConfig.proxyAuth ? '***' : null,
                enabled: true
            };
        } catch (error) {
            if (this.logger) {
                this.logger.error('解析代理URL失败:', error);
            }
            return null;
        }
    }
    
    /**
     * 检查是否启用代理
     */
    isProxyEnabled() {
        return !!this.proxyConfig.proxy;
    }
    
    /**
     * 记录连接统计
     */
    recordConnectionStats(type, data = {}) {
        switch (type) {
            case 'created':
                this.stats.connections.total++;
                this.stats.connections.active++;
                break;
            case 'reused':
                this.stats.connections.reused++;
                break;
            case 'closed':
                this.stats.connections.active = Math.max(0, this.stats.connections.active - 1);
                break;
            case 'failed':
                this.stats.connections.failed++;
                break;
        }
        
        // 记录到指标系统
        if (this.metrics && this.proxyConfig.performance.enableMetrics) {
            this.metrics.incrementCounter(`proxy_connections_${type}_total`, data);
            this.metrics.setGauge('proxy_connections_active', this.stats.connections.active);
        }
    }
    
    /**
     * 记录代理请求统计
     */
    recordProxyStats(type, responseTime = 0, data = {}) {
        switch (type) {
            case 'request':
                this.stats.proxy.requests++;
                break;
            case 'success':
                this.stats.proxy.successes++;
                this._updateResponseTime(responseTime);
                break;
            case 'failure':
                this.stats.proxy.failures++;
                break;
            case 'timeout':
                this.stats.proxy.timeouts++;
                break;
        }
        
        // 记录到指标系统
        if (this.metrics && this.proxyConfig.performance.enableMetrics) {
            this.metrics.incrementCounter(`proxy_requests_${type}_total`, data);
            
            if (responseTime > 0) {
                this.metrics.recordHistogram('proxy_response_time_ms', responseTime, data);
            }
        }
    }
    
    /**
     * 获取性能统计
     */
    getStats() {
        return {
            ...this.stats,
            config: {
                proxy: this.getProxyInfo(),
                connectionPool: this.proxyConfig.connectionPool,
                performance: this.proxyConfig.performance
            },
            uptime: process.uptime(),
            timestamp: Date.now()
        };
    }
    
    /**
     * 重置统计数据
     */
    resetStats() {
        this.stats = {
            connections: {
                total: 0,
                active: 0,
                reused: 0,
                failed: 0
            },
            proxy: {
                requests: 0,
                successes: 0,
                failures: 0,
                timeouts: 0
            },
            performance: {
                avgResponseTime: 0,
                totalResponseTime: 0,
                requestCount: 0
            }
        };
        
        if (this.logger) {
            this.logger.info('代理统计数据已重置');
        }
    }
    
    /**
     * 获取健康状态
     */
    getHealthStatus() {
        const stats = this.getStats();
        const successRate = stats.proxy.requests > 0 
            ? (stats.proxy.successes / stats.proxy.requests) * 100 
            : 100;
        
        const connectionReuseRate = stats.connections.total > 0 
            ? (stats.connections.reused / stats.connections.total) * 100 
            : 0;
        
        return {
            status: successRate >= 95 ? 'healthy' : successRate >= 80 ? 'warning' : 'unhealthy',
            successRate: Math.round(successRate * 100) / 100,
            connectionReuseRate: Math.round(connectionReuseRate * 100) / 100,
            avgResponseTime: stats.performance.avgResponseTime,
            activeConnections: stats.connections.active,
            proxyEnabled: this.isProxyEnabled(),
            timestamp: Date.now()
        };
    }
    
    /**
     * 验证配置
     */
    _validateConfig() {
        const config = this.proxyConfig;
        
        // 验证代理URL
        if (config.proxy) {
            try {
                const proxyUrl = url.parse(config.proxy);
                if (!proxyUrl.hostname) {
                    throw new Error('Invalid proxy hostname');
                }
            } catch (error) {
                throw new Error(`Invalid proxy configuration: ${error.message}`);
            }
        }
        
        // 验证连接池配置
        if (config.connectionPool.maxSockets < 1) {
            throw new Error('maxSockets must be greater than 0');
        }
        
        if (config.connectionPool.timeout < 1000) {
            throw new Error('timeout must be at least 1000ms');
        }
        
        // 验证性能配置
        if (config.performance.retryAttempts < 0) {
            throw new Error('retryAttempts must be non-negative');
        }
        
        if (config.performance.retryDelay < 0) {
            throw new Error('retryDelay must be non-negative');
        }
    }
    
    /**
     * 更新响应时间统计
     */
    _updateResponseTime(responseTime) {
        this.stats.performance.totalResponseTime += responseTime;
        this.stats.performance.requestCount++;
        this.stats.performance.avgResponseTime = 
            this.stats.performance.totalResponseTime / this.stats.performance.requestCount;
    }
    
    /**
     * 启动监控
     */
    _startMonitoring() {
        if (!this.proxyConfig.performance.enableMetrics) {
            return;
        }
        
        // 定期发出统计事件
        this.monitoringInterval = setInterval(() => {
            const stats = this.getStats();
            const health = this.getHealthStatus();
            
            this.emit('stats', stats);
            this.emit('health', health);
            
            // 记录到日志
            if (this.logger) {
                this.logger.debug('代理性能统计', {
                    successRate: health.successRate,
                    avgResponseTime: health.avgResponseTime,
                    activeConnections: health.activeConnections
                });
            }
        }, 30000); // 每30秒发出一次统计
    }
    
    /**
     * 停止监控
     */
    _stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this._stopMonitoring();
        this.removeAllListeners();
        
        if (this.logger) {
            this.logger.info('代理配置管理器已销毁');
        }
    }
}

module.exports = ProxyConfigManager;