'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var net = require('net');
var url = require('url');
var colors = require('colors');

var localIP = '127.0.0.1';

// 性能优化：连接池管理

var ConnectionPool = function () {
    function ConnectionPool() {
        var _this = this;

        _classCallCheck(this, ConnectionPool);

        this.pools = new Map(); // hostname:port -> socket数组
        this.maxPoolSize = 20;
        this.maxIdleTime = 30000; // 30秒空闲超时
        this.cleanupInterval = 60000; // 1分钟清理一次

        // 定期清理空闲连接
        setInterval(function () {
            return _this.cleanup();
        }, this.cleanupInterval);
    }

    _createClass(ConnectionPool, [{
        key: 'getKey',
        value: function getKey(hostname, port) {
            return hostname + ':' + port;
        }
    }, {
        key: 'getConnection',
        value: function getConnection(hostname, port) {
            var key = this.getKey(hostname, port);
            var pool = this.pools.get(key);

            if (pool && pool.length > 0) {
                // 查找可用的连接
                for (var i = pool.length - 1; i >= 0; i--) {
                    var socket = pool[i];
                    if (socket.readyState === 'open' && !socket.destroyed && !socket.busy) {
                        socket.busy = true;
                        socket.lastUsed = Date.now();
                        return socket;
                    }
                }
            }

            return null;
        }
    }, {
        key: 'releaseConnection',
        value: function releaseConnection(socket, hostname, port) {
            if (socket.destroyed || socket.readyState !== 'open') {
                return;
            }

            socket.busy = false;
            socket.lastUsed = Date.now();

            var key = this.getKey(hostname, port);
            var pool = this.pools.get(key);

            if (!pool) {
                pool = [];
                this.pools.set(key, pool);
            }

            // 限制池大小
            if (pool.length < this.maxPoolSize) {
                pool.push(socket);
            } else {
                socket.destroy();
            }
        }
    }, {
        key: 'cleanup',
        value: function cleanup() {
            var now = Date.now();

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = this.pools.entries()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _step$value = _slicedToArray(_step.value, 2),
                        key = _step$value[0],
                        pool = _step$value[1];

                    for (var i = pool.length - 1; i >= 0; i--) {
                        var socket = pool[i];

                        // 清理过期或损坏的连接
                        if (socket.destroyed || socket.readyState !== 'open' || now - socket.lastUsed > this.maxIdleTime) {

                            if (!socket.destroyed) {
                                socket.destroy();
                            }
                            pool.splice(i, 1);
                        }
                    }

                    // 清理空池
                    if (pool.length === 0) {
                        this.pools.delete(key);
                    }
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }
        }
    }, {
        key: 'getStats',
        value: function getStats() {
            var totalConnections = 0;
            var activeConnections = 0;

            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                for (var _iterator2 = this.pools.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    var pool = _step2.value;

                    totalConnections += pool.length;
                    activeConnections += pool.filter(function (s) {
                        return s.busy;
                    }).length;
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }

            return {
                totalPools: this.pools.size,
                totalConnections: totalConnections,
                activeConnections: activeConnections,
                idleConnections: totalConnections - activeConnections
            };
        }
    }]);

    return ConnectionPool;
}();

// 性能优化：URL解析缓存


var urlCache = new Map();
var maxUrlCacheSize = 1000;

function parseUrlCached(urlStr) {
    if (urlCache.has(urlStr)) {
        return urlCache.get(urlStr);
    }

    var parsed = url.parse('https://' + urlStr);

    // 限制缓存大小
    if (urlCache.size >= maxUrlCacheSize) {
        var firstKey = urlCache.keys().next().value;
        urlCache.delete(firstKey);
    }

    urlCache.set(urlStr, parsed);
    return parsed;
}

// 性能优化：错误处理优化
var connectErrorHandlers = {
    ECONNREFUSED: function ECONNREFUSED(cltSocket, hostname, port) {
        cltSocket.write('HTTP/1.1 502 Bad Gateway\r\n' + 'Content-Type: text/plain\r\n' + 'Connection: close\r\n\r\n' + ('Cannot connect to ' + hostname + ':' + port));
        cltSocket.end();
    },

    ETIMEDOUT: function ETIMEDOUT(cltSocket, hostname, port) {
        cltSocket.write('HTTP/1.1 504 Gateway Timeout\r\n' + 'Content-Type: text/plain\r\n' + 'Connection: close\r\n\r\n' + ('Connection timeout to ' + hostname + ':' + port));
        cltSocket.end();
    },

    EHOSTUNREACH: function EHOSTUNREACH(cltSocket, hostname, port) {
        cltSocket.write('HTTP/1.1 502 Bad Gateway\r\n' + 'Content-Type: text/plain\r\n' + 'Connection: close\r\n\r\n' + ('Host unreachable: ' + hostname + ':' + port));
        cltSocket.end();
    },

    default: function _default(cltSocket, error, hostname, port) {
        cltSocket.write('HTTP/1.1 500 Internal Server Error\r\n' + 'Content-Type: text/plain\r\n' + 'Connection: close\r\n\r\n' + ('Proxy error: ' + error.message));
        cltSocket.end();
    }
};

