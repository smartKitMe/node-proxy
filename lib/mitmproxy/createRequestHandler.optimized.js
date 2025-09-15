'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var http = require('http');
var https = require('https');
var url = require('url');
var commonUtil = require('../common/util');
var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;

// 性能优化：Promise池化

var PromisePool = function () {
    function PromisePool() {
        var size = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 100;

        _classCallCheck(this, PromisePool);

        this.pool = [];
        this.maxSize = size;
    }

    _createClass(PromisePool, [{
        key: 'get',
        value: function get() {
            return this.pool.pop() || {
                resolve: null,
                reject: null,
                promise: null
            };
        }
    }, {
        key: 'release',
        value: function release(promiseWrapper) {
            if (this.pool.length < this.maxSize) {
                promiseWrapper.resolve = null;
                promiseWrapper.reject = null;
                promiseWrapper.promise = null;
                this.pool.push(promiseWrapper);
            }
        }
    }]);

    return PromisePool;
}();

// 性能优化：错误处理器缓存


var errorHandlers = {
    ECONNRESET: function ECONNRESET(res, error) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Connection Reset');
        }
    },
    ECONNREFUSED: function ECONNREFUSED(res, error) {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Connection Refused');
        }
    },
    ETIMEDOUT: function ETIMEDOUT(res, error) {
        if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'text/plain' });
            res.end('Gateway Timeout');
        }
    },
    default: function _default(res, error) {
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy Error: ' + error.message);
        }
    }
};

// 性能优化：响应头处理缓存
var headerCache = new Map();
var maxHeaderCacheSize = 1000;

