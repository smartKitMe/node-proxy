const util = require('../src/common/util');
const { performance } = require('perf_hooks');

// 模拟请求对象
function createMockRequest(url, host, method = 'GET') {
    return {
        url: url,
        method: method,
        headers: {
            host: host,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.5',
            'accept-encoding': 'gzip, deflate'
        },
        socket: {
            customSocketId: null
        }
    };
}

// 性能测试函数
function performanceTest() {
    console.log('开始性能测试...');
    
    // 测试数据
    const testUrls = [
        { url: '/api/users', host: 'example.com' },
        { url: '/api/products?page=1', host: 'api.example.com' },
        { url: '/images/logo.png', host: 'cdn.example.com' },
        { url: '/search?q=test', host: 'search.example.com' },
        { url: '/api/users', host: 'example.com' }, // 重复URL测试缓存
        { url: '/api/products?page=2', host: 'api.example.com' },
        { url: '/images/banner.jpg', host: 'cdn.example.com' },
        { url: '/search?q=performance', host: 'search.example.com' }
    ];
    
    const proxyUrls = [
        'http://proxy1.example.com:8080',
        'https://proxy2.example.com:8080',
        'socks5://proxy3.example.com:1080',
        'http://proxy1.example.com:8080', // 重复代理测试缓存
    ];
    
    // 测试 getOptionsFormRequest 性能
    console.log('\n=== 测试 getOptionsFormRequest 性能 ===');
    
    const iterations = 10000;
    let totalTime = 0;
    
    for (let i = 0; i < iterations; i++) {
        const testData = testUrls[i % testUrls.length];
        const mockReq = createMockRequest(testData.url, testData.host);
        
        const startTime = performance.now();
        const options = util.getOptionsFormRequest(mockReq, false);
        const endTime = performance.now();
        
        totalTime += (endTime - startTime);
        
        // 验证结果正确性
        if (i === 0) {
            console.log('示例输出:', {
                protocol: options.protocol,
                hostname: options.hostname,
                port: options.port,
                method: options.method,
                path: options.path
            });
        }
    }
    
    console.log(`getOptionsFormRequest 平均耗时: ${(totalTime / iterations).toFixed(4)} ms`);
    console.log(`总计 ${iterations} 次调用，总耗时: ${totalTime.toFixed(2)} ms`);
    
    // 测试 getAgentObject 性能
    console.log('\n=== 测试 getAgentObject 性能 ===');
    
    totalTime = 0;
    const agentIterations = 1000;
    
    for (let i = 0; i < agentIterations; i++) {
        const proxyUrl = proxyUrls[i % proxyUrls.length];
        
        const startTime = performance.now();
        const agent = util.getAgentObject(proxyUrl);
        const endTime = performance.now();
        
        totalTime += (endTime - startTime);
        
        // 验证agent复用
        if (i === 0) {
            console.log('Agent类型:', agent.constructor.name);
        }
    }
    
    console.log(`getAgentObject 平均耗时: ${(totalTime / agentIterations).toFixed(4)} ms`);
    console.log(`总计 ${agentIterations} 次调用，总耗时: ${totalTime.toFixed(2)} ms`);
    
    // 测试缓存效果
    console.log('\n=== 测试缓存效果 ===');
    
    // 测试相同URL的解析时间
    const sameUrl = '/api/test?param=value';
    const sameHost = 'test.example.com';
    
    const firstCallStart = performance.now();
    const mockReq1 = createMockRequest(sameUrl, sameHost);
    util.getOptionsFormRequest(mockReq1, false);
    const firstCallEnd = performance.now();
    
    const secondCallStart = performance.now();
    const mockReq2 = createMockRequest(sameUrl, sameHost);
    util.getOptionsFormRequest(mockReq2, false);
    const secondCallEnd = performance.now();
    
    console.log(`首次调用耗时: ${(firstCallEnd - firstCallStart).toFixed(4)} ms`);
    console.log(`缓存调用耗时: ${(secondCallEnd - secondCallStart).toFixed(4)} ms`);
    console.log(`缓存提升: ${(((firstCallEnd - firstCallStart) - (secondCallEnd - secondCallStart)) / (firstCallEnd - firstCallStart) * 100).toFixed(1)}%`);
    
    // 测试agent缓存效果
    const sameProxy = 'http://cache-test.example.com:8080';
    
    const firstAgentStart = performance.now();
    util.getAgentObject(sameProxy);
    const firstAgentEnd = performance.now();
    
    const secondAgentStart = performance.now();
    util.getAgentObject(sameProxy);
    const secondAgentEnd = performance.now();
    
    console.log(`首次Agent创建耗时: ${(firstAgentEnd - firstAgentStart).toFixed(4)} ms`);
    console.log(`缓存Agent获取耗时: ${(secondAgentEnd - secondAgentStart).toFixed(4)} ms`);
    console.log(`Agent缓存提升: ${(((firstAgentEnd - firstAgentStart) - (secondAgentEnd - secondAgentStart)) / (firstAgentEnd - firstAgentStart) * 100).toFixed(1)}%`);
    
    console.log('\n性能测试完成！');
}

// 内存使用情况监控
function memoryUsage() {
    const used = process.memoryUsage();
    console.log('\n=== 内存使用情况 ===');
    for (let key in used) {
        console.log(`${key}: ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
    }
}

// 运行测试
console.log('Node.js 版本:', process.version);
memoryUsage();
performanceTest();
memoryUsage();