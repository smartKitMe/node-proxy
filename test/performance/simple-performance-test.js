/**
 * 简单的性能测试脚本
 * 测试NodeMITMProxy的基本性能
 */

const { NodeMITMProxy } = require('../../src/index');
const http = require('http');
const { performance } = require('perf_hooks');

// 测试配置
const TEST_CONFIG = {
    proxyPort: 8080,
    testUrl: 'http://httpbin.org/get',
    requestCount: 100
};

/**
 * 直接访问测试URL
 */
function directAccess(url) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        
        const req = http.get(url, (res) => {
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
                success: false,
                duration: endTime - startTime,
                error: error.message
            });
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            const endTime = performance.now();
            reject({
                success: false,
                duration: endTime - startTime,
                error: 'timeout'
            });
        });
    });
}

/**
 * 通过代理访问测试URL
 */
function proxyAccess(url, proxyPort) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const startTime = performance.now();
        
        const options = {
            hostname: 'localhost',
            port: proxyPort,
            path: url,
            method: 'GET',
            headers: {
                'Host': parsedUrl.hostname
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
                success: false,
                duration: endTime - startTime,
                error: error.message
            });
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            const endTime = performance.now();
            reject({
                success: false,
                duration: endTime - startTime,
                error: 'timeout'
            });
        });
        
        req.end();
    });
}

/**
 * 启动代理服务器
 */
async function startProxy() {
    console.log('启动代理服务器...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: TEST_CONFIG.proxyPort,
            host: 'localhost'
        },
        logger: {
            level: 'error' // 减少日志输出
        }
    });
    
    await proxy.initialize();
    await proxy.start(TEST_CONFIG.proxyPort, 'localhost');
    
    console.log('代理服务器已启动');
    return proxy;
}

/**
 * 运行性能测试
 */
async function runPerformanceTest() {
    console.log('开始性能测试...\n');
    
    let proxy;
    
    try {
        // 启动代理服务器
        proxy = await startProxy();
        
        // 等待服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 测试直接访问
        console.log(`测试直接访问 ${TEST_CONFIG.testUrl} (${TEST_CONFIG.requestCount}次)`);
        const directResults = [];
        
        for (let i = 0; i < TEST_CONFIG.requestCount; i++) {
            try {
                const result = await directAccess(TEST_CONFIG.testUrl);
                directResults.push(result);
                
                if ((i + 1) % 20 === 0) {
                    console.log(`直接访问进度: ${i + 1}/${TEST_CONFIG.requestCount}`);
                }
            } catch (error) {
                directResults.push(error);
            }
        }
        
        // 等待一段时间
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 测试代理访问
        console.log(`\n测试代理访问 ${TEST_CONFIG.testUrl} (${TEST_CONFIG.requestCount}次)`);
        const proxyResults = [];
        
        for (let i = 0; i < TEST_CONFIG.requestCount; i++) {
            try {
                const result = await proxyAccess(TEST_CONFIG.testUrl, TEST_CONFIG.proxyPort);
                proxyResults.push(result);
                
                if ((i + 1) % 20 === 0) {
                    console.log(`代理访问进度: ${i + 1}/${TEST_CONFIG.requestCount}`);
                }
            } catch (error) {
                proxyResults.push(error);
            }
        }
        
        // 分析结果
        console.log('\n=== 测试结果分析 ===');
        
        // 直接访问统计
        const directSuccess = directResults.filter(r => r.success);
        const directAvgDuration = directSuccess.reduce((sum, r) => sum + r.duration, 0) / directSuccess.length;
        
        console.log(`\n直接访问:`);
        console.log(`  成功次数: ${directSuccess.length}/${TEST_CONFIG.requestCount}`);
        console.log(`  平均耗时: ${directAvgDuration.toFixed(2)}ms`);
        
        // 代理访问统计
        const proxySuccess = proxyResults.filter(r => r.success);
        const proxyAvgDuration = proxySuccess.reduce((sum, r) => sum + r.duration, 0) / proxySuccess.length;
        
        console.log(`\n代理访问:`);
        console.log(`  成功次数: ${proxySuccess.length}/${TEST_CONFIG.requestCount}`);
        console.log(`  平均耗时: ${proxyAvgDuration.toFixed(2)}ms`);
        
        // 性能差异
        const diff = proxyAvgDuration - directAvgDuration;
        const diffPercent = (diff / directAvgDuration) * 100;
        
        console.log(`\n性能差异:`);
        console.log(`  耗时差异: ${diff.toFixed(2)}ms`);
        console.log(`  差异百分比: ${diffPercent.toFixed(2)}%`);
        
        if (diffPercent > 10) {
            console.log('  结论: 代理访问性能下降超过10%，存在明显性能损耗');
        } else if (diffPercent > 5) {
            console.log('  结论: 代理访问性能下降5-10%，存在一定性能损耗');
        } else {
            console.log('  结论: 代理访问性能损耗在可接受范围内');
        }
        
    } catch (error) {
        console.error('测试过程中发生错误:', error.message);
    } finally {
        // 关闭代理服务器
        if (proxy) {
            try {
                await proxy.stop();
                console.log('\n代理服务器已关闭');
            } catch (error) {
                console.error('关闭代理服务器时发生错误:', error.message);
            }
        }
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runPerformanceTest().catch(console.error);
}

module.exports = {
    directAccess,
    proxyAccess,
    startProxy,
    runPerformanceTest
};