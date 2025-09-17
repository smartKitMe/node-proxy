# WebSocket 代理测试用例

## 概述

本文档包含 Node Proxy WebSocket 代理功能的测试用例，涵盖基础 WebSocket 代理、连接拦截、消息拦截、升级请求处理等功能。

## 测试环境要求

- Node.js >= 12.0.0
- WebSocket 库：ws
- 测试端口：8080（代理），8090-8095（WebSocket服务器）
- 网络连接正常

## 基础 WebSocket 代理测试

### TC-WS-001: 基础 WebSocket 代理测试

**测试目标**: 验证基础 WebSocket 代理功能正常工作

**前置条件**: 
- 代理服务器支持 WebSocket
- 测试 WebSocket 服务器可用

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');
const http = require('http');

async function testBasicWebSocketProxy() {
    // 1. 创建测试 WebSocket 服务器
    const testServer = await createTestWebSocketServer(8090);
    
    // 2. 创建支持 WebSocket 的代理
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        enableWebSocket: true,
        logger: {
            level: 'info'
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ WebSocket 代理启动成功');
        
        // 3. 通过代理连接 WebSocket 服务器
        const wsClient = new WebSocket('ws://localhost:8090/echo', {
            // 配置代理
            agent: new (require('http').Agent)({
                proxy: 'http://localhost:8080'
            })
        });
        
        return new Promise((resolve, reject) => {
            let messageReceived = false;
            
            wsClient.on('open', () => {
                console.log('✓ WebSocket 连接建立成功');
                
                // 发送测试消息
                wsClient.send(JSON.stringify({
                    type: 'test',
                    message: 'Hello WebSocket Proxy!',
                    timestamp: new Date().toISOString()
                }));
            });
            
            wsClient.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log('✓ 收到 WebSocket 消息:', message);
                    
                    if (message.type === 'echo' && message.original.message === 'Hello WebSocket Proxy!') {
                        messageReceived = true;
                        console.log('✓ WebSocket 消息代理成功');
                        wsClient.close();
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            wsClient.on('close', () => {
                if (messageReceived) {
                    console.log('✓ WebSocket 连接正常关闭');
                    resolve(true);
                } else {
                    reject(new Error('未收到预期消息'));
                }
            });
            
            wsClient.on('error', reject);
            
            // 超时处理
            setTimeout(() => {
                if (!messageReceived) {
                    wsClient.close();
                    reject(new Error('WebSocket 测试超时'));
                }
            }, 5000);
        });
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

// 创建测试 WebSocket 服务器
function createTestWebSocketServer(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        const wsServer = new WebSocket.Server({ 
            server,
            path: '/echo'
        });
        
        wsServer.on('connection', (ws) => {
            console.log('WebSocket 服务器收到连接');
            
            ws.send(JSON.stringify({
                type: 'welcome',
                message: '欢迎使用 WebSocket 测试服务'
            }));
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    ws.send(JSON.stringify({
                        type: 'echo',
                        original: message,
                        timestamp: new Date().toISOString(),
                        server: 'test-websocket-server'
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid JSON message'
                    }));
                }
            });
        });
        
        server.listen(port, () => {
            console.log(`WebSocket 测试服务器启动: ws://localhost:${port}/echo`);
            resolve({ server, wsServer });
        });
    });
}

