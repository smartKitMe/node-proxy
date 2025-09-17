const { NodeMITMProxy } = require('../../src/index');
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');

/**
 * WebSocket 代理测试套件
 * 基于 test-cases-websocket-proxy.md 文档
 */
describe('WebSocket 代理测试', function() {
    this.timeout(20000); // 设置超时时间为20秒

    let proxy;
    let testServer;
    let wsServer;
    const PROXY_PORT = 8080;
    const WS_SERVER_PORT = 8090;

    // 创建测试用的WebSocket服务器
    before(async function() {
        testServer = http.createServer();
        wsServer = new WebSocket.Server({ 
            server: testServer,
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

            ws.on('close', () => {
                console.log('WebSocket 连接关闭');
            });
        });

        await new Promise((resolve) => {
            testServer.listen(WS_SERVER_PORT, resolve);
        });
        console.log(`✓ WebSocket 测试服务器启动: ws://localhost:${WS_SERVER_PORT}/echo`);
    });

    after(async function() {
        if (wsServer) {
            wsServer.close();
        }
        if (testServer) {
            testServer.close();
        }
    });

    afterEach(async function() {
        if (proxy) {
            await proxy.stop();
            proxy = null;
        }
    });

    /**
     * TC-WS-001: 基础 WebSocket 代理测试
     */
    describe('TC-WS-001: 基础 WebSocket 代理测试', function() {
        it('应该能够代理 WebSocket 连接和消息', async function() {
            proxy = new NodeMITMProxy({
                config: {
                    port: PROXY_PORT,
                    host: 'localhost'
                },
                enableWebSocket: true,
                logger: {
                    level: 'info'
                }
            });

            await proxy.initialize();
            await proxy.start();
            console.log('✓ WebSocket 代理启动成功');

            return new Promise((resolve, reject) => {
                let messageReceived = false;
                let welcomeReceived = false;

                // 通过代理连接 WebSocket 服务器
                const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT}/echo`);

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

                        if (message.type === 'welcome') {
                            welcomeReceived = true;
                            console.log('✓ 收到欢迎消息');
                        } else if (message.type === 'echo' && message.original.message === 'Hello WebSocket Proxy!') {
                            messageReceived = true;
                            console.log('✓ WebSocket 消息代理成功');
                            wsClient.close();
                        }
                    } catch (error) {
                        reject(error);
                    }
                });

                wsClient.on('close', () => {
                    if (messageReceived && welcomeReceived) {
                        console.log('✓ WebSocket 连接正常关闭');
                        resolve();
                    } else {
                        reject(new Error(`未收到预期消息 - welcome: ${welcomeReceived}, echo: ${messageReceived}`));
                    }
                });

                wsClient.on('error', (error) => {
                    console.error('WebSocket 错误:', error);
                    reject(error);
                });

                // 超时处理
                setTimeout(() => {
                    if (!messageReceived || !welcomeReceived) {
                        wsClient.close();
                        reject(new Error('WebSocket 测试超时'));
                    }
                }, 10000);
            });
        });

        it('应该能够处理多个并发 WebSocket 连接', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 1 },
                enableWebSocket: true
            });

            await proxy.initialize();
            await proxy.start();

            const connectionCount = 3;
            const promises = [];

            for (let i = 0; i < connectionCount; i++) {
                promises.push(new Promise((resolve, reject) => {
                    const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT}/echo`);
                    let messageReceived = false;

                    wsClient.on('open', () => {
                        wsClient.send(JSON.stringify({
                            type: 'test',
                            message: `Message from client ${i}`,
                            clientId: i
                        }));
                    });

                    wsClient.on('message', (data) => {
                        try {
                            const message = JSON.parse(data.toString());
                            if (message.type === 'echo' && message.original.clientId === i) {
                                messageReceived = true;
                                wsClient.close();
                            }
                        } catch (error) {
                            reject(error);
                        }
                    });

                    wsClient.on('close', () => {
                        if (messageReceived) {
                            resolve(i);
                        } else {
                            reject(new Error(`客户端 ${i} 未收到预期消息`));
                        }
                    });

                    wsClient.on('error', reject);

                    setTimeout(() => {
                        if (!messageReceived) {
                            wsClient.close();
                            reject(new Error(`客户端 ${i} 超时`));
                        }
                    }, 8000);
                }));
            }

            const results = await Promise.all(promises);
            assert.strictEqual(results.length, connectionCount, '所有连接都应该成功');
            console.log('✓ 多个并发 WebSocket 连接测试通过');
        });
    });

    /**
     * TC-WS-002: WebSocket 连接拦截测试
     */
    describe('TC-WS-002: WebSocket 连接拦截测试', function() {
        it('应该能够拦截和修改 WebSocket 升级请求', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 2 },
                enableWebSocket: true
            });

            const interceptedConnections = [];

            // 注册 WebSocket 连接拦截器
            proxy.addWebSocketInterceptor({
                name: 'connection-interceptor',
                type: 'upgrade',
                handler: async (context) => {
                    const { request } = context;
                    
                    interceptedConnections.push({
                        url: request.url,
                        headers: { ...request.headers },
                        timestamp: new Date().toISOString()
                    });

                    console.log(`[WebSocket拦截] 升级请求: ${request.url}`);

                    // 修改升级请求头
                    request.headers['X-Intercepted-By'] = 'websocket-interceptor';
                    request.headers['X-Intercept-Time'] = new Date().toISOString();

                    return context;
                }
            });

            await proxy.initialize();
            await proxy.start();

            return new Promise((resolve, reject) => {
                const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT}/echo`);

                wsClient.on('open', () => {
                    console.log('✓ WebSocket 连接建立（已拦截）');
                    wsClient.close();
                });

                wsClient.on('close', () => {
                    // 验证拦截记录
                    assert.strictEqual(interceptedConnections.length, 1, '应该拦截了1个连接');
                    assert.strictEqual(interceptedConnections[0].url, '/echo', '应该记录正确的URL');
                    assert(interceptedConnections[0].headers['upgrade'], '应该有升级头');
                    
                    console.log('✓ WebSocket 连接拦截验证通过');
                    resolve();
                });

                wsClient.on('error', reject);

                setTimeout(() => {
                    wsClient.close();
                    reject(new Error('WebSocket 连接拦截测试超时'));
                }, 8000);
            });
        });

        it('应该能够阻止特定的 WebSocket 连接', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 3 },
                enableWebSocket: true
            });

            // 注册阻止特定连接的拦截器
            proxy.addWebSocketInterceptor({
                name: 'connection-blocker',
                type: 'upgrade',
                handler: async (context) => {
                    const { request } = context;

                    // 阻止包含 'blocked' 的连接
                    if (request.url.includes('blocked')) {
                        console.log(`[WebSocket阻止] 阻止连接: ${request.url}`);
                        
                        context.response = {
                            statusCode: 403,
                            headers: { 'Content-Type': 'text/plain' },
                            body: 'WebSocket connection blocked'
                        };
                        
                        return context;
                    }

                    return context;
                }
            });

            await proxy.initialize();
            await proxy.start();

            return new Promise((resolve, reject) => {
                // 尝试连接被阻止的路径
                const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT}/blocked-path`);

                wsClient.on('open', () => {
                    wsClient.close();
                    reject(new Error('被阻止的连接不应该成功'));
                });

                wsClient.on('error', (error) => {
                    console.log('✓ WebSocket 连接被正确阻止:', error.message);
                    resolve();
                });

                setTimeout(() => {
                    reject(new Error('WebSocket 连接阻止测试超时'));
                }, 5000);
            });
        });
    });

    /**
     * TC-WS-003: WebSocket 消息拦截测试
     */
    describe('TC-WS-003: WebSocket 消息拦截测试', function() {
        it('应该能够拦截和修改 WebSocket 消息', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 4 },
                enableWebSocket: true
            });

            const interceptedMessages = [];

            // 注册消息拦截器
            proxy.addWebSocketInterceptor({
                name: 'message-interceptor',
                type: 'message',
                direction: 'both', // 拦截双向消息
                handler: async (context) => {
                    const { message, direction } = context;
                    
                    interceptedMessages.push({
                        direction,
                        message: message.toString(),
                        timestamp: new Date().toISOString()
                    });

                    console.log(`[WebSocket消息拦截] ${direction}: ${message}`);

                    // 修改客户端发送的消息
                    if (direction === 'outgoing') {
                        try {
                            const data = JSON.parse(message.toString());
                            data.intercepted = {
                                by: 'message-interceptor',
                                timestamp: new Date().toISOString()
                            };
                            context.message = Buffer.from(JSON.stringify(data));
                        } catch (error) {
                            // 非JSON消息保持原样
                        }
                    }

                    return context;
                }
            });

            await proxy.initialize();
            await proxy.start();

            return new Promise((resolve, reject) => {
                const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT}/echo`);
                let echoReceived = false;

                wsClient.on('open', () => {
                    wsClient.send(JSON.stringify({
                        type: 'test',
                        message: 'Intercept this message!'
                    }));
                });

                wsClient.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        
                        if (message.type === 'echo') {
                            // 验证消息被拦截和修改
                            assert(message.original.intercepted, '消息应该被拦截器修改');
                            assert.strictEqual(message.original.intercepted.by, 'message-interceptor', '应该有拦截器标识');
                            
                            echoReceived = true;
                            wsClient.close();
                        }
                    } catch (error) {
                        reject(error);
                    }
                });

                wsClient.on('close', () => {
                    if (echoReceived) {
                        // 验证拦截记录
                        assert(interceptedMessages.length >= 2, '应该拦截了多个消息');
                        assert(interceptedMessages.some(m => m.direction === 'outgoing'), '应该拦截了发出的消息');
                        assert(interceptedMessages.some(m => m.direction === 'incoming'), '应该拦截了接收的消息');
                        
                        console.log('✓ WebSocket 消息拦截验证通过');
                        resolve();
                    } else {
                        reject(new Error('未收到预期的回显消息'));
                    }
                });

                wsClient.on('error', reject);

                setTimeout(() => {
                    wsClient.close();
                    reject(new Error('WebSocket 消息拦截测试超时'));
                }, 8000);
            });
        });

        it('应该能够过滤特定类型的消息', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 5 },
                enableWebSocket: true
            });

            let blockedMessageCount = 0;

            // 注册消息过滤器
            proxy.addWebSocketInterceptor({
                name: 'message-filter',
                type: 'message',
                direction: 'outgoing',
                handler: async (context) => {
                    const { message } = context;
                    
                    try {
                        const data = JSON.parse(message.toString());
                        
                        // 阻止包含敏感词的消息
                        if (data.message && data.message.includes('blocked')) {
                            console.log('[WebSocket过滤] 阻止敏感消息');
                            blockedMessageCount++;
                            
                            // 返回 null 表示阻止消息
                            context.blocked = true;
                            return context;
                        }
                    } catch (error) {
                        // 非JSON消息正常处理
                    }

                    return context;
                }
            });

            await proxy.initialize();
            await proxy.start();

            return new Promise((resolve, reject) => {
                const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT}/echo`);
                let normalMessageReceived = false;
                let blockedMessageReceived = false;

                wsClient.on('open', () => {
                    // 发送正常消息
                    wsClient.send(JSON.stringify({
                        type: 'test',
                        message: 'This is a normal message'
                    }));

                    // 发送被阻止的消息
                    setTimeout(() => {
                        wsClient.send(JSON.stringify({
                            type: 'test',
                            message: 'This message should be blocked'
                        }));
                    }, 100);

                    // 等待一段时间后关闭连接
                    setTimeout(() => {
                        wsClient.close();
                    }, 2000);
                });

                wsClient.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        
                        if (message.type === 'echo') {
                            if (message.original.message.includes('normal')) {
                                normalMessageReceived = true;
                            } else if (message.original.message.includes('blocked')) {
                                blockedMessageReceived = true;
                            }
                        }
                    } catch (error) {
                        // 忽略非JSON消息
                    }
                });

                wsClient.on('close', () => {
                    assert(normalMessageReceived, '正常消息应该被接收');
                    assert(!blockedMessageReceived, '被阻止的消息不应该被接收');
                    assert.strictEqual(blockedMessageCount, 1, '应该阻止了1个消息');
                    
                    console.log('✓ WebSocket 消息过滤验证通过');
                    resolve();
                });

                wsClient.on('error', reject);

                setTimeout(() => {
                    wsClient.close();
                    reject(new Error('WebSocket 消息过滤测试超时'));
                }, 8000);
            });
        });
    });

    /**
     * TC-WS-004: WebSocket 错误处理测试
     */
    describe('TC-WS-004: WebSocket 错误处理测试', function() {
        it('应该能够处理 WebSocket 连接错误', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 6 },
                enableWebSocket: true
            });

            let errorHandled = false;

            // 注册错误处理器
            proxy.addWebSocketInterceptor({
                name: 'error-handler',
                type: 'error',
                handler: async (context) => {
                    const { error } = context;
                    console.log('[WebSocket错误处理]', error.message);
                    errorHandled = true;
                    return context;
                }
            });

            await proxy.initialize();
            await proxy.start();

            return new Promise((resolve, reject) => {
                // 尝试连接不存在的服务器
                const wsClient = new WebSocket(`ws://localhost:${WS_SERVER_PORT + 100}/nonexistent`);

                wsClient.on('open', () => {
                    wsClient.close();
                    reject(new Error('不应该成功连接到不存在的服务器'));
                });

                wsClient.on('error', (error) => {
                    console.log('✓ WebSocket 连接错误被正确处理:', error.message);
                    
                    // 给错误处理器一些时间执行
                    setTimeout(() => {
                        assert(errorHandled, '错误应该被拦截器处理');
                        resolve();
                    }, 100);
                });

                setTimeout(() => {
                    reject(new Error('WebSocket 错误处理测试超时'));
                }, 5000);
            });
        });
    });
});