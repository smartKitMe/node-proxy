const { NodeMITMProxy } = require('../src/index');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 重构版本性能基准测试
 */
class RefactoredPerformanceBenchmark {
    constructor() {
        this.testConfig = {
            requestCount: 100,  // 减少请求数量以便调试
            concurrency: 10,    // 减少并发数以便调试
            targetUrl: 'http://127.0.0.1:3333/test',  // 使用本地测试服务器
            timeout: 5000,      // 减少超时时间
            keepAlive: true,
            maxSockets: 50      // 减少最大连接数
        };
        
        // 本地测试服务器
        this.testServer = null;
        
        this.results = {
            testInfo: {
                timestamp: new Date().toISOString(),
                testConfig: this.testConfig,
                systemInfo: {
                    platform: os.platform(),
                    arch: os.arch(),
                    cpus: os.cpus().length,
                    totalMemory: os.totalmem(),
                    nodeVersion: process.version
                }
            },
            results: {}
        };
    }

    /**
     * 运行基准测试
     */
    async runBenchmark() {
        try {
            console.error('=== 开始重构版本性能基准测试 ===');
            
            console.error('1. 启动测试服务器...');
            await this.startTestServer();
            console.error('测试服务器启动成功。');
            
            console.error('\n2. 运行基本代理测试...');
            const basicResults = await this.runProxyTest('basic', {
                port: 8081,
                middleware: {
                    name: 'proxy',
                    priority: 1000,
                    handleRequest: async (ctx, next) => {
                        try {
                            const targetUrl = new URL('http://127.0.0.1:3333');
                            const targetReq = http.request({
                                protocol: targetUrl.protocol,
                                hostname: targetUrl.hostname,
                                port: targetUrl.port,
                                path: ctx.request.url || '/',
                                method: ctx.request.method,
                                headers: ctx.request.headers
                            });

                            await new Promise((resolve, reject) => {
                                targetReq.on('response', (targetRes) => {
                                    ctx.response.statusCode = targetRes.statusCode;
                                    Object.keys(targetRes.headers).forEach(key => {
                                        ctx.response.setHeader(key, targetRes.headers[key]);
                                    });
                                    targetRes.pipe(ctx.response);
                                    resolve();
                                });

                                targetReq.on('error', (err) => {
                                    ctx.response.statusCode = 502;
                                    ctx.response.setHeader('Content-Type', 'text/plain');
                                    ctx.response.end('Proxy request failed: ' + err.message);
                                    reject(err);
                                });

                                ctx.request.pipe(targetReq);
                                targetReq.end();
                            });
                        } catch (err) {
                            ctx.response.statusCode = 502;
                            ctx.response.setHeader('Content-Type', 'text/plain');
                            ctx.response.end('Proxy request failed: ' + err.message);
                        }
                    }
                }
            });
            this.results.results.basic = basicResults;
            
            console.error('\n3. 运行固定证书测试...');
            const fixedCertResults = await this.runProxyTest('fixedCert', {
                port: 8082,
                fixedCertPath: path.join(__dirname, 'fixed-cert.pem'),
                fixedKeyPath: path.join(__dirname, 'fixed-key.pem'),
                middleware: {
                    name: 'proxy',
                    priority: 1000,
                    handleRequest: async (ctx, next) => {
                        try {
                            const targetUrl = new URL('https://www.baidu.com');
                            const targetReq = https.request({
                                protocol: targetUrl.protocol,
                                hostname: targetUrl.hostname,
                                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                                path: ctx.request.url || '/',
                                method: ctx.request.method,
                                headers: ctx.request.headers
                            });

                            await new Promise((resolve, reject) => {
                                targetReq.on('response', (targetRes) => {
                                    ctx.response.statusCode = targetRes.statusCode;
                                    Object.keys(targetRes.headers).forEach(key => {
                                        ctx.response.setHeader(key, targetRes.headers[key]);
                                    });
                                    targetRes.pipe(ctx.response);
                                    resolve();
                                });

                                targetReq.on('error', (err) => {
                                    ctx.response.statusCode = 502;
                                    ctx.response.setHeader('Content-Type', 'text/plain');
                                    ctx.response.end('Proxy request failed: ' + err.message);
                                    reject(err);
                                });

                                ctx.request.pipe(targetReq);
                                targetReq.end();
                            });
                        } catch (err) {
                            ctx.response.statusCode = 502;
                            ctx.response.setHeader('Content-Type', 'text/plain');
                            ctx.response.end('Proxy request failed: ' + err.message);
                        }
                    }
                }
            });
            this.results.results.fixedCert = fixedCertResults;
            
            console.error('\n4. 运行完全优化测试...');
            const optimizedResults = await this.runProxyTest('optimized', {
                port: 8083,
                fixedCertPath: path.join(__dirname, 'fixed-cert.pem'),
                fixedKeyPath: path.join(__dirname, 'fixed-key.pem'),
                keepAlive: true,
                maxSockets: this.testConfig.maxSockets,
                enablePerformanceMetrics: true,
                middleware: {
                    name: 'proxy',
                    priority: 1000,
                    handleRequest: async (ctx, next) => {
                        try {
                            const targetUrl = new URL('https://www.baidu.com');
                            const targetReq = https.request({
                                protocol: targetUrl.protocol,
                                hostname: targetUrl.hostname,
                                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                                path: ctx.request.url || '/',
                                method: ctx.request.method,
                                headers: ctx.request.headers
                            });

                            await new Promise((resolve, reject) => {
                                targetReq.on('response', (targetRes) => {
                                    ctx.response.statusCode = targetRes.statusCode;
                                    Object.keys(targetRes.headers).forEach(key => {
                                        ctx.response.setHeader(key, targetRes.headers[key]);
                                    });
                                    targetRes.pipe(ctx.response);
                                    resolve();
                                });

                                targetReq.on('error', (err) => {
                                    ctx.response.statusCode = 502;
                                    ctx.response.setHeader('Content-Type', 'text/plain');
                                    ctx.response.end('Proxy request failed: ' + err.message);
                                    reject(err);
                                });

                                ctx.request.pipe(targetReq);
                                targetReq.end();
                            });
                        } catch (err) {
                            ctx.response.statusCode = 502;
                            ctx.response.setHeader('Content-Type', 'text/plain');
                            ctx.response.end('Proxy request failed: ' + err.message);
                        }
                    }
                }
            });
            this.results.results.optimized = optimizedResults;
            
            console.error('\n5. 生成性能对比报告...');
            this.generateComparisonReport();
            console.error('\n=== 性能测试完成 ===');
        } catch (error) {
            console.error('性能测试失败:', error);
            throw error;
        } finally {
            await this.stopTestServer();
        }
    }

