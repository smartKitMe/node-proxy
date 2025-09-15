const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

// 测试配置
const TEST_CONFIG = {
    proxyHost: 'localhost',
    proxyPort: 8080,
    testUrls: [
        'http://httpbin.org/get',  // 应该被拦截
        'http://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js',  // 快速模式
        'http://fonts.googleapis.com/css?family=Roboto',  // 快速模式
        'http://httpbin.org/api/test',  // 应该被拦截（如果配置了/api/前缀）
    ],
    concurrency: 10,
    totalRequests: 100
};

// 发送代理请求
function makeProxyRequest(url) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
            hostname: TEST_CONFIG.proxyHost,
            port: TEST_CONFIG.proxyPort,
            path: url,
            method: 'GET',
            headers: {
                'Host': urlObj.hostname,
                'User-Agent': 'SelectiveInterceptTest/1.0'
            }
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const endTime = performance.now();
                resolve({
                    url,
                    statusCode: res.statusCode,
                    latency: endTime - startTime,
                    size: data.length,
                    intercepted: res.headers['x-proxy-processed'] === 'true'
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.abort();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// 运行性能测试
async function runPerformanceTest() {
    console.log('开始选择性拦截性能测试...');
    console.log('配置:', TEST_CONFIG);
    console.log('');
    
    const results = [];
    const startTime = performance.now();
    
    // 并发测试
    const promises = [];
    for (let i = 0; i < TEST_CONFIG.totalRequests; i++) {
        const url = TEST_CONFIG.testUrls[i % TEST_CONFIG.testUrls.length];
        promises.push(makeProxyRequest(url));
        
        // 控制并发数
        if (promises.length >= TEST_CONFIG.concurrency) {
            const batch = await Promise.allSettled(promises.splice(0, TEST_CONFIG.concurrency));
            batch.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    console.error('请求失败:', result.reason.message);
                }
            });
        }
    }
    
    // 处理剩余请求
    if (promises.length > 0) {
        const batch = await Promise.allSettled(promises);
        batch.forEach(result => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error('请求失败:', result.reason.message);
            }
        });
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // 统计结果
    const interceptedRequests = results.filter(r => r.intercepted);
    const fastRequests = results.filter(r => !r.intercepted);
    const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
    const avgInterceptedLatency = interceptedRequests.length > 0 ? 
        interceptedRequests.reduce((sum, r) => sum + r.latency, 0) / interceptedRequests.length : 0;
    const avgFastLatency = fastRequests.length > 0 ? 
        fastRequests.reduce((sum, r) => sum + r.latency, 0) / fastRequests.length : 0;
    
    console.log('
=== 性能测试结果 ===');
    console.log('总请求数: ' + results.length);
    console.log('总耗时: ' + totalTime.toFixed(2) + 'ms');
    console.log('平均延迟: ' + avgLatency.toFixed(2) + 'ms');
    console.log('请求/秒: ' + (results.length / (totalTime / 1000)).toFixed(2));
    console.log('');
    console.log('拦截请求: ' + interceptedRequests.length + ' (' + (interceptedRequests.length / results.length * 100).toFixed(1) + '%)');
    console.log('拦截请求平均延迟: ' + avgInterceptedLatency.toFixed(2) + 'ms');
    console.log('');
    console.log('快速请求: ' + fastRequests.length + ' (' + (fastRequests.length / results.length * 100).toFixed(1) + '%)');
    console.log('快速请求平均延迟: ' + avgFastLatency.toFixed(2) + 'ms');
    console.log('');
    
    if (avgFastLatency > 0 && avgInterceptedLatency > 0) {
        const speedup = avgInterceptedLatency / avgFastLatency;
        console.log('快速模式提升: ' + speedup.toFixed(2) + 'x');
    }
}

// 检查代理服务器是否运行
function checkProxyServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: TEST_CONFIG.proxyHost,
            port: TEST_CONFIG.proxyPort,
            path: 'http://httpbin.org/get',
            method: 'GET',
            timeout: 2000
        }, () => {
            resolve(true);
        });
        
        req.on('error', () => resolve(false));
        req.on('timeout', () => resolve(false));
        req.end();
    });
}

// 主函数
async function main() {
    console.log('检查代理服务器状态...');
    const isRunning = await checkProxyServer();
    
    if (!isRunning) {
        console.error('代理服务器未运行，请先启动代理服务器');
        console.log('运行: node selective-intercept-usage.js');
        process.exit(1);
    }
    
    console.log('代理服务器运行正常，开始测试...');
    await runPerformanceTest();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { runPerformanceTest: runPerformanceTest, checkProxyServer: checkProxyServer };