// 性能监控
var connectMetrics = {
    connectionCount: 0,
    successCount: 0,
    errorCount: 0,
    totalConnectTime: 0,
    poolHits: 0,

    recordConnection: function recordConnection(connectTime) {
        var fromPool = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

        this.connectionCount++;
        this.successCount++;
        this.totalConnectTime += connectTime;
        if (fromPool) this.poolHits++;
    },
    recordError: function recordError() {
        this.connectionCount++;
        this.errorCount++;
    },
    getStats: function getStats() {
        return {
            totalConnections: this.connectionCount,
            successRate: this.connectionCount > 0 ? this.successCount / this.connectionCount : 0,
            avgConnectTime: this.successCount > 0 ? this.totalConnectTime / this.successCount : 0,
            poolHitRate: this.connectionCount > 0 ? this.poolHits / this.connectionCount : 0
        };
    },
    reset: function reset() {
        this.connectionCount = 0;
        this.successCount = 0;
        this.errorCount = 0;
        this.totalConnectTime = 0;
        this.poolHits = 0;
    }
};

// 连接性能统计定时器（根据配置决定是否启用）
var connectStatsInterval = null;

function initConnectStats(enabled) {
    if (enabled && !connectStatsInterval) {
        connectStatsInterval = setInterval(function () {
            var stats = connectMetrics.getStats();
            var poolStats = connectionPool.getStats();

            if (connectMetrics.connectionCount > 0) {
                console.log('Connect Performance Stats:', {
                    connections: connectMetrics.connectionCount,
                    successRate: (stats.successRate * 100).toFixed(2) + '%',
                    avgConnectTime: stats.avgConnectTime.toFixed(2) + 'ms',
                    poolHitRate: (stats.poolHitRate * 100).toFixed(2) + '%',
                    poolStats: poolStats
                });
            }
            connectMetrics.reset();
        }, 60000);
    } else if (!enabled && connectStatsInterval) {
        clearInterval(connectStatsInterval);
        connectStatsInterval = null;
    }
}

var connectionPool = new ConnectionPool();

// create connectHandler function
module.exports = function createConnectHandler(sslConnectInterceptor, fakeServerCenter) {
    var enablePerformanceMetrics = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;


    // 初始化连接性能统计
    initConnectStats(enablePerformanceMetrics);

    // 性能优化：预编译拦截器检查
    var hasInterceptor = typeof sslConnectInterceptor === 'function';

    return function connectHandler(req, cltSocket, head) {
        var startTime = enablePerformanceMetrics ? process.hrtime.bigint() : null;

        try {
            // 性能优化：使用缓存的URL解析
            var srvUrl = parseUrlCached(req.url);

            if (hasInterceptor && sslConnectInterceptor.call(null, req, cltSocket, head)) {
                // SSL拦截模式
                fakeServerCenter.getServerPromise(srvUrl.hostname, srvUrl.port).then(function (serverObj) {
                    if (enablePerformanceMetrics && startTime) {
                        var endTime = process.hrtime.bigint();
                        var connectTime = Number(endTime - startTime) / 1000000;
                        connectMetrics.recordConnection(connectTime, false);
                    }

                    connect(req, cltSocket, head, localIP, serverObj.port, false, enablePerformanceMetrics);
                }).catch(function (error) {
                    if (enablePerformanceMetrics) {
                        connectMetrics.recordError();
                    }
                    console.error('SSL server creation error:', error);
                    var handler = connectErrorHandlers.default;
                    handler(cltSocket, error, srvUrl.hostname, srvUrl.port);
                });
            } else {
                // 直接代理模式
                var connectTime = 0;
                if (enablePerformanceMetrics && startTime) {
                    var endTime = process.hrtime.bigint();
                    connectTime = Number(endTime - startTime) / 1000000;
                }

                connect(req, cltSocket, head, srvUrl.hostname, srvUrl.port, true, connectTime, enablePerformanceMetrics);
            }
        } catch (error) {
            if (enablePerformanceMetrics) {
                connectMetrics.recordError();
            }
            console.error('Connect handler error:', error);
            var handler = connectErrorHandlers.default;
            handler(cltSocket, error, 'unknown', 'unknown');
        }
    };
};

