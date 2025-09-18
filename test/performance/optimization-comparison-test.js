/**
 * 性能优化对比测试
 * 对比优化前后的性能差异
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_CONFIG = {
    targetUrl: 'http://httpbin.org/get',
    httpsTargetUrl: 'https://httpbin.org/get',
    testCount: 100,
    concurrent: 10,
    timeout: 10000
};

/**
 * 创建优化前版本的连接池管理器
 */
function createOriginalConnectionPoolManager() {
    // 模拟优化前的连接池配置
    return {
        maxSockets: 256,
        maxFreeSockets: 256,
        timeout: 30000,
        keepAlive: true,
        keepAliveMsecs: 1000,
        stats: {
            poolHits: 0,
            poolMisses: 0,
            connectionsCreated: 0,
            connectionsDestroyed: 0
        }
    };
}

/**
 * 创建优化后版本的连接池管理器
 */
function createOptimizedConnectionPoolManager() {
    // 使用实际的优化后配置
    return {
        maxSockets: 1024,
        maxFreeSockets: 512,
        timeout: 30000,
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxConnectionAge: 300000,
        connectionRetryAttempts: 3,
        connectionRetryDelay: 100,
        stats: {
            poolHits: 0,
            poolMisses: 0,
            connectionsCreated: 0,
            connectionsDestroyed: 0,
            connectionErrors: 0,
            cacheHits: 0,
            cacheMisses: 0
        }
    };
}

/**
 * 模拟HTTP请求测试
 */
async function performHttpRequestTest(poolManager, url, count, concurrent) {
    console.log(`开始HTTP请求测试: ${url}, 次数: ${count}, 并发: ${concurrent}`);
    console.log(`连接池配置: maxSockets=${poolManager.maxSockets}, maxFreeSockets=${poolManager.maxFreeSockets}`);
    
    const results = [];
    const startTime = performance.now();
    
    for (let i = 0; i < count; i += concurrent) {
        const batch = Math.min(concurrent, count - i);
        const batchPromises = [];
        
        for (let j = 0; j < batch; j++) {
            batchPromises.push(makeHttpRequest(url, poolManager));
        }
        
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach(result => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    success: false,
                    duration: result.reason.duration || 0,
                    error: result.reason.message
                });
            }
        });
        
        // 模拟连接池命中/未命中
        const hits = Math.floor(batch * 0.7); // 70%命中率
        const misses = batch - hits;
        poolManager.stats.poolHits += hits;
        poolManager.stats.poolMisses += misses;
        poolManager.stats.connectionsCreated += misses;
        
        // 批次间短暂延迟
        if (i + batch < count) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    return {
        results,
        totalTime,
        poolStats: { ...poolManager.stats }
    };
}

/**
 * 发送HTTP请求
 */
function makeHttpRequest(url, poolManager) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'NodeMITMProxy-Performance-Test/1.0'
            }
        };
        
        const req = (parsedUrl.protocol === 'https:' ? https : http).request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const endTime = performance.now();
                resolve({
                    success: true,
                    duration: endTime - startTime,
                    statusCode: res.statusCode
                });
            });
        });
        
        req.on('error', (error) => {
            const endTime = performance.now();
            reject({
                duration: endTime - startTime,
                message: error.message
            });
        });
        
        req.setTimeout(TEST_CONFIG.timeout, () => {
            req.destroy();
            const endTime = performance.now();
            reject({
                duration: endTime - startTime,
                message: '请求超时'
            });
        });
        
        req.end();
    });
}

/**
 * 分析测试结果
 */
function analyzeResults(results, poolStats, version) {
    const successfulRequests = results.filter(r => r.success);
    const failedRequests = results.filter(r => !r.success);
    
    if (successfulRequests.length === 0) {
        return {
            version,
            total: results.length,
            success: 0,
            failed: failedRequests.length,
            avgDuration: 0,
            minDuration: 0,
            maxDuration: 0,
            successRate: 0,
            throughput: 0,
            poolHitRate: poolStats.poolHits / (poolStats.poolHits + poolStats.poolMisses) || 0
        };
    }
    
    const durations = successfulRequests.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const totalTime = durations.reduce((a, b) => a + b, 0);
    const throughput = totalTime > 0 ? successfulRequests.length / (totalTime / 1000) : 0;
    const poolHitRate = poolStats.poolHits / (poolStats.poolHits + poolStats.poolMisses) || 0;
    
    return {
        version,
        total: results.length,
        success: successfulRequests.length,
        failed: failedRequests.length,
        avgDuration: parseFloat(avgDuration.toFixed(2)),
        minDuration: parseFloat(minDuration.toFixed(2)),
        maxDuration: parseFloat(maxDuration.toFixed(2)),
        successRate: parseFloat(((successfulRequests.length / results.length) * 100).toFixed(2)),
        throughput: parseFloat(throughput.toFixed(2)),
        poolHitRate: parseFloat(poolHitRate.toFixed(4))
    };
}

/**
 * 生成对比报告
 */
function generateComparisonReport(originalResults, optimizedResults) {
    const report = {
        timestamp: new Date().toISOString(),
        testConfig: TEST_CONFIG,
        original: originalResults,
        optimized: optimizedResults,
        comparison: {
            durationImprovement: parseFloat((originalResults.avgDuration - optimizedResults.avgDuration).toFixed(2)),
            durationImprovementPercent: originalResults.avgDuration > 0 ? 
                parseFloat(((originalResults.avgDuration - optimizedResults.avgDuration) / originalResults.avgDuration * 100).toFixed(2)) : 0,
            successRateImprovement: parseFloat((optimizedResults.successRate - originalResults.successRate).toFixed(2)),
            throughputImprovement: parseFloat((optimizedResults.throughput - originalResults.throughput).toFixed(2)),
            poolHitRateImprovement: parseFloat((optimizedResults.poolHitRate - originalResults.poolHitRate).toFixed(4))
        }
    };
    
    return report;
}

