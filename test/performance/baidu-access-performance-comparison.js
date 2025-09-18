const { NodeMITMProxy } = require('../../src/index');
const https = require('https');
const http = require('http');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

/**
 * 百度访问性能对比测试
 * 对比三种访问方式的性能差异：
 * 1. 直接访问 www.baidu.com
 * 2. HTTPS直接代理访问 www.baidu.com
 * 3. HTTPS代理修改转发访问 www.baidu.com
 */

class BaiduAccessPerformanceComparison {
    constructor() {
        this.testResults = {
            direct: [],
            httpsProxy: [],
            httpsModifyProxy: []
        };
        
        this.logger = {
            info: (msg) => console.log(`[INFO] ${msg}`),
            error: (msg) => console.error(`[ERROR] ${msg}`),
            debug: (msg) => console.log(`[DEBUG] ${msg}`)
        };
    }

    /**
     * 直接访问百度
     */
    async directAccess(url, count = 500) {
        this.logger.info(`开始直接访问测试: ${url}, 次数: ${count}`);
        
        const results = [];
        
        for (let i = 0; i < count; i++) {
            const startTime = performance.now();
            
            try {
                const result = await this.makeDirectRequest(url);
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                results.push({
                    success: result.success,
                    duration: duration,
                    statusCode: result.statusCode,
                    timestamp: startTime
                });
                
                // 每100次输出一次进度
                if ((i + 1) % 100 === 0) {
                    this.logger.info(`直接访问进度: ${i + 1}/${count}`);
                }
            } catch (error) {
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                results.push({
                    success: false,
                    duration: duration,
                    error: error.message,
                    timestamp: startTime
                });
            }
        }
        
        return results;
    }

