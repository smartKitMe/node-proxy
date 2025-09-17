# 性能监控和优化测试用例

## 概述

本文档包含 Node Proxy 性能监控和优化功能的测试用例，涵盖性能指标收集、监控报告、性能优化、资源使用监控等功能。

## 测试环境要求

- Node.js >= 12.0.0
- 系统监控工具（htop, iostat等）
- 负载测试工具（Apache Bench, wrk等）
- 测试端口：8080（HTTP代理），8443（HTTPS代理），8090-8099（目标服务器）
- 充足的系统资源用于性能测试

## 性能指标监控测试

### TC-PERF-001: 基础性能指标收集测试

**测试目标**: 验证代理服务器基础性能指标的收集功能

**前置条件**: 
- 代理服务器正常运行
- 性能监控模块已启用

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');
const https = require('https');

async function testBasicPerformanceMetrics() {
    // 创建测试目标服务器
    const testServers = await Promise.all([
        createTestServer(8091, 'http'),
        createTestServer(8092, 'http'),
        createTestServer(8093, 'https')
    ]);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            httpsPort: 8443,
            host: 'localhost'
        },
        performance: {
            enabled: true,
            metrics: {
                // 启用所有基础指标
                requestCount: true,
                responseTime: true,
                throughput: true,
                errorRate: true,
                connectionCount: true,
                memoryUsage: true,
                cpuUsage: true
            },
            collection: {
                interval: 1000, // 1秒收集间隔
                retention: 300000, // 5分钟数据保留
                aggregation: 'average' // 聚合方式
            }
        },
        logger: {
            level: 'info'
        }
    });
    
    const performanceData = [];
    
    // 监听性能指标事件
    proxy.on('performanceMetrics', (metrics) => {
        performanceData.push({
            timestamp: Date.now(),
            ...metrics
        });
        
        console.log('性能指标:', {
            requestCount: metrics.requestCount,
            avgResponseTime: metrics.avgResponseTime,
            throughput: metrics.throughput,
            errorRate: metrics.errorRate,
            memoryUsage: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
            cpuUsage: `${metrics.cpuUsage.toFixed(2)}%`
        });
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 性能监控代理启动成功');
        
        // 生成测试负载
        console.log('\n=== 生成测试负载 ===');
        await generateTestLoad(100, 5000); // 100个请求，5秒内完成
        
        // 等待性能数据收集
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 验证性能指标
        console.log('\n=== 验证性能指标 ===');
        const latestMetrics = performanceData[performanceData.length - 1];
        
        if (latestMetrics) {
            console.log('最新性能指标:');
            console.log(`  请求总数: ${latestMetrics.requestCount}`);
            console.log(`  平均响应时间: ${latestMetrics.avgResponseTime}ms`);
            console.log(`  吞吐量: ${latestMetrics.throughput} req/s`);
            console.log(`  错误率: ${latestMetrics.errorRate}%`);
            console.log(`  活跃连接数: ${latestMetrics.connectionCount}`);
            console.log(`  内存使用: ${(latestMetrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
            console.log(`  CPU使用率: ${latestMetrics.cpuUsage.toFixed(2)}%`);
            
            // 验证指标合理性
            const validationResults = validatePerformanceMetrics(latestMetrics);
            
            if (validationResults.valid) {
                console.log('✓ 性能指标收集正常');
            } else {
                console.log('✗ 性能指标异常:', validationResults.errors);
            }
        } else {
            console.log('✗ 未收集到性能指标');
        }
        
        // 测试性能历史数据
        console.log('\n=== 测试性能历史数据 ===');
        const historyData = await proxy.getPerformanceHistory();
        
        if (historyData && historyData.length > 0) {
            console.log(`✓ 历史数据记录: ${historyData.length} 条`);
            
            // 分析性能趋势
            const trend = analyzePerformanceTrend(historyData);
            console.log('性能趋势分析:', trend);
        } else {
            console.log('⚠ 历史数据为空');
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServers.forEach(server => server.close());
    }
}

// 生成测试负载
async function generateTestLoad(requestCount, duration) {
    const startTime = Date.now();
    const interval = duration / requestCount;
    const promises = [];
    
    for (let i = 0; i < requestCount; i++) {
        const delay = i * interval;
        
        promises.push(
            new Promise(resolve => {
                setTimeout(async () => {
                    try {
                        await makeProxyRequest(`http://localhost:8091/test-${i}`);
                        resolve({ success: true, index: i });
                    } catch (error) {
                        resolve({ success: false, index: i, error: error.message });
                    }
                }, delay);
            })
        );
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.value && r.value.success).length;
    const failed = results.length - successful;
    
    console.log(`负载生成完成: ${successful} 成功, ${failed} 失败`);
    console.log(`总耗时: ${Date.now() - startTime}ms`);
    
    return { successful, failed, totalTime: Date.now() - startTime };
}

// 发送代理请求
async function makeProxyRequest(targetUrl) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: targetUrl.replace('http://localhost:8091', ''),
            method: 'GET',
            headers: {
                'Host': 'localhost:8091',
                'User-Agent': 'Performance-Test-Client/1.0'
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    data: data
                });
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

