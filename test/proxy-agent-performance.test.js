/**
 * 代理 Agent 性能测试脚本
 * 用于验证优化后的 ProxyHttpAgent 和 ProxyHttpsAgent 功能
 */

const http = require('http');
const https = require('https');
const util = require('../src/common/util');
const colors = require('colors');

// 测试配置
const TEST_CONFIG = {
    httpUrl: 'http://httpbin.org/get',
    httpsUrl: 'https://httpbin.org/get',
    concurrency: 10,        // 并发请求数
    totalRequests: 50,      // 总请求数
    testDuration: 30000     // 测试持续时间 (ms)
};

/**
 * 发送 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {Object} options - 请求选项
 * @returns {Promise} 请求 Promise
 */
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const client = isHttps ? https : http;
        
        const urlObj = new URL(url);
        const mockReq = {
            headers: {
                host: urlObj.host
            },
            url: urlObj.pathname + urlObj.search
        };
        
        const requestOptions = {
            ...util.getOptionsFormRequest(mockReq, isHttps),
            ...options
        };
        
        const startTime = Date.now();
        
        const req = client.get(url, requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const endTime = Date.now();
                resolve({
                    statusCode: res.statusCode,
                    responseTime: endTime - startTime,
                    contentLength: data.length,
                    success: res.statusCode === 200
                });
            });
        });
        
        req.on('error', (err) => {
            const endTime = Date.now();
            reject({
                error: err.message,
                responseTime: endTime - startTime,
                success: false
            });
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject({
                error: 'Request timeout',
                responseTime: 10000,
                success: false
            });
        });
    });
}

/**
 * 并发测试函数
 * @param {string} url - 测试 URL
 * @param {number} concurrency - 并发数
 * @param {number} totalRequests - 总请求数
 * @returns {Promise} 测试结果
 */