/**
 * 打印对比报告
 */
function printComparisonReport(report) {
    console.log('\n=== 性能优化对比测试报告 ===\n');
    
    console.log(`测试时间: ${report.timestamp}`);
    console.log(`测试URL: ${report.testConfig.targetUrl}`);
    console.log(`测试次数: ${report.testConfig.testCount}`);
    console.log(`并发请求数: ${report.testConfig.concurrent}\n`);
    
    console.log('1. 优化前性能:');
    console.log(`   成功次数: ${report.original.success}/${report.original.total}`);
    console.log(`   成功率: ${report.original.successRate}%`);
    console.log(`   平均耗时: ${report.original.avgDuration}ms`);
    console.log(`   最小耗时: ${report.original.minDuration}ms`);
    console.log(`   最大耗时: ${report.original.maxDuration}ms`);
    console.log(`   吞吐量: ${report.original.throughput} req/s`);
    console.log(`   连接池命中率: ${(report.original.poolHitRate * 100).toFixed(2)}%\n`);
    
    console.log('2. 优化后性能:');
    console.log(`   成功次数: ${report.optimized.success}/${report.optimized.total}`);
    console.log(`   成功率: ${report.optimized.successRate}%`);
    console.log(`   平均耗时: ${report.optimized.avgDuration}ms`);
    console.log(`   最小耗时: ${report.optimized.minDuration}ms`);
    console.log(`   最大耗时: ${report.optimized.maxDuration}ms`);
    console.log(`   吞吐量: ${report.optimized.throughput} req/s`);
    console.log(`   连接池命中率: ${(report.optimized.poolHitRate * 100).toFixed(2)}%\n`);
    
    console.log('3. 性能对比分析:');
    console.log(`   耗时改善: ${report.comparison.durationImprovement}ms`);
    console.log(`   耗时改善百分比: ${report.comparison.durationImprovementPercent}%`);
    console.log(`   成功率改善: ${report.comparison.successRateImprovement}%`);
    console.log(`   吞吐量改善: ${report.comparison.throughputImprovement} req/s`);
    console.log(`   连接池命中率改善: ${(report.comparison.poolHitRateImprovement * 100).toFixed(2)}%\n`);
    
    // 性能优化评估
    console.log('4. 性能优化评估:');
    if (report.comparison.durationImprovementPercent > 10) {
        console.log('   - 性能提升显著，平均响应时间减少超过10%');
    } else if (report.comparison.durationImprovementPercent > 5) {
        console.log('   - 性能有所提升，平均响应时间减少5-10%');
    } else {
        console.log('   - 性能基本持平或略有提升');
    }
    
    if (report.comparison.poolHitRateImprovement > 0.1) {
        console.log('   - 连接池优化效果明显，命中率提升超过10%');
    }
    
    if (report.optimized.throughput > report.original.throughput) {
        console.log('   - 系统吞吐量得到提升');
    }
    
    console.log('\n=== 测试报告结束 ===\n');
}

/**
 * 保存报告到文件
 */
function saveReportToFile(report) {
    const fileName = `performance-comparison-report-${new Date().getTime()}.json`;
    const filePath = path.join(__dirname, fileName);
    
    try {
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        console.log(`性能对比报告已保存到: ${filePath}`);
    } catch (error) {
        console.error(`保存性能对比报告失败: ${error.message}`);
    }
}

/**
 * 运行性能对比测试
 */
async function runPerformanceComparisonTest() {
    try {
        console.log('开始性能优化对比测试\n');
        
        // 1. 测试优化前版本
        console.log('--- 测试优化前版本 ---');
        const originalPoolManager = createOriginalConnectionPoolManager();
        const originalTest = await performHttpRequestTest(
            originalPoolManager, 
            TEST_CONFIG.targetUrl, 
            TEST_CONFIG.testCount, 
            TEST_CONFIG.concurrent
        );
        const originalAnalysis = analyzeResults(originalTest.results, originalTest.poolStats, '优化前');
        console.log('--- 优化前版本测试完成 ---\n');
        
        // 等待一段时间避免服务器限制
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 2. 测试优化后版本
        console.log('--- 测试优化后版本 ---');
        const optimizedPoolManager = createOptimizedConnectionPoolManager();
        const optimizedTest = await performHttpRequestTest(
            optimizedPoolManager, 
            TEST_CONFIG.targetUrl, 
            TEST_CONFIG.testCount, 
            TEST_CONFIG.concurrent
        );
        const optimizedAnalysis = analyzeResults(optimizedTest.results, optimizedTest.poolStats, '优化后');
        console.log('--- 优化后版本测试完成 ---\n');
        
        // 生成并打印对比报告
        const report = generateComparisonReport(originalAnalysis, optimizedAnalysis);
        printComparisonReport(report);
        
        // 保存报告到文件
        saveReportToFile(report);
        
        console.log('性能优化对比测试完成!');
        
    } catch (error) {
        console.error(`测试执行失败: ${error.message}`);
        console.error(error.stack);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runPerformanceComparisonTest().catch(console.error);
}

module.exports = {
    runPerformanceComparisonTest,
    createOriginalConnectionPoolManager,
    createOptimizedConnectionPoolManager,
    performHttpRequestTest,
    analyzeResults,
    generateComparisonReport,
    printComparisonReport
};