function processHeaders(headers) {
    var headerKey = JSON.stringify(headers);

    if (headerCache.has(headerKey)) {
        return headerCache.get(headerKey);
    }

    var processedHeaders = {};

    Object.keys(headers).forEach(function (key) {
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
        var firstKey = headerCache.keys().next().value;
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
    var proxyReq = (rOptions.protocol === 'https:' ? https : http).request(rOptions, function (proxyRes) {
        // 快速头部复制
        var processedHeaders = processHeaders(proxyRes.headers);

        Object.keys(processedHeaders).forEach(function (key) {
            res.setHeader(key, processedHeaders[key]);
        });

        res.writeHead(proxyRes.statusCode);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', function (error) {
        var handler = errorHandlers[error.code] || errorHandlers.default;
        handler(res, error);
        console.error('Fast proxy error:', error);
    });

    proxyReq.on('timeout', function () {
        errorHandlers.ETIMEDOUT(res, new Error('Request timeout'));
    });

    req.on('aborted', function () {
        proxyReq.abort();
    });

    if (rOptions.body) {
        proxyReq.write(rOptions.body);
        proxyReq.end();
    } else {
        req.pipe(proxyReq);
    }
}

// 性能监控
var performanceMetrics = {
    requestCount: 0,
    totalLatency: 0,
    errorCount: 0,
    fastPathCount: 0,

    recordRequest: function recordRequest(latency) {
        var isFastPath = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

        this.requestCount++;
        this.totalLatency += latency;
        if (isFastPath) this.fastPathCount++;
    },
    recordError: function recordError() {
        this.errorCount++;
    },
    getStats: function getStats() {
        return {
            avgLatency: this.requestCount > 0 ? this.totalLatency / this.requestCount : 0,
            errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
            fastPathRate: this.requestCount > 0 ? this.fastPathCount / this.requestCount : 0
        };
    },
    reset: function reset() {
        this.requestCount = 0;
        this.totalLatency = 0;
        this.errorCount = 0;
        this.fastPathCount = 0;
    }
};

// 每分钟输出性能统计
setInterval(function () {
    var stats = performanceMetrics.getStats();
    if (performanceMetrics.requestCount > 0) {
        console.log('Proxy Performance Stats:', {
            requests: performanceMetrics.requestCount,
            avgLatency: stats.avgLatency.toFixed(2) + 'ms',
            errorRate: (stats.errorRate * 100).toFixed(2) + '%',
            fastPathRate: (stats.fastPathRate * 100).toFixed(2) + '%'
        });
    }
    performanceMetrics.reset();
}, 60000);

var promisePool = new PromisePool();

// create requestHandler function
module.exports = function createRequestHandler(requestInterceptor, responseInterceptor, middlewares, externalProxy) {

    // 性能优化：预编译拦截器检查
    var hasRequestInterceptor = typeof requestInterceptor === 'function';
    var hasResponseInterceptor = typeof responseInterceptor === 'function';
    var hasMiddlewares = middlewares && middlewares.length > 0;
    var useFastPath = shouldUseFastPath(requestInterceptor, responseInterceptor, middlewares);

    return function requestHandler(req, res, ssl) {
        var startTime = process.hrtime.bigint();

        try {
            var rOptions = commonUtil.getOptionsFormRequest(req, ssl, externalProxy);

            // 性能优化：连接管理
            if (rOptions.headers.connection === 'close') {
                req.socket.setKeepAlive(false);
            } else if (rOptions.customSocketId != null) {
                // for NTLM
                req.socket.setKeepAlive(true, 60 * 60 * 1000);
            } else {
                req.socket.setKeepAlive(true, 30000);
            }

            // 性能优化：快速路径
            if (useFastPath) {
                var endTime = process.hrtime.bigint();
                var latency = Number(endTime - startTime) / 1000000; // 转换为毫秒
                performanceMetrics.recordRequest(latency, true);
                return fastProxy(req, res, rOptions);
            }

            // 标准路径：使用优化的Promise处理
            handleStandardPath(req, res, rOptions, {
                hasRequestInterceptor: hasRequestInterceptor,
                hasResponseInterceptor: hasResponseInterceptor,
                requestInterceptor: requestInterceptor,
                responseInterceptor: responseInterceptor,
                ssl: ssl,
                startTime: startTime
            });
        } catch (error) {
            performanceMetrics.recordError();
            var handler = errorHandlers[error.code] || errorHandlers.default;
            handler(res, error);
            console.error('Request handler error:', error);
        }
    };
};

// 性能优化：标准路径处理
function handleStandardPath(req, res, rOptions, context) {
    var hasRequestInterceptor = context.hasRequestInterceptor,
        hasResponseInterceptor = context.hasResponseInterceptor,
        requestInterceptor = context.requestInterceptor,
        responseInterceptor = context.responseInterceptor,
        ssl = context.ssl,
        startTime = context.startTime;

    // 创建优化的Promise处理器

    var requestPromise = hasRequestInterceptor ? createInterceptorPromise(requestInterceptor, rOptions, req, res, ssl) : Promise.resolve();

    var proxyPromise = createProxyPromise(req, rOptions);

    // 性能优化：并行处理非依赖操作
    Promise.all([requestPromise, proxyPromise]).then(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 2),
            _ = _ref2[0],
            proxyRes = _ref2[1];

        if (res.finished) return;

        var responsePromise = hasResponseInterceptor ? createInterceptorPromise(responseInterceptor, req, res, null, proxyRes, ssl) : Promise.resolve();

        return responsePromise.then(function () {
            return proxyRes;
        });
    }).then(function (proxyRes) {
        if (!proxyRes || res.finished) return;

        // 性能优化：使用缓存的头部处理
        var processedHeaders = processHeaders(proxyRes.headers);

        Object.keys(processedHeaders).forEach(function (key) {
            res.setHeader(key, processedHeaders[key]);
        });

        res.writeHead(proxyRes.statusCode);
        proxyRes.pipe(res);

        // 记录性能指标
        var endTime = process.hrtime.bigint();
        var latency = Number(endTime - startTime) / 1000000;
        performanceMetrics.recordRequest(latency, false);
    }).catch(function (error) {
        performanceMetrics.recordError();
        var handler = errorHandlers[error.code] || errorHandlers.default;
        handler(res, error);
        console.error('Standard path error:', error);
    });
}

// 性能优化：拦截器Promise创建
function createInterceptorPromise(interceptor) {
    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
    }

    return new Promise(function (resolve, reject) {
        var next = function next() {
            return resolve();
        };
        try {
            interceptor.call.apply(interceptor, [null].concat(args, [next]));
        } catch (e) {
            reject(e);
        }
    });
}

// 性能优化：代理请求Promise创建
function createProxyPromise(req, rOptions) {
    return new Promise(function (resolve, reject) {
        rOptions.host = rOptions.hostname || rOptions.host || 'localhost';

        // NTLM socket复用逻辑
        if (rOptions.agent && rOptions.customSocketId != null && rOptions.agent.getName) {
            var socketName = rOptions.agent.getName(rOptions);
            var bindingSocket = rOptions.agent.sockets[socketName];
            if (bindingSocket && bindingSocket.length > 0) {
                bindingSocket[0].once('free', onFree);
                return;
            }
        }

        onFree();

        function onFree() {
            var proxyReq = (rOptions.protocol === 'https:' ? https : http).request(rOptions, resolve);

            proxyReq.on('timeout', function () {
                reject(new Error(rOptions.host + ':' + rOptions.port + ', request timeout'));
            });

            proxyReq.on('error', reject);

            proxyReq.on('aborted', function () {
                reject(new Error('server aborted request'));
            });

            req.on('aborted', function () {
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
module.exports.getPerformanceMetrics = function () {
    return performanceMetrics.getStats();
};
module.exports.resetPerformanceMetrics = function () {
    return performanceMetrics.reset();
};