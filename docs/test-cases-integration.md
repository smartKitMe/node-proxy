# 集成测试用例

## 概述

本文档包含 Node Proxy 集成测试用例，涵盖端到端功能测试、多组件协同测试、真实场景模拟、兼容性测试等。

## 测试环境要求

- Node.js >= 12.0.0
- 多个测试目标服务器
- 不同类型的客户端（浏览器、Node.js、curl等）
- 测试端口：8080（HTTP代理），8443（HTTPS代理），8090-8099（目标服务器）
- 网络连接正常

## 端到端功能测试

### TC-INT-001: 完整代理流程集成测试

**测试目标**: 验证从客户端到目标服务器的完整代理流程

**前置条件**: 
- 代理服务器正常运行
- 目标服务器可访问
- 拦截器和中间件已配置

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');

async function testCompleteProxyFlow() {
    // 创建多个测试目标服务器
    const testServers = await Promise.all([
        createHTTPServer(8091, 'api-server'),
        createHTTPSServer(8092, 'secure-api'),
        createWebSocketServer(8093, 'websocket-server'),
        createStaticFileServer(8094, 'static-files')
    ]);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            httpsPort: 8443,
            host: 'localhost'
        },
        interceptors: [
            {
                name: 'request-logger',
                pattern: '*',
                handler: (req, res, next) => {
                    console.log(`[拦截器] ${req.method} ${req.url}`);
                    req.headers['x-proxy-intercepted'] = 'true';
                    next();
                }
            },
            {
                name: 'response-modifier',
                pattern: '/api/*',
                handler: (req, res, next) => {
                    const originalEnd = res.end;
                    res.end = function(chunk, encoding) {
                        if (chunk && typeof chunk === 'string') {
                            try {
                                const data = JSON.parse(chunk);
                                data.proxyProcessed = true;
                                data.timestamp = new Date().toISOString();
                                chunk = JSON.stringify(data);
                            } catch (e) {
                                // 非JSON数据，不处理
                            }
                        }
                        originalEnd.call(this, chunk, encoding);
                    };
                    next();
                }
            }
        ],
        middleware: [
            {
                name: 'auth-middleware',
                priority: 1,
                handler: async (req, res, next) => {
                    // 模拟认证中间件
                    if (req.url.includes('/secure/') && !req.headers.authorization) {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Unauthorized' }));
                        return;
                    }
                    next();
                }
            },
            {
                name: 'rate-limiter',
                priority: 2,
                handler: async (req, res, next) => {
                    // 模拟限流中间件
                    const clientIP = req.connection.remoteAddress;
                    if (!this.rateLimitMap) this.rateLimitMap = new Map();
                    
                    const now = Date.now();
                    const clientData = this.rateLimitMap.get(clientIP) || { count: 0, resetTime: now + 60000 };
                    
                    if (now > clientData.resetTime) {
                        clientData.count = 0;
                        clientData.resetTime = now + 60000;
                    }
                    
                    clientData.count++;
                    this.rateLimitMap.set(clientIP, clientData);
                    
                    if (clientData.count > 100) { // 每分钟最多100个请求
                        res.writeHead(429, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
                        return;
                    }
                    
                    next();
                }
            }
        ],
        https: {
            enabled: true,
            certificate: {
                type: 'dynamic'
            }
        },
        websocket: {
            enabled: true,
            interceptors: [
                {
                    name: 'ws-logger',
                    handler: (ws, req, next) => {
                        console.log(`[WebSocket拦截器] 连接建立: ${req.url}`);
                        next();
                    }
                }
            ]
        },
        performance: {
            enabled: true,
            metrics: {
                requestCount: true,
                responseTime: true,
                throughput: true
            }
        },
        logger: { level: 'info' }
    });
    
    const testResults = {
        httpTests: [],
        httpsTests: [],
        websocketTests: [],
        staticFileTests: [],
        performanceMetrics: null
    };
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 集成测试代理启动成功');
        
        // 测试HTTP API请求
        console.log('\n=== 测试HTTP API请求 ===');
        const httpResults = await testHTTPAPIs();
        testResults.httpTests = httpResults;
        
        // 测试HTTPS安全请求
        console.log('\n=== 测试HTTPS安全请求 ===');
        const httpsResults = await testHTTPSAPIs();
        testResults.httpsTests = httpsResults;
        
        // 测试WebSocket连接
        console.log('\n=== 测试WebSocket连接 ===');
        const wsResults = await testWebSocketConnections();
        testResults.websocketTests = wsResults;
        
        // 测试静态文件服务
        console.log('\n=== 测试静态文件服务 ===');
        const staticResults = await testStaticFileServing();
        testResults.staticFileTests = staticResults;
        
        // 测试认证和授权
        console.log('\n=== 测试认证和授权 ===');
        const authResults = await testAuthenticationAndAuthorization();
        testResults.authTests = authResults;
        
        // 测试限流功能
        console.log('\n=== 测试限流功能 ===');
        const rateLimitResults = await testRateLimiting();
        testResults.rateLimitTests = rateLimitResults;
        
        // 获取性能指标
        console.log('\n=== 获取性能指标 ===');
        const performanceMetrics = await proxy.getPerformanceMetrics();
        testResults.performanceMetrics = performanceMetrics;
        
        // 综合测试结果分析
        console.log('\n=== 综合测试结果分析 ===');
        const analysis = analyzeIntegrationTestResults(testResults);
        console.log('集成测试分析:', analysis);
        
        if (analysis.overallSuccess) {
            console.log('✓ 集成测试全部通过');
        } else {
            console.log('✗ 集成测试存在失败项:', analysis.failures);
        }
        
        return analysis.overallSuccess;
        
    } catch (error) {
        console.error('✗ 集成测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServers.forEach(server => {
            if (server.close) server.close();
            if (server.server && server.server.close) server.server.close();
        });
    }
}

// 测试HTTP API请求
async function testHTTPAPIs() {
    const tests = [
        {
            name: 'GET请求测试',
            method: 'GET',
            path: '/api/users',
            expectedStatus: 200
        },
        {
            name: 'POST请求测试',
            method: 'POST',
            path: '/api/users',
            body: JSON.stringify({ name: 'Test User', email: 'test@example.com' }),
            headers: { 'Content-Type': 'application/json' },
            expectedStatus: 201
        },
        {
            name: 'PUT请求测试',
            method: 'PUT',
            path: '/api/users/1',
            body: JSON.stringify({ name: 'Updated User' }),
            headers: { 'Content-Type': 'application/json' },
            expectedStatus: 200
        },
        {
            name: 'DELETE请求测试',
            method: 'DELETE',
            path: '/api/users/1',
            expectedStatus: 204
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            console.log(`执行测试: ${test.name}`);
            
            const response = await makeHTTPRequest({
                hostname: 'localhost',
                port: 8080,
                path: test.path,
                method: test.method,
                headers: {
                    'Host': 'localhost:8091',
                    ...test.headers
                }
            }, test.body);
            
            const success = response.statusCode === test.expectedStatus;
            
            results.push({
                name: test.name,
                success: success,
                expectedStatus: test.expectedStatus,
                actualStatus: response.statusCode,
                responseData: response.data,
                proxyProcessed: response.data && response.data.proxyProcessed
            });
            
            if (success) {
                console.log(`✓ ${test.name} 通过`);
            } else {
                console.log(`✗ ${test.name} 失败: 期望状态 ${test.expectedStatus}, 实际状态 ${response.statusCode}`);
            }
            
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
            console.log(`✗ ${test.name} 异常:`, error.message);
        }
    }
    
    return results;
}

