const NodeMITMProxy = require('../index');
const EventEmitter = require('events');

/**
 * 向后兼容适配器
 * 提供与旧版本API兼容的接口
 */
class LegacyAdapter extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // 创建新版本的代理实例
        this.proxy = new NodeMITMProxy(options);
        
        // 绑定事件转发
        this._bindEvents();
        
        // 兼容性标记
        this.isLegacyAdapter = true;
        this.version = '1.x-compat';
    }
    
    /**
     * 绑定事件转发
     */
    _bindEvents() {
        // 转发代理服务器事件
        if (this.proxy.proxyServer) {
            this.proxy.proxyServer.on('request', (context) => {
                this.emit('request', context.request, context.response);
            });
            
            this.proxy.proxyServer.on('connect', (context) => {
                this.emit('connect', context.request, context.socket, context.head);
            });
            
            this.proxy.proxyServer.on('upgrade', (context) => {
                this.emit('upgrade', context.request, context.socket, context.head);
            });
            
            this.proxy.proxyServer.on('error', (error) => {
                this.emit('error', error);
            });
        }
    }
    
    /**
     * 启动代理服务器（兼容旧版本API）
     */
    listen(port, host, callback) {
        if (typeof host === 'function') {
            callback = host;
            host = undefined;
        }
        
        this.proxy.start(port, host)
            .then(() => {
                this.emit('listening');
                if (callback) callback();
            })
            .catch((error) => {
                this.emit('error', error);
                if (callback) callback(error);
            });
        
        return this;
    }
    
    /**
     * 停止代理服务器（兼容旧版本API）
     */
    close(callback) {
        this.proxy.stop()
            .then(() => {
                this.emit('close');
                if (callback) callback();
            })
            .catch((error) => {
                this.emit('error', error);
                if (callback) callback(error);
            });
        
        return this;
    }
    
    /**
     * 添加中间件（兼容旧版本API）
     */
    use(middleware) {
        if (typeof middleware === 'function') {
            // 将函数式中间件转换为新格式
            const wrappedMiddleware = {
                name: `legacy_${Date.now()}_${Math.random()}`,
                priority: 100,
                execute: async (context, phase) => {
                    if (phase === 'beforeRequest') {
                        return new Promise((resolve, reject) => {
                            try {
                                const result = middleware(context.request, context.response, (error) => {
                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve();
                                    }
                                });
                                
                                // 如果中间件返回Promise
                                if (result && typeof result.then === 'function') {
                                    result.then(resolve).catch(reject);
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });
                    }
                }
            };
            
            return this.proxy.use(wrappedMiddleware);
        } else {
            // 直接使用新格式中间件
            return this.proxy.use(middleware);
        }
    }
    
    /**
     * 添加拦截器（兼容旧版本API）
     */
    addInterceptor(interceptor) {
        return this.proxy.intercept(interceptor);
    }
    
    /**
     * 获取地址信息（兼容旧版本API）
     */
    address() {
        if (!this.proxy.running) {
            return null;
        }
        
        return {
            address: this.proxy.proxyServer.getHost(),
            family: 'IPv4',
            port: this.proxy.proxyServer.getPort()
        };
    }
    
    /**
     * 获取监听状态（兼容旧版本API）
     */
    listening() {
        return this.proxy.running;
    }
    
    /**
     * 设置最大监听器数量（兼容旧版本API）
     */
    setMaxListeners(n) {
        super.setMaxListeners(n);
        return this;
    }
    
    /**
     * 获取CA证书（兼容旧版本API）
     */
    getCACert() {
        try {
            const caCert = this.proxy.getCACertificate();
            return caCert.cert;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 获取CA私钥（兼容旧版本API）
     */
    getCAKey() {
        try {
            const caCert = this.proxy.getCACertificate();
            return caCert.key;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 获取统计信息（兼容旧版本API）
     */
    getStats() {
        return this.proxy.getStats();
    }
    
    /**
     * 重置统计信息（兼容旧版本API）
     */
    resetStats() {
        if (this.proxy.metrics) {
            this.proxy.metrics.reset();
        }
        return this;
    }
    
    /**
     * 获取配置（兼容旧版本API）
     */
    getConfig(key) {
        return this.proxy.getConfig(key);
    }
    
    /**
     * 设置配置（兼容旧版本API）
     */
    setConfig(key, value) {
        return this.proxy.setConfig(key, value);
    }
    
    /**
     * 销毁代理（兼容旧版本API）
     */
    destroy() {
        return this.proxy.destroy();
    }
}

/**
 * 创建兼容的代理实例
 */
function createLegacyProxy(options = {}) {
    return new LegacyAdapter(options);
}

/**
 * 旧版本的工厂函数（兼容性）
 */
function createProxy(options = {}) {
    return new LegacyAdapter(options);
}

// 导出适配器
module.exports = LegacyAdapter;
module.exports.createLegacyProxy = createLegacyProxy;
module.exports.createProxy = createProxy;
module.exports.default = LegacyAdapter;

// 兼容性标记
module.exports.isLegacyAdapter = true;
module.exports.version = '1.x-compat';