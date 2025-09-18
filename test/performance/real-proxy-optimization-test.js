/**
 * 实际代理服务器性能优化测试
 * 使用真实的代理服务器测试优化效果
 */

const { NodeMITMProxy } = require('../../src/index');
const http = require('http');
const { performance } = require('perf_hooks');

// 测试配置
const TEST_CONFIG = {
    targetUrl: 'http://httpbin.org/get',
    testCount: 50,
    concurrent: 5,
    timeout: 10000
};

/**
 * 创建优化前配置的代理服务器
 */
async function createOriginalProxy() {
    console.log('创建优化前配置的代理服务器...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        logger: {
            level: 'error' // 减少日志输出
        },
        engines: {
            maxSockets: 256,
            maxFreeSockets: 256,
            enableStreaming: false
        }
    });
    
    await proxy.initialize();
    await proxy.start(8080, 'localhost');
    
    console.log('优化前代理服务器已启动');
    return proxy;
}

/**
 * 创建优化后配置的代理服务器
 */
async function createOptimizedProxy() {
    console.log('创建优化后配置的代理服务器...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8081,
            host: 'localhost'
        },
        logger: {
            level: 'error' // 减少日志输出
        },
        engines: {
            maxSockets: 1024,
            maxFreeSockets: 512,
            enableStreaming: true,
            maxBodySize: 10 * 1024 * 1024, // 10MB
            enableShortCircuit: true
        }
    });
    
    await proxy.initialize();
    await proxy.start(8081, 'localhost');
    
    console.log('优化后代理服务器已启动');
    return proxy;
}

/**
 * 通过代理发送请求
 */
