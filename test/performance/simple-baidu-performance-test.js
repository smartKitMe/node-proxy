const https = require('https');
const http = require('http');
const { performance } = require('perf_hooks');

/**
 * 简单的百度性能测试
 * 对比三种访问方式的性能：
 * 1. 直接访问
 * 2. 通过代理访问
 * 3. 通过修改请求的代理访问
 */

// 测试配置
const TEST_CONFIG = {
    url: 'https://www.baidu.com',
    count: 500,
    proxy: {
        host: 'localhost',
        port: 8080
    }
};

/**
 * 直接访问百度
 */
async function directAccess(url, count) {
    console.log(`开始直接访问测试: ${url}, 次数: ${count}`);
    
    const results = [];
    
    for (let i = 0; i < count; i++) {
        const startTime = performance.now();
        
        try {
            const result = await makeDirectRequest(url);
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            results.push({
                success: result.success,
                duration: duration,
                statusCode: result.statusCode
            });
            
            // 每100次输出一次进度
            if ((i + 1) % 100 === 0) {
                console.log(`直接访问进度: ${i + 1}/${count}`);
            }
        } catch (error) {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            results.push({
                success: false,
                duration: duration,
                error: error.message
            });
        }
    }
    
    return results;
}

/**
 * 发送直接请求
 */
function makeDirectRequest(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        
        const req = (parsedUrl.protocol === 'https:' ? https : http).request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    success: true,
                    statusCode: res.statusCode,
                    data: data
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.end();
    });
}

/**
 * 通过代理访问百度
 */
async function proxyAccess(url, count, proxyPort) {
    console.log(`开始代理访问测试: ${url}, 次数: ${count}, 代理端口: ${proxyPort}`);
    
    const results = [];
    
    for (let i = 0; i < count; i++) {
        const startTime = performance.now();
        
        try {
            const result = await makeProxyRequest(url, proxyPort);
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            results.push({
                success: result.success,
                duration: duration,
                statusCode: result.statusCode
            });
            
            // 每100次输出一次进度
            if ((i + 1) % 100 === 0) {
                console.log(`代理访问进度: ${i + 1}/${count}`);
            }
        } catch (error) {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            results.push({
                success: false,
                duration: duration,
                error: error.message
            });
        }
    }
    
    return results;
}

/**
 * 发送代理请求
 */
function makeProxyRequest(url, proxyPort) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const options = {
            hostname: 'localhost',
            port: proxyPort,
            path: url,
            method: 'GET',
            headers: {
                'Host': parsedUrl.hostname,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    success: true,
                    statusCode: res.statusCode,
                    data: data
                });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.end();
    });
}

/**
 * 分析测试结果
 */
function analyzeResults(results) {
    const successfulRequests = results.filter(r => r.success);
    const failedRequests = results.filter(r => !r.success);
    
    if (successfulRequests.length === 0) {
        return {
            total: results.length,
            success: 0,
            failed: failedRequests.length,
            avgDuration: 0,
            minDuration: 0,
            maxDuration: 0,
            successRate: 0
        };
    }
    
    const durations = successfulRequests.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    return {
        total: results.length,
        success: successfulRequests.length,
        failed: failedRequests.length,
        avgDuration: parseFloat(avgDuration.toFixed(2)),
        minDuration: parseFloat(minDuration.toFixed(2)),
        maxDuration: parseFloat(maxDuration.toFixed(2)),
        successRate: parseFloat(((successfulRequests.length / results.length) * 100).toFixed(2))
    };
}

/**
 * 生成性能报告
 */
function generateReport(directResults, proxyResults) {
    const directAnalysis = analyzeResults(directResults);
    const proxyAnalysis = analyzeResults(proxyResults);
    
    const report = {
        timestamp: new Date().toISOString(),
        testUrl: TEST_CONFIG.url,
        testCount: TEST_CONFIG.count,
        direct: directAnalysis,
        proxy: proxyAnalysis,
        comparison: {
            durationDiff: parseFloat((proxyAnalysis.avgDuration - directAnalysis.avgDuration).toFixed(2)),
            durationDiffPercent: directAnalysis.avgDuration > 0 ? 
                parseFloat(((proxyAnalysis.avgDuration - directAnalysis.avgDuration) / directAnalysis.avgDuration * 100).toFixed(2)) : 0,
            successRateDiff: parseFloat((proxyAnalysis.successRate - directAnalysis.successRate).toFixed(2))
        }
    };
    
    return report;
}

/**
 * 打印报告
 */
function printReport(report) {
    console.log('\n=== 百度访问性能对比测试报告 ===\n');
    
    console.log(`测试时间: ${report.timestamp}`);
    console.log(`测试URL: ${report.testUrl}`);
    console.log(`测试次数: ${report.testCount}\n`);
    
    console.log('1. 直接访问性能:');
    console.log(`   成功次数: ${report.direct.success}/${report.direct.total}`);
    console.log(`   成功率: ${report.direct.successRate}%`);
    console.log(`   平均耗时: ${report.direct.avgDuration}ms`);
    console.log(`   最小耗时: ${report.direct.minDuration}ms`);
    console.log(`   最大耗时: ${report.direct.maxDuration}ms\n`);
    
    console.log('2. 代理访问性能:');
    console.log(`   成功次数: ${report.proxy.success}/${report.proxy.total}`);
    console.log(`   成功率: ${report.proxy.successRate}%`);
    console.log(`   平均耗时: ${report.proxy.avgDuration}ms`);
    console.log(`   最小耗时: ${report.proxy.minDuration}ms`);
    console.log(`   最大耗时: ${report.proxy.maxDuration}ms\n`);
    
    console.log('3. 性能对比分析:');
    console.log(`   耗时差异: ${report.comparison.durationDiff}ms`);
    console.log(`   耗时差异百分比: ${report.comparison.durationDiffPercent}%`);
    console.log(`   成功率差异: ${report.comparison.successRateDiff}%\n`);
    
    // 性能优化建议
    console.log('4. 性能分析:');
    if (report.comparison.durationDiffPercent > 10) {
        console.log('   - 代理访问相比直接访问性能下降超过10%，存在明显性能损耗');
    } else if (report.comparison.durationDiffPercent > 5) {
        console.log('   - 代理访问相比直接访问性能下降5-10%，存在一定性能损耗');
    } else {
        console.log('   - 代理访问性能损耗在可接受范围内');
    }
    
    if (report.direct.successRate < 95 || report.proxy.successRate < 95) {
        console.log('   - 存在请求失败情况，建议检查网络连接和服务器稳定性');
    }
    
    console.log('\n=== 测试报告结束 ===\n');
}

/**
 * 运行性能测试
 */
async function runPerformanceTest() {
    try {
        console.log('开始百度访问性能对比测试\n');
        
        // 1. 直接访问测试
        const directResults = await directAccess(TEST_CONFIG.url, TEST_CONFIG.count);
        
        // 等待一段时间避免服务器限制
        console.log('\n等待5秒后进行代理测试...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 2. 代理访问测试
        const proxyResults = await proxyAccess(TEST_CONFIG.url, TEST_CONFIG.count, TEST_CONFIG.proxy.port);
        
        // 生成并打印报告
        const report = generateReport(directResults, proxyResults);
        printReport(report);
        
    } catch (error) {
        console.error(`测试执行失败: ${error.message}`);
        console.error(error.stack);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runPerformanceTest().catch(console.error);
}

module.exports = {
    directAccess,
    proxyAccess,
    analyzeResults,
    generateReport,
    printReport,
    runPerformanceTest
};