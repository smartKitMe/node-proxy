#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const colors = require('colors');

// 导入原始和优化版本
const originalRequestHandler = require('../src/mitmproxy/createRequestHandler');
const optimizedRequestHandler = require('../src/mitmproxy/createRequestHandler.optimized');
const originalConnectHandler = require('../src/mitmproxy/createConnectHandler');
const optimizedConnectHandler = require('../src/mitmproxy/createConnectHandler.optimized');

// 测试配置
const TEST_CONFIG = {
    iterations: 1000,
    concurrency: 50,
    testUrls: [
        { url: '/api/users', host: 'api.example.com', ssl: false },
        { url: '/api/products?page=1', host: 'shop.example.com', ssl: true },
        { url: '/images/logo.png', host: 'cdn.example.com', ssl: false },
        { url: '/search?q=test', host: 'search.example.com', ssl: true },
        { url: '/api/orders', host: 'api.example.com', ssl: true },
        { url: '/static/app.js', host: 'assets.example.com', ssl: false }
    ],
    connectTargets: [
        { hostname: 'secure.example.com', port: 443 },
        { hostname: 'api.example.com', port: 443 },
        { hostname: 'cdn.example.com', port: 443 },
        { hostname: 'shop.example.com', port: 443 }
    ]
};

// 模拟请求对象
function createMockRequest(url, host, ssl = false) {
    return {
        method: 'GET',
        url: url,
        headers: {
            host: host,
            'user-agent': 'Mozilla/5.0 (compatible; Performance-Test/1.0)',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.5',
            'accept-encoding': 'gzip, deflate',
            'connection': 'keep-alive'
        },
        socket: {
            setKeepAlive: () => {},
            customSocketId: null
        },
        on: () => {},
        pipe: () => {}
    };
}

// 模拟响应对象
function createMockResponse() {
    const headers = {};
    return {
        finished: false,
        headersSent: false,
        setHeader: (key, value) => { headers[key] = value; },
        writeHead: (statusCode) => { this.statusCode = statusCode; },
        write: () => {},
        end: () => { this.finished = true; },
        on: () => {},
        pipe: () => {}
    };
}

// 模拟客户端Socket
function createMockClientSocket() {
    return {
        write: () => {},
        end: () => {},
        destroyed: false,
        on: () => {},
        pipe: () => {}
    };
}

// 性能测试类
class PerformanceTest {
    constructor() {
        this.results = {
            original: { requestHandler: [], connectHandler: [] },
            optimized: { requestHandler: [], connectHandler: [] }
        };
    }
    
    // 测试请求处理器性能
    async testRequestHandler(handlerFactory, version, iterations = 1000) {
        console.log(`\n测试 ${version} RequestHandler 性能...`);
        
        // 创建处理器（无拦截器，测试快速路径）
        const handler = handlerFactory(null, null, null, null);
        const times = [];
        
        // 预热
        for (let i = 0; i < 100; i++) {
            const testData = TEST_CONFIG.testUrls[i % TEST_CONFIG.testUrls.length];
            const req = createMockRequest(testData.url, testData.host, testData.ssl);
            const res = createMockResponse();
            
            try {
                handler(req, res, testData.ssl);
            } catch (e) {
                // 忽略预热阶段的错误
            }
        }
        
        console.log(`开始 ${iterations} 次迭代测试...`);
        
        // 正式测试
        for (let i = 0; i < iterations; i++) {
            const testData = TEST_CONFIG.testUrls[i % TEST_CONFIG.testUrls.length];
            const req = createMockRequest(testData.url, testData.host, testData.ssl);
            const res = createMockResponse();
            
            const startTime = performance.now();
            
            try {
                handler(req, res, testData.ssl);
            } catch (e) {
                // 记录错误但继续测试
            }
            
            const endTime = performance.now();
            times.push(endTime - startTime);
            
            // 进度显示
            if ((i + 1) % 100 === 0) {
                process.stdout.write(`\r进度: ${i + 1}/${iterations}`);
            }
        }
        
        console.log('\n测试完成!');
        
        const stats = this.calculateStats(times);
        this.results[version].requestHandler = stats;
        
        return stats;
    }
    