// 性能优化：连接函数
function connect(req, cltSocket, head, hostname, port) {
    var usePool = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : true;
    var baseConnectTime = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 0;
    var enablePerformanceMetrics = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : false;

    var proxySocket = null;
    var fromPool = false;

    // 尝试从连接池获取连接
    if (usePool) {
        proxySocket = connectionPool.getConnection(hostname, port);
        if (proxySocket) {
            fromPool = true;
            // 立即建立隧道
            establishTunnel(cltSocket, proxySocket, head, hostname, port, baseConnectTime, fromPool, enablePerformanceMetrics);
            return proxySocket;
        }
    }

    // 创建新连接
    var connectStart = enablePerformanceMetrics ? process.hrtime.bigint() : null;

    proxySocket = net.connect({
        port: port,
        host: hostname,
        // 性能优化：连接选项
        keepAlive: true,
        keepAliveInitialDelay: 30000,
        noDelay: true
    }, function () {
        var connectTime = baseConnectTime;
        if (enablePerformanceMetrics && connectStart) {
            var connectEnd = process.hrtime.bigint();
            connectTime = baseConnectTime + Number(connectEnd - connectStart) / 1000000;
            connectMetrics.recordConnection(connectTime, fromPool);
        }

        establishTunnel(cltSocket, proxySocket, head, hostname, port, connectTime, fromPool, enablePerformanceMetrics);
    });

    // 性能优化：错误处理
    proxySocket.on('error', function (error) {
        if (enablePerformanceMetrics) {
            connectMetrics.recordError();
        }
        console.log(colors.red('Connection error to ' + hostname + ':' + port + ':', error.message));

        var handler = connectErrorHandlers[error.code] || connectErrorHandlers.default;
        handler(cltSocket, error, hostname, port);
    });

    // 连接超时处理
    proxySocket.setTimeout(30000, function () {
        if (enablePerformanceMetrics) {
            connectMetrics.recordError();
        }
        proxySocket.destroy();
        connectErrorHandlers.ETIMEDOUT(cltSocket, hostname, port);
    });

    return proxySocket;
}

// 性能优化：建立隧道
function establishTunnel(cltSocket, proxySocket, head, hostname, port, connectTime, fromPool) {
    var enablePerformanceMetrics = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : false;

    // 发送连接建立响应
    var response = 'HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: node-mitmproxy-optimized\r\n';

    if (enablePerformanceMetrics) {
        response += 'X-Connect-Time: ' + connectTime.toFixed(2) + 'ms\r\n' + ('X-From-Pool: ' + fromPool + '\r\n');
    }

    response += '\r\n';
    cltSocket.write(response);

    // 转发初始数据
    if (head && head.length > 0) {
        proxySocket.write(head);
    }

    // 建立双向数据流
    proxySocket.pipe(cltSocket);
    cltSocket.pipe(proxySocket);

    // 性能优化：连接清理处理
    var cleanup = function cleanup() {
        if (proxySocket && !proxySocket.destroyed) {
            if (fromPool) {
                // 释放回连接池
                connectionPool.releaseConnection(proxySocket, hostname, port);
            } else {
                // 尝试加入连接池
                connectionPool.releaseConnection(proxySocket, hostname, port);
            }
        }
    };

    cltSocket.on('close', cleanup);
    cltSocket.on('error', function (error) {
        console.log(colors.yellow('Client socket error: ' + error.message));
        cleanup();
    });

    proxySocket.on('close', function () {
        if (!cltSocket.destroyed) {
            cltSocket.end();
        }
    });

    proxySocket.on('error', function (error) {
        console.log(colors.yellow('Proxy socket error: ' + error.message));
        if (!cltSocket.destroyed) {
            cltSocket.end();
        }
    });
}

// 导出性能指标和连接池统计
module.exports.getConnectMetrics = function () {
    return connectMetrics.getStats();
};
module.exports.getPoolStats = function () {
    return connectionPool.getStats();
};
module.exports.resetConnectMetrics = function () {
    return connectMetrics.reset();
};
module.exports.cleanupConnectionPool = function () {
    return connectionPool.cleanup();
};