'use strict';

var url = require('url');
var Agent = require('./ProxyHttpAgent');
var HttpsAgent = require('./ProxyHttpsAgent');
var hpa = require('https-proxy-agent');
var spa = require('socks-proxy-agent');

var util = exports;
var httpsAgent = new HttpsAgent({
    keepAlive: true,
    timeout: 60000,
    keepAliveTimeout: 30000, // free socket keepalive for 30 seconds
    rejectUnauthorized: false
});
var httpAgent = new Agent({
    keepAlive: true,
    timeout: 60000,
    keepAliveTimeout: 30000 // free socket keepalive for 30 seconds
});
var socketId = 0;

// 移除旧的agentObj，现在使用优化的agentCache Map

// 缓存URL解析结果以提升性能
var urlCache = new Map();
var maxCacheSize = 1000;

// 缓存性能统计
var cacheStats = {
    urlCacheHits: 0,
    urlCacheMisses: 0,
    agentCacheHits: 0,
    agentCacheMisses: 0,

    getStats: function getStats() {
        var totalUrlRequests = this.urlCacheHits + this.urlCacheMisses;
        var totalAgentRequests = this.agentCacheHits + this.agentCacheMisses;

        return {
            urlCacheHitRate: totalUrlRequests > 0 ? this.urlCacheHits / totalUrlRequests : 0,
            agentCacheHitRate: totalAgentRequests > 0 ? this.agentCacheHits / totalAgentRequests : 0,
            urlCacheSize: urlCache.size,
            agentCacheSize: agentCache.size
        };
    },
    reset: function reset() {
        this.urlCacheHits = 0;
        this.urlCacheMisses = 0;
        this.agentCacheHits = 0;
        this.agentCacheMisses = 0;
    }
};

// 性能监控控制变量
var performanceMetricsEnabled = false;

// 优化的URL解析函数
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

    var parsed = url.parse(urlStr);

    // 限制缓存大小，防止内存泄漏
    if (urlCache.size >= maxCacheSize) {
        var firstKey = urlCache.keys().next().value;
        urlCache.delete(firstKey);
    }

    urlCache.set(urlStr, parsed);
    return parsed;
}

util.getOptionsFormRequest = function (req, ssl) {
    var externalProxy = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

    // 预先计算常用值
    var defaultPort = ssl ? 443 : 80;
    var protocol = ssl ? 'https:' : 'http:';
    var reqHeaders = req.headers;

    // 检查必需的host header
    if (!reqHeaders.host) {
        throw new Error('Host header is required');
    }

    // 优化host解析，避免不必要的split
    var colonIndex = reqHeaders.host.indexOf(':');
    var hostname = colonIndex === -1 ? reqHeaders.host : reqHeaders.host.substring(0, colonIndex);
    var port = colonIndex === -1 ? defaultPort : parseInt(reqHeaders.host.substring(colonIndex + 1), 10) || defaultPort;

    // 缓存URL解析
    var urlObject = parseUrlCached(req.url);

    // 处理外部代理
    var externalProxyUrl = null;
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

    // 优化agent选择逻辑
    var agent = false;
    var useKeepAlive = false;

    if (!externalProxyUrl) {
        // 检查是否使用keep-alive
        if (reqHeaders.connection !== 'close') {
            agent = ssl ? httpsAgent : httpAgent;
            useKeepAlive = true;
        }
    } else {
        agent = util.getAgentObject(externalProxyUrl);
    }

    // 构建基础options对象
    var options = {
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
        var externalURL = parseUrlCached(externalProxyUrl);
        if (externalURL.protocol === 'http:') {
            options.hostname = externalURL.hostname;
            options.port = externalURL.port;
            options.path = 'http://' + urlObject.host + urlObject.path;
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
};

// 优化的agent缓存管理
var agentCache = new Map();
var maxAgentCacheSize = 100;

// 清理过期的agent连接
function cleanupAgentCache() {
    if (agentCache.size > maxAgentCacheSize) {
        // 删除最旧的一半缓存项
        var keysToDelete = Array.from(agentCache.keys()).slice(0, Math.floor(maxAgentCacheSize / 2));
        keysToDelete.forEach(function (key) {
            var agent = agentCache.get(key);
            if (agent && typeof agent.destroy === 'function') {
                agent.destroy();
            }
            agentCache.delete(key);
        });
    }
}

util.getAgentObject = function (proxyUrl) {
    // 使用缓存的URL解析结果
    var parsedUrl = parseUrlCached(proxyUrl);

    // 创建更精确的缓存key，包含协议和认证信息
    var cacheKey = parsedUrl.protocol + '//' + (parsedUrl.auth ? parsedUrl.auth + '@' : '') + parsedUrl.host;

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
    var agentOptions = {
        keepAlive: true,
        keepAliveMsecs: 30000,
        timeout: 60000,
        maxSockets: 256,
        maxFreeSockets: 256,
        scheduling: 'fifo'
    };

    var agent = void 0;
    if (proxyUrl.startsWith('socks')) {
        agent = new spa.SocksProxyAgent(proxyUrl, agentOptions);
    } else {
        agent = new hpa.HttpsProxyAgent(proxyUrl, agentOptions);
    }

    // 缓存agent实例
    agentCache.set(cacheKey, agent);

    return agent;
};

// 性能监控控制函数
util.enablePerformanceMetrics = function (enabled) {
    performanceMetricsEnabled = enabled;
    if (enabled) {
        console.log('Util cache performance metrics enabled');
    }
};

// 获取缓存性能统计
util.getCacheStats = function () {
    return cacheStats.getStats();
};

// 重置缓存性能统计
util.resetCacheStats = function () {
    cacheStats.reset();
};

// 缓存性能统计定时器
var cacheStatsInterval = null;

util.initCacheStatsReporting = function (enabled) {
    if (enabled && !cacheStatsInterval) {
        cacheStatsInterval = setInterval(function () {
            var stats = cacheStats.getStats();
            if (cacheStats.urlCacheHits + cacheStats.urlCacheMisses > 0 || cacheStats.agentCacheHits + cacheStats.agentCacheMisses > 0) {
                console.log('Cache Performance Stats:', {
                    urlCacheHitRate: (stats.urlCacheHitRate * 100).toFixed(2) + '%',
                    agentCacheHitRate: (stats.agentCacheHitRate * 100).toFixed(2) + '%',
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