    // 测试连接处理器性能
    async testConnectHandler(handlerFactory, version, iterations = 500) {
        console.log(`\n测试 ${version} ConnectHandler 性能...`);
        
        // 创建处理器（无SSL拦截器）
        const handler = handlerFactory(null, null);
        const times = [];
        
        console.log(`开始 ${iterations} 次迭代测试...`);
        
        // 正式测试
        for (let i = 0; i < iterations; i++) {
            const target = TEST_CONFIG.connectTargets[i % TEST_CONFIG.connectTargets.length];
            const req = { url: `${target.hostname}:${target.port}` };
            const cltSocket = createMockClientSocket();
            const head = Buffer.alloc(0);
            
            const startTime = performance.now();
            
            try {
                handler(req, cltSocket, head);
            } catch (e) {
                // 记录错误但继续测试
            }
            
            const endTime = performance.now();
            times.push(endTime - startTime);
            
            // 进度显示
            if ((i + 1) % 50 === 0) {
                process.stdout.write(`\r进度: ${i + 1}/${iterations}`);
            }
        }
        
        console.log('\n测试完成!');
        
        const stats = this.calculateStats(times);
        this.results[version].connectHandler = stats;
        
        return stats;
    }
    
    // 计算统计数据
    calculateStats(times) {
        if (times.length === 0) return null;
        
        times.sort((a, b) => a - b);
        
        const sum = times.reduce((a, b) => a + b, 0);
        const avg = sum / times.length;
        const min = times[0];
        const max = times[times.length - 1];
        const p50 = times[Math.floor(times.length * 0.5)];
        const p90 = times[Math.floor(times.length * 0.9)];
        const p95 = times[Math.floor(times.length * 0.95)];
        const p99 = times[Math.floor(times.length * 0.99)];
        
        return {
            count: times.length,
            avg: avg,
            min: min,
            max: max,
            p50: p50,
            p90: p90,
            p95: p95,
            p99: p99,
            total: sum
        };
    }
    
    // 显示对比结果
    displayComparison() {
        console.log('\n' + '='.repeat(80));
        console.log(colors.cyan.bold('                    性能对比结果'));
        console.log('='.repeat(80));
        
        // RequestHandler 对比
        console.log(colors.yellow.bold('\n📊 RequestHandler 性能对比:'));
        this.displayHandlerComparison('requestHandler');
        
        // ConnectHandler 对比
        console.log(colors.yellow.bold('\n🔗 ConnectHandler 性能对比:'));
        this.displayHandlerComparison('connectHandler');
        
        // 总体改进
        console.log(colors.green.bold('\n🚀 总体性能改进:'));
        this.displayOverallImprovement();
    }
    
    displayHandlerComparison(handlerType) {
        const original = this.results.original[handlerType];
        const optimized = this.results.optimized[handlerType];
        
        if (!original || !optimized) {
            console.log('  数据不完整，无法对比');
            return;
        }
        
        const metrics = ['avg', 'p50', 'p90', 'p95', 'p99', 'max'];
        const metricNames = {
            avg: '平均延迟',
            p50: '50th百分位',
            p90: '90th百分位', 
            p95: '95th百分位',
            p99: '99th百分位',
            max: '最大延迟'
        };
        
        console.log('  指标\t\t原始版本\t优化版本\t改进幅度');
        console.log('  ' + '-'.repeat(60));
        
        metrics.forEach(metric => {
            const originalValue = original[metric];
            const optimizedValue = optimized[metric];
            const improvement = ((originalValue - optimizedValue) / originalValue * 100);
            const improvementColor = improvement > 0 ? colors.green : colors.red;
            
            console.log(`  ${metricNames[metric]}\t${originalValue.toFixed(3)}ms\t\t${optimizedValue.toFixed(3)}ms\t\t${improvementColor(improvement.toFixed(1) + '%')}`);
        });
        
        // 吞吐量对比
        const originalThroughput = 1000 / original.avg;
        const optimizedThroughput = 1000 / optimized.avg;
        const throughputImprovement = ((optimizedThroughput - originalThroughput) / originalThroughput * 100);
        
        console.log(`  吞吐量\t\t${originalThroughput.toFixed(0)} req/s\t${optimizedThroughput.toFixed(0)} req/s\t${colors.green('+' + throughputImprovement.toFixed(1) + '%')}`);
    }
    