// 测试HTTPS API请求
async function testHTTPSAPIs() {
    const tests = [
        {
            name: 'HTTPS GET请求',
            path: '/secure/data',
            expectedStatus: 200
        },
        {
            name: 'HTTPS POST请求',
            path: '/secure/submit',
            body: JSON.stringify({ data: 'secure data' }),
            headers: { 'Content-Type': 'application/json' },
            expectedStatus: 200
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            console.log(`执行HTTPS测试: ${test.name}`);
            
            const response = await makeHTTPSRequest({
                hostname: 'localhost',
                port: 8443,
                path: test.path,
                method: test.method || 'GET',
                headers: {
                    'Host': 'localhost:8092',
                    ...test.headers
                },
                rejectUnauthorized: false
            }, test.body);
            
            const success = response.statusCode === test.expectedStatus;
            
            results.push({
                name: test.name,
                success: success,
                expectedStatus: test.expectedStatus,
                actualStatus: response.statusCode,
                secure: true
            });
            
            if (success) {
                console.log(`✓ ${test.name} 通过`);
            } else {
                console.log(`✗ ${test.name} 失败`);
            }
            
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
            console.log(`✗ ${test.name} 异常:`, error.message);
        }
    }
    
    return results;
}

// 测试WebSocket连接
async function testWebSocketConnections() {
    const tests = [
        {
            name: 'WebSocket基础连接',
            url: 'ws://localhost:8080',
            targetHost: 'localhost:8093',
            messages: ['Hello', 'World', 'Test']
        },
        {
            name: 'WebSocket JSON消息',
            url: 'ws://localhost:8080',
            targetHost: 'localhost:8093',
            messages: [
                JSON.stringify({ type: 'greeting', message: 'Hello' }),
                JSON.stringify({ type: 'data', payload: { id: 1, name: 'test' } })
            ]
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            console.log(`执行WebSocket测试: ${test.name}`);
            
            const result = await testWebSocketConnection(test);
            
            results.push({
                name: test.name,
                success: result.success,
                messagesReceived: result.messagesReceived,
                connectionTime: result.connectionTime,
                error: result.error
            });
            
            if (result.success) {
                console.log(`✓ ${test.name} 通过`);
            } else {
                console.log(`✗ ${test.name} 失败:`, result.error);
            }
            
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
            console.log(`✗ ${test.name} 异常:`, error.message);
        }
    }
    
    return results;
}

// 执行单个WebSocket连接测试
function testWebSocketConnection(test) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const receivedMessages = [];
        
        const ws = new WebSocket(test.url, {
            headers: {
                'Host': test.targetHost
            }
        });
        
        let messageIndex = 0;
        
        ws.on('open', () => {
            console.log(`WebSocket连接已建立: ${test.name}`);
            
            // 发送测试消息
            const sendNextMessage = () => {
                if (messageIndex < test.messages.length) {
                    ws.send(test.messages[messageIndex]);
                    messageIndex++;
                    setTimeout(sendNextMessage, 100);
                } else {
                    // 所有消息发送完毕，等待响应
                    setTimeout(() => {
                        ws.close();
                    }, 500);
                }
            };
            
            sendNextMessage();
        });
        
        ws.on('message', (data) => {
            receivedMessages.push(data.toString());
            console.log(`收到WebSocket消息: ${data}`);
        });
        
        ws.on('close', () => {
            const connectionTime = Date.now() - startTime;
            resolve({
                success: receivedMessages.length > 0,
                messagesReceived: receivedMessages.length,
                connectionTime: connectionTime,
                messages: receivedMessages
            });
        });
        
        ws.on('error', (error) => {
            resolve({
                success: false,
                error: error.message,
                connectionTime: Date.now() - startTime
            });
        });
        
        // 超时处理
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            resolve({
                success: false,
                error: 'Connection timeout',
                connectionTime: Date.now() - startTime
            });
        }, 10000);
    });
}

// 测试静态文件服务
async function testStaticFileServing() {
    const tests = [
        {
            name: '文本文件请求',
            path: '/static/test.txt',
            expectedContentType: 'text/plain'
        },
        {
            name: 'JSON文件请求',
            path: '/static/data.json',
            expectedContentType: 'application/json'
        },
        {
            name: '图片文件请求',
            path: '/static/image.png',
            expectedContentType: 'image/png'
        },
        {
            name: '不存在文件请求',
            path: '/static/nonexistent.txt',
            expectedStatus: 404
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            console.log(`执行静态文件测试: ${test.name}`);
            
            const response = await makeHTTPRequest({
                hostname: 'localhost',
                port: 8080,
                path: test.path,
                method: 'GET',
                headers: {
                    'Host': 'localhost:8094'
                }
            });
            
            const expectedStatus = test.expectedStatus || 200;
            const statusSuccess = response.statusCode === expectedStatus;
            
            let contentTypeSuccess = true;
            if (test.expectedContentType && response.statusCode === 200) {
                const contentType = response.headers['content-type'];
                contentTypeSuccess = contentType && contentType.includes(test.expectedContentType);
            }
            
            const success = statusSuccess && contentTypeSuccess;
            
            results.push({
                name: test.name,
                success: success,
                statusCode: response.statusCode,
                contentType: response.headers['content-type'],
                contentLength: response.headers['content-length']
            });
            
            if (success) {
                console.log(`✓ ${test.name} 通过`);
            } else {
                console.log(`✗ ${test.name} 失败`);
            }
            
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
            console.log(`✗ ${test.name} 异常:`, error.message);
        }
    }
    
    return results;
}

// 测试认证和授权
async function testAuthenticationAndAuthorization() {
    const tests = [
        {
            name: '无认证访问安全资源',
            path: '/secure/admin',
            expectedStatus: 401
        },
        {
            name: '有认证访问安全资源',
            path: '/secure/admin',
            headers: { 'Authorization': 'Bearer test-token' },
            expectedStatus: 200
        },
        {
            name: '访问公开资源',
            path: '/public/info',
            expectedStatus: 200
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            console.log(`执行认证测试: ${test.name}`);
            
            const response = await makeHTTPRequest({
                hostname: 'localhost',
                port: 8080,
                path: test.path,
                method: 'GET',
                headers: {
                    'Host': 'localhost:8091',
                    ...test.headers
                }
            });
            
            const success = response.statusCode === test.expectedStatus;
            
            results.push({
                name: test.name,
                success: success,
                expectedStatus: test.expectedStatus,
                actualStatus: response.statusCode
            });
            
            if (success) {
                console.log(`✓ ${test.name} 通过`);
            } else {
                console.log(`✗ ${test.name} 失败`);
            }
            
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
            console.log(`✗ ${test.name} 异常:`, error.message);
        }
    }
    
    return results;
}