// 验证性能指标
function validatePerformanceMetrics(metrics) {
    const errors = [];
    
    // 验证请求数量
    if (typeof metrics.requestCount !== 'number' || metrics.requestCount < 0) {
        errors.push('请求数量异常');
    }
    
    // 验证响应时间
    if (typeof metrics.avgResponseTime !== 'number' || metrics.avgResponseTime < 0) {
        errors.push('响应时间异常');
    }
    
    // 验证吞吐量
    if (typeof metrics.throughput !== 'number' || metrics.throughput < 0) {
        errors.push('吞吐量异常');
    }
    
    // 验证错误率
    if (typeof metrics.errorRate !== 'number' || metrics.errorRate < 0 || metrics.errorRate > 100) {
        errors.push('错误率异常');
    }
    
    // 验证内存使用
    if (typeof metrics.memoryUsage !== 'number' || metrics.memoryUsage <= 0) {
        errors.push('内存使用异常');
    }
    
    // 验证CPU使用率
    if (typeof metrics.cpuUsage !== 'number' || metrics.cpuUsage < 0 || metrics.cpuUsage > 100) {
        errors.push('CPU使用率异常');
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// 分析性能趋势
function analyzePerformanceTrend(historyData) {
    if (historyData.length < 2) {
        return { trend: 'insufficient_data' };
    }
    
    const recent = historyData.slice(-5); // 最近5个数据点
    const older = historyData.slice(-10, -5); // 之前5个数据点
    
    if (older.length === 0) {
        return { trend: 'insufficient_data' };
    }
    
    const recentAvg = {
        responseTime: recent.reduce((sum, d) => sum + d.avgResponseTime, 0) / recent.length,
        throughput: recent.reduce((sum, d) => sum + d.throughput, 0) / recent.length,
        errorRate: recent.reduce((sum, d) => sum + d.errorRate, 0) / recent.length
    };
    
    const olderAvg = {
        responseTime: older.reduce((sum, d) => sum + d.avgResponseTime, 0) / older.length,
        throughput: older.reduce((sum, d) => sum + d.throughput, 0) / older.length,
        errorRate: older.reduce((sum, d) => sum + d.errorRate, 0) / older.length
    };
    
    return {
        responseTime: recentAvg.responseTime > olderAvg.responseTime ? 'increasing' : 'decreasing',
        throughput: recentAvg.throughput > olderAvg.throughput ? 'increasing' : 'decreasing',
        errorRate: recentAvg.errorRate > olderAvg.errorRate ? 'increasing' : 'decreasing',
        recentAvg: recentAvg,
        olderAvg: olderAvg
    };
}

// 创建测试服务器
async function createTestServer(port, protocol = 'http') {
    const handler = (req, res) => {
        // 模拟不同的响应时间
        const delay = Math.random() * 100; // 0-100ms随机延迟
        
        setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: `${protocol.toUpperCase()} test server response`,
                port: port,
                url: req.url,
                method: req.method,
                timestamp: new Date().toISOString(),
                delay: delay
            }));
        }, delay);
    };
    
    let server;
    if (protocol === 'https') {
        const fs = require('fs');
        const path = require('path');
        
        const options = {
            key: fs.readFileSync(path.join(__dirname, 'certs', 'server.key')),
            cert: fs.readFileSync(path.join(__dirname, 'certs', 'server.crt'))
        };
        
        server = https.createServer(options, handler);
    } else {
        server = http.createServer(handler);
    }
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`${protocol.toUpperCase()}测试服务器启动: ${protocol}://localhost:${port}`);
            resolve(server);
        });
    });
}

