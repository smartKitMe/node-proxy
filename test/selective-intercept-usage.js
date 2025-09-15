const mitmproxy = require('../src/index');
const interceptConfig = require('./selective-intercept-config');

// 请求拦截器
function requestInterceptor(rOptions, req, res, ssl, next) {
    console.log('拦截请求:', req.headers.host + req.url);
    
    // 在这里添加你的请求处理逻辑
    // 例如：修改请求头、记录日志、验证权限等
    
    next();
}

// 响应拦截器
function responseInterceptor(req, res, proxyReq, proxyRes, ssl, next) {
    console.log('拦截响应:', req.headers.host + req.url, '状态码:', proxyRes.statusCode);
    
    // 在这里添加你的响应处理逻辑
    // 例如：修改响应头、记录日志、数据转换等
    
    next();
}

// 创建代理服务器
mitmproxy.createProxy({
    port: 8080,
    requestInterceptor,
    responseInterceptor,
    interceptConfig  // 使用选择性拦截配置
});

console.log('选择性拦截代理服务器已启动在端口 8080');