function makeProxyRequest(url, proxyPort) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        
        const parsedUrl = new URL(url);
        const options = {
            hostname: 'localhost',
            port: proxyPort,
            path: url,
            method: 'GET',
            headers: {
                'Host': parsedUrl.hostname,
                'User-Agent': 'NodeMITMProxy-Performance-Test/1.0'
            }
        };
        
        const req = http.request(options, (res) => {
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
 * 执行代理性能测试
 */
async function performProxyTest(proxyPort, testName) {
    console.log(`开始${testName}测试...`);
    
    const results = [];
    
    for (let i = 0; i < TEST_CONFIG.testCount; i += TEST_CONFIG.concurrent) {
        const batch = Math.min(TEST_CONFIG.concurrent, TEST_CONFIG.testCount - i);
        const batchPromises = [];
        
        for (let j = 0; j < batch; j++) {
            batchPromises.push(makeProxyRequest(TEST_CONFIG.targetUrl, proxyPort));
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
        
        // 批次间短暂延迟
        if (i + batch < TEST_CONFIG.testCount) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * 分析测试结果
 */
function analyzeResults(results, version) {
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
            throughput: 0
        };
    }
    
    const durations = successfulRequests.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const totalTime = durations.reduce((a, b) => a + b, 0);
    const throughput = totalTime > 0 ? successfulRequests.length / (totalTime / 1000) : 0;
    
    return {
        version,
        total: results.length,
        success: successfulRequests.length,
        failed: failedRequests.length,
        avgDuration: parseFloat(avgDuration.toFixed(2)),
        minDuration: parseFloat(minDuration.toFixed(2)),
        maxDuration: parseFloat(maxDuration.toFixed(2)),
        successRate: parseFloat(((successfulRequests.length / results.length) * 100).toFixed(2)),
        throughput: parseFloat(throughput.toFixed(2))
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
            throughputImprovement: parseFloat((optimizedResults.throughput - originalResults.throughput).toFixed(2))
        }
    };
    
    return report;
}

/**
 * 打印对比报告
 */
function printComparisonReport(report) {
    console.log('\n=== 实际代理服务器性能优化对比测试报告 ===\n');
    
    console.log(`测试时间: ${report.timestamp}`);
    console.log(`测试URL: ${report.testConfig.targetUrl}`);
    console.log(`测试次数: ${report.testConfig.testCount}`);
    console.log(`并发请求数: ${report.testConfig.concurrent}\n`);
    
    console.log('1. 优化前代理性能:');
    console.log(`   成功次数: ${report.original.success}/${report.original.total}`);
    console.log(`   成功率: ${report.original.successRate}%`);
    console.log(`   平均响应时间: ${report.original.avgDuration}ms`);
    console.log(`   最小响应时间: ${report.original.minDuration}ms`);
    console.log(`   最大响应时间: ${report.original.maxDuration}ms`);
    console.log(`   吞吐量: ${report.original.throughput} req/s\n`);
    
    console.log('2. 优化后代理性能:');
    console.log(`   成功次数: ${report.optimized.success}/${report.optimized.total}`);
    console.log(`   成功率: ${report.optimized.successRate}%`);
    console.log(`   平均响应时间: ${report.optimized.avgDuration}ms`);
    console.log(`   最小响应时间: ${report.optimized.minDuration}ms`);
    console.log(`   最大响应时间: ${report.optimized.maxDuration}ms`);
    console.log(`   吞吐量: ${report.optimized.throughput} req/s\n`);
    
    console.log('3. 性能对比分析:');
    console.log(`   响应时间改善: ${report.comparison.durationImprovement}ms`);
    console.log(`   响应时间改善百分比: ${report.comparison.durationImprovementPercent}%`);
    console.log(`   成功率改善: ${report.comparison.successRateImprovement}%`);
    console.log(`   吞吐量改善: ${report.comparison.throughputImprovement} req/s\n`);
    
    // 性能优化评估
    console.log('4. 性能优化评估:');
    if (report.comparison.durationImprovementPercent > 10) {
        console.log('   - 响应时间显著改善，性能提升明显');
    } else if (report.comparison.durationImprovementPercent > 5) {
        console.log('   - 响应时间有所改善，性能略有提升');
    } else {
        console.log('   - 响应时间基本持平');
    }
    
    if (report.comparison.throughputImprovement > 10) {
        console.log('   - 系统吞吐量大幅提升');
    } else if (report.comparison.throughputImprovement > 0) {
        console.log('   - 系统吞吐量有所提升');
    }
    
    if (report.comparison.successRateImprovement > 2) {
        console.log('   - 请求成功率显著提升，系统稳定性增强');
    }
    
    console.log('\n=== 测试报告结束 ===\n');
}

/**
 * 运行实际代理性能测试
 */
async function runRealProxyOptimizationTest() {
    let originalProxy, optimizedProxy;
    
    try {
        console.log('开始实际代理服务器性能优化对比测试\n');
        
        // 1. 启动优化前代理服务器
        originalProxy = await createOriginalProxy();
        
        // 等待服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 2. 测试优化前代理性能
        const originalResults = await performProxyTest(8080, '优化前代理');
        const originalAnalysis = analyzeResults(originalResults, '优化前');
        
        // 关闭优化前代理
        await originalProxy.stop();
        console.log('优化前代理服务器已关闭\n');
        
        // 等待一段时间
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 3. 启动优化后代理服务器
        optimizedProxy = await createOptimizedProxy();
        
        // 等待服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 4. 测试优化后代理性能
        const optimizedResults = await performProxyTest(8081, '优化后代理');
        const optimizedAnalysis = analyzeResults(optimizedResults, '优化后');
        
        // 关闭优化后代理
        await optimizedProxy.stop();
        console.log('优化后代理服务器已关闭\n');
        
        // 5. 生成并打印对比报告
        const report = generateComparisonReport(originalAnalysis, optimizedAnalysis);
        printComparisonReport(report);
        
        console.log('实际代理服务器性能优化对比测试完成!');
        
    } catch (error) {
        console.error(`测试执行失败: ${error.message}`);
        console.error(error.stack);
    } finally {
        // 确保代理服务器被关闭
        if (originalProxy) {
            try {
                await originalProxy.stop();
            } catch (error) {
                // 忽略错误
            }
        }
        
        if (optimizedProxy) {
            try {
                await optimizedProxy.stop();
            } catch (error) {
                // 忽略错误
            }
        }
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runRealProxyOptimizationTest().catch(console.error);
}

module.exports = { runRealProxyOptimizationTest };