// 测试限流功能
async function testRateLimiting() {
    console.log('测试限流功能...');
    
    const promises = [];
    const requestCount = 150; // 超过限制的请求数
    
    // 快速发送大量请求
    for (let i = 0; i < requestCount; i++) {
        promises.push(
            makeHTTPRequest({
                hostname: 'localhost',
                port: 8080,
                path: `/rate-limit-test-${i}`,
                method: 'GET',
                headers: {
                    'Host': 'localhost:8091'
                }
            }).then(response => ({
                index: i,
                statusCode: response.statusCode,
                success: true
            })).catch(error => ({
                index: i,
                error: error.message,
                success: false
            }))
        );
    }
    
    const results = await Promise.allSettled(promises);
    const responses = results.map(r => r.value).filter(Boolean);
    
    const successCount = responses.filter(r => r.success && r.statusCode === 200).length;
    const rateLimitedCount = responses.filter(r => r.success && r.statusCode === 429).length;
    const errorCount = responses.filter(r => !r.success).length;
    
    console.log(`限流测试结果:`);
    console.log(`  成功请求: ${successCount}`);
    console.log(`  被限流请求: ${rateLimitedCount}`);
    console.log(`  错误请求: ${errorCount}`);
    
    // 验证限流是否生效
    const rateLimitWorking = rateLimitedCount > 0 && successCount < requestCount;
    
    return {
        totalRequests: requests,
        successfulRequests: results.filter(r => r.success).length,
        distribution: distribution,
        isBalanced: isBalanced,
        variance: variance,
        avgResponseTime: results.filter(r => r.success).reduce((sum, r) => sum + r.responseTime, 0) / results.filter(r => r.success).length
    };
}

// 测试加权负载均衡
async function testWeightedBalancing() {
    console.log('测试加权负载均衡...');
    
    const requests = 50;
    const results = [];
    
    for (let i = 0; i < requests; i++) {
        try {
            const response = await makeProxyRequest(`/weighted-test-${i}`);
            results.push({
                index: i,
                success: true,
                backend: response.data.server,
                responseTime: response.responseTime
            });
        } catch (error) {
            results.push({
                index: i,
                success: false,
                error: error.message
            });
        }
    }
    
    // 分析权重分发
    const distribution = {};
    results.filter(r => r.success).forEach(r => {
        distribution[r.backend] = (distribution[r.backend] || 0) + 1;
    });
    
    console.log('加权分发情况:', distribution);
    
    // 验证权重比例（backend-2权重为2，其他为1）
    const expectedRatio = {
        'backend-1': 1,
        'backend-2': 2,
        'backend-3': 1,
        'backend-4': 1
    };
    
    const totalWeight = Object.values(expectedRatio).reduce((sum, w) => sum + w, 0);
    const actualTotal = Object.values(distribution).reduce((sum, c) => sum + c, 0);
    
    let weightAccuracy = 0;
    Object.keys(expectedRatio).forEach(backend => {
        const expectedCount = (expectedRatio[backend] / totalWeight) * actualTotal;
        const actualCount = distribution[backend] || 0;
        const accuracy = 1 - Math.abs(expectedCount - actualCount) / expectedCount;
        weightAccuracy += accuracy;
    });
    weightAccuracy /= Object.keys(expectedRatio).length;
    
    return {
        totalRequests: requests,
        successfulRequests: results.filter(r => r.success).length,
        distribution: distribution,
        weightAccuracy: weightAccuracy,
        isWeightedCorrectly: weightAccuracy > 0.8
    };
}

// 测试健康检查
async function testHealthChecking() {
    console.log('测试健康检查...');
    
    // 模拟一个后端服务器故障
    console.log('模拟backend-3故障...');
    
    // 等待健康检查检测到故障
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // 发送请求验证故障服务器被排除
    const requests = 20;
    const results = [];
    
    for (let i = 0; i < requests; i++) {
        try {
            const response = await makeProxyRequest(`/health-check-test-${i}`);
            results.push({
                index: i,
                success: true,
                backend: response.data.server
            });
        } catch (error) {
            results.push({
                index: i,
                success: false,
                error: error.message
            });
        }
    }
    
    // 分析是否排除了故障服务器
    const distribution = {};
    results.filter(r => r.success).forEach(r => {
        distribution[r.backend] = (distribution[r.backend] || 0) + 1;
    });
    
    console.log('健康检查后分发情况:', distribution);
    
    const healthyBackends = Object.keys(distribution);
    const excludedFaultyBackend = !healthyBackends.includes('backend-3');
    
    return {
        totalRequests: requests,
        successfulRequests: results.filter(r => r.success).length,
        distribution: distribution,
        excludedFaultyBackend: excludedFaultyBackend,
        healthyBackends: healthyBackends
    };
}

// 测试故障转移
async function testFailoverMechanism() {
    console.log('测试故障转移机制...');
    
    const results = [];
    
    // 发送请求到故障服务器，验证自动转移
    for (let i = 0; i < 10; i++) {
        try {
            const response = await makeProxyRequest(`/failover-test-${i}`, {
                'X-Target-Backend': 'backend-3' // 指定故障服务器
            });
            
            results.push({
                index: i,
                success: true,
                backend: response.data.server,
                failedOver: response.data.server !== 'backend-3'
            });
        } catch (error) {
            results.push({
                index: i,
                success: false,
                error: error.message
            });
        }
    }
    
    const successfulFailovers = results.filter(r => r.success && r.failedOver).length;
    const failoverRate = successfulFailovers / results.length;
    
    console.log(`故障转移成功率: ${(failoverRate * 100).toFixed(2)}%`);
    
    return {
        totalRequests: 10,
        successfulFailovers: successfulFailovers,
        failoverRate: failoverRate,
        isFailoverWorking: failoverRate > 0.8
    };
}

// 测试会话保持
async function testSessionPersistence() {
    console.log('测试会话保持...');
    
    const sessionId = 'test-session-123';
    const requests = 10;
    const results = [];
    
    for (let i = 0; i < requests; i++) {
        try {
            const response = await makeProxyRequest(`/session-test-${i}`, {
                'Cookie': `sessionId=${sessionId}`
            });
            
            results.push({
                index: i,
                success: true,
                backend: response.data.server,
                sessionId: sessionId
            });
        } catch (error) {
            results.push({
                index: i,
                success: false,
                error: error.message
            });
        }
    }
    
    // 验证同一会话是否路由到同一后端
    const backends = [...new Set(results.filter(r => r.success).map(r => r.backend))];
    const sessionSticky = backends.length === 1;
    
    console.log(`会话保持结果: ${sessionSticky ? '成功' : '失败'}`);
    console.log(`使用的后端服务器: ${backends.join(', ')}`);
    
    return {
        totalRequests: requests,
        successfulRequests: results.filter(r => r.success).length,
        uniqueBackends: backends.length,
        sessionSticky: sessionSticky,
        primaryBackend: backends[0]
    };
}

