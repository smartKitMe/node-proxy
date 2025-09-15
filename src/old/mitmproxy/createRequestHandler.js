const http = require('http');
const https = require('https');
const commonUtil = require('../common/util');

// 性能优化：Promise池化
class PromisePool {
    constructor(size = 100) {
        this.pool = [];
        this.maxSize = size;
    }
    
    get() {
        return this.pool.pop() || {
            resolve: null,
            reject: null,
            promise: null
        };
    }
    
    release(promiseWrapper) {
        if (this.pool.length < this.maxSize) {
            promiseWrapper.resolve = null;
            promiseWrapper.reject = null;
            promiseWrapper.promise = null;
            this.pool.push(promiseWrapper);
        }
    }
}

// 性能优化：错误处理器缓存
const errorHandlers = {
    ECONNRESET: (res, error) => {
        if (!res.headersSent) {
            res.writeHead(502, {'Content-Type': 'text/plain'});
            res.end('Connection Reset');
        }
    },
    ECONNREFUSED: (res, error) => {
        if (!res.headersSent) {
            res.writeHead(502, {'Content-Type': 'text/plain'});
            res.end('Connection Refused');
        }
    },
    ETIMEDOUT: (res, error) => {
        if (!res.headersSent) {
            res.writeHead(504, {'Content-Type': 'text/plain'});
            res.end('Gateway Timeout');
        }
    },
    default: (res, error) => {
        if (!res.headersSent) {
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end(`Proxy Error: ${error.message}`);
        }
    }
};

// 性能优化：响应头处理缓存
const headerCache = new Map();
const maxHeaderCacheSize = 1000;

function processHeaders(headers) {
    const headerKey = JSON.stringify(headers);
    
    if (headerCache.has(headerKey)) {
        return headerCache.get(headerKey);
    }
    
    const processedHeaders = {};
    
    Object.keys(headers).forEach(key => {
        if (headers[key] != undefined) {
            // https://github.com/nodejitsu/node-http-proxy/issues/362
            if (/^www-authenticate$/i.test(key)) {
                if (headers[key]) {
                    processedHeaders[key] = headers[key] && headers[key].split(',');
                }
            } else {
                processedHeaders[key] = headers[key];
            }
        }
    });
    
    // 限制缓存大小
    if (headerCache.size >= maxHeaderCacheSize) {
        const firstKey = headerCache.keys().next().value;
        headerCache.delete(firstKey);
    }
    
    headerCache.set(headerKey, processedHeaders);
    return processedHeaders;
}

// 性能优化：快速路径检测
function shouldUseFastPath(requestInterceptor, responseInterceptor, middlewares) {
    return !requestInterceptor && !responseInterceptor && (!middlewares || middlewares.length === 0);
}