testBasicWebSocketProxy();
```

**预期结果**:
- WebSocket 连接成功建立
- 消息能够正常收发
- 连接能够正常关闭
- 无连接错误或超时

---

### TC-WS-002: WebSocket 升级请求拦截测试

**测试目标**: 验证 WebSocket 升级请求的拦截功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');
const WebSocket = require('ws');

async function testWebSocketUpgradeInterception() {
    const testServer = await createTestWebSocketServer(8091);
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    let upgradeIntercepted = false;
    let authenticationPassed = false;
    
    // WebSocket 升级请求拦截器
    proxy.intercept({
        name: 'websocket-upgrade-interceptor',
        priority: 100,
        
        interceptUpgrade: async (context) => {
            const { request } = context;
            upgradeIntercepted = true;
            
            console.log(`WebSocket 升级请求: ${request.url}`);
            console.log('升级头部:', {
                'sec-websocket-key': request.headers['sec-websocket-key'],
                'sec-websocket-version': request.headers['sec-websocket-version'],
                'sec-websocket-protocol': request.headers['sec-websocket-protocol']
            });
            
            // 认证检查
            const token = request.headers['authorization'];
            if (!token || !isValidToken(token)) {
                console.log('✗ WebSocket 认证失败');
                return InterceptorResponse.directResponse({
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'text/plain'
                    },
                    body: 'Unauthorized WebSocket connection'
                });
            }
            
            authenticationPassed = true;
            console.log('✓ WebSocket 认证通过');
            
            // 修改请求头后转发
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...request.headers,
                    'X-Proxy-WebSocket': 'true',
                    'X-Connection-Time': new Date().toISOString(),
                    'X-Auth-Validated': 'true'
                }
            });
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ WebSocket 升级拦截代理启动成功');
        
        // 测试未认证的连接（应该被拒绝）
        try {
            const unauthorizedWs = new WebSocket('ws://localhost:8091/echo', {
                agent: new (require('http').Agent)({
                    proxy: 'http://localhost:8080'
                })
            });
            
            await new Promise((resolve, reject) => {
                unauthorizedWs.on('open', () => {
                    reject(new Error('未认证连接不应该成功'));
                });
                
                unauthorizedWs.on('error', (error) => {
                    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                        console.log('✓ 未认证连接被正确拒绝');
                        resolve();
                    } else {
                        reject(error);
                    }
                });
                
                setTimeout(() => resolve(), 2000); // 2秒超时
            });
        } catch (error) {
            console.log('✓ 未认证连接处理正确');
        }
        
        // 测试已认证的连接（应该成功）
        const authorizedWs = new WebSocket('ws://localhost:8091/echo', {
            headers: {
                'Authorization': 'Bearer valid-token'
            },
            agent: new (require('http').Agent)({
                proxy: 'http://localhost:8080'
            })
        });
        
        return new Promise((resolve, reject) => {
            authorizedWs.on('open', () => {
                console.log('✓ 已认证 WebSocket 连接成功');
                
                // 验证拦截器是否执行
                if (upgradeIntercepted && authenticationPassed) {
                    console.log('✓ WebSocket 升级拦截器正确执行');
                    authorizedWs.close();
                    resolve(true);
                } else {
                    reject(new Error('拦截器未正确执行'));
                }
            });
            
            authorizedWs.on('error', reject);
            
            setTimeout(() => {
                reject(new Error('已认证连接超时'));
            }, 5000);
        });
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.server.close();
    }
}

function isValidToken(token) {
    return token === 'Bearer valid-token';
}

testWebSocketUpgradeInterception();
```

**预期结果**:
- 未认证连接被拒绝（401状态码）
- 已认证连接成功建立
- 升级请求被正确拦截
- 请求头被正确修改

---

### TC-WS-003: WebSocket 消息拦截测试

**测试目标**: 验证 WebSocket 消息的拦截和修改功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');

