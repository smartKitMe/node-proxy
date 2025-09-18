const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const EventEmitter = require('events');

/**
 * HTTP百度性能测试
 * 对比三种访问方式的性能：
 * 1. 直接访问 (http://www.baidu.com)
 * 2. 通过HTTP代理访问
 * 3. 通过修改请求的HTTP代理访问
 */

// 测试配置
const TEST_CONFIG = {
    url: 'http://www.baidu.com',
    count: 500,
    concurrent: 10, // 并发请求数
    proxy: {
        host: 'localhost',
        port: 8080
    },
    modifyProxy: {
        host: 'localhost',
        port: 8081
    },
    timeout: 10000 // 请求超时时间
};

/**
 * 直接访问百度
 */
async function directAccess(url, count, concurrent = 1) {
    console.log(`开始直接访问测试: ${url}, 次数: ${count}, 并发: ${concurrent}`);
    
    const results = [];
    const emitter = new EventEmitter();
    
    // 进度报告
    let completed = 0;
    emitter.on('complete', () => {
        completed++;
        if (completed % 100 === 0 || completed === count) {
            console.log(`直接访问进度: ${completed}/${count}`);
        }
    });
    
    // 分批执行请求
    for (let i = 0; i < count; i += concurrent) {
        const batch = Math.min(concurrent, count - i);
        const batchPromises = [];
        
        for (let j = 0; j < batch; j++) {
            batchPromises.push(makeDirectRequestWithTiming(url, emitter));
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
        
        // 批次间短暂延迟，避免对服务器造成过大压力
        if (i + batch < count) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * 带计时的直接请求
 */
function makeDirectRequestWithTiming(url, emitter) {
    const startTime = performance.now();
    
    return makeDirectRequest(url)
        .then(result => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            emitter.emit('complete');
            
            return {
                success: result.success,
                duration: duration,
                statusCode: result.statusCode
            };
        })
        .catch(error => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            emitter.emit('complete');
            
            throw {
                duration: duration,
                message: error.message
            };
        });
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
        
        req.setTimeout(TEST_CONFIG.timeout, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.end();
    });
}

/**
 * 通过代理访问百度
 */
async function proxyAccess(url, count, proxyPort, concurrent = 1) {
    console.log(`开始代理访问测试: ${url}, 次数: ${count}, 代理端口: ${proxyPort}, 并发: ${concurrent}`);
    
    const results = [];
    const emitter = new EventEmitter();
    
    // 进度报告
    let completed = 0;
    emitter.on('complete', () => {
        completed++;
        if (completed % 100 === 0 || completed === count) {
            console.log(`代理访问进度: ${completed}/${count}`);
        }
    });
    
    // 分批执行请求
    for (let i = 0; i < count; i += concurrent) {
        const batch = Math.min(concurrent, count - i);
        const batchPromises = [];
        
        for (let j = 0; j < batch; j++) {
            batchPromises.push(makeProxyRequestWithTiming(url, proxyPort, emitter));
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
        
        // 批次间短暂延迟，避免对服务器和代理造成过大压力
        if (i + batch < count) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * 带计时的代理请求
 */
function makeProxyRequestWithTiming(url, proxyPort, emitter) {
    const startTime = performance.now();
    
    return makeProxyRequest(url, proxyPort)
        .then(result => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            emitter.emit('complete');
            
            return {
                success: result.success,
                duration: duration,
                statusCode: result.statusCode
            };
        })
        .catch(error => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            emitter.emit('complete');
            
            throw {
                duration: duration,
                message: error.message
            };
        });
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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
        
        req.setTimeout(TEST_CONFIG.timeout, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.end();
    });
}

/**
 * 通过修改请求的代理访问百度
 */
