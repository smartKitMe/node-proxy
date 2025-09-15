const mitmproxy = require('../src/index');
const http = require('http');
const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { performance } = require('perf_hooks');
const colors = require('colors');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * node-mitmproxy 优化性能测试脚本
 * 基于性能测试结果进行的优化：
 * 1. 连接池管理优化
 * 2. 内存使用优化
 * 3. 请求处理优化
 * 4. 错误处理优化
 */

class OptimizedMitmproxyTester {
    constructor() {
        this.proxyServer = null;
        this.proxyPort = 8888;
        this.testConfig = {
            requestCount: 1000,
            concurrency: 100, // 增加并发数
            targetUrl: 'https://www.baidu.com/',
            timeout: 10000, // 减少超时时间
            keepAlive: true, // 启用连接复用
            maxSockets: 200 // 增加最大socket数
        };
        
        this.performanceData = {
            optimizedDirect: {
                requests: [],
                errors: [],
                startTime: 0,
                endTime: 0,
                memoryUsage: [],
                connectionStats: []
            },
            optimizedExternal: {
                requests: [],
                errors: [],
                startTime: 0,
                endTime: 0,
                memoryUsage: [],
                connectionStats: []
            }
        };
        
        // 连接池管理
        this.connectionPools = new Map();
        this.activeConnections = 0;
        this.maxConnections = 500;
        
        // 优化HTTP Agent配置
        this.httpAgent = new http.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: this.testConfig.maxSockets,
            maxFreeSockets: 50,
            timeout: this.testConfig.timeout
        });
        
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: this.testConfig.maxSockets,
            maxFreeSockets: 50,
            timeout: this.testConfig.timeout,
            rejectUnauthorized: false
        });
        
        this.systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            nodeVersion: process.version
        };
    }

    /**
     * 启动优化的 mitmproxy 代理服务器
     */
    async startOptimizedProxyServer(options = {}) {
        return new Promise((resolve, reject) => {
            try {
                console.log(colors.cyan('\n=== 启动优化版 node-mitmproxy 代理服务器 ==='));
                
                const defaultOptions = {
                    port: this.proxyPort,
                    enablePerformanceMetrics: true,
                    // 优化的拦截器
                    requestInterceptor: this.createOptimizedRequestInterceptor(),
                    responseInterceptor: this.createOptimizedResponseInterceptor(),
                    sslConnectInterceptor: this.createOptimizedSSLConnectInterceptor(),
                    // 连接池配置
                    maxConnections: this.maxConnections,
                    keepAlive: true,
                    ...options
                };

                this.proxyServer = mitmproxy.createProxy(defaultOptions);
                
                // 优化服务器配置
                this.proxyServer.keepAliveTimeout = 30000;
                this.proxyServer.headersTimeout = 40000;
                this.proxyServer.maxHeadersCount = 2000;
                
                this.proxyServer.listen(this.proxyPort, () => {
                    console.log(colors.green(`✓ 优化版代理服务器启动成功，端口: ${this.proxyPort}`));
                    console.log(`  最大连接数: ${this.maxConnections}`);
                    console.log(`  Keep-Alive: ${this.testConfig.keepAlive}`);
                    console.log(`  最大Socket数: ${this.testConfig.maxSockets}`);
                    resolve(true);
                });

                this.proxyServer.on('error', (error) => {
                    console.error(colors.red('✗ 优化版代理服务器启动失败:'), error.message);
                    reject(error);
                });

            } catch (error) {
                console.error(colors.red('✗ 创建优化版代理服务器失败:'), error.message);
                reject(error);
            }
        });
    }

    /**
     * 创建优化的请求拦截器
     */
    createOptimizedRequestInterceptor() {
        return (rOptions, req, res, ssl, next) => {
            // 最小化处理，减少性能开销
            rOptions.headers['X-Optimized-Test'] = '1';
            
            // 优化连接配置
            if (this.testConfig.keepAlive) {
                rOptions.headers['Connection'] = 'keep-alive';
            }
            
            // 使用优化的Agent
            if (ssl) {
                rOptions.agent = this.httpsAgent;
            } else {
                rOptions.agent = this.httpAgent;
            }
            
            next();
        };
    }

    /**
     * 创建优化的响应拦截器
     */
    createOptimizedResponseInterceptor() {
        return (req, res, proxyReq, proxyRes, ssl, next) => {
            // 最小化响应处理
            proxyRes.headers['X-Optimized-Processed'] = '1';
            next();
        };
    }

    /**
     * 创建优化的 SSL 连接拦截器
     */
    createOptimizedSSLConnectInterceptor() {
        return (req, cltSocket, head) => {
            // 连接计数管理
            this.activeConnections++;
            
            cltSocket.on('close', () => {
                this.activeConnections--;
            });
            
            return true;
        };
    }

    /**
     * 优化的单个请求处理
     */
    async makeOptimizedProxyRequest(targetUrl, requestId) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const url = new URL(targetUrl);
            const port = url.port || 443;
            
            // 连接限制检查
            if (this.activeConnections >= this.maxConnections) {
                resolve({
                    requestId,
                    success: false,
                    error: '连接数超限',
                    responseTime: 0,
                    timestamp: Date.now()
                });
                return;
            }
            
            const connectOptions = {
                hostname: '127.0.0.1',
                port: this.proxyPort,
                method: 'CONNECT',
                path: `${url.hostname}:${port}`,
                headers: {
                    'Host': `${url.hostname}:${port}`,
                    'User-Agent': 'OptimizedTest/1.0',
                    'Connection': this.testConfig.keepAlive ? 'keep-alive' : 'close'
                },
                agent: this.httpAgent
            };

            const connectReq = http.request(connectOptions);
            
            connectReq.on('connect', (res, socket, head) => {
                if (res.statusCode === 200) {
                    const httpsOptions = {
                        socket: socket,
                        hostname: url.hostname,
                        port: port,
                        path: url.pathname + url.search,
                        method: 'GET',
                        headers: {
                            'Host': url.hostname,
                            'User-Agent': 'OptimizedTest/1.0',
                            'Accept': 'text/html,application/xhtml+xml',
                            'Accept-Encoding': 'gzip, deflate',
                            'Connection': this.testConfig.keepAlive ? 'keep-alive' : 'close'
                        },
                        agent: this.httpsAgent,
                        rejectUnauthorized: false
                    };

                    const httpsReq = https.request(httpsOptions, (httpsRes) => {
                        const endTime = performance.now();
                        const responseTime = endTime - startTime;
                        
                        let dataLength = 0;
                        
                        // 优化数据处理
                        httpsRes.on('data', (chunk) => {
                            dataLength += chunk.length;
                        });
                        
                        httpsRes.on('end', () => {
                            resolve({
                                requestId,
                                success: true,
                                statusCode: httpsRes.statusCode,
                                responseTime,
                                dataLength,
                                timestamp: Date.now(),
                                connectionReused: socket.reusedSocket || false
                            });
                        });
                    });
                    
                    httpsReq.on('error', (error) => {
                        const endTime = performance.now();
                        resolve({
                            requestId,
                            success: false,
                            error: error.message,
                            responseTime: endTime - startTime,
                            timestamp: Date.now()
                        });
                    });
                    
                    httpsReq.setTimeout(this.testConfig.timeout, () => {
                        httpsReq.destroy();
                        resolve({
                            requestId,
                            success: false,
                            error: 'HTTPS请求超时',
                            responseTime: this.testConfig.timeout,
                            timestamp: Date.now()
                        });
                    });
                    
                    httpsReq.end();
                } else {
                    const endTime = performance.now();
                    resolve({
                        requestId,
                        success: false,
                        error: `CONNECT失败: ${res.statusCode}`,
                        responseTime: endTime - startTime,
                        timestamp: Date.now()
                    });
                }
            });
            
            connectReq.on('error', (error) => {
                const endTime = performance.now();
                resolve({
                    requestId,
                    success: false,
                    error: `CONNECT错误: ${error.message}`,
                    responseTime: endTime - startTime,
                    timestamp: Date.now()
                });
            });
            
            connectReq.setTimeout(this.testConfig.timeout, () => {
                connectReq.destroy();
                resolve({
                    requestId,
                    success: false,
                    error: 'CONNECT超时',
                    responseTime: this.testConfig.timeout,
                    timestamp: Date.now()
                });
            });
            
            connectReq.end();
        });
    }

    /**
     * 执行优化的批量请求测试
     */
    async runOptimizedBatchRequests(testType) {
        console.log(colors.cyan(`\n=== 开始优化版 ${testType} 模式性能测试 ===`));
        console.log(`请求总数: ${this.testConfig.requestCount}`);
        console.log(`并发数: ${this.testConfig.concurrency}`);
        console.log(`目标URL: ${this.testConfig.targetUrl}`);
        console.log(`Keep-Alive: ${this.testConfig.keepAlive}`);
        
        const data = this.performanceData[testType];
        data.startTime = performance.now();
        
        // 内存和连接监控
        const monitor = setInterval(() => {
            const memUsage = process.memoryUsage();
            data.memoryUsage.push({
                timestamp: Date.now(),
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external
            });
            
            data.connectionStats.push({
                timestamp: Date.now(),
                activeConnections: this.activeConnections,
                httpAgentSockets: Object.keys(this.httpAgent.sockets).length,
                httpsAgentSockets: Object.keys(this.httpsAgent.sockets).length
            });
        }, 50); // 更频繁的监控
        
        try {
            // 优化的批量处理
            const batches = [];
            for (let i = 0; i < this.testConfig.requestCount; i += this.testConfig.concurrency) {
                const batchSize = Math.min(this.testConfig.concurrency, this.testConfig.requestCount - i);
                const batch = [];
                
                for (let j = 0; j < batchSize; j++) {
                    const requestId = i + j + 1;
                    batch.push(this.makeOptimizedProxyRequest(this.testConfig.targetUrl, requestId));
                }
                
                batches.push(batch);
            }
            
            let completedRequests = 0;
            const batchStartTime = performance.now();
            
            for (const batch of batches) {
                const batchResults = await Promise.all(batch);
                
                batchResults.forEach(result => {
                    if (result.success) {
                        data.requests.push(result);
                    } else {
                        data.errors.push(result);
                    }
                });
                
                completedRequests += batchResults.length;
                
                const currentTime = performance.now();
                const elapsed = (currentTime - batchStartTime) / 1000;
                const currentQPS = completedRequests / elapsed;
                
                const progress = ((completedRequests / this.testConfig.requestCount) * 100).toFixed(1);
                process.stdout.write(`\r进度: ${progress}% (${completedRequests}/${this.testConfig.requestCount}) QPS: ${currentQPS.toFixed(1)} 活跃连接: ${this.activeConnections}`);
                
                // 减少批次间延迟
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
            
            console.log(''); // 换行
            
        } finally {
            clearInterval(monitor);
            data.endTime = performance.now();
        }
        
        const totalTime = data.endTime - data.startTime;
        const successCount = data.requests.length;
        const errorCount = data.errors.length;
        const successRate = (successCount / this.testConfig.requestCount * 100).toFixed(2);
        const qps = (this.testConfig.requestCount / (totalTime / 1000)).toFixed(2);
        
        console.log(colors.green(`\n✓ 优化版 ${testType} 测试完成`));
        console.log(`总耗时: ${(totalTime / 1000).toFixed(2)} 秒`);
        console.log(`成功请求: ${successCount}`);
        console.log(`失败请求: ${errorCount}`);
        console.log(`成功率: ${successRate}%`);
        console.log(`QPS: ${qps} 请求/秒`);
        
        // 连接复用统计
        const reusedConnections = data.requests.filter(r => r.connectionReused).length;
        const reuseRate = (reusedConnections / successCount * 100).toFixed(2);
        console.log(`连接复用率: ${reuseRate}%`);
        
        return {
            testType,
            totalTime,
            successCount,
            errorCount,
            successRate: parseFloat(successRate),
            qps: parseFloat(qps),
            connectionReuseRate: parseFloat(reuseRate)
        };
    }

    /**
     * 生成优化对比报告
     */
    generateOptimizationReport(originalReport) {
        const optimizedReport = this.generatePerformanceReport();
        
        const comparison = {
            timestamp: new Date().toISOString(),
            optimization: {
                description: '连接池优化、Keep-Alive启用、Agent配置优化、内存管理优化',
                changes: [
                    '增加并发数从50到100',
                    '启用HTTP Keep-Alive连接复用',
                    '优化Agent配置（maxSockets: 200）',
                    '减少超时时间从15s到10s',
                    '添加连接数限制管理',
                    '优化内存监控频率'
                ]
            },
            comparison: {}
        };
        
        // 对比分析
        if (originalReport && originalReport.results) {
            ['directProxy', 'externalProxy'].forEach(testType => {
                const optimizedKey = testType === 'directProxy' ? 'optimizedDirect' : 'optimizedExternal';
                const original = originalReport.results[testType];
                const optimized = optimizedReport.results[optimizedKey];
                
                if (original && optimized) {
                    comparison.comparison[testType] = {
                        qps: {
                            original: original.summary.requestsPerSecond,
                            optimized: optimized.summary.requestsPerSecond,
                            improvement: ((optimized.summary.requestsPerSecond - original.summary.requestsPerSecond) / original.summary.requestsPerSecond * 100).toFixed(2) + '%'
                        },
                        avgResponseTime: {
                            original: original.responseTime.avg,
                            optimized: optimized.responseTime.avg,
                            improvement: ((original.responseTime.avg - optimized.responseTime.avg) / original.responseTime.avg * 100).toFixed(2) + '%'
                        },
                        p95ResponseTime: {
                            original: original.responseTime.p95,
                            optimized: optimized.responseTime.p95,
                            improvement: ((original.responseTime.p95 - optimized.responseTime.p95) / original.responseTime.p95 * 100).toFixed(2) + '%'
                        },
                        memoryUsage: {
                            original: (original.memory.rss.avg / 1024 / 1024).toFixed(2) + ' MB',
                            optimized: (optimized.memory.rss.avg / 1024 / 1024).toFixed(2) + ' MB',
                            improvement: ((original.memory.rss.avg - optimized.memory.rss.avg) / original.memory.rss.avg * 100).toFixed(2) + '%'
                        }
                    };
                }
            });
        }
        
        return {
            original: originalReport,
            optimized: optimizedReport,
            comparison
        };
    }

    /**
     * 生成性能报告（复用原有逻辑）
     */
    generatePerformanceReport() {
        const report = {
            testInfo: {
                timestamp: new Date().toISOString(),
                testConfig: this.testConfig,
                systemInfo: this.systemInfo
            },
            results: {}
        };
        
        ['optimizedDirect', 'optimizedExternal'].forEach(testType => {
            const data = this.performanceData[testType];
            
            if (data.requests.length > 0 || data.errors.length > 0) {
                const stats = this.calculateStatistics(data.requests);
                const memStats = this.calculateMemoryStatistics(data.memoryUsage);
                const totalTime = data.endTime - data.startTime;
                const totalRequests = data.requests.length + data.errors.length;
                
                report.results[testType] = {
                    summary: {
                        totalRequests,
                        successfulRequests: data.requests.length,
                        failedRequests: data.errors.length,
                        successRate: parseFloat((data.requests.length / totalRequests * 100).toFixed(2)),
                        totalTime: parseFloat((totalTime / 1000).toFixed(2)),
                        requestsPerSecond: parseFloat((totalRequests / (totalTime / 1000)).toFixed(2))
                    },
                    responseTime: stats,
                    memory: memStats,
                    connectionStats: {
                        maxActiveConnections: Math.max(...data.connectionStats.map(s => s.activeConnections)),
                        avgActiveConnections: data.connectionStats.reduce((sum, s) => sum + s.activeConnections, 0) / data.connectionStats.length
                    },
                    errors: data.errors.reduce((acc, error) => {
                        acc[error.error] = (acc[error.error] || 0) + 1;
                        return acc;
                    }, {})
                };
            }
        });
        
        return report;
    }

    // 复用原有的统计计算方法
    calculateStatistics(requests) {
        if (requests.length === 0) {
            return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
        }
        
        const responseTimes = requests.map(r => r.responseTime).sort((a, b) => a - b);
        const count = responseTimes.length;
        const sum = responseTimes.reduce((a, b) => a + b, 0);
        const avg = sum / count;
        const min = responseTimes[0];
        const max = responseTimes[count - 1];
        
        const getPercentile = (p) => {
            const index = Math.ceil(count * p / 100) - 1;
            return responseTimes[Math.max(0, index)];
        };
        
        return {
            count,
            avg: parseFloat(avg.toFixed(2)),
            min: parseFloat(min.toFixed(2)),
            max: parseFloat(max.toFixed(2)),
            p50: parseFloat(getPercentile(50).toFixed(2)),
            p90: parseFloat(getPercentile(90).toFixed(2)),
            p95: parseFloat(getPercentile(95).toFixed(2)),
            p99: parseFloat(getPercentile(99).toFixed(2))
        };
    }

    calculateMemoryStatistics(memoryData) {
        if (memoryData.length === 0) {
            return { rss: {}, heapUsed: {}, heapTotal: {} };
        }
        
        const calculateStats = (values) => {
            const sorted = values.sort((a, b) => a - b);
            const count = sorted.length;
            const sum = sorted.reduce((a, b) => a + b, 0);
            
            return {
                avg: Math.round(sum / count),
                min: sorted[0],
                max: sorted[count - 1],
                final: values[values.length - 1]
            };
        };
        
        return {
            rss: calculateStats(memoryData.map(m => m.rss)),
            heapUsed: calculateStats(memoryData.map(m => m.heapUsed)),
            heapTotal: calculateStats(memoryData.map(m => m.heapTotal))
        };
    }

    /**
     * 运行优化性能测试
     */
    async runOptimizedPerformanceTest() {
        console.log(colors.rainbow('\n🚀 开始 node-mitmproxy 优化性能测试\n'));
        
        try {
            // 1. 测试优化的直接代理模式
            console.log(colors.cyan('\n第一阶段: 优化直接代理模式测试'));
            await this.startOptimizedProxyServer();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.runOptimizedBatchRequests('optimizedDirect');
            
            // 关闭当前服务器
            if (this.proxyServer) {
                this.proxyServer.close();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // 2. 测试优化的外部代理模式
            console.log(colors.cyan('\n第二阶段: 优化外部代理模式测试'));
            await this.startOptimizedProxyServer({
                externalProxy: 'socks5://192.168.182.100:11080'
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.runOptimizedBatchRequests('optimizedExternal');
            
        } catch (error) {
            console.error(colors.red('\n优化性能测试过程中发生错误:'), error.message);
        } finally {
            // 清理资源
            if (this.proxyServer) {
                this.proxyServer.close();
                console.log(colors.gray('\n代理服务器已关闭'));
            }
            
            // 清理Agent
            this.httpAgent.destroy();
            this.httpsAgent.destroy();
        }
        
        // 生成优化报告
        const optimizedReport = this.generatePerformanceReport();
        
        // 尝试加载原始报告进行对比
        let originalReport = null;
        try {
            const reportFiles = fs.readdirSync(__dirname).filter(f => f.startsWith('performance-report-') && f.endsWith('.json'));
            if (reportFiles.length > 0) {
                const latestReport = reportFiles.sort().pop();
                originalReport = JSON.parse(fs.readFileSync(path.join(__dirname, latestReport), 'utf8'));
            }
        } catch (error) {
            console.log(colors.yellow('无法加载原始报告进行对比'));
        }
        
        const comparisonReport = this.generateOptimizationReport(originalReport);
        
        // 保存和显示报告
        await this.saveOptimizationReport(comparisonReport);
        this.printOptimizationReport(comparisonReport);
        
        return comparisonReport;
    }

    /**
     * 保存优化报告
     */
    async saveOptimizationReport(report) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `optimization-report-${timestamp}.json`;
        const filepath = path.join(__dirname, filename);
        
        try {
            await fs.promises.writeFile(filepath, JSON.stringify(report, null, 2));
            console.log(colors.green(`\n📊 优化报告已保存: ${filename}`));
        } catch (error) {
            console.error(colors.red('保存优化报告失败:'), error.message);
        }
    }

    /**
     * 打印优化报告
     */
    printOptimizationReport(report) {
        console.log(colors.rainbow('\n🎯 性能优化对比报告'));
        console.log('='.repeat(70));
        
        console.log(colors.cyan('\n🔧 优化措施:'));
        report.comparison.optimization.changes.forEach(change => {
            console.log(`  • ${change}`);
        });
        
        if (report.comparison.comparison) {
            Object.entries(report.comparison.comparison).forEach(([testType, comp]) => {
                console.log(colors.cyan(`\n📈 ${testType === 'directProxy' ? '直接代理' : '外部代理'} 优化效果:`));
                
                console.log(colors.green('  QPS (请求/秒):'));
                console.log(`    优化前: ${comp.qps.original}`);
                console.log(`    优化后: ${comp.qps.optimized}`);
                console.log(`    提升: ${comp.qps.improvement}`);
                
                console.log(colors.yellow('  平均响应时间 (ms):'));
                console.log(`    优化前: ${comp.avgResponseTime.original}`);
                console.log(`    优化后: ${comp.avgResponseTime.optimized}`);
                console.log(`    改善: ${comp.avgResponseTime.improvement}`);
                
                console.log(colors.magenta('  P95响应时间 (ms):'));
                console.log(`    优化前: ${comp.p95ResponseTime.original}`);
                console.log(`    优化后: ${comp.p95ResponseTime.optimized}`);
                console.log(`    改善: ${comp.p95ResponseTime.improvement}`);
                
                console.log(colors.blue('  内存使用:'));
                console.log(`    优化前: ${comp.memoryUsage.original}`);
                console.log(`    优化后: ${comp.memoryUsage.optimized}`);
                console.log(`    改善: ${comp.memoryUsage.improvement}`);
            });
        }
        
        console.log('\n' + '='.repeat(70));
        console.log(colors.green.bold('\n✨ 优化测试完成！'));
    }
}

/**
 * 主测试函数
 */
async function main() {
    const tester = new OptimizedMitmproxyTester();
    
    try {
        await tester.runOptimizedPerformanceTest();
    } catch (error) {
        console.error(colors.red('优化性能测试执行失败:'), error);
        process.exit(1);
    }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    main().catch(error => {
        console.error(colors.red('程序异常退出:'), error);
        process.exit(1);
    });
}

module.exports = OptimizedMitmproxyTester;