testBasicPerformanceMetrics();
```

**预期结果**:
- 性能指标正确收集
- 指标数值合理
- 历史数据正常记录
- 性能趋势分析准确

---

### TC-PERF-002: 实时性能监控测试

**测试目标**: 验证实时性能监控和告警功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const EventEmitter = require('events');

async function testRealTimePerformanceMonitoring() {
    const testServer = await createTestServer(8091);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        performance: {
            enabled: true,
            realTime: {
                enabled: true,
                updateInterval: 500, // 500ms更新间隔
                dashboard: {
                    enabled: true,
                    port: 9090,
                    refreshRate: 1000
                }
            },
            alerts: {
                enabled: true,
                thresholds: {
                    responseTime: 1000, // 响应时间超过1秒告警
                    errorRate: 5, // 错误率超过5%告警
                    throughput: 10, // 吞吐量低于10 req/s告警
                    memoryUsage: 512 * 1024 * 1024, // 内存使用超过512MB告警
                    cpuUsage: 80 // CPU使用率超过80%告警
                },
                actions: {
                    log: true,
                    email: false, // 测试环境关闭邮件
                    webhook: false // 测试环境关闭webhook
                }
            }
        },
        logger: { level: 'info' }
    });
    
    const monitoringData = [];
    const alerts = [];
    
    // 监听实时性能数据
    proxy.on('realTimeMetrics', (metrics) => {
        monitoringData.push({
            timestamp: Date.now(),
            ...metrics
        });
        
        console.log(`[${new Date().toISOString()}] 实时指标:`, {
            activeConnections: metrics.activeConnections,
            requestsPerSecond: metrics.requestsPerSecond,
            avgResponseTime: metrics.avgResponseTime,
            errorRate: metrics.errorRate
        });
    });
    
    // 监听性能告警
    proxy.on('performanceAlert', (alert) => {
        alerts.push({
            timestamp: Date.now(),
            ...alert
        });
        
        console.log(`🚨 性能告警: ${alert.type} - ${alert.message}`);
        console.log(`   当前值: ${alert.currentValue}`);
        console.log(`   阈值: ${alert.threshold}`);
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 实时性能监控启动成功');
        
        // 测试正常负载
        console.log('\n=== 测试正常负载 ===');
        await generateNormalLoad();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 测试高负载（触发告警）
        console.log('\n=== 测试高负载（触发告警）===');
        await generateHighLoad();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 测试错误负载（触发错误率告警）
        console.log('\n=== 测试错误负载 ===');
        await generateErrorLoad();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 验证监控数据
        console.log('\n=== 验证监控数据 ===');
        if (monitoringData.length > 0) {
            console.log(`✓ 收集到 ${monitoringData.length} 条实时监控数据`);
            
            // 分析数据完整性
            const dataIntegrity = analyzeDataIntegrity(monitoringData);
            console.log('数据完整性分析:', dataIntegrity);
        } else {
            console.log('✗ 未收集到实时监控数据');
        }
        
        // 验证告警功能
        console.log('\n=== 验证告警功能 ===');
        if (alerts.length > 0) {
            console.log(`✓ 触发了 ${alerts.length} 个告警`);
            
            alerts.forEach((alert, index) => {
                console.log(`  ${index + 1}. ${alert.type}: ${alert.message}`);
            });
            
            // 验证告警类型
            const alertTypes = [...new Set(alerts.map(a => a.type))];
            console.log('告警类型:', alertTypes);
            
            if (alertTypes.includes('responseTime') || alertTypes.includes('errorRate')) {
                console.log('✓ 告警功能正常工作');
            } else {
                console.log('⚠ 告警功能可能异常');
            }
        } else {
            console.log('⚠ 未触发任何告警（可能阈值设置过高）');
        }
        
        // 测试监控仪表板
        console.log('\n=== 测试监控仪表板 ===');
        const dashboardTest = await testMonitoringDashboard();
        
        if (dashboardTest.accessible) {
            console.log('✓ 监控仪表板可访问');
            console.log(`  仪表板URL: http://localhost:9090`);
        } else {
            console.log('✗ 监控仪表板不可访问:', dashboardTest.error);
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

// 生成正常负载
async function generateNormalLoad() {
    console.log('生成正常负载...');
    const promises = [];
    
    for (let i = 0; i < 20; i++) {
        promises.push(
            new Promise(resolve => {
                setTimeout(async () => {
                    try {
                        await makeProxyRequest('http://localhost:8091/normal');
                        resolve({ success: true });
                    } catch (error) {
                        resolve({ success: false });
                    }
                }, i * 100);
            })
        );
    }
    
    await Promise.allSettled(promises);
    console.log('正常负载生成完成');
}

// 生成高负载
async function generateHighLoad() {
    console.log('生成高负载...');
    const promises = [];
    
    // 快速发送大量请求
    for (let i = 0; i < 100; i++) {
        promises.push(
            makeProxyRequest(`http://localhost:8091/high-load-${i}`)
                .catch(() => ({ success: false }))
        );
    }
    
    await Promise.allSettled(promises);
    console.log('高负载生成完成');
}

// 生成错误负载
async function generateErrorLoad() {
    console.log('生成错误负载...');
    const promises = [];
    
    for (let i = 0; i < 20; i++) {
        promises.push(
            makeProxyRequest('http://localhost:8091/nonexistent-endpoint')
                .catch(() => ({ success: false }))
        );
    }
    
    await Promise.allSettled(promises);
    console.log('错误负载生成完成');
}

// 分析数据完整性
function analyzeDataIntegrity(data) {
    if (data.length === 0) {
        return { integrity: 'no_data' };
    }
    
    // 检查时间间隔
    const intervals = [];
    for (let i = 1; i < data.length; i++) {
        intervals.push(data[i].timestamp - data[i - 1].timestamp);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const expectedInterval = 500; // 500ms
    const intervalDeviation = Math.abs(avgInterval - expectedInterval) / expectedInterval;
    
    // 检查数据字段完整性
    const requiredFields = ['activeConnections', 'requestsPerSecond', 'avgResponseTime', 'errorRate'];
    const missingFields = [];
    
    data.forEach((record, index) => {
        requiredFields.forEach(field => {
            if (record[field] === undefined || record[field] === null) {
                missingFields.push(`${field} at index ${index}`);
            }
        });
    });
    
    return {
        integrity: missingFields.length === 0 ? 'complete' : 'incomplete',
        dataPoints: data.length,
        avgInterval: avgInterval,
        intervalDeviation: intervalDeviation,
        missingFields: missingFields
    };
}

// 测试监控仪表板
async function testMonitoringDashboard() {
    try {
        const response = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: 'localhost',
                port: 9090,
                path: '/',
                method: 'GET',
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Dashboard request timeout'));
            });
            
            req.end();
        });
        
        return {
            accessible: response.statusCode === 200,
            statusCode: response.statusCode,
            hasContent: response.data.length > 0
        };
    } catch (error) {
        return {
            accessible: false,
            error: error.message
        };
    }
}

