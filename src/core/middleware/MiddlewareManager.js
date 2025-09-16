const EventEmitter = require('events');

/**
 * 中间件管理器
 * 负责管理和执行中间件链
 */
class MiddlewareManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        // 中间件存储
        this.middlewares = new Map();
        this.sortedMiddlewares = [];
        
        // 执行选项
        this.timeout = options.timeout || 30000;
        this.maxConcurrent = options.maxConcurrent || 100;
        
        // 统计信息
        this.stats = {
            registered: 0,
            executed: 0,
            errors: 0,
            totalTime: 0
        };
        
        // 当前执行中的中间件
        this.executing = new Set();
    }
    
    /**
     * 注册中间件
     */
    register(middleware) {
        if (!middleware || typeof middleware !== 'object') {
            throw new Error('Middleware must be an object');
        }
        
        if (!middleware.name || typeof middleware.name !== 'string') {
            throw new Error('Middleware must have a name');
        }
        
        if (typeof middleware.execute !== 'function') {
            throw new Error('Middleware must have an execute method');
        }
        
        // 设置默认优先级
        if (typeof middleware.priority !== 'number') {
            middleware.priority = 100;
        }
        
        // 检查是否已存在
        if (this.middlewares.has(middleware.name)) {
            if (this.logger) {
                this.logger.warn('Middleware already exists, replacing', { name: middleware.name });
            }
        }
        
        // 存储中间件
        this.middlewares.set(middleware.name, middleware);
        
        // 重新排序
        this._sortMiddlewares();
        
        // 初始化中间件
        if (typeof middleware.initialize === 'function') {
            try {
                middleware.initialize();
            } catch (error) {
                if (this.logger) {
                    this.logger.error('Middleware initialization failed', {
                        name: middleware.name,
                        error: error.message
                    });
                }
                throw error;
            }
        }
        
        this.stats.registered++;
        
        if (this.logger) {
            this.logger.info('Middleware registered', {
                name: middleware.name,
                priority: middleware.priority
            });
        }
        
        this.emit('middlewareRegistered', middleware);
        
        return this;
    }
    
    /**
     * 注销中间件
     */
    unregister(name) {
        const middleware = this.middlewares.get(name);
        if (!middleware) {
            return false;
        }
        
        // 销毁中间件
        if (typeof middleware.destroy === 'function') {
            try {
                middleware.destroy();
            } catch (error) {
                if (this.logger) {
                    this.logger.error('Middleware destruction failed', {
                        name: middleware.name,
                        error: error.message
                    });
                }
            }
        }
        
        // 移除中间件
        this.middlewares.delete(name);
        this._sortMiddlewares();
        
        this.stats.registered--;
        
        if (this.logger) {
            this.logger.info('Middleware unregistered', { name });
        }
        
        this.emit('middlewareUnregistered', middleware);
        
        return true;
    }
    
    /**
     * 获取中间件
     */
    get(name) {
        return this.middlewares.get(name);
    }
    
    /**
     * 获取所有中间件
     */
    getAll() {
        return Array.from(this.middlewares.values());
    }
    
    /**
     * 检查中间件是否存在
     */
    has(name) {
        return this.middlewares.has(name);
    }
    
    /**
     * 执行请求前中间件
     */
    async executeBeforeRequest(context) {
        return this._executeMiddlewares('beforeRequest', context);
    }
    
    /**
     * 执行请求后中间件
     */
    async executeAfterRequest(context) {
        return this._executeMiddlewares('afterRequest', context);
    }
    
    /**
     * 执行响应前中间件
     */
    async executeBeforeResponse(context) {
        return this._executeMiddlewares('beforeResponse', context);
    }
    
    /**
     * 执行响应后中间件
     */
    async executeAfterResponse(context) {
        return this._executeMiddlewares('afterResponse', context);
    }
    
    /**
     * 执行连接前中间件
     */
    async executeBeforeConnect(context) {
        return this._executeMiddlewares('beforeConnect', context);
    }
    
    /**
     * 执行连接后中间件
     */
    async executeAfterConnect(context) {
        return this._executeMiddlewares('afterConnect', context);
    }
    
    /**
     * 执行升级前中间件
     */
    async executeBeforeUpgrade(context) {
        return this._executeMiddlewares('beforeUpgrade', context);
    }
    
    /**
     * 执行升级后中间件
     */
    async executeAfterUpgrade(context) {
        return this._executeMiddlewares('afterUpgrade', context);
    }
    
    /**
     * 执行错误处理中间件
     */
    async executeOnError(context, error) {
        context.error = error;
        return this._executeMiddlewares('onError', context);
    }
    
    /**
     * 执行中间件链
     */
    async _executeMiddlewares(phase, context) {
        if (this.executing.size >= this.maxConcurrent) {
            throw new Error('Too many concurrent middleware executions');
        }
        
        const executionId = `${phase}_${Date.now()}_${Math.random()}`;
        this.executing.add(executionId);
        
        const startTime = Date.now();
        
        try {
            for (const middleware of this.sortedMiddlewares) {
                if (context.stopped) {
                    break;
                }
                
                // 检查中间件是否支持此阶段
                if (typeof middleware.execute !== 'function') {
                    continue;
                }
                
                // 检查中间件是否应该在此阶段执行
                if (!this._shouldExecuteInPhase(middleware, phase)) {
                    continue;
                }
                
                try {
                    await this._executeMiddleware(middleware, phase, context);
                } catch (error) {
                    this.stats.errors++;
                    
                    if (this.logger) {
                        this.logger.error('Middleware execution failed', {
                            name: middleware.name,
                            phase,
                            error: error.message
                        });
                    }
                    
                    // 如果是错误处理阶段，不要再次抛出错误
                    if (phase !== 'onError') {
                        throw error;
                    }
                }
            }
            
            this.stats.executed++;
            
        } finally {
            this.executing.delete(executionId);
            
            const duration = Date.now() - startTime;
            this.stats.totalTime += duration;
            
            if (this.metrics) {
                this.metrics.recordMiddleware(phase, duration);
            }
        }
    }
    
    /**
     * 执行单个中间件
     */
    async _executeMiddleware(middleware, phase, context) {
        const startTime = Date.now();
        
        try {
            // 创建超时Promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Middleware '${middleware.name}' timeout in phase '${phase}'`));
                }, this.timeout);
            });
            
            // 执行中间件
            const executionPromise = middleware.execute(context, phase);
            
            // 等待执行完成或超时
            await Promise.race([executionPromise, timeoutPromise]);
            
        } finally {
            const duration = Date.now() - startTime;
            
            if (this.logger && this.logger.isDebugEnabled()) {
                this.logger.debug('Middleware executed', {
                    name: middleware.name,
                    phase,
                    duration
                });
            }
            
            if (this.metrics) {
                this.metrics.recordMiddleware(middleware.name, duration);
            }
        }
    }
    
    /**
     * 检查中间件是否应该在指定阶段执行
     */
    _shouldExecuteInPhase(middleware, phase) {
        // 如果中间件定义了phases属性，检查是否包含当前阶段
        if (Array.isArray(middleware.phases)) {
            return middleware.phases.includes(phase);
        }
        
        // 如果中间件定义了shouldExecute方法，调用它
        if (typeof middleware.shouldExecute === 'function') {
            try {
                return middleware.shouldExecute(phase);
            } catch (error) {
                if (this.logger) {
                    this.logger.warn('Middleware shouldExecute check failed', {
                        name: middleware.name,
                        phase,
                        error: error.message
                    });
                }
                return false;
            }
        }
        
        // 默认在所有阶段执行
        return true;
    }
    
    /**
     * 排序中间件
     */
    _sortMiddlewares() {
        this.sortedMiddlewares = Array.from(this.middlewares.values())
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
     * 清空所有中间件
     */
    clear() {
        // 销毁所有中间件
        for (const middleware of this.middlewares.values()) {
            if (typeof middleware.destroy === 'function') {
                try {
                    middleware.destroy();
                } catch (error) {
                    if (this.logger) {
                        this.logger.error('Middleware destruction failed during clear', {
                            name: middleware.name,
                            error: error.message
                        });
                    }
                }
            }
        }
        
        this.middlewares.clear();
        this.sortedMiddlewares = [];
        this.stats.registered = 0;
        
        this.emit('middlewaresCleared');
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            averageTime: this.stats.executed > 0 ? this.stats.totalTime / this.stats.executed : 0,
            executing: this.executing.size
        };
    }
    
    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            registered: this.middlewares.size,
            executed: 0,
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

module.exports = MiddlewareManager;