async function modifyProxyAccess(url, count, proxyPort, concurrent = 1) {
    console.log(`开始修改请求代理访问测试: ${url}, 次数: ${count}, 代理端口: ${proxyPort}, 并发: ${concurrent}`);
    
    const results = [];
    const emitter = new EventEmitter();
    
    // 进度报告
    let completed = 0;
    emitter.on('complete', () => {
        completed++;
        if (completed % 100 === 0 || completed === count) {
            console.log(`修改请求代理访问进度: ${completed}/${count}`);
        }
    });
    
    // 分批执行请求
    for (let i = 0; i < count; i += concurrent) {
        const batch = Math.min(concurrent, count - i);
        const batchPromises = [];
        
        for (let j = 0; j < batch; j++) {
            batchPromises.push(makeModifyProxyRequestWithTiming(url, proxyPort, emitter));
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
        
        // 批次间短暂延迟，避免对服务器和代理造成过大压力
        if (i + batch < count) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return results;
}

/**
 * 带计时的修改请求代理请求
 */
function makeModifyProxyRequestWithTiming(url, proxyPort, emitter) {
    const startTime = performance.now();
    
    return makeModifyProxyRequest(url, proxyPort)
        .then(result => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            emitter.emit('complete');
            
            return {
                success: result.success,
                duration: duration,
                statusCode: result.statusCode
            };
        })
        .catch(error => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            emitter.emit('complete');
            
            throw {
                duration: duration,
                message: error.message
            };
        });
}

/**
 * 发送修改请求的代理请求
 */
