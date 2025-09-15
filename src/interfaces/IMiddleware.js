/**
 * 中间件接口
 * 所有中间件必须实现此接口
 */
class IMiddleware {
    /**
     * 中间件名称
     */
    get name() {
        throw new Error('Middleware must implement name getter');
    }
    
    /**
     * 中间件优先级（数字越小优先级越高）
     */
    get priority() {
        return 100;
    }
    
    /**
     * 执行中间件逻辑
     * @param {RequestContext} context - 请求上下文
     * @param {...any} args - 额外参数
     */
    async execute(context, ...args) {
        throw new Error('Middleware must implement execute method');
    }
    
    /**
     * 中间件初始化
     * @param {Object} config - 配置对象
     */
    async initialize(config) {
        // 可选实现
    }
    
    /**
     * 中间件销毁
     */
    async destroy() {
        // 可选实现
    }
}

module.exports = IMiddleware;