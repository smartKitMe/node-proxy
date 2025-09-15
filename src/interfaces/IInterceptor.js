/**
 * 拦截器接口
 * 所有拦截器必须实现此接口
 */
class IInterceptor {
    /**
     * 拦截器名称
     */
    get name() {
        throw new Error('Interceptor must implement name getter');
    }
    
    /**
     * 判断是否应该拦截请求
     * @param {RequestContext} context - 请求上下文
     * @returns {boolean} 是否拦截
     */
    shouldIntercept(context) {
        throw new Error('Interceptor must implement shouldIntercept method');
    }
    
    /**
     * 拦截请求处理
     * @param {RequestContext} context - 请求上下文
     */
    async interceptRequest(context) {
        throw new Error('Interceptor must implement interceptRequest method');
    }
    
    /**
     * 拦截响应处理
     * @param {RequestContext} context - 请求上下文
     */
    async interceptResponse(context) {
        // 可选实现
    }
    
    /**
     * 拦截器初始化
     * @param {Object} config - 配置对象
     */
    async initialize(config) {
        // 可选实现
    }
    
    /**
     * 拦截器销毁
     */
    async destroy() {
        // 可选实现
    }
}

module.exports = IInterceptor;