/**
 * Node Proxy 性能监控测试
 * 基于 test-cases-performance-monitoring.md 文档
 */

const { expect } = require('chai');
const http = require('http');
const https = require('https');
const EventEmitter = require('events');

// 模拟 NodeMITMProxy 类（实际使用时应该导入真实的类）
class MockNodeMITMProxy extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.performanceData = [];
        this.isRunning = false;
        this.metrics = {
            requestCount: 0,
            responseTime: [],
            throughput: 0,
            errorRate: 0,
            connectionCount: 0,
            memoryUsage: 0,
            cpuUsage: 0
        };
        this.metricsInterval = null;
    }

    async initialize() {
        await TestUtils.delay(100);
    }

    async start() {
        this.isRunning = true;
        
        // 启动性能指标收集
        if (this.config.performance && this.config.performance.enabled) {
            this.startMetricsCollection();
        }
        
        await TestUtils.delay(100);
    }

    async stop() {
        this.isRunning = false;
        
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        
        await TestUtils.delay(100);
    }

    startMetricsCollection() {
        const interval = this.config.performance.collection?.interval || 1000;
        
        this.metricsInterval = setInterval(() => {
            const currentMetrics = this.collectCurrentMetrics();
            this.performanceData.push({
                timestamp: Date.now(),
                ...currentMetrics
            });
            
            this.emit('performanceMetrics', currentMetrics);
        }, interval);
    }

    collectCurrentMetrics() {
        // 模拟性能指标收集
        const memUsage = process.memoryUsage();
        
        return {
            requestCount: this.metrics.requestCount,
            avgResponseTime: this.calculateAverageResponseTime(),
            throughput: this.calculateThroughput(),
            errorRate: this.calculateErrorRate(),
            connectionCount: Math.floor(Math.random() * 50) + 10,
            memoryUsage: memUsage.heapUsed,
            cpuUsage: Math.random() * 20 + 5 // 模拟5-25%的CPU使用率
        };
    }

    calculateAverageResponseTime() {
        if (this.metrics.responseTime.length === 0) return 0;
        const sum = this.metrics.responseTime.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.metrics.responseTime.length);
    }

    calculateThroughput() {
        // 简化的吞吐量计算
        return Math.floor(this.metrics.requestCount / 10);
    }

    calculateErrorRate() {
        // 模拟错误率
        return Math.random() * 5; // 0-5%的错误率
    }

    async getPerformanceHistory() {
        return this.performanceData.slice();
    }

    async getPerformanceReport() {
        const history = await this.getPerformanceHistory();
        
        if (history.length === 0) {
            return null;
        }
        
        return {
            summary: {
                totalRequests: Math.max(...history.map(h => h.requestCount)),
                avgResponseTime: this.calculateAverageFromHistory(history, 'avgResponseTime'),
                maxThroughput: Math.max(...history.map(h => h.throughput)),
                avgErrorRate: this.calculateAverageFromHistory(history, 'errorRate'),
                peakMemoryUsage: Math.max(...history.map(h => h.memoryUsage)),
                avgCpuUsage: this.calculateAverageFromHistory(history, 'cpuUsage')
            },
            trends: this.analyzeTrends(history),
            recommendations: this.generateRecommendations(history)
        };
    }

    calculateAverageFromHistory(history, field) {
        const values = history.map(h => h[field]).filter(v => v !== undefined);
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    analyzeTrends(history) {
        if (history.length < 2) return {};
        
        const first = history[0];
        const last = history[history.length - 1];
        
        return {
            responseTime: this.calculateTrend(first.avgResponseTime, last.avgResponseTime),
            throughput: this.calculateTrend(first.throughput, last.throughput),
            errorRate: this.calculateTrend(first.errorRate, last.errorRate),
            memoryUsage: this.calculateTrend(first.memoryUsage, last.memoryUsage),
            cpuUsage: this.calculateTrend(first.cpuUsage, last.cpuUsage)
        };
    }

    calculateTrend(start, end) {
        if (start === 0) return 'stable';
        const change = ((end - start) / start) * 100;
        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    generateRecommendations(history) {
        const recommendations = [];
        const latest = history[history.length - 1];
        
        if (latest.avgResponseTime > 1000) {
            recommendations.push('响应时间较高，建议优化后端服务或增加缓存');
        }
        
        if (latest.errorRate > 5) {
            recommendations.push('错误率较高，建议检查服务稳定性');
        }
        
        if (latest.memoryUsage > 500 * 1024 * 1024) { // 500MB
            recommendations.push('内存使用量较高，建议检查内存泄漏');
        }
        
        if (latest.cpuUsage > 80) {
            recommendations.push('CPU使用率较高，建议优化处理逻辑或扩容');
        }
        
        return recommendations;
    }

    // 模拟请求处理
    simulateRequest(responseTime = null) {
        this.metrics.requestCount++;
        const time = responseTime || (Math.random() * 500 + 100); // 100-600ms
        this.metrics.responseTime.push(time);
        
        // 保持最近100个响应时间记录
        if (this.metrics.responseTime.length > 100) {
            this.metrics.responseTime.shift();
        }
    }
}

describe('性能监控测试', function() {
    this.timeout(TEST_CONFIG.timeouts.long);
    
    let proxy;
    let testServers = [];
    
    beforeEach(async function() {
        // 创建测试目标服务器
        testServers = await Promise.all([
            createPerformanceTestServer(portManager.getAvailablePort('target'), 'fast-server', 50),
            createPerformanceTestServer(portManager.getAvailablePort('target'), 'slow-server', 500),
            createPerformanceTestServer(portManager.getAvailablePort('target'), 'error-server', 100, 0.1)
        ]);
    });
    
    afterEach(async function() {
        if (proxy) {
            await proxy.stop();
        }
        
        await Promise.all(testServers.map(server => 
            new Promise(resolve => server.close(resolve))
        ));
        
        testServers = [];
    });

    describe('TC-PERF-001: 基础性能指标收集测试', function() {
        it('应该正确收集基础性能指标', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            const httpsPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    httpsPort: httpsPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    metrics: {
                        requestCount: true,
                        responseTime: true,
                        throughput: true,
                        errorRate: true,
                        connectionCount: true,
                        memoryUsage: true,
                        cpuUsage: true
                    },
                    collection: {
                        interval: 500, // 0.5秒收集间隔
                        retention: 30000, // 30秒数据保留
                        aggregation: 'average'
                    }
                }
            });
            
            const performanceData = [];
            
            // 监听性能指标事件
            proxy.on('performanceMetrics', (metrics) => {
                performanceData.push({
                    timestamp: Date.now(),
                    ...metrics
                });
            });
            
            await proxy.initialize();
            await proxy.start();
            
            // 模拟请求负载
            for (let i = 0; i < 50; i++) {
                proxy.simulateRequest(Math.random() * 300 + 100);
                await TestUtils.delay(10);
            }
            
            // 等待性能数据收集
            await TestUtils.delay(2000);
            
            // 验证性能指标
            expect(performanceData).to.have.length.at.least(3);
            
            const latestMetrics = performanceData[performanceData.length - 1];
            expect(latestMetrics).to.have.property('requestCount');
            expect(latestMetrics).to.have.property('avgResponseTime');
            expect(latestMetrics).to.have.property('throughput');
            expect(latestMetrics).to.have.property('errorRate');
            expect(latestMetrics).to.have.property('connectionCount');
            expect(latestMetrics).to.have.property('memoryUsage');
            expect(latestMetrics).to.have.property('cpuUsage');
            
            // 验证指标合理性
            expect(latestMetrics.requestCount).to.be.at.least(50);
            expect(latestMetrics.avgResponseTime).to.be.within(50, 500);
            expect(latestMetrics.errorRate).to.be.within(0, 10);
            expect(latestMetrics.memoryUsage).to.be.above(0);
            expect(latestMetrics.cpuUsage).to.be.within(0, 100);
        });

        it('应该正确保存和检索性能历史数据', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    collection: {
                        interval: 200,
                        retention: 10000
                    }
                }
            });
            
            await proxy.initialize();
            await proxy.start();
            
            // 模拟一些请求
            for (let i = 0; i < 20; i++) {
                proxy.simulateRequest();
            }
            
            // 等待数据收集
            await TestUtils.delay(1000);
            
            const historyData = await proxy.getPerformanceHistory();
            
            expect(historyData).to.be.an('array');
            expect(historyData).to.have.length.at.least(3);
            
            // 验证历史数据结构
            historyData.forEach(record => {
                expect(record).to.have.property('timestamp');
                expect(record).to.have.property('requestCount');
                expect(record).to.have.property('avgResponseTime');
                expect(record.timestamp).to.be.a('number');
            });
            
            // 验证时间顺序
            for (let i = 1; i < historyData.length; i++) {
                expect(historyData[i].timestamp).to.be.at.least(historyData[i-1].timestamp);
            }
        });
    });

    describe('TC-PERF-002: 性能报告生成测试', function() {
        it('应该生成详细的性能报告', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    collection: {
                        interval: 100
                    }
                }
            });
            
            await proxy.initialize();
            await proxy.start();
            
            // 模拟不同类型的请求
            for (let i = 0; i < 30; i++) {
                if (i % 10 === 0) {
                    proxy.simulateRequest(800); // 慢请求
                } else {
                    proxy.simulateRequest(150); // 快请求
                }
            }
            
            // 等待数据收集
            await TestUtils.delay(1500);
            
            const report = await proxy.getPerformanceReport();
            
            expect(report).to.be.an('object');
            expect(report).to.have.property('summary');
            expect(report).to.have.property('trends');
            expect(report).to.have.property('recommendations');
            
            // 验证摘要信息
            const summary = report.summary;
            expect(summary).to.have.property('totalRequests');
            expect(summary).to.have.property('avgResponseTime');
            expect(summary).to.have.property('maxThroughput');
            expect(summary).to.have.property('avgErrorRate');
            expect(summary).to.have.property('peakMemoryUsage');
            expect(summary).to.have.property('avgCpuUsage');
            
            expect(summary.totalRequests).to.be.at.least(30);
            expect(summary.avgResponseTime).to.be.above(0);
            
            // 验证趋势分析
            const trends = report.trends;
            expect(trends).to.be.an('object');
            expect(trends).to.have.property('responseTime');
            expect(trends).to.have.property('throughput');
            expect(trends).to.have.property('errorRate');
            
            // 验证建议
            expect(report.recommendations).to.be.an('array');
        });

        it('应该根据性能数据生成合理的建议', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    collection: {
                        interval: 100
                    }
                }
            });
            
            await proxy.initialize();
            await proxy.start();
            
            // 模拟高响应时间的请求
            for (let i = 0; i < 20; i++) {
                proxy.simulateRequest(1500); // 高响应时间
            }
            
            await TestUtils.delay(1000);
            
            const report = await proxy.getPerformanceReport();
            const recommendations = report.recommendations;
            
            expect(recommendations).to.be.an('array');
            
            // 应该包含关于响应时间的建议
            const responseTimeRecommendation = recommendations.find(r => 
                r.includes('响应时间') || r.includes('response time')
            );
            expect(responseTimeRecommendation).to.exist;
        });
    });

    describe('TC-PERF-003: 负载测试', function() {
        it('应该在高并发下正常收集性能指标', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    collection: {
                        interval: 200
                    }
                }
            });
            
            await proxy.initialize();
            await proxy.start();
            
            const performanceData = [];
            proxy.on('performanceMetrics', (metrics) => {
                performanceData.push(metrics);
            });
            
            // 模拟高并发请求
            const concurrentRequests = 100;
            const requestPromises = [];
            
            for (let i = 0; i < concurrentRequests; i++) {
                requestPromises.push(
                    new Promise(resolve => {
                        setTimeout(() => {
                            proxy.simulateRequest(Math.random() * 200 + 50);
                            resolve();
                        }, Math.random() * 1000);
                    })
                );
            }
            
            await Promise.all(requestPromises);
            await TestUtils.delay(1000);
            
            // 验证性能数据收集
            expect(performanceData).to.have.length.at.least(3);
            
            const latestMetrics = performanceData[performanceData.length - 1];
            expect(latestMetrics.requestCount).to.be.at.least(concurrentRequests);
            
            // 验证吞吐量计算
            expect(latestMetrics.throughput).to.be.above(0);
        });

        it('应该正确处理性能数据的内存管理', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    collection: {
                        interval: 50,
                        retention: 1000 // 1秒保留期
                    }
                }
            });
            
            await proxy.initialize();
            await proxy.start();
            
            // 生成大量数据
            for (let i = 0; i < 100; i++) {
                proxy.simulateRequest();
                await TestUtils.delay(10);
            }
            
            await TestUtils.delay(2000); // 等待超过保留期
            
            const historyData = await proxy.getPerformanceHistory();
            
            // 验证数据没有无限增长
            expect(historyData.length).to.be.below(50); // 应该有数据清理
        });
    });

    describe('TC-PERF-004: 性能阈值监控', function() {
        it('应该检测性能异常', async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    host: 'localhost'
                },
                performance: {
                    enabled: true,
                    thresholds: {
                        responseTime: 500,
                        errorRate: 5,
                        memoryUsage: 100 * 1024 * 1024 // 100MB
                    }
                }
            });
            
            await proxy.initialize();
            await proxy.start();
            
            // 模拟异常情况
            for (let i = 0; i < 10; i++) {
                proxy.simulateRequest(800); // 超过阈值的响应时间
            }
            
            await TestUtils.delay(1000);
            
            const report = await proxy.getPerformanceReport();
            const recommendations = report.recommendations;
            
            // 应该检测到响应时间异常
            expect(recommendations).to.be.an('array');
            expect(recommendations.length).to.be.above(0);
        });
    });
});