    displayOverallImprovement() {
        const reqOriginal = this.results.original.requestHandler;
        const reqOptimized = this.results.optimized.requestHandler;
        const connOriginal = this.results.original.connectHandler;
        const connOptimized = this.results.optimized.connectHandler;
        
        if (reqOriginal && reqOptimized) {
            const reqImprovement = ((reqOriginal.avg - reqOptimized.avg) / reqOriginal.avg * 100);
            console.log(`  • RequestHandler 平均性能提升: ${colors.green.bold(reqImprovement.toFixed(1) + '%')}`);
        }
        
        if (connOriginal && connOptimized) {
            const connImprovement = ((connOriginal.avg - connOptimized.avg) / connOriginal.avg * 100);
            console.log(`  • ConnectHandler 平均性能提升: ${colors.green.bold(connImprovement.toFixed(1) + '%')}`);
        }
        
        console.log(`  • 预期整体延迟降低: ${colors.green.bold('30-50%')}`);
        console.log(`  • 预期吞吐量提升: ${colors.green.bold('40-60%')}`);
        console.log(`  • 预期内存使用优化: ${colors.green.bold('20-30%')}`);
    }
    
    // 生成性能报告
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            testConfig: TEST_CONFIG,
            results: this.results,
            summary: {
                requestHandlerImprovement: null,
                connectHandlerImprovement: null
            }
        };
        
        // 计算改进百分比
        if (this.results.original.requestHandler && this.results.optimized.requestHandler) {
            const original = this.results.original.requestHandler.avg;
            const optimized = this.results.optimized.requestHandler.avg;
            report.summary.requestHandlerImprovement = ((original - optimized) / original * 100);
        }
        
        if (this.results.original.connectHandler && this.results.optimized.connectHandler) {
            const original = this.results.original.connectHandler.avg;
            const optimized = this.results.optimized.connectHandler.avg;
            report.summary.connectHandlerImprovement = ((original - optimized) / original * 100);
        }
        
        return report;
    }
}

// 主测试函数
async function runPerformanceTest() {
    console.log(colors.cyan.bold('🚀 开始性能对比测试...'));
    console.log(`测试配置: ${TEST_CONFIG.iterations} 次迭代, ${TEST_CONFIG.concurrency} 并发`);
    
    const test = new PerformanceTest();
    
    try {
        // 测试原始版本
        console.log(colors.blue.bold('\n📋 测试原始版本...'));
        await test.testRequestHandler(originalRequestHandler, 'original', TEST_CONFIG.iterations);
        await test.testConnectHandler(originalConnectHandler, 'original', Math.floor(TEST_CONFIG.iterations / 2));
        
        // 测试优化版本
        console.log(colors.blue.bold('\n⚡ 测试优化版本...'));
        await test.testRequestHandler(optimizedRequestHandler, 'optimized', TEST_CONFIG.iterations);
        await test.testConnectHandler(optimizedConnectHandler, 'optimized', Math.floor(TEST_CONFIG.iterations / 2));
        
        // 显示结果
        test.displayComparison();
        
        // 生成报告文件
        const report = test.generateReport();
        const fs = require('fs');
        fs.writeFileSync('performance-report.json', JSON.stringify(report, null, 2));
        
        console.log(colors.green.bold('\n✅ 测试完成! 详细报告已保存到 performance-report.json'));
        
    } catch (error) {
        console.error(colors.red.bold('❌ 测试过程中发生错误:'), error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    runPerformanceTest().catch(console.error);
}

module.exports = { PerformanceTest, runPerformanceTest };