// 发送代理请求
function makeProxyRequest(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: path,
            method: 'GET',
            headers: {
                'Host': 'api.example.com',
                ...headers
            }
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const responseTime = Date.now() - startTime;
                
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData,
                        responseTime: responseTime
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data,
                        responseTime: responseTime
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// 创建后端服务器
async function createBackendServer(port, name) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        
        // 健康检查端点
        if (url.pathname === '/health') {
            if (name === 'backend-3') {
                // 模拟backend-3故障
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'unhealthy', server: name }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'healthy', server: name }));
            }
            return;
        }
        
        // 模拟backend-3故障
        if (name === 'backend-3' && !url.pathname.includes('health')) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service unavailable', server: name }));
            return;
        }
        
        // 正常响应
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            server: name,
            port: port,
            path: url.pathname,
            method: req.method,
            timestamp: new Date().toISOString(),
            headers: req.headers
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`后端服务器启动: http://localhost:${port} (${name})`);
            resolve(server);
        });
    });
}

// 分析负载均衡结果
function analyzeLoadBalancingResults(results) {
    const analysis = {
        overallSuccess: true,
        categories: {},
        totalTests: 0,
        passedTests: 0
    };
    
    // 分析轮询负载均衡
    if (results.roundRobin) {
        const rrSuccess = results.roundRobin.isBalanced && 
                         results.roundRobin.successfulRequests === results.roundRobin.totalRequests;
        
        analysis.categories.roundRobin = {
            success: rrSuccess,
            balanced: results.roundRobin.isBalanced,
            successRate: (results.roundRobin.successfulRequests / results.roundRobin.totalRequests) * 100
        };
        
        analysis.totalTests += 1;
        if (rrSuccess) analysis.passedTests += 1;
        else analysis.overallSuccess = false;
    }
    
    // 分析加权负载均衡
    if (results.weighted) {
        const weightedSuccess = results.weighted.isWeightedCorrectly && 
                               results.weighted.successfulRequests === results.weighted.totalRequests;
        
        analysis.categories.weighted = {
            success: weightedSuccess,
            weightAccuracy: results.weighted.weightAccuracy,
            successRate: (results.weighted.successfulRequests / results.weighted.totalRequests) * 100
        };
        
        analysis.totalTests += 1;
        if (weightedSuccess) analysis.passedTests += 1;
        else analysis.overallSuccess = false;
    }
    
    // 分析健康检查
    if (results.healthCheck) {
        const healthSuccess = results.healthCheck.excludedFaultyBackend;
        
        analysis.categories.healthCheck = {
            success: healthSuccess,
            excludedFaultyBackend: results.healthCheck.excludedFaultyBackend,
            healthyBackends: results.healthCheck.healthyBackends
        };
        
        analysis.totalTests += 1;
        if (healthSuccess) analysis.passedTests += 1;
        else analysis.overallSuccess = false;
    }
    
    // 分析故障转移
    if (results.failover) {
        const failoverSuccess = results.failover.isFailoverWorking;
        
        analysis.categories.failover = {
            success: failoverSuccess,
            failoverRate: results.failover.failoverRate,
            successfulFailovers: results.failover.successfulFailovers
        };
        
        analysis.totalTests += 1;
        if (failoverSuccess) analysis.passedTests += 1;
        else analysis.overallSuccess = false;
    }
    
    // 分析会话保持
    if (results.session) {
        const sessionSuccess = results.session.sessionSticky;
        
        analysis.categories.session = {
            success: sessionSuccess,
            sessionSticky: results.session.sessionSticky,
            uniqueBackends: results.session.uniqueBackends
        };
        
        analysis.totalTests += 1;
        if (sessionSuccess) analysis.passedTests += 1;
        else analysis.overallSuccess = false;
    }
    
    analysis.overallSuccessRate = (analysis.passedTests / analysis.totalTests) * 100;
    
    return analysis;
}

testLoadBalancingIntegration();
```

**预期结果**:
- 轮询负载均衡正常工作
- 加权负载均衡按权重分发
- 健康检查正确排除故障服务器
- 故障转移机制正常
- 会话保持功能正常

---

## 性能测试

### TC-INT-004: 高并发性能测试

**测试目标**: 验证代理服务器在高并发情况下的性能表现

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const cluster = require('cluster');
const http = require('http');

async function testHighConcurrencyPerformance() {
    const concurrencyLevels = [100, 500, 1000, 2000, 5000];
    const testDuration = 60000; // 60秒
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        performance: {
            enabled: true,
            metrics: {
                requestCount: true,
                responseTime: true,
                throughput: true,
                errorRate: true,
                memoryUsage: true,
                cpuUsage: true
            }
        },
        logger: { level: 'warn' } // 减少日志输出
    });
    
    // 创建目标服务器
    const targetServer = await createHighPerformanceServer(8091);
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 高性能代理启动成功');
        
        const results = [];
        
        for (const concurrency of concurrencyLevels) {
            console.log(`\n=== 测试并发级别: ${concurrency} ===`);
            
            const result = await runConcurrencyTest(concurrency, testDuration);
            results.push({
                concurrency: concurrency,
                ...result
            });
            
            // 等待系统恢复
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        // 性能分析
        console.log('\n=== 高并发性能分析 ===');
        const analysis = analyzePerformanceResults(results);
        console.log('性能分析结果:', analysis);
        
        return analysis.overallPerformance === 'good';
        
    } catch (error) {
        console.error('✗ 高并发性能测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        targetServer.close();
    }
}

// 运行并发测试
async function runConcurrencyTest(concurrency, duration) {
    console.log(`启动${concurrency}个并发连接，持续${duration/1000}秒...`);
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    const workers = [];
    const results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        errors: {}
    };
    
    // 创建工作进程
    const workersCount = Math.min(concurrency, require('os').cpus().length);
    const requestsPerWorker = Math.ceil(concurrency / workersCount);
    
    for (let i = 0; i < workersCount; i++) {
        const worker = cluster.fork();
        workers.push(worker);
        
        worker.send({
            type: 'start-test',
            concurrency: requestsPerWorker,
            duration: duration,
            workerId: i
        });
        
        worker.on('message', (message) => {
            if (message.type === 'test-result') {
                results.totalRequests += message.totalRequests;
                results.successfulRequests += message.successfulRequests;
                results.failedRequests += message.failedRequests;
                results.totalResponseTime += message.totalResponseTime;
                results.minResponseTime = Math.min(results.minResponseTime, message.minResponseTime);
                results.maxResponseTime = Math.max(results.maxResponseTime, message.maxResponseTime);
                
                // 合并错误统计
                Object.keys(message.errors).forEach(error => {
                    results.errors[error] = (results.errors[error] || 0) + message.errors[error];
                });
            }
        });
    }
    
    // 等待测试完成
    await new Promise(resolve => {
        let completedWorkers = 0;
        workers.forEach(worker => {
            worker.on('exit', () => {
                completedWorkers++;
                if (completedWorkers === workers.length) {
                    resolve();
                }
            });
        });
        
        setTimeout(() => {
            workers.forEach(worker => worker.kill());
        }, duration + 5000);
    });
    
    // 计算性能指标
    const actualDuration = Date.now() - startTime;
    const avgResponseTime = results.totalResponseTime / results.successfulRequests;
    const throughput = (results.successfulRequests / actualDuration) * 1000; // 请求/秒
    const errorRate = (results.failedRequests / results.totalRequests) * 100;
    
    console.log(`并发${concurrency}测试结果:`);
    console.log(`  总请求数: ${results.totalRequests}`);
    console.log(`  成功请求: ${results.successfulRequests}`);
    console.log(`  失败请求: ${results.failedRequests}`);
    console.log(`  错误率: ${errorRate.toFixed(2)}%`);
    console.log(`  平均响应时间: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`  最小响应时间: ${results.minResponseTime}ms`);
    console.log(`  最大响应时间: ${results.maxResponseTime}ms`);
    console.log(`  吞吐量: ${throughput.toFixed(2)} 请求/秒`);
    
    return {
        totalRequests: results.totalRequests,
        successfulRequests: results.successfulRequests,
        failedRequests: results.failedRequests,
        errorRate: errorRate,
        avgResponseTime: avgResponseTime,
        minResponseTime: results.minResponseTime,
        maxResponseTime: results.maxResponseTime,
        throughput: throughput,
        duration: actualDuration,
        errors: results.errors
    };
}

