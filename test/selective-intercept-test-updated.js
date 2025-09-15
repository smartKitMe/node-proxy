const mitmproxy = require('../src/mitmproxy');

// 测试修改后的选择性拦截逻辑
function testSelectiveIntercept() {
    console.log('=== 测试修改后的选择性拦截逻辑 ===\n');
    
    // 测试配置1：只配置域名，没有路径配置
    const config1 = {
        interceptConfig: {
            domains: ['example.com', 'test.com'],
            urls: [],
            urlPrefixes: [],
            pathPrefixes: [],
            fastDomains: [],
            staticExtensions: ['.js', '.css', '.png', '.jpg']
        }
    };
    
    console.log('配置1：只配置域名，没有路径配置');
    console.log('预期：所有请求都走快速模式（因为没有路径配置）\n');
    
    // 测试配置2：配置域名和路径
    const config2 = {
        interceptConfig: {
            domains: ['api.example.com'],
            urls: [],
            urlPrefixes: [],
            pathPrefixes: ['/api/', '/admin/'],
            fastDomains: [],
            staticExtensions: ['.js', '.css', '.png', '.jpg']
        }
    };
    
    console.log('配置2：配置域名和路径前缀');
    console.log('预期：只有api.example.com域名下的/api/和/admin/路径会被拦截\n');
    
    // 测试配置3：没有配置域名
    const config3 = {
        interceptConfig: {
            domains: [],
            urls: ['example.com/api/test'],
            urlPrefixes: ['example.com/api/'],
            pathPrefixes: ['/api/'],
            fastDomains: [],
            staticExtensions: ['.js', '.css', '.png', '.jpg']
        }
    };
    
    console.log('配置3：没有配置域名');
    console.log('预期：所有请求都走快速模式（因为没有配置域名）\n');
    
    // 创建代理服务器进行测试
    console.log('创建测试代理服务器...');
    
    const proxy = mitmproxy.createProxy({
        port: 8081,
        requestInterceptor: (rOptions, req, res, ssl, next) => {
            console.log(`[拦截] ${req.method} ${req.headers.host}${req.url}`);
            next();
        },
        responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
            console.log(`[响应拦截] ${req.method} ${req.headers.host}${req.url}`);
            next();
        },
        ...config2  // 使用配置2进行测试
    });
    
    console.log('\n代理服务器已启动在端口 8081');
    console.log('\n测试说明：');
    console.log('1. 只有明确配置的域名才会进行拦截判断');
    console.log('2. 配置了域名但没有配置路径时，直接走快速模式');
    console.log('3. 只有在域名匹配且路径匹配时才会进行拦截');
    console.log('\n使用以下命令测试：');
    console.log('curl -x http://localhost:8081 http://api.example.com/api/test  # 应该被拦截');
    console.log('curl -x http://localhost:8081 http://api.example.com/other    # 应该走快速模式');
    console.log('curl -x http://localhost:8081 http://other.com/api/test      # 应该走快速模式');
}

// 性能测试函数
function performanceTest() {
    console.log('\n=== 性能测试 ===');
    
    const testRequests = [
        { host: 'api.example.com', url: '/api/test' },      // 应该被拦截
        { host: 'api.example.com', url: '/other' },         // 快速模式
        { host: 'other.com', url: '/api/test' },            // 快速模式
        { host: 'static.com', url: '/style.css' },          // 静态资源，快速模式
        { host: 'fast.com', url: '/any' }                   // 快速模式
    ];
    
    console.log('模拟请求测试：');
    testRequests.forEach((req, index) => {
        console.log(`请求${index + 1}: ${req.host}${req.url}`);
    });
}

if (require.main === module) {
    testSelectiveIntercept();
    performanceTest();
}

module.exports = {
    testSelectiveIntercept,
    performanceTest
};