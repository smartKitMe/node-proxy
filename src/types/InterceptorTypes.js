/**
 * 拦截器处理结果类型
 */
const InterceptorResult = {
    // 不拦截，继续正常流程
    CONTINUE: 'continue',
    
    // 拦截并直接返回响应，不进行转发
    DIRECT_RESPONSE: 'direct_response',
    
    // 拦截并修改请求参数/请求体后转发
    MODIFY_AND_FORWARD: 'modify_and_forward',
    
    // 停止处理（用于错误情况）
    STOP: 'stop'
};

/**
 * 拦截器响应数据结构
 */
class InterceptorResponse {
    constructor(result = InterceptorResult.CONTINUE, data = null) {
        this.result = result;
        this.data = data;
        this.timestamp = Date.now();
    }
    
    /**
     * 创建继续处理的响应
     */
    static continue() {
        return new InterceptorResponse(InterceptorResult.CONTINUE);
    }
    
    /**
     * 创建直接响应的结果
     * @param {Object} responseData - 响应数据
     * @param {number} responseData.statusCode - HTTP状态码
     * @param {Object} responseData.headers - 响应头
     * @param {string|Buffer} responseData.body - 响应体
     */
    static directResponse(responseData) {
        return new InterceptorResponse(InterceptorResult.DIRECT_RESPONSE, responseData);
    }
    
    /**
     * 创建修改后转发的结果
     * @param {Object} modifiedData - 修改后的数据
     * @param {Object} modifiedData.headers - 修改后的请求头
     * @param {string|Buffer} modifiedData.body - 修改后的请求体
     * @param {string} modifiedData.url - 修改后的URL
     * @param {string} modifiedData.method - 修改后的HTTP方法
     */
    static modifyAndForward(modifiedData) {
        return new InterceptorResponse(InterceptorResult.MODIFY_AND_FORWARD, modifiedData);
    }
    
    /**
     * 创建停止处理的结果
     * @param {string} reason - 停止原因
     */
    static stop(reason = 'Processing stopped') {
        return new InterceptorResponse(InterceptorResult.STOP, { reason });
    }
    
    /**
     * 检查是否应该继续处理
     */
    shouldContinue() {
        return this.result === InterceptorResult.CONTINUE;
    }
    
    /**
     * 检查是否应该直接响应
     */
    shouldDirectResponse() {
        return this.result === InterceptorResult.DIRECT_RESPONSE;
    }
    
    /**
     * 检查是否应该修改后转发
     */
    shouldModifyAndForward() {
        return this.result === InterceptorResult.MODIFY_AND_FORWARD;
    }
    
    /**
     * 检查是否应该停止处理
     */
    shouldStop() {
        return this.result === InterceptorResult.STOP;
    }
}

/**
 * 拦截器上下文增强
 * 为上下文添加拦截器相关的方法和属性
 */
class InterceptorContext {
    constructor(originalContext) {
        // 复制原始上下文的所有属性
        Object.assign(this, originalContext);
        
        // 拦截器相关属性
        this.interceptorResult = null;
        this.modifiedRequest = null;
        this.directResponse = null;
    }
    
    /**
     * 设置拦截器结果
     */
    setInterceptorResult(result) {
        this.interceptorResult = result;
        
        if (result.shouldDirectResponse()) {
            this.directResponse = result.data;
        } else if (result.shouldModifyAndForward()) {
            // 累积修改而不是覆盖
            if (!this.modifiedRequest) {
                this.modifiedRequest = {};
            }
            
            const newData = result.data;
            
            // 累积请求头修改
            if (newData.headers) {
                this.modifiedRequest.headers = {
                    ...this.modifiedRequest.headers,
                    ...newData.headers
                };
            }
            
            // 累积其他修改（后面的覆盖前面的）
            if (newData.url !== undefined) {
                this.modifiedRequest.url = newData.url;
                // 同时更新request.url，让后续拦截器能看到修改后的URL
                this.request.url = newData.url;
            }
            if (newData.method !== undefined) {
                this.modifiedRequest.method = newData.method;
                // 同时更新request.method
                this.request.method = newData.method;
            }
            if (newData.body !== undefined) {
                this.modifiedRequest.body = newData.body;
            }
        }
    }
    
    /**
     * 获取修改后的请求头
     */
    getModifiedHeaders() {
        if (this.modifiedRequest && this.modifiedRequest.headers) {
            return { ...this.request.headers, ...this.modifiedRequest.headers };
        }
        return this.request.headers;
    }
    
    /**
     * 获取修改后的请求体
     */
    getModifiedBody() {
        return this.modifiedRequest && this.modifiedRequest.body !== undefined 
            ? this.modifiedRequest.body 
            : null;
    }
    
    /**
     * 获取修改后的URL
     */
    getModifiedUrl() {
        return this.modifiedRequest && this.modifiedRequest.url 
            ? this.modifiedRequest.url 
            : this.request.url;
    }
    
    /**
     * 获取修改后的HTTP方法
     */
    getModifiedMethod() {
        return this.modifiedRequest && this.modifiedRequest.method 
            ? this.modifiedRequest.method 
            : this.request.method;
    }
    
    /**
     * 检查是否有修改的请求数据
     */
    hasModifiedRequest() {
        return this.modifiedRequest !== null;
    }
    
    /**
     * 检查是否有直接响应数据
     */
    hasDirectResponse() {
        return this.directResponse !== null;
    }
    
    /**
     * 标记请求已被拦截
     */
    markIntercepted() {
        this.intercepted = true;
    }
}

module.exports = {
    InterceptorResult,
    InterceptorResponse,
    InterceptorContext
};