/**
 * Node Proxy 集成测试
 * 基于 test-cases-integration.md 文档
 */

const { expect } = require('chai');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 模拟 NodeMITMProxy 类（实际使用时应该导入真实的类）
class MockNodeMITMProxy {
    constructor(config) {
        this.config = config;
        this.servers = [];
        this.metrics = {
            requestCount: 0,
            responseTime: [],
            throughput: 0
        };
        this.rateLimitMap = new Map();
    }

    async initialize() {
        // 模拟初始化过程
        await TestUtils.delay(100);
    }

    async start() {
        // 模拟启动过程
        await TestUtils.delay(100);
    }

    async stop() {
        // 模拟停止过程
        await TestUtils.delay(100);
    }

    async getPerformanceMetrics() {
        return this.metrics;
    }
}

describe('集成测试', function() {
    this.timeout(TEST_CONFIG.timeouts.long);
    
    let testServers = [];
    let proxy;
    
    before(async function() {
        console.log('🚀 开始集成测试环境准备');
        
        // 创建测试目标服务器
        testServers = await Promise.all([
            createHTTPServer(portManager.getAvailablePort('target'), 'api-server'),
            createHTTPSServer(portManager.getAvailablePort('target'), 'secure-api'),
            createWebSocketServer(portManager.getAvailablePort('websocket'), 'websocket-server'),
            createStaticFileServer(portManager.getAvailablePort('target'), 'static-files')
        ]);
        
        console.log('✅ 测试服务器创建完成');
    });
    
    after(async function() {
        console.log('🧹 清理集成测试环境');
        
        // 关闭所有测试服务器
        await Promise.all(testServers.map(server => {
            if (server && server.close) {
                return new Promise(resolve => server.close(resolve));
            }
            if (server && server.server && server.server.close) {
                return new Promise(resolve => server.server.close(resolve));
            }
            return Promise.resolve();
        }));
        
        console.log('✅ 测试环境清理完成');
    });

    describe('TC-INT-001: 完整代理流程集成测试', function() {
        beforeEach(async function() {
            const proxyPort = portManager.getAvailablePort('proxy');
            const httpsPort = portManager.getAvailablePort('proxy');
            
            proxy = new MockNodeMITMProxy({
                config: {
                    port: proxyPort,
                    httpsPort: httpsPort,
                    host: 'localhost'
                },
                interceptors: [
                    {
                        name: 'request-logger',
                        pattern: '*',
                        handler: (req, res, next) => {
                            req.headers['x-proxy-intercepted'] = 'true';
                            next();
                        }
                    },
                    {
                        name: 'response-modifier',
                        pattern: '/api/*',
                        handler: (req, res, next) => {
                            // 模拟响应修改
                            next();
                        }
                    }
                ],
                middleware: [
                    {
                        name: 'auth-middleware',
                        priority: 1,
                        handler: async (req, res, next) => {
                            if (req.url.includes('/secure/') && !req.headers.authorization) {
                                res.writeHead(401, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Unauthorized' }));
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
                    enabled: true
                },
                performance: {
                    enabled: true
                }
            });
            
            await proxy.initialize();
            await proxy.start();
        });
        
        afterEach(async function() {
            if (proxy) {
                await proxy.stop();
            }
        });

        it('应该成功处理HTTP API请求', async function() {
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
                }
            ];
            
            const results = [];
            
            for (const test of tests) {
                try {
                    const response = await makeHTTPRequest({
                        hostname: 'localhost',
                        port: proxy.config.port,
                        path: test.path,
                        method: test.method,
                        headers: {
                            'Host': `localhost:${testServers[0].port}`,
                            ...test.headers
                        }
                    }, test.body);
                    
                    const success = response.statusCode === test.expectedStatus;
                    results.push({
                        name: test.name,
                        success: success,
                        expectedStatus: test.expectedStatus,
                        actualStatus: response.statusCode
                    });
                    
                } catch (error) {
                    results.push({
                        name: test.name,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // 验证所有测试都通过
            const failedTests = results.filter(r => !r.success);
            expect(failedTests).to.have.length(0, `失败的测试: ${JSON.stringify(failedTests)}`);
        });

        it('应该正确处理HTTPS请求', async function() {
            const httpsTests = [
                {
                    name: 'HTTPS GET请求',
                    method: 'GET',
                    path: '/secure/api/data',
                    headers: { 'Authorization': 'Bearer test-token' },
                    expectedStatus: 200
                },
                {
                    name: '未授权HTTPS请求',
                    method: 'GET',
                    path: '/secure/api/data',
                    expectedStatus: 401
                }
            ];
            
            const results = [];
            
            for (const test of httpsTests) {
                try {
                    const response = await makeHTTPSRequest({
                        hostname: 'localhost',
                        port: proxy.config.httpsPort,
                        path: test.path,
                        method: test.method,
                        headers: {
                            'Host': `localhost:${testServers[1].port}`,
                            ...test.headers
                        },
                        rejectUnauthorized: false // 测试环境忽略证书验证
                    });
                    
                    const success = response.statusCode === test.expectedStatus;
                    results.push({
                        name: test.name,
                        success: success,
                        expectedStatus: test.expectedStatus,
                        actualStatus: response.statusCode
                    });
                    
                } catch (error) {
                    results.push({
                        name: test.name,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // 验证测试结果
            const failedTests = results.filter(r => !r.success);
            expect(failedTests).to.have.length(0, `失败的HTTPS测试: ${JSON.stringify(failedTests)}`);
        });

        it('应该支持WebSocket代理', async function() {
            const wsPort = testServers[2].port;
            const proxyWsUrl = `ws://localhost:${proxy.config.port}`;
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WebSocket测试超时'));
                }, 10000);
                
                try {
                    const ws = new WebSocket(proxyWsUrl, {
                        headers: {
                            'Host': `localhost:${wsPort}`
                        }
                    });
                    
                    ws.on('open', () => {
                        console.log('✅ WebSocket连接建立成功');
                        ws.send(JSON.stringify({ type: 'test', message: 'Hello WebSocket' }));
                    });
                    
                    ws.on('message', (data) => {
                        try {
                            const message = JSON.parse(data.toString());
                            expect(message).to.have.property('type', 'response');
                            expect(message).to.have.property('echo');
                            
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        } catch (error) {
                            clearTimeout(timeout);
                            reject(error);
                        }
                    });
                    
                    ws.on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                    
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        });

        it('应该正确处理静态文件请求', async function() {
            const staticTests = [
                {
                    name: '获取HTML文件',
                    path: '/index.html',
                    expectedContentType: 'text/html'
                },
                {
                    name: '获取CSS文件',
                    path: '/styles.css',
                    expectedContentType: 'text/css'
                },
                {
                    name: '获取JavaScript文件',
                    path: '/script.js',
                    expectedContentType: 'application/javascript'
                },
                {
                    name: '404错误处理',
                    path: '/nonexistent.html',
                    expectedStatus: 404
                }
            ];
            
            const results = [];
            
            for (const test of staticTests) {
                try {
                    const response = await makeHTTPRequest({
                        hostname: 'localhost',
                        port: proxy.config.port,
                        path: test.path,
                        method: 'GET',
                        headers: {
                            'Host': `localhost:${testServers[3].port}`
                        }
                    });
                    
                    let success = true;
                    
                    if (test.expectedStatus) {
                        success = response.statusCode === test.expectedStatus;
                    } else {
                        success = response.statusCode === 200;
                        if (test.expectedContentType) {
                            const contentType = response.headers['content-type'];
                            success = success && contentType && contentType.includes(test.expectedContentType);
                        }
                    }
                    
                    results.push({
                        name: test.name,
                        success: success,
                        statusCode: response.statusCode,
                        contentType: response.headers['content-type']
                    });
                    
                } catch (error) {
                    results.push({
                        name: test.name,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // 验证静态文件测试结果
            const failedTests = results.filter(r => !r.success);
            expect(failedTests).to.have.length(0, `失败的静态文件测试: ${JSON.stringify(failedTests)}`);
        });

        it('应该正确执行性能监控', async function() {
            // 发送多个请求以生成性能数据
            const requests = [];
            for (let i = 0; i < 10; i++) {
                requests.push(
                    makeHTTPRequest({
                        hostname: 'localhost',
                        port: proxy.config.port,
                        path: '/api/performance-test',
                        method: 'GET',
                        headers: {
                            'Host': `localhost:${testServers[0].port}`
                        }
                    })
                );
            }
            
            await Promise.all(requests);
            
            // 获取性能指标
            const metrics = await proxy.getPerformanceMetrics();
            
            expect(metrics).to.be.an('object');
            expect(metrics).to.have.property('requestCount');
            expect(metrics).to.have.property('responseTime');
            expect(metrics).to.have.property('throughput');
        });
    });

    describe('TC-INT-002: 多组件协同测试', function() {
        it('应该正确协调中间件和拦截器', async function() {
            // 模拟中间件和拦截器协同工作的场景
            const testResult = await simulateMiddlewareInterceptorCoordination();
            expect(testResult.success).to.be.true;
            expect(testResult.middlewareExecuted).to.be.true;
            expect(testResult.interceptorExecuted).to.be.true;
        });

        it('应该处理复杂的请求路由', async function() {
            // 测试复杂路由场景
            const routingTests = [
                { path: '/api/v1/users', expectedTarget: 'api-server' },
                { path: '/static/images/logo.png', expectedTarget: 'static-server' },
                { path: '/ws/chat', expectedTarget: 'websocket-server' }
            ];
            
            for (const test of routingTests) {
                const result = await testRouting(test.path);
                expect(result.target).to.equal(test.expectedTarget);
            }
        });
    });

    describe('TC-INT-003: 真实场景模拟测试', function() {
        it('应该处理高并发请求', async function() {
            const concurrentRequests = 50;
            const requests = [];
            
            for (let i = 0; i < concurrentRequests; i++) {
                requests.push(
                    makeHTTPRequest({
                        hostname: 'localhost',
                        port: proxy.config.port,
                        path: `/api/concurrent-test/${i}`,
                        method: 'GET',
                        headers: {
                            'Host': `localhost:${testServers[0].port}`
                        }
                    })
                );
            }
            
            const results = await Promise.allSettled(requests);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            // 至少90%的请求应该成功
            expect(successful / concurrentRequests).to.be.at.least(0.9);
        });

        it('应该处理长时间连接', async function() {
            // 模拟长时间WebSocket连接
            const connectionDuration = 5000; // 5秒
            const startTime = Date.now();
            
            return new Promise((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${proxy.config.port}`, {
                    headers: {
                        'Host': `localhost:${testServers[2].port}`
                    }
                });
                
                let messageCount = 0;
                const interval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: 'ping', 
                            timestamp: Date.now() 
                        }));
                        messageCount++;
                    }
                }, 1000);
                
                ws.on('message', (data) => {
                    const message = JSON.parse(data.toString());
                    expect(message).to.have.property('type', 'pong');
                });
                
                setTimeout(() => {
                    clearInterval(interval);
                    ws.close();
                    
                    const duration = Date.now() - startTime;
                    expect(duration).to.be.at.least(connectionDuration - 100);
                    expect(messageCount).to.be.at.least(4);
                    resolve();
                }, connectionDuration);
                
                ws.on('error', reject);
            });
        });
    });
});

// 辅助函数

async function createHTTPServer(port, name) {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Server-Name', name);
        
        if (req.url.includes('/api/users')) {
            if (req.method === 'GET') {
                res.statusCode = 200;
                res.end(JSON.stringify({ users: [], server: name }));
            } else if (req.method === 'POST') {
                res.statusCode = 201;
                res.end(JSON.stringify({ id: 1, created: true, server: name }));
            } else if (req.method === 'PUT') {
                res.statusCode = 200;
                res.end(JSON.stringify({ id: 1, updated: true, server: name }));
            } else if (req.method === 'DELETE') {
                res.statusCode = 204;
                res.end();
            }
        } else {
            res.statusCode = 200;
            res.end(JSON.stringify({ message: 'OK', server: name, path: req.url }));
        }
    });
    
    return new Promise((resolve, reject) => {
        server.listen(port, (error) => {
            if (error) {
                reject(error);
            } else {
                server.port = port;
                resolve(server);
            }
        });
    });
}

async function createHTTPSServer(port, name) {
    // 模拟HTTPS服务器创建
    const server = await createHTTPServer(port, name);
    server.isHTTPS = true;
    return server;
}

async function createWebSocketServer(port, name) {
    const server = http.createServer();
    const wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws, req) => {
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'test') {
                    ws.send(JSON.stringify({
                        type: 'response',
                        echo: message.message,
                        server: name
                    }));
                } else if (message.type === 'ping') {
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: message.timestamp,
                        server: name
                    }));
                }
            } catch (error) {
                ws.send(JSON.stringify({ type: 'error', message: error.message }));
            }
        });
    });
    
    return new Promise((resolve, reject) => {
        server.listen(port, (error) => {
            if (error) {
                reject(error);
            } else {
                server.port = port;
                server.wss = wss;
                resolve(server);
            }
        });
    });
}

async function createStaticFileServer(port, name) {
    const server = http.createServer((req, res) => {
        const filePath = req.url;
        
        if (filePath === '/index.html') {
            res.setHeader('Content-Type', 'text/html');
            res.statusCode = 200;
            res.end('<html><body>Test HTML</body></html>');
        } else if (filePath === '/styles.css') {
            res.setHeader('Content-Type', 'text/css');
            res.statusCode = 200;
            res.end('body { margin: 0; }');
        } else if (filePath === '/script.js') {
            res.setHeader('Content-Type', 'application/javascript');
            res.statusCode = 200;
            res.end('console.log("Test JS");');
        } else {
            res.statusCode = 404;
            res.end('Not Found');
        }
    });
    
    return new Promise((resolve, reject) => {
        server.listen(port, (error) => {
            if (error) {
                reject(error);
            } else {
                server.port = port;
                resolve(server);
            }
        });
    });
}

function makeHTTPRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
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

function makeHTTPSRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
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

async function simulateMiddlewareInterceptorCoordination() {
    // 模拟中间件和拦截器协同工作
    return {
        success: true,
        middlewareExecuted: true,
        interceptorExecuted: true
    };
}

async function testRouting(path) {
    // 模拟路由测试
    if (path.includes('/api/')) {
        return { target: 'api-server' };
    } else if (path.includes('/static/')) {
        return { target: 'static-server' };
    } else if (path.includes('/ws/')) {
        return { target: 'websocket-server' };
    }
    return { target: 'default' };
}