// 辅助函数

async function createPerformanceTestServer(port, name, responseDelay = 100, errorRate = 0) {
    const server = http.createServer((req, res) => {
        // 模拟错误
        if (Math.random() < errorRate) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error', server: name }));
            return;
        }
        
        // 模拟响应延迟
        setTimeout(() => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Server-Name', name);
            res.statusCode = 200;
            res.end(JSON.stringify({ 
                message: 'OK', 
                server: name, 
                timestamp: Date.now(),
                path: req.url 
            }));
        }, responseDelay);
    });
    
    return new Promise((resolve, reject) => {
        server.listen(port, (error) => {
            if (error) {
                reject(error);
            } else {
                server.port = port;
                server.name = name;
                resolve(server);
            }
        });
    });
}

function validatePerformanceMetrics(metrics) {
    const errors = [];
    
    if (typeof metrics.requestCount !== 'number' || metrics.requestCount < 0) {
        errors.push('请求计数无效');
    }
    
    if (typeof metrics.avgResponseTime !== 'number' || metrics.avgResponseTime < 0) {
        errors.push('平均响应时间无效');
    }
    
    if (typeof metrics.throughput !== 'number' || metrics.throughput < 0) {
        errors.push('吞吐量无效');
    }
    
    if (typeof metrics.errorRate !== 'number' || metrics.errorRate < 0 || metrics.errorRate > 100) {
        errors.push('错误率无效');
    }
    
    if (typeof metrics.memoryUsage !== 'number' || metrics.memoryUsage < 0) {
        errors.push('内存使用量无效');
    }
    
    if (typeof metrics.cpuUsage !== 'number' || metrics.cpuUsage < 0 || metrics.cpuUsage > 100) {
        errors.push('CPU使用率无效');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function analyzePerformanceTrend(historyData) {
    if (historyData.length < 2) {
        return { trend: 'insufficient_data' };
    }
    
    const first = historyData[0];
    const last = historyData[historyData.length - 1];
    
    const responseTimeTrend = calculateTrendDirection(
        first.avgResponseTime, 
        last.avgResponseTime
    );
    
    const throughputTrend = calculateTrendDirection(
        first.throughput, 
        last.throughput
    );
    
    return {
        responseTime: responseTimeTrend,
        throughput: throughputTrend,
        dataPoints: historyData.length,
        timeSpan: last.timestamp - first.timestamp
    };
}

function calculateTrendDirection(start, end) {
    if (start === 0) return 'stable';
    
    const change = ((end - start) / start) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
}