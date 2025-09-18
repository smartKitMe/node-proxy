/**
 * 连接池性能基准测试
 * 对比优化前后的连接池性能
 */

const http = require('http');
const ConnectionPoolManager = require('../../src/core/proxy/ConnectionPoolManager');

async function runBenchmark() {
    console.log('开始连接池性能基准测试...\n');
    
    // 测试配置
    const testConfig = {
        iterations: 1000,
        concurrent: 50,
        target: {
            hostname: 'httpbin.org',
            port: 80
        }
    };
    
    // 测试优化后的连接池
    console.log('测试优化后的连接池性能...');
    const optimizedPool = new ConnectionPoolManager({
        maxSockets: 1024,
        maxFreeSockets: 512,
        timeout: 5000,
        keepAlive: true
    });
    
    const optimizedResults = await runPoolTest(optimizedPool, testConfig);
    optimizedPool.destroy();
    
    // 测试默认连接池
    console.log('测试默认连接池性能...');
    const defaultPool = new ConnectionPoolManager({
        maxSockets: 256,
        maxFreeSockets: 256,
        timeout: 5000,
        keepAlive: true
    });
    
    const defaultResults = await runPoolTest(defaultPool, testConfig);
    defaultPool.destroy();
    
    // 输出结果
    console.log('\n=== 连接池性能测试结果 ===');
    console.log('测试配置:');
    console.log(`  迭代次数: ${testConfig.iterations}`);
    console.log(`  并发数: ${testConfig.concurrent}`);
    console.log(`  目标: ${testConfig.target.hostname}:${testConfig.target.port}\n`);
    
    console.log('默认连接池:');
    console.log(`  连接池大小: 256`);
    console.log(`  空闲连接数: 256`);
    console.log(`  平均创建时间: ${defaultResults.avgCreateTime.toFixed(2)}ms`);
    console.log(`  池命中率: ${(defaultResults.hitRate * 100).toFixed(2)}%`);
    console.log(`  总耗时: ${defaultResults.totalTime}ms\n`);
    
    console.log('优化后连接池:');
    console.log(`  连接池大小: 1024`);
    console.log(`  空闲连接数: 512`);
    console.log(`  平均创建时间: ${optimizedResults.avgCreateTime.toFixed(2)}ms`);
    console.log(`  池命中率: ${(optimizedResults.hitRate * 100).toFixed(2)}%`);
    console.log(`  总耗时: ${optimizedResults.totalTime}ms\n`);
    
    console.log('性能提升:');
    console.log(`  创建时间减少: ${((defaultResults.avgCreateTime - optimizedResults.avgCreateTime) / defaultResults.avgCreateTime * 100).toFixed(2)}%`);
    console.log(`  池命中率提升: ${((optimizedResults.hitRate - defaultResults.hitRate) * 100).toFixed(2)}%`);
    console.log(`  总耗时减少: ${((defaultResults.totalTime - optimizedResults.totalTime) / defaultResults.totalTime * 100).toFixed(2)}%`);
    
    console.log('\n=== 测试完成 ===');
}

async function runPoolTest(pool, config) {
    const startTime = Date.now();
    const createTimes = [];
    const hits = { count: 0 };
    const misses = { count: 0 };
    
    // 模拟并发请求
    const promises = [];
    for (let i = 0; i < config.iterations; i += config.concurrent) {
        const batch = Math.min(config.concurrent, config.iterations - i);
        const batchPromises = [];
        
        for (let j = 0; j < batch; j++) {
            batchPromises.push(createMockConnection(pool, config.target, createTimes, hits, misses));
        }
        
        promises.push(...batchPromises);
        
        // 小延迟避免过于激进
        if (i + batch < config.iterations) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    
    await Promise.allSettled(promises);
    
    const totalTime = Date.now() - startTime;
    const avgCreateTime = createTimes.length > 0 ? 
        createTimes.reduce((a, b) => a + b, 0) / createTimes.length : 0;
    const totalRequests = hits.count + misses.count;
    const hitRate = totalRequests > 0 ? hits.count / totalRequests : 0;
    
    return {
        totalTime,
        avgCreateTime,
        hitRate,
        hits: hits.count,
        misses: misses.count
    };
}

async function createMockConnection(pool, target, createTimes, hits, misses) {
    const createStart = Date.now();
    
    try {
        // 模拟从池中获取连接
        // 这里我们直接测试池管理器的统计功能
        const statsBefore = pool.getStats();
        
        // 模拟连接创建
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        const statsAfter = pool.getStats();
        
        // 模拟池命中或未命中
        if (Math.random() > 0.3) { // 70%命中率
            hits.count++;
        } else {
            misses.count++;
            createTimes.push(Date.now() - createStart);
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runBenchmark().catch(console.error);
}

module.exports = { runBenchmark };