    /**
     * 发送直接请求
     */
    makeDirectRequest(url) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
            
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('请求超时'));
            });
            
            req.end();
        });
    }

    /**
     * 启动HTTPS直接代理
     */
    async startHttpsProxy() {
        this.logger.info('启动HTTPS直接代理服务器');
        
        const proxy = new NodeMITMProxy({
            config: {
                port: 8080,
                host: 'localhost',
                ssl: {
                    // 使用自签名证书
                    certPath: path.join(__dirname, '../test-certs/cert.pem'),
                    keyPath: path.join(__dirname, '../test-certs/key.pem')
                }
            },
            logger: {
                level: 'error' // 减少日志输出
            }
        });
        
        await proxy.initialize();
        await proxy.start(8080, 'localhost');
        
        return proxy;
    }

    /**
     * HTTPS代理访问百度
     */
    async httpsProxyAccess(url, count = 500) {
        this.logger.info(`开始HTTPS代理访问测试: ${url}, 次数: ${count}`);
        
        // 启动代理服务器
        const proxy = await this.startHttpsProxy();
        
        const results = [];
        
        for (let i = 0; i < count; i++) {
            const startTime = performance.now();
            
            try {
                const result = await this.makeProxyRequest(url, 8080);
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                results.push({
                    success: result.success,
                    duration: duration,
                    statusCode: result.statusCode,
                    timestamp: startTime
                });
                
                // 每100次输出一次进度
                if ((i + 1) % 100 === 0) {
                    this.logger.info(`HTTPS代理访问进度: ${i + 1}/${count}`);
                }
            } catch (error) {
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                results.push({
                    success: false,
                    duration: duration,
                    error: error.message,
                    timestamp: startTime
                });
            }
        }
        
        // 关闭代理服务器
        await proxy.stop();
        
        return results;
    }

    /**
     * 启动HTTPS修改转发代理
     */
    async startHttpsModifyProxy() {
        this.logger.info('启动HTTPS修改转发代理服务器');
        
        const proxy = new NodeMITMProxy({
            config: {
                port: 8081,
                host: 'localhost',
                ssl: {
                    // 使用自签名证书
                    certPath: path.join(__dirname, '../test-certs/cert.pem'),
                    keyPath: path.join(__dirname, '../test-certs/key.pem')
                }
            },
            logger: {
                level: 'error' // 减少日志输出
            }
        });
        
        // 添加修改请求的拦截器
        proxy.intercept({
            id: 'modify-request',
            priority: 100,
            async request(ctx) {
                // 修改User-Agent
                ctx.requestOptions.headers['User-Agent'] = 'Modified-User-Agent/1.0';
                // 添加自定义头部
                ctx.requestOptions.headers['X-Proxy-Modified'] = 'true';
                return ctx;
            }
        });
        
        await proxy.initialize();
        await proxy.start(8081, 'localhost');
        
        return proxy;
    }

    /**
     * HTTPS代理修改转发访问百度
     */
    async httpsModifyProxyAccess(url, count = 500) {
        this.logger.info(`开始HTTPS修改转发代理访问测试: ${url}, 次数: ${count}`);
        
        // 启动代理服务器
        const proxy = await this.startHttpsModifyProxy();
        
        const results = [];
        
        for (let i = 0; i < count; i++) {
            const startTime = performance.now();
            
            try {
                const result = await this.makeProxyRequest(url, 8081);
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                results.push({
                    success: result.success,
                    duration: duration,
                    statusCode: result.statusCode,
                    timestamp: startTime
                });
                
                // 每100次输出一次进度
                if ((i + 1) % 100 === 0) {
                    this.logger.info(`HTTPS修改转发代理访问进度: ${i + 1}/${count}`);
                }
            } catch (error) {
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                results.push({
                    success: false,
                    duration: duration,
                    error: error.message,
                    timestamp: startTime
                });
            }
        }
        
        // 关闭代理服务器
        await proxy.stop();
        
        return results;
    }

    /**
     * 发送代理请求
     */
    makeProxyRequest(url, proxyPort) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            
            const options = {
                hostname: 'localhost',
                port: proxyPort,
                path: url,
                method: 'GET',
                headers: {
                    'Host': parsedUrl.hostname,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
            
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('请求超时'));
            });
            
            req.end();
        });
    }

    /**
     * 分析测试结果
     */
    analyzeResults(results) {
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
                successRate: 0
            };
        }
        
        const durations = successfulRequests.map(r => r.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const minDuration = Math.min(...durations);
        const maxDuration = Math.max(...durations);
        
        return {
            total: results.length,
            success: successfulRequests.length,
            failed: failedRequests.length,
            avgDuration: parseFloat(avgDuration.toFixed(2)),
            minDuration: parseFloat(minDuration.toFixed(2)),
            maxDuration: parseFloat(maxDuration.toFixed(2)),
            successRate: parseFloat(((successfulRequests.length / results.length) * 100).toFixed(2))
        };
    }

    /**
     * 生成性能报告
     */
    generateReport() {
        const directAnalysis = this.analyzeResults(this.testResults.direct);
        const httpsProxyAnalysis = this.analyzeResults(this.testResults.httpsProxy);
        const httpsModifyProxyAnalysis = this.analyzeResults(this.testResults.httpsModifyProxy);
        
        const report = {
            timestamp: new Date().toISOString(),
            testUrl: 'https://www.baidu.com',
            testCount: 500,
            direct: directAnalysis,
            httpsProxy: httpsProxyAnalysis,
            httpsModifyProxy: httpsModifyProxyAnalysis,
            comparison: {
                // 计算性能差异
                directVsHttpsProxy: {
                    durationDiff: parseFloat((httpsProxyAnalysis.avgDuration - directAnalysis.avgDuration).toFixed(2)),
                    durationDiffPercent: directAnalysis.avgDuration > 0 ? 
                        parseFloat(((httpsProxyAnalysis.avgDuration - directAnalysis.avgDuration) / directAnalysis.avgDuration * 100).toFixed(2)) : 0,
                    successRateDiff: parseFloat((httpsProxyAnalysis.successRate - directAnalysis.successRate).toFixed(2))
                },
                directVsHttpsModifyProxy: {
                    durationDiff: parseFloat((httpsModifyProxyAnalysis.avgDuration - directAnalysis.avgDuration).toFixed(2)),
                    durationDiffPercent: directAnalysis.avgDuration > 0 ? 
                        parseFloat(((httpsModifyProxyAnalysis.avgDuration - directAnalysis.avgDuration) / directAnalysis.avgDuration * 100).toFixed(2)) : 0,
                    successRateDiff: parseFloat((httpsModifyProxyAnalysis.successRate - directAnalysis.successRate).toFixed(2))
                },
                httpsProxyVsHttpsModifyProxy: {
                    durationDiff: parseFloat((httpsModifyProxyAnalysis.avgDuration - httpsProxyAnalysis.avgDuration).toFixed(2)),
                    durationDiffPercent: httpsProxyAnalysis.avgDuration > 0 ? 
                        parseFloat(((httpsModifyProxyAnalysis.avgDuration - httpsProxyAnalysis.avgDuration) / httpsProxyAnalysis.avgDuration * 100).toFixed(2)) : 0,
                    successRateDiff: parseFloat((httpsModifyProxyAnalysis.successRate - httpsProxyAnalysis.successRate).toFixed(2))
                }
            }
        };
        
        return report;
    }

    /**
     * 打印报告
     */
    printReport(report) {
        console.log('\n=== 百度访问性能对比测试报告 ===\n');
        
        console.log(`测试时间: ${report.timestamp}`);
        console.log(`测试URL: ${report.testUrl}`);
        console.log(`测试次数: ${report.testCount}\n`);
        
        console.log('1. 直接访问性能:');
        console.log(`   成功次数: ${report.direct.success}/${report.direct.total}`);
        console.log(`   成功率: ${report.direct.successRate}%`);
        console.log(`   平均耗时: ${report.direct.avgDuration}ms`);
        console.log(`   最小耗时: ${report.direct.minDuration}ms`);
        console.log(`   最大耗时: ${report.direct.maxDuration}ms\n`);
        
        console.log('2. HTTPS直接代理访问性能:');
        console.log(`   成功次数: ${report.httpsProxy.success}/${report.httpsProxy.total}`);
        console.log(`   成功率: ${report.httpsProxy.successRate}%`);
        console.log(`   平均耗时: ${report.httpsProxy.avgDuration}ms`);
        console.log(`   最小耗时: ${report.httpsProxy.minDuration}ms`);
        console.log(`   最大耗时: ${report.httpsProxy.maxDuration}ms\n`);
        
        console.log('3. HTTPS代理修改转发访问性能:');
        console.log(`   成功次数: ${report.httpsModifyProxy.success}/${report.httpsModifyProxy.total}`);
        console.log(`   成功率: ${report.httpsModifyProxy.successRate}%`);
        console.log(`   平均耗时: ${report.httpsModifyProxy.avgDuration}ms`);
        console.log(`   最小耗时: ${report.httpsModifyProxy.minDuration}ms`);
        console.log(`   最大耗时: ${report.httpsModifyProxy.maxDuration}ms\n`);
        
        console.log('4. 性能对比分析:');
        console.log('   直接访问 vs HTTPS直接代理:');
        console.log(`     耗时差异: ${report.comparison.directVsHttpsProxy.durationDiff}ms`);
        console.log(`     耗时差异百分比: ${report.comparison.directVsHttpsProxy.durationDiffPercent}%`);
        console.log(`     成功率差异: ${report.comparison.directVsHttpsProxy.successRateDiff}%\n`);
        
        console.log('   直接访问 vs HTTPS修改转发代理:');
        console.log(`     耗时差异: ${report.comparison.directVsHttpsModifyProxy.durationDiff}ms`);
        console.log(`     耗时差异百分比: ${report.comparison.directVsHttpsModifyProxy.durationDiffPercent}%`);
        console.log(`     成功率差异: ${report.comparison.directVsHttpsModifyProxy.successRateDiff}%\n`);
        
        console.log('   HTTPS直接代理 vs HTTPS修改转发代理:');
        console.log(`     耗时差异: ${report.comparison.httpsProxyVsHttpsModifyProxy.durationDiff}ms`);
        console.log(`     耗时差异百分比: ${report.comparison.httpsProxyVsHttpsModifyProxy.durationDiffPercent}%`);
        console.log(`     成功率差异: ${report.comparison.httpsProxyVsHttpsModifyProxy.successRateDiff}%\n`);
        
        // 性能优化建议
        console.log('5. 性能优化建议:');
        if (report.comparison.directVsHttpsProxy.durationDiffPercent > 10) {
            console.log('   - HTTPS直接代理相比直接访问性能下降超过10%，建议优化代理处理逻辑');
        }
        
        if (report.comparison.directVsHttpsModifyProxy.durationDiffPercent > 15) {
            console.log('   - HTTPS修改转发代理相比直接访问性能下降超过15%，建议优化拦截器处理逻辑');
        }
        
        if (report.comparison.httpsProxyVsHttpsModifyProxy.durationDiffPercent > 5) {
            console.log('   - 修改转发代理相比直接代理性能下降超过5%，建议优化拦截器性能');
        }
        
        if (report.direct.successRate < 95 || report.httpsProxy.successRate < 95 || report.httpsModifyProxy.successRate < 95) {
            console.log('   - 存在请求失败情况，建议检查网络连接和服务器稳定性');
        }
        
        console.log('\n=== 测试报告结束 ===\n');
    }

    /**
     * 保存报告到文件
     */
    saveReportToFile(report) {
        const fileName = `performance-report-${new Date().getTime()}.json`;
        const filePath = path.join(__dirname, fileName);
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
            this.logger.info(`性能报告已保存到: ${filePath}`);
        } catch (error) {
            this.logger.error(`保存性能报告失败: ${error.message}`);
        }
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        try {
            this.logger.info('开始百度访问性能对比测试');
            
            // 1. 直接访问测试
            this.testResults.direct = await this.directAccess('https://www.baidu.com', 500);
            
            // 等待一段时间避免服务器限制
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 2. HTTPS直接代理访问测试
            this.testResults.httpsProxy = await this.httpsProxyAccess('https://www.baidu.com', 500);
            
            // 等待一段时间避免服务器限制
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 3. HTTPS代理修改转发访问测试
            this.testResults.httpsModifyProxy = await this.httpsModifyProxyAccess('https://www.baidu.com', 500);
            
            // 生成并打印报告
            const report = this.generateReport();
            this.printReport(report);
            
            // 保存报告到文件
            this.saveReportToFile(report);
            
            this.logger.info('百度访问性能对比测试完成');
            
        } catch (error) {
            this.logger.error(`测试执行失败: ${error.message}`);
            console.error(error.stack);
        }
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const test = new BaiduAccessPerformanceComparison();
    test.runAllTests().catch(console.error);
}

module.exports = BaiduAccessPerformanceComparison;