async function concurrencyTest(url, concurrency, totalRequests) {
    console.log(colors.cyan(`\n开始测试: ${url}`));
    console.log(colors.yellow(`并发数: ${concurrency}, 总请求数: ${totalRequests}`));
    
    const results = [];
    const startTime = Date.now();
    
    // 分批发送请求
    for (let i = 0; i < totalRequests; i += concurrency) {
        const batchSize = Math.min(concurrency, totalRequests - i);
        const promises = [];
        
        for (let j = 0; j < batchSize; j++) {
            promises.push(
                makeRequest(url).catch(err => err)
            );
        }
        
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
        
        // 显示进度
        const progress = ((i + batchSize) / totalRequests * 100).toFixed(1);
        process.stdout.write(`\r进度: ${progress}%`);
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log('\n');
    
    // 计算统计信息
    const successResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    const responseTimes = successResults.map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    
    const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    
    // 计算百分位数
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    
    return {
        url,
        totalRequests,
        successCount: successResults.length,
        failedCount: failedResults.length,
        successRate: (successResults.length / totalRequests * 100).toFixed(2),
        totalTime,
        avgResponseTime: avgResponseTime.toFixed(2),
        minResponseTime,
        maxResponseTime,
        p95ResponseTime: sortedTimes[p95Index] || 0,
        p99ResponseTime: sortedTimes[p99Index] || 0,
        requestsPerSecond: (totalRequests / (totalTime / 1000)).toFixed(2)
    };
}

/**
 * 打印测试结果
 * @param {Object} result - 测试结果
 */
function printTestResult(result) {
    console.log(colors.green('\n=== 测试结果 ==='));
    console.log(`URL: ${result.url}`);
    console.log(`总请求数: ${result.totalRequests}`);
    console.log(`成功请求: ${result.successCount}`);
    console.log(`失败请求: ${result.failedCount}`);
    console.log(`成功率: ${result.successRate}%`);
    console.log(`总耗时: ${result.totalTime}ms`);
    console.log(`平均响应时间: ${result.avgResponseTime}ms`);
    console.log(`最小响应时间: ${result.minResponseTime}ms`);
    console.log(`最大响应时间: ${result.maxResponseTime}ms`);
    console.log(`95% 响应时间: ${result.p95ResponseTime}ms`);
    console.log(`99% 响应时间: ${result.p99ResponseTime}ms`);
    console.log(`QPS: ${result.requestsPerSecond}`);
}

/**
 * 打印代理统计信息
 */
function printAgentStats() {
    const stats = util.getAgentStats();
    
    console.log(colors.blue('\n=== 代理 Agent 统计 ==='));
    
    if (stats.http) {
        console.log(colors.cyan('HTTP Agent:'));
        console.log(`  总请求数: ${stats.http.totalRequests}`);
        console.log(`  活跃连接: ${stats.http.activeConnections}`);
        console.log(`  连接复用率: ${stats.http.reuseRate}%`);
        console.log(`  错误率: ${stats.http.errorRate}%`);
        console.log(`  超时次数: ${stats.http.timeouts}`);
    }
    
    if (stats.https) {
        console.log(colors.cyan('HTTPS Agent:'));
        console.log(`  总请求数: ${stats.https.totalRequests}`);
        console.log(`  活跃连接: ${stats.https.activeConnections}`);
        console.log(`  连接复用率: ${stats.https.reuseRate}%`);
        console.log(`  SSL 握手次数: ${stats.https.sslHandshakes}`);
        console.log(`  SSL 错误率: ${stats.https.sslErrorRate}%`);
        console.log(`  错误率: ${stats.https.errorRate}%`);
        console.log(`  超时次数: ${stats.https.timeouts}`);
    }
}

/**
 * 主测试函数
 */
async function runPerformanceTest() {
    console.log(colors.rainbow('\n🚀 代理 Agent 性能测试开始'));
    
    // 启用调试日志和性能监控
    util.setProxyDebugLogs(true);
    util.setProxyPerformanceMetrics(true);
    
    // 重置统计数据
    util.resetAgentStats();
    
    try {
        // 测试 HTTP
        const httpResult = await concurrencyTest(
            TEST_CONFIG.httpUrl,
            TEST_CONFIG.concurrency,
            TEST_CONFIG.totalRequests
        );
        printTestResult(httpResult);
        
        // 等待一段时间
        console.log(colors.yellow('\n等待 2 秒...'));
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 测试 HTTPS
        const httpsResult = await concurrencyTest(
            TEST_CONFIG.httpsUrl,
            TEST_CONFIG.concurrency,
            TEST_CONFIG.totalRequests
        );
        printTestResult(httpsResult);
        
        // 打印代理统计信息
        printAgentStats();
        
        // 性能评估
        console.log(colors.green('\n=== 性能评估 ==='));
        
        const httpReuseRate = util.getAgentStats().http?.reuseRate || 0;
        const httpsReuseRate = util.getAgentStats().https?.reuseRate || 0;
        
        if (httpReuseRate > 70) {
            console.log(colors.green(`✅ HTTP 连接复用率良好: ${httpReuseRate}%`));
        } else {
            console.log(colors.red(`❌ HTTP 连接复用率偏低: ${httpReuseRate}%`));
        }
        
        if (httpsReuseRate > 70) {
            console.log(colors.green(`✅ HTTPS 连接复用率良好: ${httpsReuseRate}%`));
        } else {
            console.log(colors.red(`❌ HTTPS 连接复用率偏低: ${httpsReuseRate}%`));
        }
        
        if (httpResult.successRate > 95 && httpsResult.successRate > 95) {
            console.log(colors.green('✅ 请求成功率良好'));
        } else {
            console.log(colors.red('❌ 请求成功率偏低，需要检查网络或配置'));
        }
        
        console.log(colors.rainbow('\n🎉 性能测试完成'));
        
    } catch (error) {
        console.error(colors.red('测试过程中发生错误:'), error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    runPerformanceTest().catch(console.error);
}

module.exports = {
    runPerformanceTest,
    concurrencyTest,
    makeRequest
};