testHighConcurrencyPerformance();
```

**预期结果**:
- 在不同并发级别下保持稳定性能
- 错误率低于5%
- 响应时间在可接受范围内
- 吞吐量随并发数合理增长

---

## 测试执行指南

### 环境准备

1. **安装依赖**:
```bash
npm install node-proxy ws mime-types
```

2. **创建测试目录**:
```bash
mkdir -p docs/test-results
mkdir -p test-certs
```

3. **生成测试证书**:
```bash
openssl req -x509 -newkey rsa:4096 -keyout test-certs/server.key -out test-certs/server.crt -days 365 -nodes
```

### 执行测试

1. **运行完整集成测试**:
```bash
node test-cases-integration.js
```

2. **运行特定测试场景**:
```bash
# 只运行端到端功能测试
node -e "require('./test-cases-integration.js').testCompleteProxyFlow()"

# 只运行协议兼容性测试
node -e "require('./test-cases-integration.js').testMultiProtocolCompatibility()"
```

3. **生成测试报告**:
```bash
node test-cases-integration.js > docs/test-results/integration-test-report.txt
```

### 测试结果分析

测试完成后，检查以下指标：

1. **功能完整性**: 所有功能测试是否通过
2. **性能指标**: 响应时间、吞吐量是否满足要求
3. **稳定性**: 长时间运行是否稳定
4. **兼容性**: 不同协议和客户端是否兼容
5. **错误处理**: 异常情况是否正确处理

## 故障排除

### 常见问题

1. **端口冲突**:
   - 检查测试端口是否被占用
   - 修改测试配置中的端口号

2. **证书问题**:
   - 确保测试证书正确生成
   - 检查证书路径是否正确

3. **内存不足**:
   - 减少并发测试的连接数
   - 增加系统内存或调整Node.js内存限制

4. **网络超时**:
   - 增加测试超时时间
   - 检查网络连接状态

5. **依赖缺失**:
   - 确保所有必要的npm包已安装
   - 检查Node.js版本兼容性Requests: requestCount,
        successCount: successCount,
        rateLimitedCount: rateLimitedCount,
        errorCount: errorCount,
        rateLimitWorking: rateLimitWorking
    };
}

// 发送HTTP请求
function makeHTTPRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = data ? JSON.parse(data) : null;
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(body);
        }
        
        req.end();
    });
}

// 发送HTTPS请求
function makeHTTPSRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = data ? JSON.parse(data) : null;
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(body);
        }
        
        req.end();
    });
}

// 创建HTTP测试服务器
async function createHTTPServer(port, name) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const path = url.pathname;
        
        // 模拟不同的API端点
        if (path.startsWith('/api/users')) {
            handleUsersAPI(req, res, path);
        } else if (path.startsWith('/secure/')) {
            handleSecureAPI(req, res, path);
        } else if (path.startsWith('/public/')) {
            handlePublicAPI(req, res, path);
        } else {
            // 默认响应
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                server: name,
                path: path,
                method: req.method,
                timestamp: new Date().toISOString()
            }));
        }
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`HTTP测试服务器启动: http://localhost:${port} (${name})`);
            resolve(server);
        });
    });
}

// 处理用户API
function handleUsersAPI(req, res, path) {
    const method = req.method;
    
    if (method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            users: [
                { id: 1, name: 'User 1', email: 'user1@example.com' },
                { id: 2, name: 'User 2', email: 'user2@example.com' }
            ]
        }));
    } else if (method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: 3,
                ...JSON.parse(body),
                created: new Date().toISOString()
            }));
        });
    } else if (method === 'PUT') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: 1,
                ...JSON.parse(body),
                updated: new Date().toISOString()
            }));
        });
    } else if (method === 'DELETE') {
        res.writeHead(204);
        res.end();
    } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
}

// 处理安全API
function handleSecureAPI(req, res, path) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        message: 'Secure data accessed',
        path: path,
        authenticated: true,
        timestamp: new Date().toISOString()
    }));
}

// 处理公开API
function handlePublicAPI(req, res, path) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        message: 'Public information',
        path: path,
        public: true,
        timestamp: new Date().toISOString()
    }));
}

// 创建HTTPS测试服务器
async function createHTTPSServer(port, name) {
    const fs = require('fs');
    const path = require('path');
    
    // 使用自签名证书
    const options = {
        key: fs.readFileSync(path.join(__dirname, 'certs', 'server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'server.crt'))
    };
    
    const server = https.createServer(options, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            server: name,
            secure: true,
            path: req.url,
            method: req.method,
            timestamp: new Date().toISOString()
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`HTTPS测试服务器启动: https://localhost:${port} (${name})`);
            resolve(server);
        });
    });
}

