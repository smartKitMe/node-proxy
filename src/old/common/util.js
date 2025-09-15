// ============================================================================
// 模块依赖导入
// ============================================================================
const url = require('url');
const Agent = require('./ProxyHttpAgent');
const HttpsAgent = require('./ProxyHttpsAgent');
var hpa = require('https-proxy-agent');
var spa = require('socks-proxy-agent');

var util = exports;

// ============================================================================
// 全局变量和配置
// ============================================================================
var socketId = 0;

// Agent 缓存 - 按需创建并缓存
let httpsAgent = null;
let httpAgent = null;

// Agent 默认配置
const DEFAULT_AGENT_CONFIG = {
    keepAlive: true,
    timeout: 60000,
    keepAliveTimeout: 30000,
    enableDebugLogs: process.env.NODE_ENV === 'development' || process.env.DEBUG_PROXY === 'true',
    enablePerformanceMetrics: process.env.ENABLE_PROXY_METRICS === 'true'
};

// ============================================================================
// Agent 创建和管理函数
// ============================================================================

/**
 * 获取或创建 HTTP Agent 实例
 * @returns {Agent} HTTP Agent 实例
 */
function getHttpAgent() {
    if (!httpAgent) {
        httpAgent = new Agent(DEFAULT_AGENT_CONFIG);
    }
    return httpAgent;
}

/**
 * 获取或创建 HTTPS Agent 实例
 * @returns {HttpsAgent} HTTPS Agent 实例
 */
function getHttpsAgent() {
    if (!httpsAgent) {
        httpsAgent = new HttpsAgent({
            ...DEFAULT_AGENT_CONFIG,
            rejectUnauthorized: false
        });
    }
    return httpsAgent;
}

/**
 * 重置 Agent 实例（用于配置更新）
 */
function resetAgents() {
    if (httpAgent && typeof httpAgent.destroy === 'function') {
        httpAgent.destroy();
    }
    if (httpsAgent && typeof httpsAgent.destroy === 'function') {
        httpsAgent.destroy();
    }
    httpAgent = null;
    httpsAgent = null;
}

// ============================================================================
// 缓存管理系统
// ============================================================================

// URL 解析缓存
const urlCache = new Map();
const maxUrlCacheSize = 1000;

// 外部代理 Agent 缓存
const agentCache = new Map();
const maxAgentCacheSize = 100;

// 缓存性能统计
const cacheStats = {
    urlCacheHits: 0,
    urlCacheMisses: 0,
    agentCacheHits: 0,
    agentCacheMisses: 0,
    
    getStats() {
        const totalUrlRequests = this.urlCacheHits + this.urlCacheMisses;
        const totalAgentRequests = this.agentCacheHits + this.agentCacheMisses;
        
        return {
            urlCacheHitRate: totalUrlRequests > 0 ? this.urlCacheHits / totalUrlRequests : 0,
            agentCacheHitRate: totalAgentRequests > 0 ? this.agentCacheHits / totalAgentRequests : 0,
            urlCacheSize: urlCache.size,
            agentCacheSize: agentCache.size
        };
    },
    
    reset() {
        this.urlCacheHits = 0;
        this.urlCacheMisses = 0;
        this.agentCacheHits = 0;
        this.agentCacheMisses = 0;
    }
};

// 性能监控控制变量
let performanceMetricsEnabled = false;

// ============================================================================
// 缓存管理函数
// ============================================================================

/**
 * 统一的缓存清理策略
 * @param {Map} cache - 要清理的缓存Map
 * @param {number} maxSize - 最大缓存大小
 * @param {Function} destroyCallback - 销毁回调函数（可选）
 */
function cleanupCache(cache, maxSize, destroyCallback = null) {
    if (cache.size > maxSize) {
        const deleteCount = Math.floor(maxSize / 2);
        const keysToDelete = Array.from(cache.keys()).slice(0, deleteCount);
        
        keysToDelete.forEach(key => {
            const item = cache.get(key);
            if (destroyCallback && item) {
                destroyCallback(item);
            }
            cache.delete(key);
        });
    }
}