testRealTimePerformanceMonitoring();
```

**预期结果**:
- 实时监控数据正常更新
- 告警功能正确触发
- 监控仪表板可访问
- 数据完整性良好

---

### TC-PERF-003: 性能优化测试

**测试目标**: 验证性能优化功能的效果

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const cluster = require('cluster');
const os = require('os');

async function testPerformanceOptimization() {
    console.log('=== 性能优化测试 ===');
    
    // 测试连接池优化
    console.log('\n--- 连接池优化测试 ---');
    const connectionPoolResults = await testConnectionPoolOptimization();
    
    // 测试缓存优化
    console.log('\n--- 缓存优化测试 ---');
    const cacheResults = await testCacheOptimization();
    
    // 测试压缩优化
    console.log('\n--- 压缩优化测试 ---');
    const compressionResults = await testCompressionOptimization();
    
    // 测试集群模式
    console.log('\n--- 集群模式测试 ---');
    const clusterResults = await testClusterMode();
    
    // 性能优化效果分析
    console.log('\n--- 性能优化效果分析 ---');
    analyzeOptimizationResults({
        connectionPool: connectionPoolResults,
        cache: cacheResults,
        compression: compressionResults,
        cluster: clusterResults
    });
    
    return true;
}

// 测试连接池优化
async function testConnectionPoolOptimization() {
    const testServer = await createTestServer(8091);
    
    // 测试无连接池配置
    console.log('测试无连接池配置...');
    const withoutPoolResults = await testWithConnectionPool(false);
    
    // 测试有连接池配置
    console.log('测试有连接池配置...');
    const withPoolResults = await testWithConnectionPool(true);
    
    testServer.close();
    
    const improvement = {
        responseTime: ((withoutPoolResults.avgResponseTime - withPoolResults.avgResponseTime) / withoutPoolResults.avgResponseTime) * 100,
        throughput: ((withPoolResults.throughput - withoutPoolResults.throughput) / withoutPoolResults.throughput) * 100,
        connectionReuse: withPoolResults.connectionReuse - withoutPoolResults.connectionReuse
    };
    
    console.log('连接池优化效果:');
    console.log(`  响应时间改善: ${improvement.responseTime.toFixed(2)}%`);
    console.log(`  吞吐量提升: ${improvement.throughput.toFixed(2)}%`);
    console.log(`  连接复用提升: ${improvement.connectionReuse}`);
    
    return {
        withoutPool: withoutPoolResults,
        withPool: withPoolResults,
        improvement: improvement
    };
}

// 测试连接池配置
async function testWithConnectionPool(enablePool) {
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        optimization: {
            connectionPool: {
                enabled: enablePool,
                maxConnections: enablePool ? 50 : 1,
                keepAlive: enablePool,
                keepAliveMsecs: enablePool ? 30000 : 0,
                maxSockets: enablePool ? 10 : 1,
                maxFreeSockets: enablePool ? 5 : 0
            }
        },
        performance: {
            enabled: true
        },
        logger: { level: 'warn' }
    });
    
    await proxy.initialize();
    await proxy.start();
    
    const startTime = Date.now();
    const promises = [];
    
    // 发送并发请求
    for (let i = 0; i < 50; i++) {
        promises.push(
            makeProxyRequest(`http://localhost:8091/pool-test-${i}`)
                .then(response => ({ success: true, responseTime: Date.now() - startTime }))
                .catch(() => ({ success: false, responseTime: Date.now() - startTime }))
        );
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.value && r.value.success);
    const totalTime = Date.now() - startTime;
    
    const metrics = await proxy.getPerformanceMetrics();
    
    await proxy.stop();
    
    return {
        successful: successful.length,
        total: results.length,
        totalTime: totalTime,
        avgResponseTime: successful.reduce((sum, r) => sum + r.value.responseTime, 0) / successful.length,
        throughput: (successful.length / totalTime) * 1000,
        connectionReuse: metrics ? metrics.connectionReuse || 0 : 0
    };
}

// 测试缓存优化
async function testCacheOptimization() {
    const testServer = await createTestServer(8091);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        optimization: {
            cache: {
                enabled: true,
                type: 'memory',
                maxSize: 100, // 100MB
                ttl: 60000, // 60秒
                compression: true,
                rules: [
                    {
                        pattern: '/static/*',
                        ttl: 300000 // 静态资源缓存5分钟
                    },
                    {
                        pattern: '/api/cache-test',
                        ttl: 30000 // API缓存30秒
                    }
                ]
            }
        },
        performance: {
            enabled: true
        },
        logger: { level: 'warn' }
    });
    
    await proxy.initialize();
    await proxy.start();
    
    // 测试缓存命中
    console.log('测试缓存功能...');
    
    // 第一次请求（缓存未命中）
    const firstRequestStart = Date.now();
    await makeProxyRequest('http://localhost:8091/api/cache-test');
    const firstRequestTime = Date.now() - firstRequestStart;
    
    // 第二次请求（缓存命中）
    const secondRequestStart = Date.now();
    await makeProxyRequest('http://localhost:8091/api/cache-test');
    const secondRequestTime = Date.now() - secondRequestStart;
    
    // 测试缓存统计
    const cacheStats = await proxy.getCacheStatistics();
    
    await proxy.stop();
    testServer.close();
    
    const cacheImprovement = ((firstRequestTime - secondRequestTime) / firstRequestTime) * 100;
    
    console.log('缓存优化效果:');
    console.log(`  首次请求时间: ${firstRequestTime}ms`);
    console.log(`  缓存请求时间: ${secondRequestTime}ms`);
    console.log(`  性能提升: ${cacheImprovement.toFixed(2)}%`);
    console.log(`  缓存命中率: ${cacheStats ? cacheStats.hitRate : 'N/A'}%`);
    
    return {
        firstRequestTime: firstRequestTime,
        secondRequestTime: secondRequestTime,
        improvement: cacheImprovement,
        cacheStats: cacheStats
    };
}