function makeModifyProxyRequest(url, proxyPort) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        
        const options = {
            hostname: 'localhost',
            port: proxyPort,
            path: url,
            method: 'GET',
            headers: {
                'Host': parsedUrl.hostname,
                'User-Agent': 'Modified-User-Agent/1.0',
                'X-Proxy-Modified': 'true'
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
        
        req.setTimeout(TEST_CONFIG.timeout, () => {
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
            medianDuration: 0,
            successRate: 0,
            throughput: 0 // 每秒处理请求数
        };
    }
    
    const durations = successfulRequests.map(r => r.duration);
    
    // 计算平均值
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    
    // 计算最小值和最大值
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    // 计算中位数
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const medianDuration = sortedDurations.length % 2 === 0
        ? (sortedDurations[sortedDurations.length / 2 - 1] + sortedDurations[sortedDurations.length / 2]) / 2
        : sortedDurations[Math.floor(sortedDurations.length / 2)];
    
    // 计算吞吐量 (每秒处理请求数)
    const totalTime = durations.reduce((a, b) => a + b, 0);
    const throughput = totalTime > 0 ? successfulRequests.length / (totalTime / 1000) : 0;
    
    return {
        total: results.length,
        success: successfulRequests.length,
        failed: failedRequests.length,
        avgDuration: parseFloat(avgDuration.toFixed(2)),
        minDuration: parseFloat(minDuration.toFixed(2)),
        maxDuration: parseFloat(maxDuration.toFixed(2)),
        medianDuration: parseFloat(medianDuration.toFixed(2)),
        successRate: parseFloat(((successfulRequests.length / results.length) * 100).toFixed(2)),
        throughput: parseFloat(throughput.toFixed(2))
    };
}

/**
 * 生成性能报告
 */
function generateReport(directResults, proxyResults, modifyProxyResults) {
    const directAnalysis = analyzeResults(directResults);
    const proxyAnalysis = analyzeResults(proxyResults);
    const modifyProxyAnalysis = analyzeResults(modifyProxyResults);
    
    const report = {
        timestamp: new Date().toISOString(),
        testUrl: TEST_CONFIG.url,
        testCount: TEST_CONFIG.count,
        concurrent: TEST_CONFIG.concurrent,
        direct: directAnalysis,
        proxy: proxyAnalysis,
        modifyProxy: modifyProxyAnalysis,
        comparison: {
            // 直接访问 vs HTTP代理
            directVsProxy: {
                durationDiff: parseFloat((proxyAnalysis.avgDuration - directAnalysis.avgDuration).toFixed(2)),
                durationDiffPercent: directAnalysis.avgDuration > 0 ? 
                    parseFloat(((proxyAnalysis.avgDuration - directAnalysis.avgDuration) / directAnalysis.avgDuration * 100).toFixed(2)) : 0,
                successRateDiff: parseFloat((proxyAnalysis.successRate - directAnalysis.successRate).toFixed(2)),
                throughputDiff: parseFloat((proxyAnalysis.throughput - directAnalysis.throughput).toFixed(2))
            },
            // 直接访问 vs 修改请求代理
            directVsModifyProxy: {
                durationDiff: parseFloat((modifyProxyAnalysis.avgDuration - directAnalysis.avgDuration).toFixed(2)),
                durationDiffPercent: directAnalysis.avgDuration > 0 ? 
                    parseFloat(((modifyProxyAnalysis.avgDuration - directAnalysis.avgDuration) / directAnalysis.avgDuration * 100).toFixed(2)) : 0,
                successRateDiff: parseFloat((modifyProxyAnalysis.successRate - directAnalysis.successRate).toFixed(2)),
                throughputDiff: parseFloat((modifyProxyAnalysis.throughput - directAnalysis.throughput).toFixed(2))
            },
            // HTTP代理 vs 修改请求代理
            proxyVsModifyProxy: {
                durationDiff: parseFloat((modifyProxyAnalysis.avgDuration - proxyAnalysis.avgDuration).toFixed(2)),
                durationDiffPercent: proxyAnalysis.avgDuration > 0 ? 
                    parseFloat(((modifyProxyAnalysis.avgDuration - proxyAnalysis.avgDuration) / proxyAnalysis.avgDuration * 100).toFixed(2)) : 0,
                successRateDiff: parseFloat((modifyProxyAnalysis.successRate - proxyAnalysis.successRate).toFixed(2)),
                throughputDiff: parseFloat((modifyProxyAnalysis.throughput - proxyAnalysis.throughput).toFixed(2))
            }
        }
    };
    
    return report;
}

/**
 * 打印报告
 */
function printReport(report) {
    console.log('\n=== 百度HTTP访问性能对比测试报告 ===\n');
    
    console.log(`测试时间: ${report.timestamp}`);
    console.log(`测试URL: ${report.testUrl}`);
    console.log(`测试次数: ${report.testCount}`);
    console.log(`并发请求数: ${report.concurrent}\n`);
    
    console.log('1. 直接访问性能:');
    console.log(`   成功次数: ${report.direct.success}/${report.direct.total}`);
    console.log(`   成功率: ${report.direct.successRate}%`);
    console.log(`   平均耗时: ${report.direct.avgDuration}ms`);
    console.log(`   中位数耗时: ${report.direct.medianDuration}ms`);
    console.log(`   最小耗时: ${report.direct.minDuration}ms`);
    console.log(`   最大耗时: ${report.direct.maxDuration}ms`);
    console.log(`   吞吐量: ${report.direct.throughput} req/s\n`);
    
    console.log('2. HTTP代理访问性能:');
    console.log(`   成功次数: ${report.proxy.success}/${report.proxy.total}`);
    console.log(`   成功率: ${report.proxy.successRate}%`);
    console.log(`   平均耗时: ${report.proxy.avgDuration}ms`);
    console.log(`   中位数耗时: ${report.proxy.medianDuration}ms`);
    console.log(`   最小耗时: ${report.proxy.minDuration}ms`);
    console.log(`   最大耗时: ${report.proxy.maxDuration}ms`);
    console.log(`   吞吐量: ${report.proxy.throughput} req/s\n`);
    
    console.log('3. 修改请求代理访问性能:');
    console.log(`   成功次数: ${report.modifyProxy.success}/${report.modifyProxy.total}`);
    console.log(`   成功率: ${report.modifyProxy.successRate}%`);
    console.log(`   平均耗时: ${report.modifyProxy.avgDuration}ms`);
    console.log(`   中位数耗时: ${report.modifyProxy.medianDuration}ms`);
    console.log(`   最小耗时: ${report.modifyProxy.minDuration}ms`);
    console.log(`   最大耗时: ${report.modifyProxy.maxDuration}ms`);
    console.log(`   吞吐量: ${report.modifyProxy.throughput} req/s\n`);
    
    console.log('4. 性能对比分析:');
    console.log('   直接访问 vs HTTP代理:');
    console.log(`     耗时差异: ${report.comparison.directVsProxy.durationDiff}ms`);
    console.log(`     耗时差异百分比: ${report.comparison.directVsProxy.durationDiffPercent}%`);
    console.log(`     成功率差异: ${report.comparison.directVsProxy.successRateDiff}%`);
    console.log(`     吞吐量差异: ${report.comparison.directVsProxy.throughputDiff} req/s\n`);
    
    console.log('   直接访问 vs 修改请求代理:');
    console.log(`     耗时差异: ${report.comparison.directVsModifyProxy.durationDiff}ms`);
    console.log(`     耗时差异百分比: ${report.comparison.directVsModifyProxy.durationDiffPercent}%`);
    console.log(`     成功率差异: ${report.comparison.directVsModifyProxy.successRateDiff}%`);
    console.log(`     吞吐量差异: ${report.comparison.directVsModifyProxy.throughputDiff} req/s\n`);
    
    console.log('   HTTP代理 vs 修改请求代理:');
    console.log(`     耗时差异: ${report.comparison.proxyVsModifyProxy.durationDiff}ms`);
    console.log(`     耗时差异百分比: ${report.comparison.proxyVsModifyProxy.durationDiffPercent}%`);
    console.log(`     成功率差异: ${report.comparison.proxyVsModifyProxy.successRateDiff}%`);
    console.log(`     吞吐量差异: ${report.comparison.proxyVsModifyProxy.throughputDiff} req/s\n`);
    
    // 性能优化建议
    console.log('5. 性能分析:');
    
    if (report.comparison.directVsProxy.durationDiffPercent > 10) {
        console.log('   - HTTP代理访问相比直接访问性能下降超过10%，存在明显性能损耗');
    } else if (report.comparison.directVsProxy.durationDiffPercent > 5) {
        console.log('   - HTTP代理访问相比直接访问性能下降5-10%，存在一定性能损耗');
    } else {
        console.log('   - HTTP代理访问性能损耗在可接受范围内');
    }
    
    if (report.comparison.directVsModifyProxy.durationDiffPercent > 15) {
        console.log('   - 修改请求代理访问相比直接访问性能下降超过15%，拦截器处理逻辑可能需要优化');
    } else if (report.comparison.directVsModifyProxy.durationDiffPercent > 10) {
        console.log('   - 修改请求代理访问相比直接访问性能下降10-15%，拦截器处理逻辑可能存在性能问题');
    } else {
        console.log('   - 修改请求代理访问性能损耗在可接受范围内');
    }
    
    if (report.direct.successRate < 95 || report.proxy.successRate < 95 || report.modifyProxy.successRate < 95) {
        console.log('   - 存在请求失败情况，建议检查网络连接和服务器稳定性');
    }
    
    console.log('\n=== 测试报告结束 ===\n');
}

/**
 * 运行性能测试
 */
async function runPerformanceTest() {
    try {
        console.log('开始百度HTTP访问性能对比测试\n');
        
        // 1. 直接访问测试
        console.log('--- 开始直接访问测试 ---');
        const directResults = await directAccess(TEST_CONFIG.url, TEST_CONFIG.count, TEST_CONFIG.concurrent);
        console.log('--- 直接访问测试完成 ---\n');
        
        // 等待一段时间避免服务器限制
        console.log('等待5秒后进行HTTP代理测试...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 2. HTTP代理访问测试
        console.log('--- 开始HTTP代理访问测试 ---');
        const proxyResults = await proxyAccess(TEST_CONFIG.url, TEST_CONFIG.count, TEST_CONFIG.proxy.port, TEST_CONFIG.concurrent);
        console.log('--- HTTP代理访问测试完成 ---\n');
        
        // 等待一段时间避免服务器限制
        console.log('等待5秒后进行修改请求代理测试...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 3. 修改请求代理访问测试
        console.log('--- 开始修改请求代理访问测试 ---');
        const modifyProxyResults = await modifyProxyAccess(TEST_CONFIG.url, TEST_CONFIG.count, TEST_CONFIG.modifyProxy.port, TEST_CONFIG.concurrent);
        console.log('--- 修改请求代理访问测试完成 ---\n');
        
        // 生成并打印报告
        const report = generateReport(directResults, proxyResults, modifyProxyResults);
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
    modifyProxyAccess,
    analyzeResults,
    generateReport,
    printReport,
    runPerformanceTest
};