// 创建WebSocket测试服务器
async function createWebSocketServer(port, name) {
    const WebSocket = require('ws');
    
    const wss = new WebSocket.Server({ port: port });
    
    wss.on('connection', (ws, req) => {
        console.log(`WebSocket连接建立: ${name}`);
        
        ws.on('message', (message) => {
            console.log(`WebSocket收到消息: ${message}`);
            
            // 回显消息
            ws.send(JSON.stringify({
                type: 'echo',
                originalMessage: message.toString(),
                server: name,
                timestamp: new Date().toISOString()
            }));
        });
        
        ws.on('close', () => {
            console.log(`WebSocket连接关闭: ${name}`);
        });
        
        // 发送欢迎消息
        ws.send(JSON.stringify({
            type: 'welcome',
            message: `Connected to ${name}`,
            timestamp: new Date().toISOString()
        }));
    });
    
    console.log(`WebSocket测试服务器启动: ws://localhost:${port} (${name})`);
    
    return {
        server: wss,
        close: () => wss.close()
    };
}

// 创建静态文件服务器
async function createStaticFileServer(port, name) {
    const fs = require('fs');
    const path = require('path');
    const mime = require('mime-types');
    
    // 创建测试文件目录
    const staticDir = path.join(__dirname, 'static-test-files');
    if (!fs.existsSync(staticDir)) {
        fs.mkdirSync(staticDir, { recursive: true });
        
        // 创建测试文件
        fs.writeFileSync(path.join(staticDir, 'test.txt'), 'This is a test text file.');
        fs.writeFileSync(path.join(staticDir, 'data.json'), JSON.stringify({ test: 'data' }));
        
        // 创建一个简单的PNG图片（1x1像素）
        const pngBuffer = Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
            0x60, 0x82
        ]);
        fs.writeFileSync(path.join(staticDir, 'image.png'), pngBuffer);
    }
    
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const filePath = path.join(staticDir, url.pathname.replace('/static/', ''));
        
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const mimeType = mime.lookup(filePath) || 'application/octet-stream';
            const fileContent = fs.readFileSync(filePath);
            
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': fileContent.length
            });
            res.end(fileContent);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File not found' }));
        }
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`静态文件服务器启动: http://localhost:${port} (${name})`);
            resolve(server);
        });
    });
}

// 分析集成测试结果
function analyzeIntegrationTestResults(results) {
    const analysis = {
        overallSuccess: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        failures: [],
        categories: {}
    };
    
    // 分析HTTP测试
    if (results.httpTests) {
        const httpPassed = results.httpTests.filter(t => t.success).length;
        const httpTotal = results.httpTests.length;
        
        analysis.categories.http = {
            passed: httpPassed,
            total: httpTotal,
            success: httpPassed === httpTotal
        };
        
        analysis.totalTests += httpTotal;
        analysis.passedTests += httpPassed;
        
        if (httpPassed !== httpTotal) {
            analysis.overallSuccess = false;
            analysis.failures.push('HTTP API测试失败');
        }
    }
    
    // 分析HTTPS测试
    if (results.httpsTests) {
        const httpsPassed = results.httpsTests.filter(t => t.success).length;
        const httpsTotal = results.httpsTests.length;
        
        analysis.categories.https = {
            passed: httpsPassed,
            total: httpsTotal,
            success: httpsPassed === httpsTotal
        };
        
        analysis.totalTests += httpsTotal;
        analysis.passedTests += httpsPassed;
        
        if (httpsPassed !== httpsTotal) {
            analysis.overallSuccess = false;
            analysis.failures.push('HTTPS API测试失败');
        }
    }
    
    // 分析WebSocket测试
    if (results.websocketTests) {
        const wsPassed = results.websocketTests.filter(t => t.success).length;
        const wsTotal = results.websocketTests.length;
        
        analysis.categories.websocket = {
            passed: wsPassed,
            total: wsTotal,
            success: wsPassed === wsTotal
        };
        
        analysis.totalTests += wsTotal;
        analysis.passedTests += wsPassed;
        
        if (wsPassed !== wsTotal) {
            analysis.overallSuccess = false;
            analysis.failures.push('WebSocket测试失败');
        }
    }
    
    // 分析静态文件测试
    if (results.staticFileTests) {
        const staticPassed = results.staticFileTests.filter(t => t.success).length;
        const staticTotal = results.staticFileTests.length;
        
        analysis.categories.staticFiles = {
            passed: staticPassed,
            total: staticTotal,
            success: staticPassed === staticTotal
        };
        
        analysis.totalTests += staticTotal;
        analysis.passedTests += staticPassed;
        
        if (staticPassed !== staticTotal) {
            analysis.overallSuccess = false;
            analysis.failures.push('静态文件服务测试失败');
        }
    }
    
    // 分析认证测试
    if (results.authTests) {
        const authPassed = results.authTests.filter(t => t.success).length;
        const authTotal = results.authTests.length;
        
        analysis.categories.authentication = {
            passed: authPassed,
            total: authTotal,
            success: authPassed === authTotal
        };
        
        analysis.totalTests += authTotal;
        analysis.passedTests += authPassed;
        
        if (authPassed !== authTotal) {
            analysis.overallSuccess = false;
            analysis.failures.push('认证授权测试失败');
        }
    }
    
    // 分析限流测试
    if (results.rateLimitTests) {
        const rateLimitSuccess = results.rateLimitTests.rateLimitWorking;
        
        analysis.categories.rateLimit = {
            success: rateLimitSuccess,
            successCount: results.rateLimitTests.successCount,
            rateLimitedCount: results.rateLimitTests.rateLimitedCount
        };
        
        analysis.totalTests += 1;
        if (rateLimitSuccess) {
            analysis.passedTests += 1;
        } else {
            analysis.overallSuccess = false;
            analysis.failures.push('限流功能测试失败');
        }
    }
    
    analysis.failedTests = analysis.totalTests - analysis.passedTests;
    analysis.successRate = (analysis.passedTests / analysis.totalTests) * 100;
    
    return analysis;
}

