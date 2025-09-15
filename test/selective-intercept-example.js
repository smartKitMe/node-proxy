const mitmproxy = require('../src/index');

// 选择性拦截配置示例
const interceptConfig = {
    // 需要拦截的域名列表（支持子域名匹配）
    domains: [
        'api.example.com',
        'auth.mysite.com',
        'payment.service.com'
    ],
    
    // 需要拦截的完整URL列表
    urls: [
        'cdn.example.com/api/v1/user',
        'static.mysite.com/config.json'
    ],
    
    // 需要拦截的URL前缀列表
    urlPrefixes: [
        'api.example.com/v1/',
        'auth.mysite.com/oauth/',
        'payment.service.com/checkout/'
    ],
    
    // 需要拦截的路径前缀列表
    pathPrefixes: [
        '/api/',
        '/auth/',
        '/admin/',
        '/secure/'
    ],
    
    // 强制快速模式的域名列表（即使匹配其他规则也不拦截）
    fastDomains: [
        'cdn.jsdelivr.net',
        'fonts.googleapis.com',
        'ajax.googleapis.com',
        'unpkg.com'
    ],
    
    // 静态资源扩展名（自动走快速模式）
    staticExtensions: [
        '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
        '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.pdf', '.zip'
    ]
};

// 请求拦截器（只对匹配的请求生效）
function requestInterceptor(rOptions, req, res, ssl, next) {
    console.log('拦截请求:', req.headers.host + req.url);
    
    // 修改请求头
    if (req.headers.host.includes('api.example.com')) {
        rOptions.headers['X-Custom-Header'] = 'intercepted';
    }
    
    // 记录敏感API调用
    if (req.url.startsWith('/api/')) {
        console.log('API调用:', {
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
    }
    
    next();
}

// 响应拦截器（只对匹配的请求生效）
function responseInterceptor(req, res, proxyReq, proxyRes, ssl, next) {
    console.log('拦截响应:', req.headers.host + req.url, '状态码:', proxyRes.statusCode);
    
    // 修改响应头
    if (req.headers.host.includes('api.example.com')) {
        proxyRes.headers['X-Proxy-Processed'] = 'true';
    }
    
    // 记录错误响应
    if (proxyRes.statusCode >= 400) {
        console.error('错误响应:', {
            url: req.headers.host + req.url,
            status: proxyRes.statusCode,
            timestamp: new Date().toISOString()
        });
    }
    
    next();
}

// 创建代理服务器
mitmproxy.createProxy({
    port: 8080,
    requestInterceptor,
    responseInterceptor,
    interceptConfig,  // 传入选择性拦截配置
    
    // SSL连接拦截器（可选）
    sslConnectInterceptor: (req, cltSocket, head, next) => {
        const hostname = req.url.split(':')[0];
        console.log('SSL连接:', hostname);
        next();
    }
});

console.log('\n=== 选择性拦截代理服务器已启动 ===');
console.log('端口: 8080');
console.log('\n拦截规则:');
console.log('- 域名:', interceptConfig.domains.join(', '));
console.log('- URL前缀:', interceptConfig.urlPrefixes.join(', '));
console.log('- 路径前缀:', interceptConfig.pathPrefixes.join(', '));
console.log('\n快速模式:');
console.log('- 快速域名:', interceptConfig.fastDomains.join(', '));
console.log('- 静态资源:', interceptConfig.staticExtensions.join(', '));
console.log('\n其他请求将自动走快速代理模式，不会触发拦截器\n');