// 测试压缩优化
async function testCompressionOptimization() {
    const testServer = await createTestServer(8091);
    
    // 测试无压缩
    const withoutCompressionResults = await testWithCompression(false);
    
    // 测试有压缩
    const withCompressionResults = await testWithCompression(true);
    
    testServer.close();
    
    const compressionRatio = (withoutCompressionResults.totalBytes - withCompressionResults.totalBytes) / withoutCompressionResults.totalBytes;
    const speedImprovement = ((withoutCompressionResults.totalTime - withCompressionResults.totalTime) / withoutCompressionResults.totalTime) * 100;
    
    console.log('压缩优化效果:');
    console.log(`  数据压缩率: ${(compressionRatio * 100).toFixed(2)}%`);
    console.log(`  传输速度提升: ${speedImprovement.toFixed(2)}%`);
    console.log(`  原始大小: ${withoutCompressionResults.totalBytes} bytes`);
    console.log(`  压缩后大小: ${withCompressionResults.totalBytes} bytes`);
    
    return {
        withoutCompression: withoutCompressionResults,
        withCompression: withCompressionResults,
        compressionRatio: compressionRatio,
        speedImprovement: speedImprovement
    };
}

// 测试压缩配置
async function testWithCompression(enableCompression) {
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        optimization: {
            compression: {
                enabled: enableCompression,
                level: enableCompression ? 6 : 0, // gzip压缩级别
                threshold: enableCompression ? 1024 : 0, // 1KB以上才压缩
                types: enableCompression ? ['text/*', 'application/json', 'application/javascript'] : []
            }
        },
        logger: { level: 'warn' }
    });
    
    await proxy.initialize();
    await proxy.start();
    
    const startTime = Date.now();
    let totalBytes = 0;
    
    // 请求大文件测试压缩效果
    const response = await makeProxyRequestWithSize('http://localhost:8091/large-content');
    totalBytes += response.size || 0;
    
    const totalTime = Date.now() - startTime;
    
    await proxy.stop();
    
    return {
        totalTime: totalTime,
        totalBytes: totalBytes,
        compression: enableCompression
    };
}

// 发送请求并获取大小信息
async function makeProxyRequestWithSize(targetUrl) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: targetUrl.replace('http://localhost:8091', ''),
            method: 'GET',
            headers: {
                'Host': 'localhost:8091',
                'Accept-Encoding': 'gzip, deflate'
            }
        };
        
        const req = http.request(options, (res) => {
            let data = Buffer.alloc(0);
            
            res.on('data', (chunk) => {
                data = Buffer.concat([data, chunk]);
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    size: data.length,
                    compressed: res.headers['content-encoding'] === 'gzip'
                });
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// 测试集群模式
async function testClusterMode() {
    if (cluster.isMaster) {
        console.log('启动集群模式测试...');
        
        const numCPUs = Math.min(os.cpus().length, 4); // 最多4个进程
        const workers = [];
        
        // 启动工作进程
        for (let i = 0; i < numCPUs; i++) {
            const worker = cluster.fork();
            workers.push(worker);
        }
        
        // 等待所有工作进程启动
        await new Promise(resolve => {
            let readyCount = 0;
            workers.forEach(worker => {
                worker.on('message', (msg) => {
                    if (msg.type === 'ready') {
                        readyCount++;
                        if (readyCount === numCPUs) {
                            resolve();
                        }
                    }
                });
            });
        });
        
        console.log(`✓ ${numCPUs} 个工作进程启动完成`);
        
        // 执行负载测试
        const loadTestResults = await performClusterLoadTest();
        
        // 关闭工作进程
        workers.forEach(worker => worker.kill());
        
        return {
            workerCount: numCPUs,
            loadTestResults: loadTestResults
        };
    } else {
        // 工作进程
        const proxy = new NodeMITMProxy({
            config: {
                port: 8080 + cluster.worker.id,
                host: 'localhost'
            },
            cluster: {
                enabled: true,
                workerId: cluster.worker.id
            },
            logger: { level: 'error' }
        });
        
        await proxy.initialize();
        await proxy.start();
        
        process.send({ type: 'ready', workerId: cluster.worker.id });
        
        // 保持进程运行
        process.on('SIGTERM', async () => {
            await proxy.stop();
            process.exit(0);
        });
    }
}

// 执行集群负载测试
async function performClusterLoadTest() {
    const testServer = await createTestServer(8091);
    
    const startTime = Date.now();
    const promises = [];
    
    // 向不同的工作进程发送请求
    for (let i = 0; i < 200; i++) {
        const workerPort = 8080 + (i % 4) + 1; // 轮询分配到不同工作进程
        
        promises.push(
            makeRequestToWorker(workerPort, `/cluster-test-${i}`)
                .then(() => ({ success: true }))
                .catch(() => ({ success: false }))
        );
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.value && r.value.success).length;
    const totalTime = Date.now() - startTime;
    
    testServer.close();
    
    return {
        totalRequests: results.length,
        successful: successful,
        totalTime: totalTime,
        throughput: (successful / totalTime) * 1000
    };
}

// 向特定工作进程发送请求
async function makeRequestToWorker(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: path,
            method: 'GET',
            headers: {
                'Host': 'localhost:8091'
            }
        }, (res) => {
            res.on('data', () => {}); // 消费数据
            res.on('end', resolve);
        });
        
        req.on('error', reject);
        req.end();
    });
}