// 性能优化：快速代理实现
function fastProxy(req, res, rOptions) {
    const proxyReq = (rOptions.protocol === 'https:' ? https : http).request(rOptions, (proxyRes) => {
        // 快速头部复制
        const processedHeaders = processHeaders(proxyRes.headers);
        
        Object.keys(processedHeaders).forEach(key => {
            res.setHeader(key, processedHeaders[key]);
        });
        
        res.writeHead(proxyRes.statusCode);
        proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (error) => {
        const handler = errorHandlers[error.code] || errorHandlers.default;
        handler(res, error);
        console.error('Fast proxy error:', error);
    });
    
    proxyReq.on('timeout', () => {
        errorHandlers.ETIMEDOUT(res, new Error('Request timeout'));
    });
    
    req.on('aborted', () => {
        proxyReq.abort();
    });
    
    req.pipe(proxyReq);
    
}

// 性能监控
const performanceMetrics = {
    requestCount: 0,
    totalLatency: 0,
    errorCount: 0,
    fastPathCount: 0,
    
    recordRequest(latency, isFastPath = false) {
        this.requestCount++;
        this.totalLatency += latency;
        if (isFastPath) this.fastPathCount++;
    },
    
    recordError() {
        this.errorCount++;
    },
    
    getStats() {
        return {
            avgLatency: this.requestCount > 0 ? this.totalLatency / this.requestCount : 0,
            errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
            fastPathRate: this.requestCount > 0 ? this.fastPathCount / this.requestCount : 0
        };
    },
    
    reset() {
        this.requestCount = 0;
        this.totalLatency = 0;
        this.errorCount = 0;
        this.fastPathCount = 0;
    }
};

// 性能统计定时器（根据配置决定是否启用）
let performanceStatsInterval = null;

function initPerformanceStats(enabled) {
    if (enabled && !performanceStatsInterval) {
        performanceStatsInterval = setInterval(() => {
            const stats = performanceMetrics.getStats();
            if (performanceMetrics.requestCount > 0) {
                console.log('Proxy Performance Stats:', {
                    requests: performanceMetrics.requestCount,
                    avgLatency: `${stats.avgLatency.toFixed(2)}ms`,
                    errorRate: `${(stats.errorRate * 100).toFixed(2)}%`,
                    fastPathRate: `${(stats.fastPathRate * 100).toFixed(2)}%`
                });
            }
            performanceMetrics.reset();
        }, 60000);
    } else if (!enabled && performanceStatsInterval) {
        clearInterval(performanceStatsInterval);
        performanceStatsInterval = null;
    }
}

const promisePool = new PromisePool();

// 选择性拦截匹配函数
function shouldIntercept(req, interceptConfig) {
    const url = req.url;
    const hostname = req.headers.host ? req.headers.host.split(':')[0].toLowerCase() : '';
    const fullUrl = `${req.headers.host}${url}`;

    // 如果没有配置拦截域名，直接走快速模式
    if (interceptConfig.domains.length === 0) {
        return false;
    }

    // 检查域名是否匹配
    const domainMatch = interceptConfig.domains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
    );
    
    // 如果域名不匹配，直接走快速模式
    if (!domainMatch) {
        return false;
    }
    
    // 检查静态资源
    const hasStaticExtension = interceptConfig.staticExtensions.some(ext => url.toLowerCase().endsWith(ext));
    if (hasStaticExtension) {
        return false;
    }
    
    // 域名匹配后，检查是否有路径配置
    const hasPathConfig = interceptConfig.urls.length > 0 || 
                         interceptConfig.urlPrefixes.length > 0 || 
                         interceptConfig.pathPrefixes.length > 0;
    
    // 如果没有路径配置，直接走快速模式
    if (!hasPathConfig) {
        return false;
    }
    
    // 检查完整URL匹配
    if (interceptConfig.urls.length > 0) {
        const urlMatch = interceptConfig.urls.some(configUrl => fullUrl === configUrl);
        if (urlMatch) return true;
    }
    
    // 检查URL前缀匹配
    if (interceptConfig.urlPrefixes.length > 0) {
        const urlPrefixMatch = interceptConfig.urlPrefixes.some(prefix => fullUrl.startsWith(prefix));
        if (urlPrefixMatch) return true;
    }
    
    // 检查路径前缀匹配
    if (interceptConfig.pathPrefixes.length > 0) {
        const pathPrefixMatch = interceptConfig.pathPrefixes.some(prefix => url.startsWith(prefix));
        if (pathPrefixMatch) {
            return true;
        }
    }
    
    return false;
}

// create requestHandler function
module.exports = function createRequestHandler(requestInterceptor, responseInterceptor, middlewares, externalProxy, interceptConfig = {}, enablePerformanceMetrics = false) {
    
    // 性能优化：预编译拦截器检查
    const hasRequestInterceptor = typeof requestInterceptor === 'function';
    const hasResponseInterceptor = typeof responseInterceptor === 'function';
    const hasMiddlewares = middlewares && middlewares.length > 0;
    const hasInterceptors = hasRequestInterceptor || hasResponseInterceptor || hasMiddlewares;
    
    // 标准化拦截配置
    const normalizedInterceptConfig = {
        domains: interceptConfig.domains || [],
        urls: interceptConfig.urls || [],
        urlPrefixes: interceptConfig.urlPrefixes || [],
        pathPrefixes: interceptConfig.pathPrefixes || [],
        fastDomains: interceptConfig.fastDomains || [],
        staticExtensions: interceptConfig.staticExtensions || ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot']
    };
    
    // 初始化性能统计
    initPerformanceStats(enablePerformanceMetrics);
    
    // 初始化util缓存性能监控
    commonUtil.enablePerformanceMetrics(enablePerformanceMetrics);
    commonUtil.initCacheStatsReporting(enablePerformanceMetrics);
    
    return function requestHandler(req, res, ssl) {
        const startTime = enablePerformanceMetrics ? process.hrtime.bigint() : null;
        
        try {
            const rOptions = commonUtil.getOptionsFormRequest(req, ssl, externalProxy);
            
            // 性能优化：连接管理
            if (rOptions.headers.connection === 'close') {
                req.socket.setKeepAlive(false);
            } else if (rOptions.customSocketId != null) {  // for NTLM
                req.socket.setKeepAlive(true, 60 * 60 * 1000);
            } else {
                req.socket.setKeepAlive(true, 30000);
            }
            
            // 选择性拦截判断
            const needsIntercept = shouldIntercept(req, normalizedInterceptConfig);
            
            // 性能优化：快速路径（无拦截器或不需要拦截）
            if (!hasInterceptors || !needsIntercept) {
                if (enablePerformanceMetrics && startTime) {
                    const endTime = process.hrtime.bigint();
                    const latency = Number(endTime - startTime) / 1000000; // 转换为毫秒
                    performanceMetrics.recordRequest(latency, true);
                }
                return fastProxy(req, res, rOptions);
            }
            
            // 标准路径：使用优化的Promise处理
            handleStandardPath(req, res, rOptions, {
                hasRequestInterceptor,
                hasResponseInterceptor,
                requestInterceptor,
                responseInterceptor,
                ssl,
                startTime,
                enablePerformanceMetrics
            });
            
        } catch (error) {
            if (enablePerformanceMetrics) {
                performanceMetrics.recordError();
            }
            const handler = errorHandlers[error.code] || errorHandlers.default;
            handler(res, error);
            console.error('Request handler error:', error);
        }
    };
};