testCompleteProxyFlow();
```

**预期结果**:
- 所有HTTP/HTTPS请求正常代理
- WebSocket连接和消息传输正常
- 静态文件服务正常
- 拦截器和中间件正确执行
- 认证和限流功能正常

---

### TC-INT-002: 多协议兼容性测试

**测试目标**: 验证代理服务器对不同协议的兼容性

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');
const https = require('https');
const http2 = require('http2');

async function testMultiProtocolCompatibility() {
    // 创建不同协议的测试服务器
    const testServers = await Promise.all([
        createHTTP1Server(8091),
        createHTTP2Server(8092),
        createHTTPSServer(8093),
        createHTTP2SecureServer(8094)
    ]);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            httpsPort: 8443,
            host: 'localhost'
        },
        protocols: {
            http1: { enabled: true },
            http2: { enabled: true },
            https: { enabled: true }
        },
        logger: { level: 'info' }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 多协议代理启动成功');
        
        // 测试HTTP/1.1协议
        console.log('\n=== 测试HTTP/1.1协议 ===');
        const http1Results = await testHTTP1Compatibility();
        
        // 测试HTTP/2协议
        console.log('\n=== 测试HTTP/2协议 ===');
        const http2Results = await testHTTP2Compatibility();
        
        // 测试HTTPS协议
        console.log('\n=== 测试HTTPS协议 ===');
        const httpsResults = await testHTTPSCompatibility();
        
        // 测试协议升级
        console.log('\n=== 测试协议升级 ===');
        const upgradeResults = await testProtocolUpgrade();
        
        // 综合兼容性分析
        console.log('\n=== 综合兼容性分析 ===');
        const analysis = analyzeProtocolCompatibility({
            http1: http1Results,
            http2: http2Results,
            https: httpsResults,
            upgrade: upgradeResults
        });
        
        console.log('协议兼容性分析:', analysis);
        
        return analysis.overallCompatible;
        
    } catch (error) {
        console.error('✗ 多协议兼容性测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServers.forEach(server => {
            if (server.close) server.close();
            if (server.server && server.server.close) server.server.close();
        });
    }
}

// 测试HTTP/1.1兼容性
async function testHTTP1Compatibility() {
    const tests = [
        { name: 'GET请求', method: 'GET', path: '/test' },
        { name: 'POST请求', method: 'POST', path: '/test', body: 'test data' },
        { name: 'Keep-Alive连接', method: 'GET', path: '/keepalive', headers: { 'Connection': 'keep-alive' } },
        { name: '分块传输', method: 'POST', path: '/chunked', headers: { 'Transfer-Encoding': 'chunked' } }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            const response = await makeHTTP1Request(test);
            results.push({
                name: test.name,
                success: response.statusCode === 200,
                protocol: response.httpVersion,
                statusCode: response.statusCode
            });
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}

// 测试HTTP/2兼容性
async function testHTTP2Compatibility() {
    const tests = [
        { name: 'HTTP/2 GET请求', path: '/test' },
        { name: 'HTTP/2 POST请求', path: '/test', method: 'POST', body: 'test data' },
        { name: 'HTTP/2 多路复用', path: '/multiplex', concurrent: 5 },
        { name: 'HTTP/2 服务器推送', path: '/push' }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            if (test.concurrent) {
                const response = await testHTTP2Multiplexing(test);
                results.push({
                    name: test.name,
                    success: response.success,
                    concurrentRequests: response.concurrentRequests,
                    totalTime: response.totalTime
                });
            } else {
                const response = await makeHTTP2Request(test);
                results.push({
                    name: test.name,
                    success: response.statusCode === 200,
                    protocol: 'HTTP/2',
                    statusCode: response.statusCode
                });
            }
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}

// 测试HTTPS兼容性
async function testHTTPSCompatibility() {
    const tests = [
        { name: 'TLS 1.2连接', tlsVersion: 'TLSv1.2' },
        { name: 'TLS 1.3连接', tlsVersion: 'TLSv1.3' },
        { name: 'SNI支持', hostname: 'test.example.com' },
        { name: '客户端证书认证', clientCert: true }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            const response = await makeHTTPSRequest({
                hostname: 'localhost',
                port: 8443,
                path: '/https-test',
                method: 'GET',
                headers: {
                    'Host': test.hostname || 'localhost:8093'
                },
                secureProtocol: test.tlsVersion ? `${test.tlsVersion}_method` : undefined,
                rejectUnauthorized: false
            });
            
            results.push({
                name: test.name,
                success: response.statusCode === 200,
                tlsVersion: test.tlsVersion,
                statusCode: response.statusCode
            });
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}

// 测试协议升级
async function testProtocolUpgrade() {
    const tests = [
        { name: 'HTTP到HTTPS升级', from: 'http', to: 'https' },
        { name: 'HTTP/1.1到HTTP/2升级', from: 'http1', to: 'http2' },
        { name: 'WebSocket升级', from: 'http', to: 'websocket' }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            let success = false;
            
            if (test.to === 'websocket') {
                success = await testWebSocketUpgrade();
            } else if (test.to === 'http2') {
                success = await testHTTP2Upgrade();
            } else if (test.to === 'https') {
                success = await testHTTPSUpgrade();
            }
            
            results.push({
                name: test.name,
                success: success,
                from: test.from,
                to: test.to
            });
        } catch (error) {
            results.push({
                name: test.name,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}

// 发送HTTP/1.1请求
function makeHTTP1Request(test) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: test.path,
            method: test.method || 'GET',
            headers: {
                'Host': 'localhost:8091',
                ...test.headers
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    httpVersion: res.httpVersion,
                    headers: res.headers,
                    data: data
                });
            });
        });
        
        req.on('error', reject);
        
        if (test.body) {
            req.write(test.body);
        }
        
        req.end();
    });
}

// 发送HTTP/2请求
function makeHTTP2Request(test) {
    return new Promise((resolve, reject) => {
        const client = http2.connect('http://localhost:8080');
        
        const req = client.request({
            ':method': test.method || 'GET',
            ':path': test.path,
            'host': 'localhost:8092'
        });
        
        let data = '';
        
        req.on('response', (headers) => {
            resolve({
                statusCode: headers[':status'],
                headers: headers
            });
        });
        
        req.on('data', (chunk) => {
            data += chunk;
        });
        
        req.on('end', () => {
            client.close();
        });
        
        req.on('error', (error) => {
            client.close();
            reject(error);
        });
        
        if (test.body) {
            req.write(test.body);
        }
        
        req.end();
    });
}

// 测试HTTP/2多路复用
function testHTTP2Multiplexing(test) {
    return new Promise((resolve, reject) => {
        const client = http2.connect('http://localhost:8080');
        const startTime = Date.now();
        const requests = [];
        
        for (let i = 0; i < test.concurrent; i++) {
            const req = client.request({
                ':method': 'GET',
                ':path': `${test.path}/${i}`,
                'host': 'localhost:8092'
            });
            
            requests.push(new Promise((resolveReq) => {
                req.on('response', (headers) => {
                    resolveReq({ statusCode: headers[':status'] });
                });
                
                req.on('error', () => {
                    resolveReq({ statusCode: 0 });
                });
                
                req.end();
            }));
        }
        
        Promise.all(requests).then(responses => {
            const totalTime = Date.now() - startTime;
            const successCount = responses.filter(r => r.statusCode === 200).length;
            
            client.close();
            
            resolve({
                success: successCount === test.concurrent,
                concurrentRequests: test.concurrent,
                successCount: successCount,
                totalTime: totalTime
            });
        }).catch(reject);
    });
}

// 测试WebSocket升级
function testWebSocketUpgrade() {
    return new Promise((resolve) => {
        const WebSocket = require('ws');
        
        const ws = new WebSocket('ws://localhost:8080/websocket-test', {
            headers: {
                'Host': 'localhost:8093'
            }
        });
        
        ws.on('open', () => {
            ws.close();
            resolve(true);
        });
        
        ws.on('error', () => {
            resolve(false);
        });
        
        setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                ws.terminate();
                resolve(false);
            }
        }, 5000);
    });
}

// 测试HTTP/2升级
function testHTTP2Upgrade() {
    return new Promise((resolve) => {
        const client = http2.connect('http://localhost:8080');
        
        const req = client.request({
            ':method': 'GET',
            ':path': '/upgrade-test',
            'host': 'localhost:8092'
        });
        
        req.on('response', (headers) => {
            client.close();
            resolve(headers[':status'] === 200);
        });
        
        req.on('error', () => {
            client.close();
            resolve(false);
        });
        
        req.end();
        
        setTimeout(() => {
            client.close();
            resolve(false);
        }, 5000);
    });
}

// 测试HTTPS升级
function testHTTPSUpgrade() {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'localhost',
            port: 8443,
            path: '/upgrade-test',
            method: 'GET',
            headers: {
                'Host': 'localhost:8093'
            },
            rejectUnauthorized: false
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        
        req.on('error', () => {
            resolve(false);
        });
        
        req.end();
        
        setTimeout(() => {
            req.destroy();
            resolve(false);
        }, 5000);
    });
}

// 创建HTTP/1.1服务器
async function createHTTP1Server(port) {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            protocol: 'HTTP/1.1',
            method: req.method,
            url: req.url,
            httpVersion: req.httpVersion
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`HTTP/1.1服务器启动: http://localhost:${port}`);
            resolve(server);
        });
    });
}