// 分析优化结果
function analyzeOptimizationResults(results) {
    console.log('=== 性能优化综合分析 ===');
    
    // 连接池优化分析
    if (results.connectionPool && results.connectionPool.improvement) {
        const poolImprovement = results.connectionPool.improvement;
        console.log('\n连接池优化:');
        console.log(`  响应时间改善: ${poolImprovement.responseTime.toFixed(2)}%`);
        console.log(`  吞吐量提升: ${poolImprovement.throughput.toFixed(2)}%`);
        
        if (poolImprovement.responseTime > 10 && poolImprovement.throughput > 20) {
            console.log('  ✓ 连接池优化效果显著');
        } else {
            console.log('  ⚠ 连接池优化效果一般');
        }
    }
    
    // 缓存优化分析
    if (results.cache) {
        console.log('\n缓存优化:');
        console.log(`  性能提升: ${results.cache.improvement.toFixed(2)}%`);
        
        if (results.cache.improvement > 50) {
            console.log('  ✓ 缓存优化效果显著');
        } else {
            console.log('  ⚠ 缓存优化效果一般');
        }
    }
    
    // 压缩优化分析
    if (results.compression) {
        console.log('\n压缩优化:');
        console.log(`  数据压缩率: ${(results.compression.compressionRatio * 100).toFixed(2)}%`);
        console.log(`  速度提升: ${results.compression.speedImprovement.toFixed(2)}%`);
        
        if (results.compression.compressionRatio > 0.3) {
            console.log('  ✓ 压缩优化效果显著');
        } else {
            console.log('  ⚠ 压缩优化效果一般');
        }
    }
    
    // 集群模式分析
    if (results.cluster) {
        console.log('\n集群模式:');
        console.log(`  工作进程数: ${results.cluster.workerCount}`);
        console.log(`  总吞吐量: ${results.cluster.loadTestResults.throughput.toFixed(2)} req/s`);
        
        const expectedThroughput = results.cluster.workerCount * 50; // 假设单进程50 req/s
        if (results.cluster.loadTestResults.throughput > expectedThroughput * 0.8) {
            console.log('  ✓ 集群模式扩展性良好');
        } else {
            console.log('  ⚠ 集群模式扩展性有待提升');
        }
    }
    
    // 综合评估
    console.log('\n=== 综合评估 ===');
    const optimizations = [];
    
    if (results.connectionPool && results.connectionPool.improvement.responseTime > 10) {
        optimizations.push('连接池');
    }
    if (results.cache && results.cache.improvement > 50) {
        optimizations.push('缓存');
    }
    if (results.compression && results.compression.compressionRatio > 0.3) {
        optimizations.push('压缩');
    }
    if (results.cluster && results.cluster.loadTestResults.throughput > 100) {
        optimizations.push('集群');
    }
    
    console.log(`有效的优化策略: ${optimizations.join(', ')}`);
    console.log(`优化策略数量: ${optimizations.length}/4`);
    
    if (optimizations.length >= 3) {
        console.log('✓ 性能优化效果优秀');
    } else if (optimizations.length >= 2) {
        console.log('✓ 性能优化效果良好');
    } else {
        console.log('⚠ 性能优化效果需要改进');
    }
}

testPerformanceOptimization();
```

**预期结果**:
- 连接池优化提升性能
- 缓存机制有效减少响应时间
- 压缩功能减少传输数据量
- 集群模式提升并发处理能力

---

### TC-PERF-004: 资源使用监控测试

**测试目标**: 验证系统资源使用监控功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const os = require('os');
const fs = require('fs');

async function testResourceUsageMonitoring() {
    const testServer = await createTestServer(8091);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        monitoring: {
            resources: {
                enabled: true,
                interval: 1000, // 1秒监控间隔
                metrics: {
                    cpu: true,
                    memory: true,
                    disk: true,
                    network: true,
                    handles: true, // 文件句柄
                    eventLoop: true // 事件循环延迟
                }
            },
            alerts: {
                enabled: true,
                thresholds: {
                    cpuUsage: 80,
                    memoryUsage: 512 * 1024 * 1024, // 512MB
                    diskUsage: 90, // 90%
                    fileHandles: 1000,
                    eventLoopDelay: 100 // 100ms
                }
            }
        },
        logger: { level: 'info' }
    });
    
    const resourceData = [];
    const resourceAlerts = [];
    
    // 监听资源使用数据
    proxy.on('resourceMetrics', (metrics) => {
        resourceData.push({
            timestamp: Date.now(),
            ...metrics
        });
        
        console.log('资源使用情况:', {
            cpu: `${metrics.cpuUsage.toFixed(2)}%`,
            memory: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
            handles: metrics.fileHandles,
            eventLoopDelay: `${metrics.eventLoopDelay.toFixed(2)}ms`
        });
    });
    
    // 监听资源告警
    proxy.on('resourceAlert', (alert) => {
        resourceAlerts.push({
            timestamp: Date.now(),
            ...alert
        });
        
        console.log(`🚨 资源告警: ${alert.type} - ${alert.message}`);
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 资源监控启动成功');
        
        // 获取基线资源使用
        console.log('\n=== 获取基线资源使用 ===');
        await new Promise(resolve => setTimeout(resolve, 3000));
        const baselineMetrics = resourceData[resourceData.length - 1];
        console.log('基线资源使用:', baselineMetrics);
        
        // 测试CPU密集型负载
        console.log('\n=== 测试CPU密集型负载 ===');
        await generateCPUIntensiveLoad();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 测试内存密集型负载
        console.log('\n=== 测试内存密集型负载 ===');
        await generateMemoryIntensiveLoad();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 测试I/O密集型负载
        console.log('\n=== 测试I/O密集型负载 ===');
        await generateIOIntensiveLoad();
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 分析资源使用趋势
        console.log('\n=== 分析资源使用趋势 ===');
        const trendAnalysis = analyzeResourceTrends(resourceData);
        console.log('资源使用趋势:', trendAnalysis);
        
        // 验证资源告警
        console.log('\n=== 验证资源告警 ===');
        if (resourceAlerts.length > 0) {
            console.log(`✓ 触发了 ${resourceAlerts.length} 个资源告警`);
            resourceAlerts.forEach((alert, index) => {
                console.log(`  ${index + 1}. ${alert.type}: ${alert.message}`);
            });
        } else {
            console.log('⚠ 未触发资源告警（可能负载不够或阈值过高）');
        }
        
        // 生成资源使用报告
        console.log('\n=== 生成资源使用报告 ===');
        const report = generateResourceReport(resourceData, baselineMetrics);
        console.log('资源使用报告:', report);
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

// 生成CPU密集型负载
async function generateCPUIntensiveLoad() {
    console.log('生成CPU密集型负载...');
    
    const promises = [];
    for (let i = 0; i < 50; i++) {
        promises.push(
            makeProxyRequest(`http://localhost:8091/cpu-intensive?iterations=1000000`)
        );
    }
    
    await Promise.allSettled(promises);
    console.log('CPU密集型负载完成');
}

