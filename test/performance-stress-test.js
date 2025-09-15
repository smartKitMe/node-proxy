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
 * node-mitmproxy 性能压力测试脚本
 * 测试内容：
 * 1. 直接代理模式 - 1000次并发请求
 * 2. 外部SOCKS5代理模式 - 1000次并发请求
 * 3. 详细性能指标收集和分析
 * 4. 性能报告生成
 */

class MitmproxyPerformanceTester {
    constructor() {
        this.proxyServer = null;
        this.proxyPort = 8888;
        this.testConfig = {
            requestCount: 1000,
            concurrency: 50, // 并发数
            targetUrl: 'https://www.baidu.com/',
            timeout: 15000
        };
        
        this.performanceData = {
            directProxy: {
                requests: [],
                errors: [],
                startTime: 0,
                endTime: 0,
                memoryUsage: []
            },
            externalProxy: {
                requests: [],
                errors: [],
                startTime: 0,
                endTime: 0,
                memoryUsage: []
            }
        };
        
        this.systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            nodeVersion: process.version
        };
    }

    /**
     * 启动 mitmproxy 代理服务器（性能优化版本）
     * @param {Object} options - 代理服务器配置选项
     * @returns {Promise<boolean>} 启动是否成功
     */
    async startProxyServer(options = {}) {
        return new Promise((resolve, reject) => {
            try {
                console.log(colors.cyan('\n=== 启动 node-mitmproxy 代理服务器（性能测试模式）==='));
                
                const defaultOptions = {
                    port: this.proxyPort,
                    enablePerformanceMetrics: true,
                    // 性能测试模式下减少日志输出
                    requestInterceptor: this.createMinimalRequestInterceptor(),
                    responseInterceptor: this.createMinimalResponseInterceptor(),
                    sslConnectInterceptor: this.createMinimalSSLConnectInterceptor(),
                    ...options
                };

                this.proxyServer = mitmproxy.createProxy(defaultOptions);
                
                this.proxyServer.listen(this.proxyPort, () => {
                    console.log(colors.green(`✓ 代理服务器启动成功，端口: ${this.proxyPort}`));
                    resolve(true);
                });

                this.proxyServer.on('error', (error) => {
                    console.error(colors.red('✗ 代理服务器启动失败:'), error.message);
                    reject(error);
                });

            } catch (error) {
                console.error(colors.red('✗ 创建代理服务器失败:'), error.message);
                reject(error);
            }
        });
    }

    /**
     * 创建最小化请求拦截器（减少性能开销）
     */
    createMinimalRequestInterceptor() {
        return (rOptions, req, res, ssl, next) => {
            // 只添加必要的测试标识，减少日志输出
            rOptions.headers['X-Perf-Test'] = 'true';
            next();
        };
    }

    /**
     * 创建最小化响应拦截器
     */
    createMinimalResponseInterceptor() {
        return (req, res, proxyReq, proxyRes, ssl, next) => {
            // 最小化处理，只添加标识
            proxyRes.headers['X-Perf-Processed'] = 'true';
            next();
        };
    }

    /**
     * 创建最小化 SSL 连接拦截器
     */
    createMinimalSSLConnectInterceptor() {
        return (req, cltSocket, head) => {
            return true;
        };
    }

    /**
     * 执行单个代理请求（性能优化版本）
     * @param {string} targetUrl - 目标 URL
     * @param {number} requestId - 请求ID
     * @returns {Promise<Object>} 请求结果
     */
    async makeSingleProxyRequest(targetUrl, requestId) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const url = new URL(targetUrl);
            const port = url.port || 443;
            
            // 建立 CONNECT 隧道
            const connectOptions = {
                hostname: '127.0.0.1',
                port: this.proxyPort,
                method: 'CONNECT',
                path: `${url.hostname}:${port}`,
                headers: {
                    'Host': `${url.hostname}:${port}`,
                    'User-Agent': 'PerfTest/1.0'
                }
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
                            'User-Agent': 'PerfTest/1.0',
                            'Connection': 'close'
                        },
                        rejectUnauthorized: false
                    };

                    const httpsReq = https.request(httpsOptions, (httpsRes) => {
                        const endTime = performance.now();
                        const responseTime = endTime - startTime;
                        
                        let dataLength = 0;
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
                                timestamp: Date.now()
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
     * 执行批量并发请求测试
     * @param {string} testType - 测试类型 ('directProxy' 或 'externalProxy')
     * @returns {Promise<Object>} 测试结果
     */
    async runBatchRequests(testType) {
        console.log(colors.cyan(`\n=== 开始 ${testType} 模式性能测试 ===`));
        console.log(`请求总数: ${this.testConfig.requestCount}`);
        console.log(`并发数: ${this.testConfig.concurrency}`);
        console.log(`目标URL: ${this.testConfig.targetUrl}`);
        
        const data = this.performanceData[testType];
        data.startTime = performance.now();
        
        // 开始内存监控
        const memoryMonitor = setInterval(() => {
            const memUsage = process.memoryUsage();
            data.memoryUsage.push({
                timestamp: Date.now(),
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external
            });
        }, 100); // 每100ms记录一次内存使用
        
        try {
            // 分批执行请求以控制并发数
            const batches = [];
            for (let i = 0; i < this.testConfig.requestCount; i += this.testConfig.concurrency) {
                const batchSize = Math.min(this.testConfig.concurrency, this.testConfig.requestCount - i);
                const batch = [];
                
                for (let j = 0; j < batchSize; j++) {
                    const requestId = i + j + 1;
                    batch.push(this.makeSingleProxyRequest(this.testConfig.targetUrl, requestId));
                }
                
                batches.push(batch);
            }
            
            // 执行所有批次
            let completedRequests = 0;
            for (const batch of batches) {
                const results = await Promise.all(batch);
                
                results.forEach(result => {
                    if (result.success) {
                        data.requests.push(result);
                    } else {
                        data.errors.push(result);
                    }
                });
                
                completedRequests += results.length;
                
                // 显示进度
                const progress = ((completedRequests / this.testConfig.requestCount) * 100).toFixed(1);
                process.stdout.write(`\r进度: ${progress}% (${completedRequests}/${this.testConfig.requestCount})`);
                
                // 批次间短暂延迟，避免过度压力
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            console.log(''); // 换行
            
        } finally {
            clearInterval(memoryMonitor);
            data.endTime = performance.now();
        }
        
        const totalTime = data.endTime - data.startTime;
        const successCount = data.requests.length;
        const errorCount = data.errors.length;
        const successRate = (successCount / this.testConfig.requestCount * 100).toFixed(2);
        
        console.log(colors.green(`\n✓ ${testType} 测试完成`));
        console.log(`总耗时: ${(totalTime / 1000).toFixed(2)} 秒`);
        console.log(`成功请求: ${successCount}`);
        console.log(`失败请求: ${errorCount}`);
        console.log(`成功率: ${successRate}%`);
        
        return {
            testType,
            totalTime,
            successCount,
            errorCount,
            successRate: parseFloat(successRate)
        };
    }

    /**
     * 计算性能统计数据
     * @param {Array} requests - 请求数据数组
     * @returns {Object} 统计结果
     */
    calculateStatistics(requests) {
        if (requests.length === 0) {
            return {
                count: 0,
                avg: 0,
                min: 0,
                max: 0,
                p50: 0,
                p90: 0,
                p95: 0,
                p99: 0
            };
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

    /**
     * 计算内存使用统计
     * @param {Array} memoryData - 内存使用数据
     * @returns {Object} 内存统计
     */
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
     * 生成性能报告
     * @returns {Object} 完整的性能报告
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
        
        // 处理每种测试类型的数据
        ['directProxy', 'externalProxy'].forEach(testType => {
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
                    errors: data.errors.reduce((acc, error) => {
                        acc[error.error] = (acc[error.error] || 0) + 1;
                        return acc;
                    }, {})
                };
            }
        });
        
        return report;
    }

    /**
     * 保存性能报告到文件
     * @param {Object} report - 性能报告
     */
    async savePerformanceReport(report) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `performance-report-${timestamp}.json`;
        const filepath = path.join(__dirname, filename);
        
        try {
            await fs.promises.writeFile(filepath, JSON.stringify(report, null, 2));
            console.log(colors.green(`\n📊 性能报告已保存: ${filename}`));
        } catch (error) {
            console.error(colors.red('保存报告失败:'), error.message);
        }
    }

    /**
     * 打印性能报告摘要
     * @param {Object} report - 性能报告
     */
    printPerformanceReport(report) {
        console.log(colors.rainbow('\n📈 性能测试报告摘要'));
        console.log('='.repeat(60));
        
        console.log(colors.cyan('\n🖥️  系统信息:'));
        console.log(`平台: ${report.testInfo.systemInfo.platform} ${report.testInfo.systemInfo.arch}`);
        console.log(`CPU核心数: ${report.testInfo.systemInfo.cpus}`);
        console.log(`总内存: ${(report.testInfo.systemInfo.totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
        console.log(`Node.js版本: ${report.testInfo.systemInfo.nodeVersion}`);
        
        console.log(colors.cyan('\n⚙️  测试配置:'));
        console.log(`请求总数: ${report.testInfo.testConfig.requestCount}`);
        console.log(`并发数: ${report.testInfo.testConfig.concurrency}`);
        console.log(`目标URL: ${report.testInfo.testConfig.targetUrl}`);
        
        Object.entries(report.results).forEach(([testType, result]) => {
            console.log(colors.cyan(`\n📊 ${testType === 'directProxy' ? '直接代理' : '外部代理'} 测试结果:`));
            
            const summary = result.summary;
            console.log(`总请求数: ${summary.totalRequests}`);
            console.log(`成功请求: ${summary.successfulRequests}`);
            console.log(`失败请求: ${summary.failedRequests}`);
            console.log(`成功率: ${summary.successRate}%`);
            console.log(`总耗时: ${summary.totalTime} 秒`);
            console.log(`QPS: ${summary.requestsPerSecond} 请求/秒`);
            
            const rt = result.responseTime;
            console.log(colors.yellow('\n⏱️  响应时间统计 (ms):'));
            console.log(`平均值: ${rt.avg}`);
            console.log(`最小值: ${rt.min}`);
            console.log(`最大值: ${rt.max}`);
            console.log(`P50: ${rt.p50}`);
            console.log(`P90: ${rt.p90}`);
            console.log(`P95: ${rt.p95}`);
            console.log(`P99: ${rt.p99}`);
            
            const mem = result.memory;
            console.log(colors.magenta('\n💾 内存使用统计:'));
            console.log(`RSS - 平均: ${(mem.rss.avg / 1024 / 1024).toFixed(2)} MB, 峰值: ${(mem.rss.max / 1024 / 1024).toFixed(2)} MB`);
            console.log(`堆内存 - 平均: ${(mem.heapUsed.avg / 1024 / 1024).toFixed(2)} MB, 峰值: ${(mem.heapUsed.max / 1024 / 1024).toFixed(2)} MB`);
            
            if (Object.keys(result.errors).length > 0) {
                console.log(colors.red('\n❌ 错误统计:'));
                Object.entries(result.errors).forEach(([error, count]) => {
                    console.log(`${error}: ${count} 次`);
                });
            }
        });
        
        console.log('\n' + '='.repeat(60));
    }

    /**
     * 运行完整的性能测试
     */
    async runPerformanceTest() {
        console.log(colors.rainbow('\n🚀 开始 node-mitmproxy 性能压力测试\n'));
        
        try {
            // 1. 测试直接代理模式
            console.log(colors.cyan('\n第一阶段: 直接代理模式测试'));
            await this.startProxyServer();
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.runBatchRequests('directProxy');
            
            // 关闭当前服务器
            if (this.proxyServer) {
                this.proxyServer.close();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // 2. 测试外部代理模式
            console.log(colors.cyan('\n第二阶段: 外部代理模式测试'));
            await this.startProxyServer({
                externalProxy: 'socks5://192.168.182.100:11080'
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.runBatchRequests('externalProxy');
            
        } catch (error) {
            console.error(colors.red('\n性能测试过程中发生错误:'), error.message);
        } finally {
            // 清理资源
            if (this.proxyServer) {
                this.proxyServer.close();
                console.log(colors.gray('\n代理服务器已关闭'));
            }
        }
        
        // 生成和显示报告
        const report = this.generatePerformanceReport();
        this.printPerformanceReport(report);
        await this.savePerformanceReport(report);
        
        return report;
    }
}

/**
 * 主测试函数
 */
async function main() {
    const tester = new MitmproxyPerformanceTester();
    
    try {
        await tester.runPerformanceTest();
    } catch (error) {
        console.error(colors.red('性能测试执行失败:'), error);
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

module.exports = MitmproxyPerformanceTester;