async function testWebSocketMessageInterception() {
    const testServer = await createTestWebSocketServer(8092);
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    let clientToServerMessages = [];
    let serverToClientMessages = [];
    
    // WebSocket 消息拦截器
    proxy.intercept({
        name: 'websocket-message-interceptor',
        priority: 100,
        
        interceptWebSocketMessage: async (context) => {
            const { message, direction, connection } = context;
            
            console.log(`WebSocket 消息 [${direction}]:`, message.toString());
            
            if (direction === 'client-to-server') {
                clientToServerMessages.push(message.toString());
                
                try {
                    const data = JSON.parse(message.toString());
                    
                    // 修改客户端到服务器的消息
                    data.timestamp = new Date().toISOString();
                    data.proxied = true;
                    data.interceptor = 'client-to-server';
                    
                    const modifiedMessage = JSON.stringify(data);
                    console.log('✓ 修改客户端消息:', modifiedMessage);
                    
                    return { modifiedMessage };
                } catch (e) {
                    // 非JSON消息直接转发
                    return { modifiedMessage: message };
                }
            } else if (direction === 'server-to-client') {
                serverToClientMessages.push(message.toString());
                
                try {
                    const data = JSON.parse(message.toString());
                    
                    // 修改服务器到客户端的消息
                    data.proxyProcessed = true;
                    data.processingTime = new Date().toISOString();
                    data.interceptor = 'server-to-client';
                    
                    const modifiedMessage = JSON.stringify(data);
                    console.log('✓ 修改服务器消息:', modifiedMessage);
                    
                    return { modifiedMessage };
                } catch (e) {
                    return { modifiedMessage: message };
                }
            }
            
            return { modifiedMessage: message };
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ WebSocket 消息拦截代理启动成功');
        
        const wsClient = new WebSocket('ws://localhost:8092/echo', {
            agent: new (require('http').Agent)({
                proxy: 'http://localhost:8080'
            })
        });
        
        return new Promise((resolve, reject) => {
            let testCompleted = false;
            
            wsClient.on('open', () => {
                console.log('✓ WebSocket 连接建立');
                
                // 发送测试消息
                wsClient.send(JSON.stringify({
                    type: 'test',
                    message: 'Test message interception',
                    id: 'test-001'
                }));
            });
            
            wsClient.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log('收到消息:', message);
                    
                    // 验证消息拦截和修改
                    if (message.type === 'echo') {
                        // 验证客户端消息被修改
                        if (message.original.proxied === true && 
                            message.original.interceptor === 'client-to-server') {
                            console.log('✓ 客户端消息拦截修改成功');
                        }
                        
                        // 验证服务器消息被修改
                        if (message.proxyProcessed === true && 
                            message.interceptor === 'server-to-client') {
                            console.log('✓ 服务器消息拦截修改成功');
                        }
                        
                        testCompleted = true;
                        wsClient.close();
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            wsClient.on('close', () => {
                if (testCompleted) {
                    // 验证消息统计
                    console.log(`客户端到服务器消息数: ${clientToServerMessages.length}`);
                    console.log(`服务器到客户端消息数: ${serverToClientMessages.length}`);
                    
                    if (clientToServerMessages.length > 0 && serverToClientMessages.length > 0) {
                        console.log('✓ WebSocket 消息拦截统计正确');
                        resolve(true);
                    } else {
                        reject(new Error('消息拦截统计异常'));
                    }
                } else {
                    reject(new Error('测试未完成'));
                }
            });
            
            wsClient.on('error', reject);
            
            setTimeout(() => {
                if (!testCompleted) {
                    wsClient.close();
                    reject(new Error('WebSocket 消息拦截测试超时'));
                }
            }, 10000);
        });
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.server.close();
    }
}

testWebSocketMessageInterception();
```

**预期结果**:
- 客户端到服务器的消息被拦截和修改
- 服务器到客户端的消息被拦截和修改
- 消息统计正确
- 修改后的消息格式正确

---

### TC-WS-004: WebSocket 中间件测试

**测试目标**: 验证 WebSocket 中间件系统的功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');

async function testWebSocketMiddleware() {
    const testServer = await createTestWebSocketServer(8093);
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    const middlewareExecutionLog = [];
    
    // WebSocket 升级中间件
    proxy.use({
        name: 'websocket-upgrade-middleware',
        stage: 'upgrade',
        handler: async (context, next) => {
            const { request } = context;
            middlewareExecutionLog.push('upgrade-middleware');
            
            console.log(`WebSocket 升级中间件: ${request.url}`);
            console.log('连接头部:', {
                'connection': request.headers['connection'],
                'upgrade': request.headers['upgrade'],
                'sec-websocket-key': request.headers['sec-websocket-key']
            });
            
            // 记录连接信息
            request.headers['X-Middleware-Processed'] = 'upgrade';
            request.headers['X-Connection-Id'] = generateConnectionId();
            
            await next();
        }
    });
    
    // WebSocket 消息中间件
    proxy.use({
        name: 'websocket-message-middleware',
        stage: 'websocket-message',
        handler: async (context, next) => {
            const { message, direction } = context;
            middlewareExecutionLog.push(`message-middleware-${direction}`);
            
            console.log(`WebSocket 消息中间件 [${direction}]:`, message.toString().substring(0, 100));
            
            // 添加中间件标记
            try {
                const data = JSON.parse(message.toString());
                data.middlewareProcessed = true;
                data.middlewareTimestamp = new Date().toISOString();
                context.modifiedMessage = JSON.stringify(data);
            } catch (e) {
                // 非JSON消息保持原样
            }
            
            await next();
        }
    });
    
    // 连接统计中间件
    proxy.use({
        name: 'websocket-stats-middleware',
        stage: 'upgrade',
        handler: async (context, next) => {
            middlewareExecutionLog.push('stats-middleware');
            
            console.log('WebSocket 连接统计中间件执行');
            
            // 模拟统计记录
            const stats = {
                connectionTime: new Date().toISOString(),
                userAgent: context.request.headers['user-agent'],
                origin: context.request.headers['origin']
            };
            
            console.log('连接统计:', stats);
            
            await next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ WebSocket 中间件代理启动成功');
        
        const wsClient = new WebSocket('ws://localhost:8093/echo', {
            headers: {
                'User-Agent': 'WebSocket-Test-Client/1.0',
                'Origin': 'http://localhost:3000'
            },
            agent: new (require('http').Agent)({
                proxy: 'http://localhost:8080'
            })
        });
        
        return new Promise((resolve, reject) => {
            let messageReceived = false;
            
            wsClient.on('open', () => {
                console.log('✓ WebSocket 连接建立（中间件处理）');
                
                // 发送测试消息
                wsClient.send(JSON.stringify({
                    type: 'middleware-test',
                    message: 'Testing WebSocket middleware',
                    testId: 'TC-WS-004'
                }));
            });
            
            wsClient.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log('收到中间件处理的消息:', message);
                    
                    // 验证中间件处理
                    if (message.type === 'echo' && message.original.middlewareProcessed === true) {
                        console.log('✓ 客户端消息中间件处理成功');
                    }
                    
                    if (message.middlewareProcessed === true) {
                        console.log('✓ 服务器消息中间件处理成功');
                    }
                    
                    messageReceived = true;
                    wsClient.close();
                } catch (error) {
                    reject(error);
                }
            });
            
            wsClient.on('close', () => {
                if (messageReceived) {
                    // 验证中间件执行顺序
                    console.log('中间件执行日志:', middlewareExecutionLog);
                    
                    const expectedMiddlewares = [
                        'upgrade-middleware',
                        'stats-middleware',
                        'message-middleware-client-to-server',
                        'message-middleware-server-to-client'
                    ];
                    
                    const allExecuted = expectedMiddlewares.every(mw => 
                        middlewareExecutionLog.includes(mw)
                    );
                    
                    if (allExecuted) {
                        console.log('✓ 所有 WebSocket 中间件正确执行');
                        resolve(true);
                    } else {
                        reject(new Error('部分中间件未执行'));
                    }
                } else {
                    reject(new Error('未收到消息'));
                }
            });
            
            wsClient.on('error', reject);
            
            setTimeout(() => {
                if (!messageReceived) {
                    wsClient.close();
                    reject(new Error('WebSocket 中间件测试超时'));
                }
            }, 8000);
        });
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.server.close();
    }
}

function generateConnectionId() {
    return 'conn_' + Math.random().toString(36).substr(2, 9);
}

testWebSocketMiddleware();
```

**预期结果**:
- 升级中间件正确执行
- 消息中间件正确处理双向消息
- 统计中间件正确记录连接信息
- 中间件执行顺序正确

---

### TC-WS-005: WebSocket 连接池测试

**测试目标**: 验证 WebSocket 连接的池化管理功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');

async function testWebSocketConnectionPool() {
    const testServer = await createTestWebSocketServer(8094);
    const proxy = new NodeMITMProxy({ 
        config: { port: 8080 },
        // WebSocket 连接池配置
        websocket: {
            maxConnections: 10,
            connectionTimeout: 30000,
            pingInterval: 10000
        }
    });
    
    const connections = [];
    let connectionCount = 0;
    
    // 连接监控中间件
    proxy.use({
        name: 'connection-monitor',
        stage: 'upgrade',
        handler: async (context, next) => {
            connectionCount++;
            console.log(`WebSocket 连接数: ${connectionCount}`);
            
            context.request.headers['X-Connection-Number'] = connectionCount.toString();
            
            await next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ WebSocket 连接池代理启动成功');
        
        // 创建多个并发连接
        const connectionPromises = [];
        const maxConnections = 5;
        
        for (let i = 0; i < maxConnections; i++) {
            connectionPromises.push(createWebSocketConnection(i));
        }
        
        const results = await Promise.allSettled(connectionPromises);
        
        // 验证连接结果
        const successfulConnections = results.filter(r => r.status === 'fulfilled').length;
        const failedConnections = results.filter(r => r.status === 'rejected').length;
        
        console.log(`成功连接: ${successfulConnections}`);
        console.log(`失败连接: ${failedConnections}`);
        
        if (successfulConnections === maxConnections) {
            console.log('✓ 所有 WebSocket 连接成功建立');
        } else {
            console.log('⚠ 部分 WebSocket 连接失败');
        }
        
        // 测试连接复用和管理
        await testConnectionReuse();
        
        // 清理连接
        connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.server.close();
    }
    
    function createWebSocketConnection(index) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket('ws://localhost:8094/echo', {
                headers: {
                    'X-Client-Id': `client-${index}`
                },
                agent: new (require('http').Agent)({
                    proxy: 'http://localhost:8080'
                })
            });
            
            connections.push(ws);
            
            ws.on('open', () => {
                console.log(`✓ WebSocket 连接 ${index} 建立成功`);
                
                // 发送测试消息
                ws.send(JSON.stringify({
                    type: 'pool-test',
                    clientId: index,
                    message: `Connection ${index} test message`
                }));
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'echo') {
                        console.log(`✓ 连接 ${index} 消息收发正常`);
                        resolve(ws);
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            ws.on('error', reject);
            
            setTimeout(() => {
                reject(new Error(`连接 ${index} 超时`));
            }, 5000);
        });
    }
    
    async function testConnectionReuse() {
        console.log('测试连接复用...');
        
        // 关闭一些连接
        const connectionsToClose = connections.slice(0, 2);
        connectionsToClose.forEach(ws => ws.close());
        
        // 等待连接关闭
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 创建新连接（应该复用连接池）
        const newConnection = await createWebSocketConnection('reuse-test');
        
        if (newConnection.readyState === WebSocket.OPEN) {
            console.log('✓ WebSocket 连接复用成功');
        }
    }
}

testWebSocketConnectionPool();
```

**预期结果**:
- 多个并发连接成功建立
- 连接池管理正常
- 连接复用功能正常
- 连接统计准确

---

## 性能测试

### TC-WS-PERF-001: WebSocket 性能测试

**测试目标**: 验证 WebSocket 代理的性能表现

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');

async function testWebSocketPerformance() {
    const testServer = await createTestWebSocketServer(8095);
    
    // 直连性能测试
    const directResults = await performanceTest('direct', null);
    
    // 代理性能测试
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    await proxy.initialize();
    await proxy.start();
    
    const proxyResults = await performanceTest('proxy', proxy);
    
    await proxy.stop();
    testServer.server.close();
    
    // 性能分析
    analyzePerformance(directResults, proxyResults);
    
    return true;
}

async function performanceTest(type, proxy) {
    const results = {
        type: type,
        connectionTime: [],
        messageLatency: [],
        throughput: 0,
        errors: 0
    };
    
    const messageCount = 100;
    const concurrentConnections = 5;
    
    console.log(`开始 ${type} 性能测试...`);
    
    const connectionPromises = [];
    
    for (let i = 0; i < concurrentConnections; i++) {
        connectionPromises.push(testSingleConnection(i, messageCount, results, proxy));
    }
    
    await Promise.allSettled(connectionPromises);
    
    // 计算平均值
    results.avgConnectionTime = results.connectionTime.reduce((a, b) => a + b, 0) / results.connectionTime.length;
    results.avgMessageLatency = results.messageLatency.reduce((a, b) => a + b, 0) / results.messageLatency.length;
    results.throughput = (messageCount * concurrentConnections) / (results.avgMessageLatency / 1000);
    
    return results;
}

function testSingleConnection(connectionId, messageCount, results, proxy) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const wsOptions = {};
        if (proxy) {
            wsOptions.agent = new (require('http').Agent)({
                proxy: 'http://localhost:8080'
            });
        }
        
        const ws = new WebSocket('ws://localhost:8095/echo', wsOptions);
        
        let messagesReceived = 0;
        const messageTimes = [];
        
        ws.on('open', () => {
            const connectionTime = Date.now() - startTime;
            results.connectionTime.push(connectionTime);
            
            // 发送测试消息
            for (let i = 0; i < messageCount; i++) {
                const messageStart = Date.now();
                ws.send(JSON.stringify({
                    type: 'perf-test',
                    id: i,
                    timestamp: messageStart,
                    connectionId: connectionId
                }));
                messageTimes.push(messageStart);
            }
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'echo') {
                    const latency = Date.now() - message.original.timestamp;
                    results.messageLatency.push(latency);
                    messagesReceived++;
                    
                    if (messagesReceived >= messageCount) {
                        ws.close();
                    }
                }
            } catch (error) {
                results.errors++;
            }
        });
        
        ws.on('close', () => {
            resolve();
        });
        
        ws.on('error', () => {
            results.errors++;
            resolve();
        });
        
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            resolve();
        }, 30000);
    });
}

function analyzePerformance(directResults, proxyResults) {
    console.log('\n=== WebSocket 性能测试结果 ===');
    
    console.log('\n直连结果:');
    console.log(`平均连接时间: ${directResults.avgConnectionTime.toFixed(2)}ms`);
    console.log(`平均消息延迟: ${directResults.avgMessageLatency.toFixed(2)}ms`);
    console.log(`吞吐量: ${directResults.throughput.toFixed(2)} 消息/秒`);
    console.log(`错误数: ${directResults.errors}`);
    
    console.log('\n代理结果:');
    console.log(`平均连接时间: ${proxyResults.avgConnectionTime.toFixed(2)}ms`);
    console.log(`平均消息延迟: ${proxyResults.avgMessageLatency.toFixed(2)}ms`);
    console.log(`吞吐量: ${proxyResults.throughput.toFixed(2)} 消息/秒`);
    console.log(`错误数: ${proxyResults.errors}`);
    
    // 性能对比
    const connectionOverhead = ((proxyResults.avgConnectionTime - directResults.avgConnectionTime) / directResults.avgConnectionTime) * 100;
    const latencyOverhead = ((proxyResults.avgMessageLatency - directResults.avgMessageLatency) / directResults.avgMessageLatency) * 100;
    const throughputLoss = ((directResults.throughput - proxyResults.throughput) / directResults.throughput) * 100;
    
    console.log('\n性能对比:');
    console.log(`连接时间开销: ${connectionOverhead.toFixed(2)}%`);
    console.log(`消息延迟开销: ${latencyOverhead.toFixed(2)}%`);
    console.log(`吞吐量损失: ${throughputLoss.toFixed(2)}%`);
    
    // 性能评估
    if (connectionOverhead < 50 && latencyOverhead < 30 && throughputLoss < 20) {
        console.log('✓ WebSocket 代理性能表现良好');
    } else {
        console.log('⚠ WebSocket 代理性能需要优化');
    }
}

testWebSocketPerformance();
```

**预期结果**:
- 连接时间开销 < 50%
- 消息延迟开销 < 30%
- 吞吐量损失 < 20%
- 错误率 < 1%

---

## 测试执行指南

### 运行单个测试
```bash
node test-ws-001.js
```

### 运行所有 WebSocket 测试
```bash
# 创建 WebSocket 测试套件
node -e "
const tests = [
    'test-ws-001.js', // 基础代理
    'test-ws-002.js', // 升级拦截
    'test-ws-003.js', // 消息拦截
    'test-ws-004.js', // 中间件
    'test-ws-005.js'  // 连接池
];

async function runWebSocketTests() {
    console.log('=== WebSocket 代理测试套件 ===\\n');
    
    for (const test of tests) {
        console.log(\`运行测试: \${test}\`);
        try {
            require(\`./\${test}\`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(\`测试失败: \${error.message}\`);
        }
        console.log('---');
    }
}

runWebSocketTests();
"
```

### 性能测试
```bash
node test-ws-perf-001.js
```

## 故障排除

### 常见问题

1. **WebSocket 连接失败**
   - 检查代理是否支持 WebSocket 升级
   - 验证 Upgrade 和 Connection 头部
   - 确认防火墙设置

2. **消息拦截不生效**
   - 检查拦截器配置
   - 验证消息格式
   - 确认拦截器优先级

3. **性能问题**
   - 优化消息处理逻辑
   - 减少不必要的消息修改
   - 调整连接池配置

4. **连接池问题**
   - 检查最大连接数设置
   - 验证连接超时配置
   - 监控内存使用情况