// 生成内存密集型负载
async function generateMemoryIntensiveLoad() {
    console.log('生成内存密集型负载...');
    
    const promises = [];
    for (let i = 0; i < 20; i++) {
        promises.push(
            makeProxyRequest(`http://localhost:8091/memory-intensive?size=10MB`)
        );
    }
    
    await Promise.allSettled(promises);
    console.log('内存密集型负载完成');
}

// 生成I/O密集型负载
async function generateIOIntensiveLoad() {
    console.log('生成I/O密集型负载...');
    
    const promises = [];
    for (let i = 0; i < 30; i++) {
        promises.push(
            makeProxyRequest(`http://localhost:8091/io-intensive?files=100`)
        );
    }
    
    await Promise.allSettled(promises);
    console.log('I/O密集型负载完成');
}

// 分析资源使用趋势
function analyzeResourceTrends(data) {
    if (data.length < 5) {
        return { trend: 'insufficient_data' };
    }
    
    const recent = data.slice(-5);
    const earlier = data.slice(-10, -5);
    
    if (earlier.length === 0) {
        return { trend: 'insufficient_data' };
    }
    
    const recentAvg = {
        cpu: recent.reduce((sum, d) => sum + d.cpuUsage, 0) / recent.length,
        memory: recent.reduce((sum, d) => sum + d.memoryUsage, 0) / recent.length,
        eventLoopDelay: recent.reduce((sum, d) => sum + d.eventLoopDelay, 0) / recent.length
    };
    
    const earlierAvg = {
        cpu: earlier.reduce((sum, d) => sum + d.cpuUsage, 0) / earlier.length,
        memory: earlier.reduce((sum, d) => sum + d.memoryUsage, 0) / earlier.length,
        eventLoopDelay: earlier.reduce((sum, d) => sum + d.eventLoopDelay, 0) / earlier.length
    };
    
    return {
        cpu: {
            trend: recentAvg.cpu > earlierAvg.cpu ? 'increasing' : 'decreasing',
            change: ((recentAvg.cpu - earlierAvg.cpu) / earlierAvg.cpu) * 100
        },
        memory: {
            trend: recentAvg.memory > earlierAvg.memory ? 'increasing' : 'decreasing',
            change: ((recentAvg.memory - earlierAvg.memory) / earlierAvg.memory) * 100
        },
        eventLoopDelay: {
            trend: recentAvg.eventLoopDelay > earlierAvg.eventLoopDelay ? 'increasing' : 'decreasing',
            change: ((recentAvg.eventLoopDelay - earlierAvg.eventLoopDelay) / earlierAvg.eventLoopDelay) * 100
        }
    };
}