    /**
     * 运行单个代理测试
     */
    async runProxyTest(testName, proxyOptions) {
        const proxy = new NodeMITMProxy(proxyOptions);
        let results = {
            summary: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                successRate: 0,
                totalTime: 0,
                requestsPerSecond: 0
            },
            responseTime: {
                times: [],
                avg: 0,
                min: Number.MAX_VALUE,
                max: 0,
                p50: 0,
                p90: 0,
                p95: 0,
                p99: 0
            },
            memory: {
                samples: [],
                rss: { avg: 0, min: Number.MAX_VALUE, max: 0 },
                heapUsed: { avg: 0, min: Number.MAX_VALUE, max: 0 },
                heapTotal: { avg: 0, min: Number.MAX_VALUE, max: 0 }
            },
            errors: {}
        };
        
        try {
            await proxy.initialize();
            await proxy.start(proxyOptions.port, '127.0.0.1');
            
            // 等待代理服务器完全启动并获取实际端口
            await new Promise(resolve => setTimeout(resolve, 1000));
            const serverInfo = proxy.getServerInfo();
            const actualPort = serverInfo.port || proxyOptions.port;
            
            console.error(`代理服务器已启动在端口 ${actualPort}`);
            
            const startTime = Date.now();
            const workers = [];
            
            // 创建并发请求
            for (let i = 0; i < this.testConfig.concurrency; i++) {
                const requestsPerWorker = Math.floor(this.testConfig.requestCount / this.testConfig.concurrency);
                workers.push(this.runWorker(results, requestsPerWorker, actualPort));
            }
            
            // 等待所有请求完成
            await Promise.all(workers);
            
            const endTime = Date.now();
            results.summary.totalTime = (endTime - startTime) / 1000;
            results.summary.requestsPerSecond = results.summary.successfulRequests / results.summary.totalTime;
            results.summary.successRate = (results.summary.successfulRequests / results.summary.totalRequests) * 100;
            
            // 计算响应时间百分位数
            if (results.responseTime.times.length > 0) {
                const sortedTimes = results.responseTime.times.sort((a, b) => a - b);
                results.responseTime.p50 = this.calculatePercentile(sortedTimes, 50);
                results.responseTime.p90 = this.calculatePercentile(sortedTimes, 90);
                results.responseTime.p95 = this.calculatePercentile(sortedTimes, 95);
                results.responseTime.p99 = this.calculatePercentile(sortedTimes, 99);
                results.responseTime.avg = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
            }
            
            // 清理内存统计数据
            delete results.responseTime.times;
            delete results.memory.samples;
            
            console.error(`${testName} 测试完成:`);
            console.error(`- QPS: ${results.summary.requestsPerSecond.toFixed(2)}`);
            console.error(`- 成功率: ${results.summary.successRate.toFixed(2)}%`);
            console.error(`- 平均响应时间: ${results.responseTime.avg ? results.responseTime.avg.toFixed(2) : 'N/A'} ms`);
            
            return results;
        } catch (error) {
            console.error(`${testName} 测试失败:`, error);
            throw error;
        } finally {
            if (proxy) {
                await proxy.stop();
            }
        }
    }

    /**
     * 运行工作进程
     */
    async runWorker(results, requestCount, proxyPort) {
        const errors = [];
        const responseTimes = [];
        const memorySnapshots = [];
        
        console.error(`开始运行工作进程，请求数: ${requestCount}`);
        
        for (let i = 0; i < requestCount; i++) {
            try {
                const startTime = Date.now();
                const response = await this.sendRequest(proxyPort);
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                
                if (response.statusCode === 200) {
                    responseTimes.push(responseTime);
                    if (i % 100 === 0) {
                        console.error(`成功处理 ${i + 1} 个请求，响应时间: ${responseTime}ms`);
                    }
                } else {
                    errors.push(`HTTP ${response.statusCode}`);
                    console.error(`请求失败，状态码: ${response.statusCode}，响应内容: ${response.body}`);
                }
                
                // 每10个请求收集一次内存快照
                if (i % 10 === 0) {
                    memorySnapshots.push(process.memoryUsage());
                }
                
            } catch (error) {
                errors.push(error.message || 'Unknown error');
                console.error(`请求错误: ${error.message}`);
            }
        }
        
        // 更新统计信息
        results.summary.totalRequests += requestCount;
        results.summary.successfulRequests += responseTimes.length;
        results.summary.failedRequests += errors.length;
        
        // 更新响应时间统计
        if (responseTimes.length > 0) {
            results.responseTime.times.push(...responseTimes);
            results.responseTime.min = Math.min(results.responseTime.min, ...responseTimes);
            results.responseTime.max = Math.max(results.responseTime.max, ...responseTimes);
        }
        
        // 更新内存统计
        if (memorySnapshots.length > 0) {
            results.memory.samples.push(...memorySnapshots);
            const rssValues = memorySnapshots.map(m => m.rss);
            const heapUsedValues = memorySnapshots.map(m => m.heapUsed);
            const heapTotalValues = memorySnapshots.map(m => m.heapTotal);
            
            results.memory.rss.min = Math.min(results.memory.rss.min, ...rssValues);
            results.memory.rss.max = Math.max(results.memory.rss.max, ...rssValues);
            results.memory.heapUsed.min = Math.min(results.memory.heapUsed.min, ...heapUsedValues);
            results.memory.heapUsed.max = Math.max(results.memory.heapUsed.max, ...heapUsedValues);
            results.memory.heapTotal.min = Math.min(results.memory.heapTotal.min, ...heapTotalValues);
            results.memory.heapTotal.max = Math.max(results.memory.heapTotal.max, ...heapTotalValues);
        }
        
        // 更新错误统计
        errors.forEach(error => {
            results.errors[error] = (results.errors[error] || 0) + 1;
        });
    }

    /**
     * 发送HTTP请求
     */
    sendRequest(proxyPort) {
        if (!proxyPort) {
            throw new Error('Proxy port is required');
        }
        
        console.error(`发送请求到代理服务器: 127.0.0.1:${proxyPort}`);
        
        return new Promise((resolve, reject) => {
            // 通过代理服务器请求
            const req = http.request({
                protocol: 'http:',
                hostname: '127.0.0.1',
                port: 6789,  // 代理服务器端口
                path: 'http://127.0.0.1:3333/',  // 目标URL
                method: 'GET',
                timeout: this.testConfig.timeout,
                agent: new http.Agent({
                    keepAlive: this.testConfig.keepAlive,
                    maxSockets: this.testConfig.maxSockets
                }),
                headers: {
                    'Host': new URL(this.testConfig.targetUrl).host,
                    'Connection': this.testConfig.keepAlive ? 'keep-alive' : 'close'
                }
            });
            
            let responseTimeout = setTimeout(() => {
                req.destroy();
                reject(new Error('Response timeout'));
            }, this.testConfig.timeout);
            
            req.on('response', (res) => {
                let data = '';
                
                res.on('data', chunk => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    clearTimeout(responseTimeout);
                    res.body = data;
                    resolve(res);
                });
                
                res.on('error', error => {
                    clearTimeout(responseTimeout);
                    reject(new Error(`Response error: ${error.message}`));
                });
            });
            
            req.on('error', error => {
                clearTimeout(responseTimeout);
                reject(new Error(`Request error: ${error.message}`));
            });
            
            req.on('timeout', () => {
                clearTimeout(responseTimeout);
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.end();
        }).catch(error => {
            console.error('Request failed:', error.message);
            throw error;
        });
    }

    /**
     * 启动测试服务器
     */
    async startTestServer() {
        return new Promise((resolve, reject) => {
            this.testServer = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('OK');
            });
            
            this.testServer.listen(3333, '127.0.0.1', (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('测试服务器已启动在端口 3333');
                    resolve();
                }
            });
        });
    }

    /**
     * 停止测试服务器
     */
    async stopTestServer() {
        if (this.testServer) {
            return new Promise(resolve => {
                this.testServer.close(() => {
                    console.log('测试服务器已停止');
                    resolve();
                });
            });
        }
    }

    /**
     * 计算百分位数
     */
    calculatePercentile(sortedArray, percentile) {
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[index];
    }

    /**
     * 生成对比报告
     */
    generateComparisonReport() {
        const oldResults = this.loadOldResults();
        
        this.results.comparison = {
            timestamp: new Date().toISOString(),
            improvements: {
                basic: this.compareResults(oldResults.results.directProxy, this.results.results.basic),
                fixedCert: this.compareResults(oldResults.results.directProxy, this.results.results.fixedCert),
                optimized: this.compareResults(oldResults.results.directProxy, this.results.results.optimized)
            }
        };
        
        // 保存测试结果
        const reportPath = path.join(__dirname, `refactored-benchmark-${this.results.testInfo.timestamp}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        
        console.log('\n=== 性能对比报告 ===');
        console.log('基本代理改进:', this.results.comparison.improvements.basic);
        console.log('固定证书改进:', this.results.comparison.improvements.fixedCert);
        console.log('完全优化改进:', this.results.comparison.improvements.optimized);
        console.log(`\n详细报告已保存到: ${reportPath}`);
    }

    /**
     * 加载旧版本测试结果
     */
    loadOldResults() {
        const oldReportPath = path.join(__dirname, 'performance-report-2025-09-15T08-36-57-848Z.json');
        return JSON.parse(fs.readFileSync(oldReportPath, 'utf8'));
    }

    /**
     * 对比结果并计算改进百分比
     */
    compareResults(oldResult, newResult) {
        return {
            qps: {
                original: oldResult.summary.requestsPerSecond,
                new: newResult.summary.requestsPerSecond,
                improvement: ((newResult.summary.requestsPerSecond - oldResult.summary.requestsPerSecond) / oldResult.summary.requestsPerSecond * 100).toFixed(2) + '%'
            },
            responseTime: {
                original: oldResult.responseTime.avg,
                new: newResult.responseTime.avg,
                improvement: ((oldResult.responseTime.avg - newResult.responseTime.avg) / oldResult.responseTime.avg * 100).toFixed(2) + '%'
            },
            memory: {
                original: this.formatBytes(oldResult.memory.rss.avg),
                new: this.formatBytes(newResult.memory.rss.avg),
                improvement: ((oldResult.memory.rss.avg - newResult.memory.rss.avg) / oldResult.memory.rss.avg * 100).toFixed(2) + '%'
            },
            successRate: {
                original: oldResult.summary.successRate,
                new: newResult.summary.successRate,
                improvement: ((newResult.summary.successRate - oldResult.summary.successRate) / oldResult.summary.successRate * 100).toFixed(2) + '%'
            }
        };
    }

    /**
     * 格式化字节数
     */
    formatBytes(bytes) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
}

// 运行测试
if (require.main === module) {
    const benchmark = new RefactoredPerformanceBenchmark();
    benchmark.runBenchmark().catch(error => {
        console.error('基准测试失败:', error);
        process.exit(1);
    });
}

module.exports = RefactoredPerformanceBenchmark;