/**
 * 代理相关类型定义
 */

/**
 * 请求上下文类
 * 封装请求处理过程中的所有相关信息
 */
class RequestContext {
    constructor(request, response, ssl = false) {
        this.request = request;
        this.response = response;
        this.ssl = ssl;
        this.startTime = Date.now();
        this.stopped = false;
        this.intercepted = false;
        this.meta = {};
        this.logger = null;
        this.metrics = null;
        this.requestSize = 0;
        this.responseSize = 0;
        this.error = null;
    }
    
    /**
     * 停止请求处理
     */
    stop() {
        this.stopped = true;
    }
    
    /**
     * 标记为已拦截
     */
    markIntercepted() {
        this.intercepted = true;
    }
    
    /**
     * 重置上下文（用于对象池化）
     */
    reset() {
        this.request = null;
        this.response = null;
        this.ssl = false;
        this.startTime = Date.now();
        this.stopped = false;
        this.intercepted = false;
        this.meta = {};
        this.logger = null;
        this.metrics = null;
        this.requestSize = 0;
        this.responseSize = 0;
        this.error = null;
    }
    
    /**
     * 获取请求处理时长
     * @returns {number} 处理时长（毫秒）
     */
    getDuration() {
        return Date.now() - this.startTime;
    }
    
    /**
     * 获取请求URL
     * @returns {string} 请求URL
     */
    getUrl() {
        return this.request ? this.request.url : '';
    }
    
    /**
     * 获取请求方法
     * @returns {string} 请求方法
     */
    getMethod() {
        return this.request ? this.request.method : '';
    }
    
    /**
     * 获取响应状态码
     * @returns {number} 状态码
     */
    getStatusCode() {
        return this.response ? this.response.statusCode : 0;
    }
}

/**
 * 连接上下文类
 * 封装CONNECT请求处理过程中的相关信息
 */
class ConnectContext {
    constructor(request, socket, head) {
        this.request = request;
        this.socket = socket;
        this.head = head;
        this.startTime = Date.now();
        this.stopped = false;
        this.meta = {};
        this.logger = null;
        this.metrics = null;
        this.error = null;
    }
    
    /**
     * 停止连接处理
     */
    stop() {
        this.stopped = true;
    }
    
    /**
     * 重置上下文
     */
    reset() {
        this.request = null;
        this.socket = null;
        this.head = null;
        this.startTime = Date.now();
        this.stopped = false;
        this.meta = {};
        this.logger = null;
        this.metrics = null;
        this.error = null;
    }
    
    /**
     * 获取目标主机
     * @returns {string} 目标主机
     */
    getTargetHost() {
        return this.request ? this.request.url : '';
    }
}

/**
 * 升级上下文类
 * 封装WebSocket升级请求处理过程中的相关信息
 */
class UpgradeContext {
    constructor(request, socket, head) {
        this.request = request;
        this.socket = socket;
        this.head = head;
        this.startTime = Date.now();
        this.stopped = false;
        this.meta = {};
        this.logger = null;
        this.metrics = null;
        this.error = null;
    }
    
    /**
     * 停止升级处理
     */
    stop() {
        this.stopped = true;
    }
    
    /**
     * 重置上下文
     */
    reset() {
        this.request = null;
        this.socket = null;
        this.head = null;
        this.startTime = Date.now();
        this.stopped = false;
        this.meta = {};
        this.logger = null;
        this.metrics = null;
        this.error = null;
    }
}

module.exports = {
    RequestContext,
    ConnectContext,
    UpgradeContext
};