// 性能优化：标准路径处理
function handleStandardPath(req, res, rOptions, context) {
    const {
        hasRequestInterceptor,
        hasResponseInterceptor, 
        requestInterceptor,
        responseInterceptor,
        ssl,
        startTime,
        enablePerformanceMetrics
    } = context;
    
    // 创建优化的Promise处理器
    const requestPromise = hasRequestInterceptor ? 
        createInterceptorPromise(requestInterceptor, rOptions, req, res, ssl) :
        Promise.resolve();
    
    // 修复：先执行请求拦截器，再执行代理请求
    requestPromise
        .then(() => {
            if (res.finished) return;
            // 请求拦截器执行完成后，再创建代理请求
            return createProxyPromise(req, rOptions);
        })
        .then((proxyRes) => {
            if (!proxyRes || res.finished) return;
            
            const responsePromise = hasResponseInterceptor ?
                createInterceptorPromise(responseInterceptor, req, res, null, proxyRes, ssl) :
                Promise.resolve();
            
            return responsePromise.then(() => proxyRes);
        })
        .then((proxyRes) => {
            if (!proxyRes || res.finished) return;
            
            // 性能优化：使用缓存的头部处理
            const processedHeaders = processHeaders(proxyRes.headers);
            
            Object.keys(processedHeaders).forEach(key => {
                res.setHeader(key, processedHeaders[key]);
            });
            
            res.writeHead(proxyRes.statusCode);
            proxyRes.pipe(res);
            
            // 记录性能指标
            if (enablePerformanceMetrics && startTime) {
                const endTime = process.hrtime.bigint();
                const latency = Number(endTime - startTime) / 1000000;
                performanceMetrics.recordRequest(latency, false);
            }
        })
        .catch((error) => {
            if (enablePerformanceMetrics) {
                performanceMetrics.recordError();
            }
            const handler = errorHandlers[error.code] || errorHandlers.default;
            handler(res, error);
            console.error('Standard path error:', error);
        });
}

// 性能优化：拦截器Promise创建
function createInterceptorPromise(interceptor, ...args) {
    return new Promise((resolve, reject) => {
        const next = () => resolve();
        try {
            interceptor.call(null, ...args, next);
        } catch (e) {
            reject(e);
        }
    });
}

// 性能优化：代理请求Promise创建
function createProxyPromise(req, rOptions) {
    return new Promise((resolve, reject) => {
        rOptions.host = rOptions.hostname || rOptions.host || 'localhost';
        
        // NTLM socket复用逻辑
        if (rOptions.agent && rOptions.customSocketId != null && rOptions.agent.getName) {
            const socketName = rOptions.agent.getName(rOptions);
            const bindingSocket = rOptions.agent.sockets[socketName];
            if (bindingSocket && bindingSocket.length > 0) {
                bindingSocket[0].once('free', onFree);
                return;
            }
        }
        
        onFree();
        
        function onFree() {
            const proxyReq = (rOptions.protocol === 'https:' ? https : http).request(rOptions, resolve);
            
            proxyReq.on('timeout', () => {
                reject(new Error(`${rOptions.host}:${rOptions.port}, request timeout`));
            });
            
            proxyReq.on('error', reject);
            
            proxyReq.on('aborted', () => {
                reject(new Error('server aborted request'));
            });
            
            req.on('aborted', () => {
                proxyReq.abort();
            });
            
            if (rOptions.body) {
                proxyReq.write(rOptions.body);
                proxyReq.end();
            } else {
                req.pipe(proxyReq);
            }
        }
    });
}

// 导出性能指标（用于监控）
module.exports.getPerformanceMetrics = () => performanceMetrics.getStats();
module.exports.resetPerformanceMetrics = () => performanceMetrics.reset();