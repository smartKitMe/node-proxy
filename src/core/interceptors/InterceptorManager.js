const EventEmitter = require('events');

/**
 * 拦截器管理器
 * 负责管理和执行拦截器
 */
class InterceptorManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        // 拦截器存储
        this.interceptors = new Map();
        this.sortedInterceptors = [];
        
        // 执行选项
        this.timeout = options.timeout || 30000;
        this.maxConcurrent = options.maxConcurrent || 50;
        
        // 统计信息
        this.stats = {
            registered: 0,
            intercepted: 0,
            errors: 0,
            totalTime: 0
        };
        
        // 当前执行中的拦截器
        this.executing = new Set();
    }
    
    /**
     * 注册拦截器
     */
    register(interceptor) {
        if (!interceptor || typeof interceptor !== 'object') {
            throw new Error('Interceptor must be an object');
        }
        
        if (!interceptor.name || typeof interceptor.name !== 'string') {
            throw new Error('Interceptor must have a name');
        }
        
        if (typeof interceptor.shouldIntercept !== 'function') {
            throw new Error('Interceptor must have a shouldIntercept method');
        }
        
        // 设置默认优先级
        if (typeof interceptor.priority !== 'number') {
            interceptor.priority = 100;
        }
        
        // 检查是否已存在
        if (this.interceptors.has(interceptor.name)) {
            if (this.logger) {
                this.logger.warn('Interceptor already exists, replacing', { name: interceptor.name });
            }
        }
        
        // 存储拦截器
        this.interceptors.set(interceptor.name, interceptor);
        
        // 重新排序
        this._sortInterceptors();
        
        // 初始化拦截器
        if (typeof interceptor.initialize === 'function') {
            try {
                interceptor.initialize();
            } catch (error) {
                if (this.logger) {
                    this.logger.error('Interceptor initialization failed', {
                        name: interceptor.name,
                        error: error.message
                    });
                }
                throw error;
            }
        }
        
        this.stats.registered++;
        
        if (this.logger) {
            this.logger.info('Interceptor registered', {
                name: interceptor.name,
                priority: interceptor.priority
            });
        }
        
        this.emit('interceptorRegistered', interceptor);
        
        return this;
    }
    
    /**
     * 注销拦截器
     */
    unregister(name) {
        const interceptor = this.interceptors.get(name);
        if (!interceptor) {
            return false;
        }
        
        // 销毁拦截器
        if (typeof interceptor.destroy === 'function') {
            try {
                interceptor.destroy();
            } catch (error) {
                if (this.logger) {
                    this.logger.error('Interceptor destruction failed', {
                        name: interceptor.name,
                        error: error.message
                    });
                }
            }
        }
        
        // 移除拦截器
        this.interceptors.delete(name);
        this._sortInterceptors();
        
        this.stats.registered--;
        
        if (this.logger) {
            this.logger.info('Interceptor unregistered', { name });
        }
        
        this.emit('interceptorUnregistered', interceptor);
        
        return true;
    }
    
    /**
     * 获取拦截器
     */
    get(name) {
        return this.interceptors.get(name);
    }
    
    /**
     * 获取所有拦截器
     */
    getAll() {
        return Array.from(this.interceptors.values());
    }
    
    /**
     * 检查拦截器是否存在
     */
    has(name) {
        return this.interceptors.has(name);
    }
    
    /**
     * 检查是否应该拦截请求
     */
    async shouldInterceptRequest(context) {
        return this._shouldIntercept('request', context);
    }
    
    /**
     * 拦截请求
     */
    async interceptRequest(context) {
        return this._intercept('request', context, 'interceptRequest');
    }
    
    /**
     * 检查是否应该拦截响应
     */
    async shouldInterceptResponse(context) {
        return this._shouldIntercept('response', context);
    }
    
    /**
     * 拦截响应
     */
    async interceptResponse(context) {
        return this._intercept('response', context, 'interceptResponse');
    }
    
    /**
     * 检查是否应该拦截连接
     */
    async shouldInterceptConnect(context) {
        return this._shouldIntercept('connect', context);
    }
    
    /**
     * 拦截连接
     */
    async interceptConnect(context) {
        return this._intercept('connect', context, 'interceptConnect');
    }
    
    /**
     * 检查是否应该拦截升级
     */
    async shouldInterceptUpgrade(context) {
        return this._shouldIntercept('upgrade', context);
    }
    
    /**
     * 拦截升级
     */
    async interceptUpgrade(context) {
        return this._intercept('upgrade', context, 'interceptUpgrade');
    }
    
    /**
     * 检查是否应该拦截
     */
    async _shouldIntercept(type, context) {
        for (const interceptor of this.sortedInterceptors) {
            try {
                const shouldIntercept = await this._callShouldIntercept(interceptor, type, context);
                if (shouldIntercept) {
                    return true;
                }
            } catch (error) {
                if (this.logger) {
                    this.logger.error('Interceptor shouldIntercept check failed', {
                        name: interceptor.name,
                        type,
                        error: error.message
                    });
                }
                // 继续检查其他拦截器
            }
        }
        
        return false;
    }
    
    /**
     * 执行拦截
     */
    async _intercept(type, context, methodName) {
        if (this.executing.size >= this.maxConcurrent) {
            throw new Error('Too many concurrent interceptor executions');
        }
        
        const executionId = `${type}_${Date.now()}_${Math.random()}`;
        this.executing.add(executionId);
        
        const startTime = Date.now();
        
        try {
            for (const interceptor of this.sortedInterceptors) {
                if (context.stopped) {
                    break;
                }
                
                try {
                    // 检查是否应该拦截
                    const shouldIntercept = await this._callShouldIntercept(interceptor, type, context);
                    if (!shouldIntercept) {
                        continue;
                    }
                    
                    // 执行拦截
                    if (typeof interceptor[methodName] === 'function') {
                        await this._executeInterceptor(interceptor, methodName, context);
                        this.stats.intercepted++;
                        
                        if (this.logger && this.logger.isDebugEnabled()) {
                            this.logger.debug('Request intercepted', {
                                name: interceptor.name,
                                type
                            });
                        }
                        
                        // 如果拦截器标记为独占，停止执行其他拦截器
                        if (interceptor.exclusive) {
                            break;
                        }
                    }
                    
                } catch (error) {
                    this.stats.errors++;
                    
                    if (this.logger) {
                        this.logger.error('Interceptor execution failed', {
                            name: interceptor.name,
                            type,
                            error: error.message
                        });
                    }
                    
                    // 如果拦截器标记为关键，抛出错误
                    if (interceptor.critical) {
                        throw error;
                    }
                }
            }
            
        } finally {
            this.executing.delete(executionId);
            
            const duration = Date.now() - startTime;
            this.stats.totalTime += duration;
            
            if (this.metrics) {
                this.metrics.recordInterceptorExecution(type, duration);
            }
        }
    }
    
    /**
     * 调用shouldIntercept方法
     */
    async _callShouldIntercept(interceptor, type, context) {
        // 创建超时Promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Interceptor '${interceptor.name}' shouldIntercept timeout for type '${type}'`));
            }, this.timeout);
        });
        
        // 执行shouldIntercept
        const checkPromise = interceptor.shouldIntercept(context, type);
        
        // 等待执行完成或超时
        return await Promise.race([checkPromise, timeoutPromise]);
    }
    
    /**
     * 执行拦截器
     */
    async _executeInterceptor(interceptor, methodName, context) {
        const startTime = Date.now();
        
        try {
            // 创建超时Promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Interceptor '${interceptor.name}' ${methodName} timeout`));
                }, this.timeout);
            });
            
            // 执行拦截器
            const executionPromise = interceptor[methodName](context);
            
            // 等待执行完成或超时
            await Promise.race([executionPromise, timeoutPromise]);
            
        } finally {
            const duration = Date.now() - startTime;
            
            if (this.logger && this.logger.isDebugEnabled()) {
                this.logger.debug('Interceptor executed', {
                    name: interceptor.name,
                    method: methodName,
                    duration
                });
            }
            
            if (this.metrics) {
                this.metrics.recordInterceptorTime(interceptor.name, methodName, duration);
            }
        }
    }
    
    /**
     * 排序拦截器
     */
    _sortInterceptors() {
        this.sortedInterceptors = Array.from(this.interceptors.values())
            .sort((a, b) => {
                // 按优先级排序（数字越小优先级越高）
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                // 优先级相同时按名称排序
                return a.name.localeCompare(b.name);
            });
    }
    
    /**
     * 清空所有拦截器
     */
    clear() {
        // 销毁所有拦截器
        for (const interceptor of this.interceptors.values()) {
            if (typeof interceptor.destroy === 'function') {
                try {
                    interceptor.destroy();
                } catch (error) {
                    if (this.logger) {
                        this.logger.error('Interceptor destruction failed during clear', {
                            name: interceptor.name,
                            error: error.message
                        });
                    }
                }
            }
        }
        
        this.interceptors.clear();
        this.sortedInterceptors = [];
        this.stats.registered = 0;
        
        this.emit('interceptorsCleared');
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            averageTime: this.stats.intercepted > 0 ? this.stats.totalTime / this.stats.intercepted : 0,
            executing: this.executing.size
        };
    }
    
    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            registered: this.interceptors.size,
            intercepted: 0,
            errors: 0,
            totalTime: 0
        };
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this.clear();
        this.removeAllListeners();
    }
}

module.exports = InterceptorManager;