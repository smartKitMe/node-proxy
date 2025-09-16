const { InterceptorResponse } = require('../types/InterceptorTypes');

/**
 * 拦截器接口
 * 所有拦截器必须实现此接口
 * 
 * 支持两种拦截模式：
 * 1. 直接返回响应（不进行转发）
 * 2. 修改请求参数/请求体后转发
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
     * @param {string} type - 拦截类型 ('request', 'response', 'connect', 'upgrade')
     * @returns {boolean} 是否拦截
     */
    shouldIntercept(context, type) {
        throw new Error('Interceptor must implement shouldIntercept method');
    }
    
    /**
     * 拦截请求处理
     * @param {InterceptorContext} context - 拦截器上下文
     * @returns {InterceptorResponse} 拦截器响应
     */
    async interceptRequest(context) {
        // 默认实现：继续处理
        return InterceptorResponse.continue();
    }
    
    /**
     * 拦截响应处理
     * @param {InterceptorContext} context - 拦截器上下文
     * @returns {InterceptorResponse} 拦截器响应
     */
    async interceptResponse(context) {
        // 默认实现：继续处理
        return InterceptorResponse.continue();
    }
    
    /**
     * 拦截连接处理
     * @param {InterceptorContext} context - 拦截器上下文
     * @returns {InterceptorResponse} 拦截器响应
     */
    async interceptConnect(context) {
        // 默认实现：继续处理
        return InterceptorResponse.continue();
    }
    
    /**
     * 拦截升级处理
     * @param {InterceptorContext} context - 拦截器上下文
     * @returns {InterceptorResponse} 拦截器响应
     */
    async interceptUpgrade(context) {
        // 默认实现：继续处理
        return InterceptorResponse.continue();
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