// 生成资源使用报告
function generateResourceReport(data, baseline) {
    if (data.length === 0) {
        return { error: 'No data available' };
    }
    
    const latest = data[data.length - 1];
    
    // 计算峰值
    const peaks = {
        cpu: Math.max(...data.map(d => d.cpuUsage)),
        memory: Math.max(...data.map(d => d.memoryUsage)),
        eventLoopDelay: Math.max(...data.map(d => d.eventLoopDelay)),
        fileHandles: Math.max(...data.map(d => d.fileHandles))
    };
    
    // 计算平均值
    const averages = {
        cpu: data.reduce((sum, d) => sum + d.cpuUsage, 0) / data.length,
        memory: data.reduce((sum, d) => sum + d.memoryUsage, 0) / data.length,
        eventLoopDelay: data.reduce((sum, d) => sum + d.eventLoopDelay, 0) / data.length,
        fileHandles: data.reduce((sum, d) => sum + d.fileHandles, 0) / data.length
    };
    
    // 与基线对比
    const baselineComparison = baseline ? {
        cpu: ((latest.cpuUsage - baseline.cpuUsage) / baseline.cpuUsage) * 100,
        memory: ((latest.memoryUsage - baseline.memoryUsage) / baseline.memoryUsage) * 100,
        eventLoopDelay: ((latest.eventLoopDelay - baseline.eventLoopDelay) / baseline.eventLoopDelay) * 100
    } : null;
    
    return {
        dataPoints: data.length,
        duration: data.length > 1 ? data[data.length - 1].timestamp - data[0].timestamp : 0,
        current: {
            cpu: `${latest.cpuUsage.toFixed(2)}%`,
            memory: `${(latest.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
            eventLoopDelay: `${latest.eventLoopDelay.toFixed(2)}ms`,
            fileHandles: latest.fileHandles
        },
        peaks: {
            cpu: `${peaks.cpu.toFixed(2)}%`,
            memory: `${(peaks.memory / 1024 / 1024).toFixed(2)}MB`,
            eventLoopDelay: `${peaks.eventLoopDelay.toFixed(2)}ms`,
            fileHandles: peaks.fileHandles
        },
        averages: {
            cpu: `${averages.cpu.toFixed(2)}%`,
            memory: `${(averages.memory / 1024 / 1024).toFixed(2)}MB`,
            eventLoopDelay: `${averages.eventLoopDelay.toFixed(2)}ms`,
            fileHandles: Math.round(averages.fileHandles)
        },
        baselineComparison: baselineComparison ? {
            cpu: `${baselineComparison.cpu.toFixed(2)}%`,
            memory: `${baselineComparison.memory.toFixed(2)}%`,
            eventLoopDelay: `${baselineComparison.eventLoopDelay.toFixed(2)}%`
        } : null
    };
}

// 创建支持不同负载类型的测试服务器
async function createTestServer(port) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const path = url.pathname;
        const params = url.searchParams;
        
        if (path === '/cpu-intensive') {
            // CPU密集型任务
            const iterations = parseInt(params.get('iterations')) || 100000;
            let result = 0;
            
            for (let i = 0; i < iterations; i++) {
                result += Math.sqrt(i) * Math.sin(i);
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'CPU intensive task completed',
                iterations: iterations,
                result: result
            }));
            
        } else if (path === '/memory-intensive') {
            // 内存密集型任务
            const sizeStr = params.get('size') || '1MB';
            const sizeBytes = parseSizeString(sizeStr);
            
            // 创建大数组
            const largeArray = new Array(sizeBytes / 8).fill(Math.random());
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Memory intensive task completed',
                allocatedSize: sizeStr,
                arrayLength: largeArray.length
            }));
            
        } else if (path === '/io-intensive') {
            // I/O密集型任务
            const fileCount = parseInt(params.get('files')) || 10;
            const promises = [];
            
            for (let i = 0; i < fileCount; i++) {
                promises.push(
                    new Promise((resolve) => {
                        fs.readFile(__filename, 'utf8', (err, data) => {
                            resolve({ index: i, size: data ? data.length : 0 });
                        });
                    })
                );
            }
            
            Promise.all(promises).then(results => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: 'I/O intensive task completed',
                    filesRead: results.length,
                    totalSize: results.reduce((sum, r) => sum + r.size, 0)
                }));
            });
            
        } else {
            // 默认响应
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Test server response',
                path: path,
                timestamp: new Date().toISOString()
            }));
        }
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`资源测试服务器启动: http://localhost:${port}`);
            resolve(server);
        });
    });
}

// 解析大小字符串
function parseSizeString(sizeStr) {
    const units = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024
    };
    
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match) return 1024; // 默认1KB
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    return Math.floor(value * (units[unit] || 1));
}

testResourceUsageMonitoring();
```

**预期结果**:
- 资源使用指标正确收集
- 资源告警正常触发
- 趋势分析准确
- 资源使用报告完整

---

## 测试执行指南

### 运行单个测试
```bash
node test-perf-001.js
```

### 运行所有性能测试
```bash
# 创建性能测试套件
node -e "
const tests = [
    'test-perf-001.js', // 基础性能指标
    'test-perf-002.js', // 实时监控
    'test-perf-003.js', // 性能优化
    'test-perf-004.js'  // 资源监控
];

async function runPerformanceTests() {
    console.log('=== 性能监控测试套件 ===\\n');
    
    for (const test of tests) {
        console.log(\`运行测试: \${test}\`);
        try {
            require(\`./\${test}\`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error(\`测试失败: \${error.message}\`);
        }
        console.log('---');
    }
}

runPerformanceTests();
"
```

### 性能基准测试
```bash
# 使用Apache Bench进行基准测试
ab -n 1000 -c 10 http://localhost:8080/

# 使用wrk进行高并发测试
wrk -t12 -c400 -d30s http://localhost:8080/
```

## 故障排除

### 常见问题

1. **性能指标收集异常**
   - 检查监控模块配置
   - 验证系统权限
   - 确认Node.js版本兼容性

2. **实时监控数据缺失**
   - 检查事件监听器
   - 验证更新间隔设置
   - 确认网络连接

3. **性能告警不触发**
   - 检查告警阈值设置
   - 验证告警条件逻辑
   - 确认事件处理器

4. **资源使用监控不准确**
   - 检查系统监控权限
   - 验证监控工具可用性
   - 确认采样间隔设置

5. **性能优化效果不明显**
   - 检查优化配置
   - 验证测试负载
   - 分析系统瓶颈