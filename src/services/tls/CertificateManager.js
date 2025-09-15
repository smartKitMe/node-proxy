const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const EventEmitter = require('events');

/**
 * TLS证书管理器
 * 负责SSL/TLS证书的生成、缓存和管理
 */
class CertificateManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        // 证书配置
        this.certDir = options.certDir || path.join(process.cwd(), 'certs');
        this.caCertPath = options.caCertPath || path.join(this.certDir, 'ca.crt');
        this.caKeyPath = options.caKeyPath || path.join(this.certDir, 'ca.key');
        
        // 证书缓存
        this.certCache = new Map();
        this.maxCacheSize = options.maxCacheSize || 1000;
        this.certTTL = options.certTTL || 24 * 60 * 60 * 1000; // 24小时
        
        // CA证书和密钥
        this.caCert = null;
        this.caKey = null;
        
        // 证书生成选项
        this.certOptions = {
            keySize: options.keySize || 2048,
            validityDays: options.validityDays || 365,
            algorithm: options.algorithm || 'sha256',
            country: options.country || 'US',
            state: options.state || 'CA',
            locality: options.locality || 'San Francisco',
            organization: options.organization || 'Node MITMProxy',
            organizationalUnit: options.organizationalUnit || 'IT Department'
        };
        
        // 统计信息
        this.stats = {
            generated: 0,
            cached: 0,
            hits: 0,
            misses: 0,
            errors: 0
        };
        
        // 清理定时器
        this.cleanupTimer = null;
        this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1小时
    }
    
    /**
     * 初始化证书管理器
     */
    async initialize() {
        try {
            // 确保证书目录存在
            await this._ensureCertDir();
            
            // 加载或生成CA证书
            await this._loadOrGenerateCA();
            
            // 启动清理定时器
            this._startCleanupTimer();
            
            if (this.logger) {
                this.logger.info('Certificate manager initialized', {
                    certDir: this.certDir,
                    maxCacheSize: this.maxCacheSize
                });
            }
            
            this.emit('initialized');
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Certificate manager initialization failed', {
                    error: error.message
                });
            }
            throw error;
        }
    }
    
    /**
     * 获取域名证书
     */
    async getCertificate(hostname, context = null) {
        if (!hostname) {
            throw new Error('Hostname is required');
        }
        
        // 检查是否有固定证书（从中间件注入）
        if (context && context.fixedCert && context.fixedKey) {
            if (this.logger && this.logger.isDebugEnabled()) {
                this.logger.debug('Using fixed certificate', { hostname });
            }
            return {
                cert: context.fixedCert,
                key: context.fixedKey,
                createdAt: Date.now()
            };
        }
        
        // 规范化主机名
        const normalizedHostname = this._normalizeHostname(hostname);
        
        // 检查缓存
        const cached = this.certCache.get(normalizedHostname);
        if (cached && !this._isCertExpired(cached)) {
            this.stats.hits++;
            return cached;
        }
        
        this.stats.misses++;
        
        try {
            // 生成新证书
            const cert = await this._generateCertificate(normalizedHostname);
            
            // 缓存证书
            this._cacheCertificate(normalizedHostname, cert);
            
            this.stats.generated++;
            
            if (this.logger) {
                this.logger.debug('Certificate generated', {
                    hostname: normalizedHostname
                });
            }
            
            return cert;
            
        } catch (error) {
            this.stats.errors++;
            
            if (this.logger) {
                this.logger.error('Certificate generation failed', {
                    hostname: normalizedHostname,
                    error: error.message
                });
            }
            
            throw error;
        }
    }
    
    /**
     * 获取CA证书
     */
    getCACertificate() {
        if (!this.caCert) {
            throw new Error('CA certificate not loaded');
        }
        
        return {
            cert: forge.pki.certificateToPem(this.caCert),
            key: forge.pki.privateKeyToPem(this.caKey)
        };
    }
    
    /**
     * 预生成证书
     */
    async preGenerateCertificate(hostname) {
        try {
            await this.getCertificate(hostname);
        } catch (error) {
            if (this.logger) {
                this.logger.warn('Certificate pre-generation failed', {
                    hostname,
                    error: error.message
                });
            }
        }
    }
    
    /**
     * 清除证书缓存
     */
    clearCache(hostname) {
        if (hostname) {
            const normalizedHostname = this._normalizeHostname(hostname);
            return this.certCache.delete(normalizedHostname);
        } else {
            this.certCache.clear();
            return true;
        }
    }
    
    /**
     * 确保证书目录存在
     */
    async _ensureCertDir() {
        try {
            await fs.promises.access(this.certDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.promises.mkdir(this.certDir, { recursive: true });
            } else {
                throw error;
            }
        }
    }
    
    /**
     * 加载或生成CA证书
     */
    async _loadOrGenerateCA() {
        try {
            // 尝试加载现有CA证书
            const caCertPem = await fs.promises.readFile(this.caCertPath, 'utf8');
            const caKeyPem = await fs.promises.readFile(this.caKeyPath, 'utf8');
            
            this.caCert = forge.pki.certificateFromPem(caCertPem);
            this.caKey = forge.pki.privateKeyFromPem(caKeyPem);
            
            // 验证CA证书是否有效
            if (this._isCACertExpired()) {
                throw new Error('CA certificate expired');
            }
            
            if (this.logger) {
                this.logger.info('CA certificate loaded', {
                    subject: this.caCert.subject.getField('CN').value,
                    validFrom: this.caCert.validity.notBefore,
                    validTo: this.caCert.validity.notAfter
                });
            }
            
        } catch (error) {
            if (this.logger) {
                this.logger.info('Generating new CA certificate', {
                    reason: error.message
                });
            }
            
            // 生成新的CA证书
            await this._generateCA();
        }
    }
    
    /**
     * 生成CA证书
     */
    async _generateCA() {
        // 生成CA密钥对
        const caKeys = forge.pki.rsa.generateKeyPair(this.certOptions.keySize);
        
        // 创建CA证书
        const caCert = forge.pki.createCertificate();
        caCert.publicKey = caKeys.publicKey;
        caCert.serialNumber = this._generateSerialNumber();
        
        // 设置有效期
        caCert.validity.notBefore = new Date();
        caCert.validity.notAfter = new Date();
        caCert.validity.notAfter.setFullYear(
            caCert.validity.notBefore.getFullYear() + Math.ceil(this.certOptions.validityDays / 365)
        );
        
        // 设置主题和颁发者
        const attrs = [
            { name: 'countryName', value: this.certOptions.country },
            { name: 'stateOrProvinceName', value: this.certOptions.state },
            { name: 'localityName', value: this.certOptions.locality },
            { name: 'organizationName', value: this.certOptions.organization },
            { name: 'organizationalUnitName', value: this.certOptions.organizationalUnit },
            { name: 'commonName', value: 'Node MITMProxy CA' }
        ];
        
        caCert.setSubject(attrs);
        caCert.setIssuer(attrs);
        
        // 设置扩展
        caCert.setExtensions([
            {
                name: 'basicConstraints',
                cA: true,
                critical: true
            },
            {
                name: 'keyUsage',
                keyCertSign: true,
                cRLSign: true,
                critical: true
            },
            {
                name: 'subjectKeyIdentifier'
            }
        ]);
        
        // 自签名
        caCert.sign(caKeys.privateKey, forge.md[this.certOptions.algorithm].create());
        
        // 保存CA证书和密钥
        const caCertPem = forge.pki.certificateToPem(caCert);
        const caKeyPem = forge.pki.privateKeyToPem(caKeys.privateKey);
        
        await fs.promises.writeFile(this.caCertPath, caCertPem);
        await fs.promises.writeFile(this.caKeyPath, caKeyPem);
        
        // 设置文件权限
        await fs.promises.chmod(this.caKeyPath, 0o600);
        
        this.caCert = caCert;
        this.caKey = caKeys.privateKey;
        
        if (this.logger) {
            this.logger.info('CA certificate generated', {
                subject: 'Node MITMProxy CA',
                validFrom: caCert.validity.notBefore,
                validTo: caCert.validity.notAfter
            });
        }
    }
    
    /**
     * 生成域名证书
     */
    async _generateCertificate(hostname) {
        // 生成密钥对
        const keys = forge.pki.rsa.generateKeyPair(this.certOptions.keySize);
        
        // 创建证书
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = this._generateSerialNumber();
        
        // 设置有效期
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setDate(
            cert.validity.notBefore.getDate() + this.certOptions.validityDays
        );
        
        // 设置主题
        const attrs = [
            { name: 'countryName', value: this.certOptions.country },
            { name: 'stateOrProvinceName', value: this.certOptions.state },
            { name: 'localityName', value: this.certOptions.locality },
            { name: 'organizationName', value: this.certOptions.organization },
            { name: 'organizationalUnitName', value: this.certOptions.organizationalUnit },
            { name: 'commonName', value: hostname }
        ];
        
        cert.setSubject(attrs);
        cert.setIssuer(this.caCert.subject.attributes);
        
        // 设置扩展
        const extensions = [
            {
                name: 'basicConstraints',
                cA: false
            },
            {
                name: 'keyUsage',
                keyEncipherment: true,
                digitalSignature: true
            },
            {
                name: 'extKeyUsage',
                serverAuth: true,
                clientAuth: true
            },
            {
                name: 'subjectAltName',
                altNames: this._generateAltNames(hostname)
            }
        ];
        
        cert.setExtensions(extensions);
        
        // 使用CA密钥签名
        cert.sign(this.caKey, forge.md[this.certOptions.algorithm].create());
        
        return {
            cert: forge.pki.certificateToPem(cert),
            key: forge.pki.privateKeyToPem(keys.privateKey),
            createdAt: Date.now()
        };
    }
    
    /**
     * 生成备用名称
     */
    _generateAltNames(hostname) {
        const altNames = [
            { type: 2, value: hostname } // DNS name
        ];
        
        // 如果是IP地址，添加IP类型
        if (this._isIPAddress(hostname)) {
            altNames.push({ type: 7, ip: hostname });
        } else {
            // 添加通配符域名
            if (!hostname.startsWith('*.')) {
                const parts = hostname.split('.');
                if (parts.length > 1) {
                    const wildcardDomain = '*.' + parts.slice(1).join('.');
                    altNames.push({ type: 2, value: wildcardDomain });
                }
            }
        }
        
        return altNames;
    }
    
    /**
     * 缓存证书
     */
    _cacheCertificate(hostname, cert) {
        // 检查缓存大小限制
        if (this.certCache.size >= this.maxCacheSize) {
            this._evictOldestCertificate();
        }
        
        this.certCache.set(hostname, cert);
        this.stats.cached++;
    }
    
    /**
     * 驱逐最旧的证书
     */
    _evictOldestCertificate() {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, cert] of this.certCache.entries()) {
            if (cert.createdAt < oldestTime) {
                oldestTime = cert.createdAt;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.certCache.delete(oldestKey);
        }
    }
    
    /**
     * 检查证书是否过期
     */
    _isCertExpired(cert) {
        return Date.now() - cert.createdAt > this.certTTL;
    }
    
    /**
     * 检查CA证书是否过期
     */
    _isCACertExpired() {
        return new Date() >= this.caCert.validity.notAfter;
    }
    
    /**
     * 规范化主机名
     */
    _normalizeHostname(hostname) {
        return hostname.toLowerCase().trim();
    }
    
    /**
     * 检查是否为IP地址
     */
    _isIPAddress(hostname) {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(hostname) || ipv6Regex.test(hostname);
    }
    
    /**
     * 生成序列号
     */
    _generateSerialNumber() {
        return Math.floor(Math.random() * 1000000000).toString();
    }
    
    /**
     * 启动清理定时器
     */
    _startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this._cleanupExpiredCertificates();
        }, this.cleanupInterval);
    }
    
    /**
     * 清理过期证书
     */
    _cleanupExpiredCertificates() {
        let cleaned = 0;
        
        for (const [hostname, cert] of this.certCache.entries()) {
            if (this._isCertExpired(cert)) {
                this.certCache.delete(hostname);
                cleaned++;
            }
        }
        
        if (cleaned > 0 && this.logger && this.logger.isDebugEnabled()) {
            this.logger.debug('Cleaned up expired certificates', { count: cleaned });
        }
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.certCache.size,
            hitRate: this.stats.hits + this.stats.misses > 0 
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            generated: 0,
            cached: 0,
            hits: 0,
            misses: 0,
            errors: 0
        };
    }
    
    /**
     * 销毁证书管理器
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        this.certCache.clear();
        this.removeAllListeners();
        
        if (this.logger) {
            this.logger.info('Certificate manager destroyed');
        }
    }
}

module.exports = CertificateManager;