/**
 * 优化的URL解析函数，带缓存功能
 * @param {string} urlStr - 要解析的URL字符串
 * @returns {Object} 解析后的URL对象
 */
function parseUrlCached(urlStr) {
    if (urlCache.has(urlStr)) {
        if (performanceMetricsEnabled) {
            cacheStats.urlCacheHits++;
        }
        return urlCache.get(urlStr);
    }
    
    if (performanceMetricsEnabled) {
        cacheStats.urlCacheMisses++;
    }
    
    const parsed = url.parse(urlStr);
    
    // 使用统一的缓存清理策略
    cleanupCache(urlCache, maxUrlCacheSize);
    
    urlCache.set(urlStr, parsed);
    return parsed;
}

/**
 * 清理过期的agent连接
 */
function cleanupAgentCache() {
    cleanupCache(agentCache, maxAgentCacheSize, (agent) => {
        if (agent && typeof agent.destroy === 'function') {
            agent.destroy();
        }
    });
}

/**
 * 清理所有缓存
 */
function clearAllCaches() {
    // 清理URL缓存
    urlCache.clear();
    
    // 清理Agent缓存并销毁实例
    agentCache.forEach(agent => {
        if (agent && typeof agent.destroy === 'function') {
            agent.destroy();
        }
    });
    agentCache.clear();
    
    // 重置统计数据
    cacheStats.reset();
    
    console.log('[Util] 所有缓存已清理');
}

/**
 * 获取缓存使用情况
 * @returns {Object} 缓存使用统计
 */
function getCacheUsage() {
    return {
        urlCache: {
            size: urlCache.size,
            maxSize: maxUrlCacheSize,
            usage: `${urlCache.size}/${maxUrlCacheSize}`
        },
        agentCache: {
            size: agentCache.size,
            maxSize: maxAgentCacheSize,
            usage: `${agentCache.size}/${maxAgentCacheSize}`
        }
    };
}

// ============================================================================
// 请求选项生成函数
// ============================================================================

/**
 * 从请求对象生成HTTP/HTTPS请求选项
 * @param {Object} req - HTTP请求对象
 * @param {boolean} ssl - 是否为HTTPS请求
 * @param {string|Function|null} externalProxy - 外部代理配置
 * @returns {Object} 请求选项对象
 */
util.getOptionsFormRequest = (req, ssl, externalProxy = null) => {
    // 预先计算常用值
    const defaultPort = ssl ? 443 : 80;
    const protocol = ssl ? 'https:' : 'http:';
    const reqHeaders = req.headers;
    
    // 检查必需的host header
    if (!reqHeaders.host) {
        throw new Error('Host header is required');
    }
    
    // 优化host解析，避免不必要的split
    const colonIndex = reqHeaders.host.indexOf(':');
    const hostname = colonIndex === -1 ? reqHeaders.host : reqHeaders.host.substring(0, colonIndex);
    const port = colonIndex === -1 ? defaultPort : parseInt(reqHeaders.host.substring(colonIndex + 1), 10) || defaultPort;
    
    // 缓存URL解析
    const urlObject = parseUrlCached(req.url);
    
    // 处理外部代理
    let externalProxyUrl = null;
    if (externalProxy) {
        if (typeof externalProxy === 'string') {
            externalProxyUrl = externalProxy;
        } else if (typeof externalProxy === 'function') {
            try {
                externalProxyUrl = externalProxy(req, ssl);
            } catch (e) {
                console.error(e);
            }
        }
    }
    
    // 优化agent选择逻辑 - 使用按需创建的Agent
    let agent = false;
    let useKeepAlive = false;
    
    if (!externalProxyUrl) {
        // 检查是否使用keep-alive
        if (reqHeaders.connection !== 'close') {
            agent = ssl ? getHttpsAgent() : getHttpAgent();
            useKeepAlive = true;
        }
    } else {
        agent = util.getAgentObject(externalProxyUrl);
    }
    
    // 构建基础options对象
    const options = {
        protocol: protocol,
        hostname: hostname,
        method: req.method,
        port: port,
        path: urlObject.path,
        headers: reqHeaders,
        agent: agent
    };
    
    // 处理HTTP代理的特殊情况
    if (protocol === 'http:' && externalProxyUrl) {
        const externalURL = parseUrlCached(externalProxyUrl);
        if (externalURL.protocol === 'http:') {
            options.hostname = externalURL.hostname;
            options.port = externalURL.port;
            options.path = `http://${urlObject.host}${urlObject.path}`;
        }
    }
    
    // 处理NTLM认证的socket ID
    if (req.socket.customSocketId) {
        options.customSocketId = req.socket.customSocketId;
    } else if (reqHeaders.authorization) {
        options.customSocketId = req.socket.customSocketId = socketId++;
    }
    
    // 优化headers处理，只在需要时修改
    if (useKeepAlive || reqHeaders['proxy-connection']) {
        // 只在需要时创建headers副本
        options.headers = Object.assign({}, reqHeaders);
        delete options.headers['proxy-connection'];
        if (useKeepAlive) {
            options.headers.connection = 'keep-alive';
        }
    }
    
    return options;
}

