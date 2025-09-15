const IMiddleware = require('../../interfaces/IMiddleware');
const fs = require('fs');
const forge = require('node-forge');

/**
 * 固定证书中间件
 * 用于支持使用预设的固定证书，提升性能
 */
class FixedCertMiddleware extends IMiddleware {
    constructor(options = {}) {
        super();
        
        this.name = 'fixed-cert-middleware';
        this.priority = 1000; // 高优先级，确保在其他中间件之前执行
        
        // 固定证书配置
        this.fixedCert = null;
        this.fixedKey = null;
        this.useFixedCert = false;
        
        // 从选项中加载证书
        if (options.fixedCert && options.fixedKey) {
            // 直接使用证书对象
            this.fixedCert = options.fixedCert;
            this.fixedKey = options.fixedKey;
            this.useFixedCert = true;
        } else if (options.fixedCertPath && options.fixedKeyPath) {
            // 从文件加载证书
            try {
                const certPem = fs.readFileSync(options.fixedCertPath, 'utf8');
                const keyPem = fs.readFileSync(options.fixedKeyPath, 'utf8');
                this.fixedCert = forge.pki.certificateFromPem(certPem);
                this.fixedKey = forge.pki.privateKeyFromPem(keyPem);
                this.useFixedCert = true;
            } catch (error) {
                console.error('Failed to load fixed certificate:', error);
            }
        } else if (options.fixedCertString && options.fixedKeyString) {
            // 从字符串加载证书
            try {
                this.fixedCert = forge.pki.certificateFromPem(options.fixedCertString);
                this.fixedKey = forge.pki.privateKeyFromPem(options.fixedKeyString);
                this.useFixedCert = true;
            } catch (error) {
                console.error('Failed to parse fixed certificate string:', error);
            }
        }
    }
    
    /**
     * 初始化中间件
     */
    async initialize() {
        if (this.useFixedCert) {
            this.logger.info('Fixed certificate middleware initialized', {
                enabled: true,
                hasFixedCert: !!this.fixedCert,
                hasFixedKey: !!this.fixedKey
            });
        }
    }
    
    /**
     * 处理请求
     */
    async execute(context, next) {
        if (this.useFixedCert && this.fixedCert && this.fixedKey) {
            // 注入固定证书到上下文
            context.fixedCert = this.fixedCert;
            context.fixedKey = this.fixedKey;
            
            // 记录性能指标
            this.metrics.increment('fixed_cert.used');
        }
        
        await next();
    }
    
    /**
     * 启用或禁用固定证书
     */
    enableFixedCert(enable) {
        this.useFixedCert = enable && !!this.fixedCert && !!this.fixedKey;
        return this.useFixedCert;
    }
    
    /**
     * 设置新的固定证书
     */
    setFixedCert(cert, key) {
        if (!cert || !key) {
            throw new Error('Certificate and key are required');
        }
        
        this.fixedCert = cert;
        this.fixedKey = key;
        this.useFixedCert = true;
        
        return true;
    }
    
    /**
     * 检查是否启用了固定证书
     */
    isFixedCertEnabled() {
        return this.useFixedCert && !!this.fixedCert && !!this.fixedKey;
    }
    
    /**
     * 获取当前的固定证书
     */
    getFixedCert() {
        if (!this.useFixedCert) {
            return null;
        }
        
        return {
            cert: this.fixedCert,
            key: this.fixedKey
        };
    }
    
    /**
     * 销毁中间件
     */
    destroy() {
        this.fixedCert = null;
        this.fixedKey = null;
        this.useFixedCert = false;
    }
}

module.exports = FixedCertMiddleware;