const EventEmitter = require('events');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

/**
 * TLS管理器
 * 负责TLS连接的创建、配置和管理
 */
class TlsManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        this.certificateManager = options.certificateManager;
        
        // TLS配置
        this.tlsOptions = {
            rejectUnauthorized: options.rejectUnauthorized || false,
            secureProtocol: options.secureProtocol || 'TLSv1_2_method',
            ciphers: options.ciphers || 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS',
            honorCipherOrder: options.honorCipherOrder !== false,
            ...options.tls
        };
        
        // 服务器选项缓存
        this.serverOptionsCache = new Map();
        this.maxCacheSize = options.maxCacheSize || 1000;
        
        // 统计信息
        this.stats = {
            connections: 0,
            certificates: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        
        if (this.logger) {
            this.logger.info('TLS manager initialized');
        }
    }
    
    /**
     * 获取服务器TLS选项
     * @param {string} hostname - 主机名
     * @returns {Promise<Object>} TLS选项
     */
    async getServerOptions(hostname) {
        try {
            // 检查缓存
            if (this.serverOptionsCache.has(hostname)) {
                this.stats.cacheHits++;
                return this.serverOptionsCache.get(hostname);
            }
            
            this.stats.cacheMisses++;
            
            // 获取证书
            let cert, key;
            if (this.certificateManager) {
                const certData = await this.certificateManager.getCertificate(hostname);
                cert = certData.cert;
                key = certData.key;
            } else {
                // 使用默认证书
                cert = this._getDefaultCert();
                key = this._getDefaultKey();
            }
            
            const serverOptions = {
                cert: cert,
                key: key,
                ...this.tlsOptions
            };
            
            // 缓存选项
            if (this.serverOptionsCache.size >= this.maxCacheSize) {
                // 清理最旧的缓存项
                const firstKey = this.serverOptionsCache.keys().next().value;
                this.serverOptionsCache.delete(firstKey);
            }
            
            this.serverOptionsCache.set(hostname, serverOptions);
            this.stats.certificates++;
            
            return serverOptions;
            
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('Failed to get server options', { hostname, error: error.message });
            }
            throw error;
        }
    }
    
    /**
     * 创建TLS服务器
     * @param {Object} options - TLS选项
     * @returns {tls.Server} TLS服务器
     */
    createServer(options = {}) {
        try {
            const serverOptions = {
                ...this.tlsOptions,
                ...options
            };
            
            const server = tls.createServer(serverOptions);
            
            server.on('secureConnection', () => {
                this.stats.connections++;
            });
            
            server.on('error', (error) => {
                this.stats.errors++;
                if (this.logger) {
                    this.logger.error('TLS server error', { error: error.message });
                }
                this.emit('error', error);
            });
            
            return server;
            
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('Failed to create TLS server', { error: error.message });
            }
            throw error;
        }
    }
    
    /**
     * 创建TLS连接
     * @param {Object} options - 连接选项
     * @returns {Promise<tls.TLSSocket>} TLS连接
     */
    createConnection(options = {}) {
        return new Promise((resolve, reject) => {
            try {
                const connectionOptions = {
                    ...this.tlsOptions,
                    ...options
                };
                
                const socket = tls.connect(connectionOptions);
                
                socket.on('secureConnect', () => {
                    this.stats.connections++;
                    resolve(socket);
                });
                
                socket.on('error', (error) => {
                    this.stats.errors++;
                    if (this.logger) {
                        this.logger.error('TLS connection error', { error: error.message });
                    }
                    reject(error);
                });
                
            } catch (error) {
                this.stats.errors++;
                if (this.logger) {
                    this.logger.error('Failed to create TLS connection', { error: error.message });
                }
                reject(error);
            }
        });
    }
    
    /**
     * 获取默认证书
     * @returns {string} 默认证书
     */
    _getDefaultCert() {
        // 返回一个简单的自签名证书
        return `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAMlyFqk69v+9MA0GCSqGSIb3DQEBCwUAMBQxEjAQBgNVBAMMCWxv
Y2FsaG9zdDAeFw0yMzEwMDEwMDAwMDBaFw0yNDEwMDEwMDAwMDBaMBQxEjAQBgNV
BAMMCWxvY2FsaG9zdDBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQDTwqq/kundZxlz
fAqC8AJGailfTZlQEBU8f/7RBmAjSuTt9J8dyKAl+yoHfKpY3QSrRQnpXrTXn5Vo
QMlnMb/fAgMBAAEwDQYJKoZIhvcNAQELBQADQQBJlffJHybjDGxRMqaRmDhX98S/
zpbOFBIXxWveKFdJzF9d3QGpfGFaMj5I6ac4R0wKGpf6oMXeWCKtqHiMkqNF
-----END CERTIFICATE-----`;
    }
    
    /**
     * 获取默认私钥
     * @returns {string} 默认私钥
     */
    _getDefaultKey() {
        // 返回一个简单的私钥
        return `-----BEGIN PRIVATE KEY-----
MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEA08Kqv5Lp3WcZc3wK
gvACRmopX02ZUBAVPH/+0QZgI0rk7fSfHcigJfsqB3yqWN0Eq0UJ6V6015+VaEDJ
ZzG/3wIDAQABAkEAiAmRiouAFfl5xYXTBv9z2Y1q1La8n4f7cpQcxss7gDggHp6i
IMuVt2cSRlJrmtBL7jyFSLuIuIcpLb+60+FVyQIhAPZsvPaplSQrXuiV2ncJw0s5
7LBqzFBgtzibVsJ+nmYHAiEA2XGHAn2EvuMpAh+OgPnwlnNjmmuPiU3jJ6LanVlN
k1kCIBmLZXr5AAoQs5uEiJ+2krEi3KKVdMqmhQrNxbdBVBXDAiAQkWw+dDrS5Bp7
D+hI5q5rYKSaZVrL3+Ug5H5Ug5H5UQIgMFrGnhZeZeI5+Ug5H5Ug5H5Ug5H5Ug5H
5Ug5H5U=
-----END PRIVATE KEY-----`;
    }
    
    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * 清理缓存
     */
    clearCache() {
        this.serverOptionsCache.clear();
        if (this.logger) {
            this.logger.info('TLS manager cache cleared');
        }
    }
    
    /**
     * 销毁TLS管理器
     */
    destroy() {
        this.clearCache();
        this.removeAllListeners();
        
        if (this.logger) {
            this.logger.info('TLS manager destroyed');
        }
    }
}

module.exports = TlsManager;