// ============================================================================
// 外部代理 Agent 管理函数
// ============================================================================

/**
 * 获取外部代理 Agent 对象（带缓存）
 * @param {string} proxyUrl - 代理服务器URL
 * @returns {Object} 代理Agent实例
 */
util.getAgentObject = (proxyUrl) => {
    // 使用缓存的URL解析结果
    const parsedUrl = parseUrlCached(proxyUrl);
    
    // 创建更精确的缓存key，包含协议和认证信息
    const cacheKey = `${parsedUrl.protocol}//${parsedUrl.auth ? parsedUrl.auth + '@' : ''}${parsedUrl.host}`;
    
    if (agentCache.has(cacheKey)) {
        if (performanceMetricsEnabled) {
            cacheStats.agentCacheHits++;
        }
        return agentCache.get(cacheKey);
    }
    
    if (performanceMetricsEnabled) {
        cacheStats.agentCacheMisses++;
    }
    
    // 清理缓存以防止内存泄漏
    cleanupAgentCache();
    
    // 创建优化配置的agent选项
    const agentOptions = {
        keepAlive: true,
        keepAliveMsecs: 30000,
        timeout: 60000,
        maxSockets: 256,
        maxFreeSockets: 256,
        scheduling: 'fifo'
    };
    
    let agent;
    if (proxyUrl.startsWith('socks')) {
        agent = new spa.SocksProxyAgent(proxyUrl, agentOptions);
    } else {
        agent = new hpa.HttpsProxyAgent(proxyUrl, agentOptions);
    }
    
    // 缓存agent实例
    agentCache.set(cacheKey, agent);
    
    return agent;
}

// ============================================================================
// 性能监控和统计函数
// ============================================================================

// 缓存性能统计定时器
let cacheStatsInterval = null;

/**
 * 启用或禁用性能监控
 * @param {boolean} enabled - 是否启用性能监控
 */
util.enablePerformanceMetrics = (enabled) => {
    performanceMetricsEnabled = enabled;
    if (enabled) {
        console.log('Util cache performance metrics enabled');
    }
};

/**
 * 获取缓存性能统计信息
 * @returns {Object} 缓存性能统计数据
 */
util.getCacheStats = () => {
    return cacheStats.getStats();
};

/**
 * 重置缓存性能统计数据
 */
util.resetCacheStats = () => {
    cacheStats.reset();
};

/**
 * 初始化缓存性能统计报告
 * @param {boolean} enabled - 是否启用定时报告
 */
util.initCacheStatsReporting = (enabled) => {
    if (enabled && !cacheStatsInterval) {
        cacheStatsInterval = setInterval(() => {
            const stats = cacheStats.getStats();
            if (cacheStats.urlCacheHits + cacheStats.urlCacheMisses > 0 || 
                cacheStats.agentCacheHits + cacheStats.agentCacheMisses > 0) {
                console.log('Cache Performance Stats:', {
                    urlCacheHitRate: `${(stats.urlCacheHitRate * 100).toFixed(2)}%`,
                    agentCacheHitRate: `${(stats.agentCacheHitRate * 100).toFixed(2)}%`,
                    urlCacheSize: stats.urlCacheSize,
                    agentCacheSize: stats.agentCacheSize
                });
            }
            cacheStats.reset();
        }, 60000);
    } else if (!enabled && cacheStatsInterval) {
        clearInterval(cacheStatsInterval);
        cacheStatsInterval = null;
    }
};

