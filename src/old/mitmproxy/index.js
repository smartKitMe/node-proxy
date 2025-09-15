const tlsUtils = require('../tls/tlsUtils');
const http = require('http');
const config = require('../common/config');
const colors = require('colors');
const createRequestHandler = require('./createRequestHandler');
const createConnectHandler = require('./createConnectHandler');
const createFakeServerCenter = require('./createFakeServerCenter');
const createUpgradeHandler = require('./createUpgradeHandler');


module.exports = {
    createProxy({
        port = config.defaultPort,
        caCertPath,
        caKeyPath,
        sslConnectInterceptor,
        requestInterceptor,
        responseInterceptor,
        getCertSocketTimeout = 1 * 1000,
        middlewares = [],
        externalProxy,
        fixedCertPath = null,
        fixedKeyPath = null,
        fixedCert = null,
        fixedKey = null,
        useFixedCert = false,
        // 性能监控配置
        enablePerformanceMetrics = false,  // 是否开启性能指标监控和打印
        // 选择性拦截配置
        interceptConfig = {
            domains: [],           // 需要拦截的域名列表
            urls: [],             // 需要拦截的完整URL列表
            urlPrefixes: [],      // 需要拦截的URL前缀列表
            pathPrefixes: [],     // 需要拦截的路径前缀列表
            staticExtensions: ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'] // 静态资源扩展名
        }
    }) {

        // Don't reject unauthorized
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'

        if (!caCertPath && !caKeyPath) {
            var rs = this.createCA();
            caCertPath = rs.caCertPath;
            caKeyPath = rs.caKeyPath;
            if (rs.create) {
                console.log(colors.cyan(`CA Cert saved in: ${caCertPath}`));
                console.log(colors.cyan(`CA private key saved in: ${caKeyPath}`));
            }
        }

        port = ~~port;
        // 验证和标准化拦截配置
        const normalizedConfig = {
            domains: Array.isArray(interceptConfig.domains) ? interceptConfig.domains.map(d => d.toLowerCase()) : [],
            urls: Array.isArray(interceptConfig.urls) ? interceptConfig.urls : [],
            urlPrefixes: Array.isArray(interceptConfig.urlPrefixes) ? interceptConfig.urlPrefixes : [],
            pathPrefixes: Array.isArray(interceptConfig.pathPrefixes) ? interceptConfig.pathPrefixes : [],
            fastDomains: Array.isArray(interceptConfig.fastDomains) ? interceptConfig.fastDomains.map(d => d.toLowerCase()) : [],
            staticExtensions: Array.isArray(interceptConfig.staticExtensions) ? interceptConfig.staticExtensions : ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot']
        };

        // 输出配置摘要
        console.log(colors.cyan('选择性拦截配置:'));
        console.log(colors.yellow(`  拦截域名: ${normalizedConfig.domains.length > 0 ? normalizedConfig.domains.join(', ') : '无'}`));
        console.log(colors.yellow(`  拦截URL: ${normalizedConfig.urls.length > 0 ? normalizedConfig.urls.length + '个' : '无'}`));
        console.log(colors.yellow(`  拦截URL前缀: ${normalizedConfig.urlPrefixes.length > 0 ? normalizedConfig.urlPrefixes.join(', ') : '无'}`));
        console.log(colors.yellow(`  拦截路径前缀: ${normalizedConfig.pathPrefixes.length > 0 ? normalizedConfig.pathPrefixes.join(', ') : '无'}`));
        console.log(colors.yellow(`  快速域名: ${normalizedConfig.fastDomains.length > 0 ? normalizedConfig.fastDomains.join(', ') : '无'}`));
        console.log(colors.yellow(`  静态资源扩展名: ${normalizedConfig.staticExtensions.join(', ')}`));

        var requestHandler = createRequestHandler(
            requestInterceptor,
            responseInterceptor,
            middlewares,
            externalProxy,
            normalizedConfig,
            enablePerformanceMetrics
        );

        var upgradeHandler = createUpgradeHandler();

        var fakeServersCenter = createFakeServerCenter({
            caCertPath,
            caKeyPath,
            requestHandler,
            upgradeHandler,
            getCertSocketTimeout,
            fixedCertPath,
            fixedKeyPath,
            fixedCert,
            fixedKey,
            useFixedCert
        });

        var connectHandler = createConnectHandler(
            sslConnectInterceptor,
            fakeServersCenter,
            enablePerformanceMetrics
        );

        var server = new http.Server();
        
        server.on('error', (e) => {
            console.error(colors.red(e));
        });
        server.on('request', (req, res) => {
            var ssl = false;
            requestHandler(req, res, ssl);
        });
        // tunneling for https
        server.on('connect', (req, cltSocket, head) => {
            connectHandler(req, cltSocket, head);
        });
        // TODO: handler WebSocket
        server.on('upgrade', function(req, socket, head) {
            var ssl = false;
            upgradeHandler(req, socket, head, ssl);
        });
        
        // 重写listen方法以添加启动日志
        const originalListen = server.listen.bind(server);
        server.listen = function(portOrCallback, callback) {
            if (typeof portOrCallback === 'function') {
                callback = portOrCallback;
                portOrCallback = port;
            }
            return originalListen(portOrCallback || port, () => {
                console.log(colors.green(`node-mitmproxy启动端口: ${portOrCallback || port}`));
                if (callback) callback();
            });
        };
        
        return server;
    },
    createCA(caBasePath = config.getDefaultCABasePath()) {
        return tlsUtils.initCA(caBasePath);
    }
}
