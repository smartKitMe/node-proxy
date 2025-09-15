const { NodeMITMProxy } = require('../src/index');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * 重构版本性能测试
 */
class RefactoredPerformanceTest {
    constructor() {
        this.proxy = null;
        this.testServer = null;
        this.results = {
            requests: 0,
            responses: 0,
            errors: 0,
            startTime: 0,
            endTime: 0,
            latencies: [],
            memoryUsage: [],
            cpuUsage: []
        };
    }
    
    /**
     * 初始化测试环境
     */
    async setup() {
        console.log('Setting up refactored performance test...');
        
        // 创建测试服务器
        await this.createTestServer();
        
        // 创建代理服务器
        await this.createProxyServer();
        
        console.log('Test environment setup completed');
    }
    
    /**
     * 创建测试服务器
     */
    async createTestServer() {
        return new Promise((resolve) => {
            this.testServer = http.createServer((req, res) => {
                // 模拟不同类型的响应
                const url = req.url;
                
                if (url === '/small') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('Hello World');
                } else if (url === '/medium') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Hello World', data: new Array(100).fill('test') }));
                } else if (url === '/large') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(new Array(1000).fill('Large response data').join('\n'));
                } else if (url === '/delay') {
                    setTimeout(() => {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end('Delayed response');
                    }, 100);
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });
            
            this.testServer.listen(3001, () => {
                console.log('Test server started on port 3001');
                resolve();
            });
        });
    }
    
    /**
     * 创建代理服务器
     */
    async createProxyServer() {
        this.proxy = new NodeMITMProxy({
            port: 8081,
            ssl: {
                enabled: false // 简化测试，不使用SSL
            },
            logging: {
                level: 'error' // 减少日志输出，避免影响性能
            },
            performance: {
                objectPoolSize: 2000,
                maxConnections: 20000
            },
            monitoring: {
                enabled: true,
                interval: 1000
            }
        });
        
        // 添加性能监控中间件
        this.proxy.use({
            name: 'performance-monitor',
            phase: 'request',
            priority: 1000,
            execute: async (context, next) => {
                const startTime = Date.now();
                
                await next();
                
                const endTime = Date.now();
                const latency = endTime - startTime;
                this.results.latencies.push(latency);
            }
        });
        
        // 监听性能指标
        this.proxy.on('metrics', (metrics) => {
            this.results.memoryUsage.push(process.memoryUsage());
        });
        
        await this.proxy.start();
        console.log('Proxy server started on port 8081');
    }
    
    /**
     * 运行性能测试
     */
    async runTest(options = {}) {
        const {
            concurrency = 100,
            requests = 1000,
            endpoints = ['/small', '/medium', '/large'],
            duration = 30000 // 30秒
        } = options;
        
        console.log(`Starting performance test with ${concurrency} concurrent connections...`);
        console.log(`Target: ${requests} requests over ${duration}ms`);
        
        this.results.startTime = Date.now();
        
        // 启动并发请求
        const promises = [];
        for (let i = 0; i < concurrency; i++) {
            promises.push(this.runConcurrentRequests(endpoints, requests / concurrency, duration));
        }
        
        // 启动系统监控
        const monitorInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 1000);
        
        try {
            await Promise.all(promises);
        } finally {
            clearInterval(monitorInterval);
            this.results.endTime = Date.now();
        }
        
        return this.generateReport();
    }
    
    /**
     * 运行并发请求
     */
    async runConcurrentRequests(endpoints, requestCount, duration) {
        const startTime = Date.now();
        let requestsSent = 0;
        
        while (requestsSent < requestCount && (Date.now() - startTime) < duration) {
            const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
            
            try {
                await this.makeRequest(endpoint);
                this.results.requests++;
                this.results.responses++;
                requestsSent++;
            } catch (error) {
                this.results.errors++;
                console.error('Request error:', error.message);
            }
            
            // 小延迟避免过度占用CPU
            if (requestsSent % 10 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }
    }
    
    /**
     * 发送HTTP请求
     */
    async makeRequest(endpoint) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 8081,
                path: `http://localhost:3001${endpoint}`,
                method: 'GET',
                headers: {
                    'Proxy-Connection': 'keep-alive'
                }
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve(data);
                });
            });
            
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.end();
        });
    }
    
    /**
     * 收集系统指标
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        this.results.memoryUsage.push({
            timestamp: Date.now(),
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external
        });
        
        this.results.cpuUsage.push({
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        });
    }
    
    /**
     * 生成测试报告
     */
    generateReport() {
        const duration = this.results.endTime - this.results.startTime;
        const rps = (this.results.responses / duration) * 1000;
        
        // 计算延迟统计
        const latencies = this.results.latencies.sort((a, b) => a - b);
        const latencyStats = {
            min: latencies[0] || 0,
            max: latencies[latencies.length - 1] || 0,
            avg: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length || 0,
            p50: latencies[Math.floor(latencies.length * 0.5)] || 0,
            p90: latencies[Math.floor(latencies.length * 0.9)] || 0,
            p95: latencies[Math.floor(latencies.length * 0.95)] || 0,
            p99: latencies[Math.floor(latencies.length * 0.99)] || 0
        };
        
        // 计算内存统计
        const memoryStats = this.calculateMemoryStats();
        
        // 获取代理统计
        const proxyStats = this.proxy.getStats();
        
        const report = {
            summary: {
                duration: duration,
                requests: this.results.requests,
                responses: this.results.responses,
                errors: this.results.errors,
                rps: rps,
                errorRate: (this.results.errors / this.results.requests) * 100
            },
            latency: latencyStats,
            memory: memoryStats,
            proxy: proxyStats,
            timestamp: new Date().toISOString()
        };
        
        return report;
    }
    
    /**
     * 计算内存统计
     */
    calculateMemoryStats() {
        if (this.results.memoryUsage.length === 0) {
            return {};
        }
        
        const rssValues = this.results.memoryUsage.map(m => m.rss);
        const heapUsedValues = this.results.memoryUsage.map(m => m.heapUsed);
        
        return {
            rss: {
                min: Math.min(...rssValues),
                max: Math.max(...rssValues),
                avg: rssValues.reduce((sum, val) => sum + val, 0) / rssValues.length
            },
            heapUsed: {
                min: Math.min(...heapUsedValues),
                max: Math.max(...heapUsedValues),
                avg: heapUsedValues.reduce((sum, val) => sum + val, 0) / heapUsedValues.length
            }
        };
    }
    
    /**
     * 清理测试环境
     */
    async cleanup() {
        console.log('Cleaning up test environment...');
        
        if (this.proxy) {
            await this.proxy.stop();
        }
        
        if (this.testServer) {
            this.testServer.close();
        }
        
        console.log('Cleanup completed');
    }
    
    /**
     * 保存测试报告
     */
    async saveReport(report, filename) {
        const reportPath = path.join(__dirname, 'reports', filename);
        const reportDir = path.dirname(reportPath);
        
        // 确保报告目录存在
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`Report saved to: ${reportPath}`);
    }
}