// ============================================================================
// Agent 实例管理和配置函数
// ============================================================================

/**
 * 获取代理 Agent 的性能统计信息
 * @returns {Object} 包含 HTTP 和 HTTPS Agent 的性能统计
 */
util.getAgentStats = () => {
    const httpAgentInstance = httpAgent;
    const httpsAgentInstance = httpsAgent;
    
    return {
        http: httpAgentInstance && httpAgentInstance.getPerformanceStats ? httpAgentInstance.getPerformanceStats() : null,
        https: httpsAgentInstance && httpsAgentInstance.getPerformanceStats ? httpsAgentInstance.getPerformanceStats() : null,
        timestamp: Date.now()
    };
};

/**
 * 重置代理 Agent 的性能统计数据
 */
util.resetAgentStats = () => {
    if (httpAgent && httpAgent.resetStats) {
        httpAgent.resetStats();
    }
    if (httpsAgent && httpsAgent.resetStats) {
        httpsAgent.resetStats();
    }
    console.log('[Util] 代理 Agent 性能统计已重置');
};

/**
 * 启用或禁用代理调试日志
 * @param {boolean} enabled - 是否启用调试日志
 */
util.setProxyDebugLogs = (enabled) => {
    // 更新默认配置
    DEFAULT_AGENT_CONFIG.enableDebugLogs = enabled;
    
    // 更新现有实例
    if (httpAgent && httpAgent.enableDebugLogs !== undefined) {
        httpAgent.enableDebugLogs = enabled;
    }
    if (httpsAgent && httpsAgent.enableDebugLogs !== undefined) {
        httpsAgent.enableDebugLogs = enabled;
    }
    console.log(`[Util] 代理调试日志已${enabled ? '启用' : '禁用'}`);
};

/**
 * 启用或禁用代理性能监控
 * @param {boolean} enabled - 是否启用性能监控
 */
util.setProxyPerformanceMetrics = (enabled) => {
    // 更新默认配置
    DEFAULT_AGENT_CONFIG.enablePerformanceMetrics = enabled;
    
    // 更新现有实例
    if (httpAgent && httpAgent.enablePerformanceMetrics !== undefined) {
        httpAgent.enablePerformanceMetrics = enabled;
    }
    if (httpsAgent && httpsAgent.enablePerformanceMetrics !== undefined) {
        httpsAgent.enablePerformanceMetrics = enabled;
    }
    console.log(`[Util] 代理性能监控已${enabled ? '启用' : '禁用'}`);
};

/**
 * 重置所有 Agent 实例（用于配置更新后重新创建）
 */
util.resetAllAgents = resetAgents;

// ============================================================================
// 缓存管理公共接口
// ============================================================================

/**
 * 清理所有缓存数据
 */
util.clearAllCaches = clearAllCaches;

/**
 * 获取缓存使用情况统计
 * @returns {Object} 缓存使用统计信息
 */
util.getCacheUsage = getCacheUsage;

/**
 * 手动触发缓存清理
 */
util.cleanupCaches = () => {
    cleanupCache(urlCache, maxUrlCacheSize);
    cleanupAgentCache();
    console.log('[Util] 缓存清理完成');
};

// ============================================================================
// 模块初始化和配置
// ============================================================================

// 如果启用了性能监控，则初始化统计报告
if (process.env.ENABLE_PROXY_METRICS === 'true') {
    util.enablePerformanceMetrics(true);
    util.initCacheStatsReporting(true);
}

// 导出内部函数供测试使用（仅在开发环境）
if (process.env.NODE_ENV === 'development') {
    util._internal = {
        getHttpAgent,
        getHttpsAgent,
        parseUrlCached,
        cleanupCache,
        getCacheUsage
    };
}
