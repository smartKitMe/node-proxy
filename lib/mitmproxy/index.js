'use strict';

var tlsUtils = require('../tls/tlsUtils');
var http = require('http');
var config = require('../common/config');
var colors = require('colors');
var createRequestHandler = require('./createRequestHandler');
var createConnectHandler = require('./createConnectHandler');
var createFakeServerCenter = require('./createFakeServerCenter');
var createUpgradeHandler = require('./createUpgradeHandler');

module.exports = {
    createProxy: function createProxy(_ref) {
        var _ref$port = _ref.port,
            port = _ref$port === undefined ? config.defaultPort : _ref$port,
            caCertPath = _ref.caCertPath,
            caKeyPath = _ref.caKeyPath,
            sslConnectInterceptor = _ref.sslConnectInterceptor,
            requestInterceptor = _ref.requestInterceptor,
            responseInterceptor = _ref.responseInterceptor,
            _ref$getCertSocketTim = _ref.getCertSocketTimeout,
            getCertSocketTimeout = _ref$getCertSocketTim === undefined ? 1 * 1000 : _ref$getCertSocketTim,
            _ref$middlewares = _ref.middlewares,
            middlewares = _ref$middlewares === undefined ? [] : _ref$middlewares,
            externalProxy = _ref.externalProxy,
            _ref$fixedCertPath = _ref.fixedCertPath,
            fixedCertPath = _ref$fixedCertPath === undefined ? null : _ref$fixedCertPath,
            _ref$fixedKeyPath = _ref.fixedKeyPath,
            fixedKeyPath = _ref$fixedKeyPath === undefined ? null : _ref$fixedKeyPath,
            _ref$fixedCert = _ref.fixedCert,
            fixedCert = _ref$fixedCert === undefined ? null : _ref$fixedCert,
            _ref$fixedKey = _ref.fixedKey,
            fixedKey = _ref$fixedKey === undefined ? null : _ref$fixedKey,
            _ref$useFixedCert = _ref.useFixedCert,
            useFixedCert = _ref$useFixedCert === undefined ? false : _ref$useFixedCert,
            _ref$enablePerformanc = _ref.enablePerformanceMetrics,
            enablePerformanceMetrics = _ref$enablePerformanc === undefined ? false : _ref$enablePerformanc,
            _ref$interceptConfig = _ref.interceptConfig,
            interceptConfig = _ref$interceptConfig === undefined ? {
            domains: [], // 需要拦截的域名列表
            urls: [], // 需要拦截的完整URL列表
            urlPrefixes: [], // 需要拦截的URL前缀列表
            pathPrefixes: [], // 需要拦截的路径前缀列表
            staticExtensions: ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'] // 静态资源扩展名
        } : _ref$interceptConfig;


        // Don't reject unauthorized
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

        if (!caCertPath && !caKeyPath) {
            var rs = this.createCA();
            caCertPath = rs.caCertPath;
            caKeyPath = rs.caKeyPath;
            if (rs.create) {
                console.log(colors.cyan('CA Cert saved in: ' + caCertPath));
                console.log(colors.cyan('CA private key saved in: ' + caKeyPath));
            }
        }

        port = ~~port;
        // 验证和标准化拦截配置
        var normalizedConfig = {
            domains: Array.isArray(interceptConfig.domains) ? interceptConfig.domains.map(function (d) {
                return d.toLowerCase();
            }) : [],
            urls: Array.isArray(interceptConfig.urls) ? interceptConfig.urls : [],
            urlPrefixes: Array.isArray(interceptConfig.urlPrefixes) ? interceptConfig.urlPrefixes : [],
            pathPrefixes: Array.isArray(interceptConfig.pathPrefixes) ? interceptConfig.pathPrefixes : [],
            fastDomains: Array.isArray(interceptConfig.fastDomains) ? interceptConfig.fastDomains.map(function (d) {
                return d.toLowerCase();
            }) : [],
            staticExtensions: Array.isArray(interceptConfig.staticExtensions) ? interceptConfig.staticExtensions : ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot']
        };

        // 输出配置摘要
        console.log(colors.cyan('选择性拦截配置:'));
        console.log(colors.yellow('  \u62E6\u622A\u57DF\u540D: ' + (normalizedConfig.domains.length > 0 ? normalizedConfig.domains.join(', ') : '无')));
        console.log(colors.yellow('  \u62E6\u622AURL: ' + (normalizedConfig.urls.length > 0 ? normalizedConfig.urls.length + '个' : '无')));
        console.log(colors.yellow('  \u62E6\u622AURL\u524D\u7F00: ' + (normalizedConfig.urlPrefixes.length > 0 ? normalizedConfig.urlPrefixes.join(', ') : '无')));
        console.log(colors.yellow('  \u62E6\u622A\u8DEF\u5F84\u524D\u7F00: ' + (normalizedConfig.pathPrefixes.length > 0 ? normalizedConfig.pathPrefixes.join(', ') : '无')));
        console.log(colors.yellow('  \u5FEB\u901F\u57DF\u540D: ' + (normalizedConfig.fastDomains.length > 0 ? normalizedConfig.fastDomains.join(', ') : '无')));
        console.log(colors.yellow('  \u9759\u6001\u8D44\u6E90\u6269\u5C55\u540D: ' + normalizedConfig.staticExtensions.join(', ')));

        var requestHandler = createRequestHandler(requestInterceptor, responseInterceptor, middlewares, externalProxy, normalizedConfig, enablePerformanceMetrics);

        var upgradeHandler = createUpgradeHandler();

        var fakeServersCenter = createFakeServerCenter({
            caCertPath: caCertPath,
            caKeyPath: caKeyPath,
            requestHandler: requestHandler,
            upgradeHandler: upgradeHandler,
            getCertSocketTimeout: getCertSocketTimeout,
            fixedCertPath: fixedCertPath,
            fixedKeyPath: fixedKeyPath,
            fixedCert: fixedCert,
            fixedKey: fixedKey,
            useFixedCert: useFixedCert
        });

        var connectHandler = createConnectHandler(sslConnectInterceptor, fakeServersCenter, enablePerformanceMetrics);

        var server = new http.Server();

        server.on('error', function (e) {
            console.error(colors.red(e));
        });
        server.on('request', function (req, res) {
            var ssl = false;
            requestHandler(req, res, ssl);
        });
        // tunneling for https
        server.on('connect', function (req, cltSocket, head) {
            connectHandler(req, cltSocket, head);
        });
        // TODO: handler WebSocket
        server.on('upgrade', function (req, socket, head) {
            var ssl = false;
            upgradeHandler(req, socket, head, ssl);
        });

        // 重写listen方法以添加启动日志
        var originalListen = server.listen.bind(server);
        server.listen = function (portOrCallback, callback) {
            if (typeof portOrCallback === 'function') {
                callback = portOrCallback;
                portOrCallback = port;
            }
            return originalListen(portOrCallback || port, function () {
                console.log(colors.green('node-mitmproxy\u542F\u52A8\u7AEF\u53E3: ' + (portOrCallback || port)));
                if (callback) callback();
            });
        };

        return server;
    },
    createCA: function createCA() {
        var caBasePath = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : config.getDefaultCABasePath();

        return tlsUtils.initCA(caBasePath);
    }
};