/**
 * 运行性能测试
 */
async function runPerformanceTest() {
    const test = new RefactoredPerformanceTest();
    
    try {
        await test.setup();
        
        console.log('\n=== Running Light Load Test ===');
        const lightReport = await test.runTest({
            concurrency: 50,
            requests: 500,
            duration: 15000
        });
        
        console.log('Light Load Results:');
        console.log(`RPS: ${lightReport.summary.rps.toFixed(2)}`);
        console.log(`Avg Latency: ${lightReport.latency.avg.toFixed(2)}ms`);
        console.log(`P99 Latency: ${lightReport.latency.p99.toFixed(2)}ms`);
        console.log(`Error Rate: ${lightReport.summary.errorRate.toFixed(2)}%`);
        
        await test.saveReport(lightReport, `refactored-light-${Date.now()}.json`);
        
        // 等待一段时间让系统恢复
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('\n=== Running Heavy Load Test ===');
        const heavyReport = await test.runTest({
            concurrency: 200,
            requests: 2000,
            duration: 30000
        });
        
        console.log('Heavy Load Results:');
        console.log(`RPS: ${heavyReport.summary.rps.toFixed(2)}`);
        console.log(`Avg Latency: ${heavyReport.latency.avg.toFixed(2)}ms`);
        console.log(`P99 Latency: ${heavyReport.latency.p99.toFixed(2)}ms`);
        console.log(`Error Rate: ${heavyReport.summary.errorRate.toFixed(2)}%`);
        
        await test.saveReport(heavyReport, `refactored-heavy-${Date.now()}.json`);
        
        // 生成对比报告
        const comparison = {
            light: lightReport,
            heavy: heavyReport,
            improvement: {
                rps: ((heavyReport.summary.rps - lightReport.summary.rps) / lightReport.summary.rps * 100).toFixed(2) + '%',
                latency: ((lightReport.latency.avg - heavyReport.latency.avg) / lightReport.latency.avg * 100).toFixed(2) + '%'
            }
        };
        
        await test.saveReport(comparison, `refactored-comparison-${Date.now()}.json`);
        
        console.log('\n=== Performance Test Completed ===');
        console.log('Reports saved in test/reports/ directory');
        
    } catch (error) {
        console.error('Performance test failed:', error);
    } finally {
        await test.cleanup();
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runPerformanceTest().catch(console.error);
}

module.exports = RefactoredPerformanceTest;