// 创建HTTP/2服务器
async function createHTTP2Server(port) {
    const server = http2.createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
            protocol: 'HTTP/2',
            method: req.method,
            url: req.url
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`HTTP/2服务器启动: http://localhost:${port}`);
            resolve(server);
        });
    });
}

// 创建HTTP/2安全服务器
async function createHTTP2SecureServer(port) {
    const fs = require('fs');
    const path = require('path');
    
    const options = {
        key: fs.readFileSync(path.join(__dirname, 'certs', 'server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'server.crt'))
    };
    
    const server = http2.createSecureServer(options, (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
            protocol: 'HTTP/2 over TLS',
            method: req.method,
            url: req.url,
            secure: true
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`HTTP/2安全服务器启动: https://localhost:${port}`);
            resolve(server);
        });
    });
}

// 分析协议兼容性
function analyzeProtocolCompatibility(results) {
    const analysis = {
        overallCompatible: true,
        protocols: {},
        totalTests: 0,
        passedTests: 0
    };
    
    // 分析各协议测试结果
    Object.keys(results).forEach(protocol => {
        const protocolResults = results[protocol];
        const passed = protocolResults.filter(r => r.success).length;
        const total = protocolResults.length;
        
        analysis.protocols[protocol] = {
            passed: passed,
            total: total,
            success: passed === total,
            successRate: (passed / total) * 100
        };
        
        analysis.totalTests += total;
        analysis.passedTests += passed;
        
        if (passed !== total) {
            analysis.overallCompatible = false;
        }
    });
    
    analysis.overallSuccessRate = (analysis.passedTests / analysis.totalTests) * 100;
    
    return analysis;
}

testMultiProtocolCompatibility();
```

**预期结果**:
- HTTP/1.1协议完全兼容
- HTTP/2协议支持良好
- HTTPS连接正常
- 协议升级功能正常

---

### TC-INT-003: 负载均衡集成测试

**测试目标**: 验证代理服务器的负载均衡功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testLoadBalancingIntegration() {
    // 创建多个后端服务器
    const backendServers = await Promise.all([
        createBackendServer(8091, 'backend-1'),
        createBackendServer(8092, 'backend-2'),
        createBackendServer(8093, 'backend-3'),
        createBackendServer(8094, 'backend-4')
    ]);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        loadBalancing: {
            enabled: true,
            algorithm: 'round-robin', // 轮询算法
            backends: [
                { host: 'localhost', port: 8091, weight: 1 },
                { host: 'localhost', port: 8092, weight: 2 },
                { host: 'localhost', port: 8093, weight: 1 },
                { host: 'localhost', port: 8094, weight: 1 }
            ],
            healthCheck: {
                enabled: true,
                interval: 5000,
                timeout: 3000,
                path: '/health',
                expectedStatus: 200
            },
            failover: {
                enabled: true,
                maxRetries: 3,
                retryDelay: 1000
            }
        },
        logger: { level: 'info' }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 负载均衡代理启动成功');
        
        // 测试轮询负载均衡
        console.log('\n=== 测试轮询负载均衡 ===');
        const roundRobinResults = await testRoundRobinBalancing();
        
        // 测试加权负载均衡
        console.log('\n=== 测试加权负载均衡 ===');
        const weightedResults = await testWeightedBalancing();
        
        // 测试健康检查
        console.log('\n=== 测试健康检查 ===');
        const healthCheckResults = await testHealthChecking();
        
        // 测试故障转移
        console.log('\n=== 测试故障转移 ===');
        const failoverResults = await testFailoverMechanism();
        
        // 测试会话保持
        console.log('\n=== 测试会话保持 ===');
        const sessionResults = await testSessionPersistence();
        
        // 综合分析
        console.log('\n=== 负载均衡综合分析 ===');
        const analysis = analyzeLoadBalancingResults({
            roundRobin: roundRobinResults,
            weighted: weightedResults,
            healthCheck: healthCheckResults,
            failover: failoverResults,
            session: sessionResults
        });
        
        console.log('负载均衡分析:', analysis);
        
        return analysis.overallSuccess;
        
    } catch (error) {
        console.error('✗ 负载均衡集成测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        backendServers.forEach(server => server.close());
    }
}

// 测试轮询负载均衡
async function testRoundRobinBalancing() {
    console.log('测试轮询负载均衡...');
    
    const requests = 20;
    const results = [];
    
    for (let i = 0; i < requests; i++) {
        try {
            const response = await makeProxyRequest(`/round-robin-test-${i}`);
            results.push({
                index: i,
                success: true,
                backend: response.data.server,
                responseTime: response.responseTime
            });
        } catch (error) {
            results.push({
                index: i,
                success: false,
                error: error.message
            });
        }
    }
    
    // 分析分发情况
    const distribution = {};
    results.filter(r => r.success).forEach(r => {
        distribution[r.backend] = (distribution[r.backend] || 0) + 1;
    });
    
    console.log('请求分发情况:', distribution);
    
    // 验证是否均匀分发
    const backendCounts = Object.values(distribution);
    const avgCount = backendCounts.reduce((sum, count) => sum + count, 0) / backendCounts.length;
    const variance = backendCounts.reduce((sum, count) => sum + Math.pow(count - avgCount, 2), 0) / backendCounts.length;
    const isBalanced = variance < avgCount * 0.2; // 方差小于平均值的20%认为是均衡的
    
    return {
        total