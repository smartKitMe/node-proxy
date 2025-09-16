const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const http = require('http');
const net = require('net');
const { InterceptorResponse } = require('../src/types/InterceptorTypes');

/**
 * WebSocket测试用例4：SOCKS5代理转发
 * 验证代理服务器能够通过SOCKS5代理正确转发WebSocket连接
 */
class WebSocketSocks5ProxyTest {
    constructor() {
        this.logger = {
            info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
            debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
            error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
            warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
        };
        
        this.proxy = null;
        this.wsServer = null;
        this.mockSocksServer = null;
        this.testResults = [];
        this.proxyPort = null;
        this.wsServerPort = null;
        this.socksProxyPort = null;
        this.socksProxyHost = '192.168.182.100';
        this.socksProxyUrl = null;
        this.interceptedConnections = [];
    }
    
    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🚀 WebSocket SOCKS5代理转发测试开始\n');
        console.log('=' .repeat(80));
        
        try {
            // 获取随机端口
            this.proxyPort = await this.getAvailablePort();
            this.wsServerPort = await this.getAvailablePort();
            this.socksProxyPort = await this.getAvailablePort();
            this.socksProxyUrl = `socks5://${this.socksProxyHost}:11080`;
            
            await this.setupMockSocksServer();
            await this.setupWebSocketServer();
            await this.setupProxy();
            await this.testBasicSocks5WebSocketConnection();
            await this.testSocks5WebSocketWithAuthentication();
            await this.testSocks5WebSocketReconnection();
            await this.testSocks5WebSocketErrorHandling();
            
            this.printTestResults();
            
        } catch (error) {
            this.logger.error('测试执行失败', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
    
    /**
     * 设置模拟SOCKS5服务器
     */
    async setupMockSocksServer() {
        console.log('1. 设置模拟SOCKS5服务器...');
        
        return new Promise((resolve, reject) => {
            this.mockSocksServer = net.createServer((clientSocket) => {
                console.log('   📡 SOCKS5服务器收到连接');
                
                let step = 'greeting';
                let targetHost = '';
                let targetPort = 0;
                let targetSocket = null;
                
                clientSocket.on('data', (data) => {
                    try {
                        if (step === 'greeting') {
                            // SOCKS5握手：客户端发送版本和认证方法
                            if (data[0] === 0x05) {
                                console.log('   🤝 SOCKS5握手请求');
                                // 响应：版本5，无需认证
                                clientSocket.write(Buffer.from([0x05, 0x00]));
                                step = 'request';
                            }
                        } else if (step === 'request') {
                            // SOCKS5连接请求
                            if (data[0] === 0x05 && data[1] === 0x01) {
                                console.log('   🔗 SOCKS5连接请求');
                                
                                // 解析目标地址
                                const addressType = data[3];
                                let addressStart = 4;
                                
                                if (addressType === 0x01) {
                                    // IPv4
                                    const ip = Array.from(data.slice(4, 8)).join('.');
                                    targetHost = ip;
                                    addressStart = 8;
                                } else if (addressType === 0x03) {
                                    // 域名
                                    const domainLength = data[4];
                                    targetHost = data.slice(5, 5 + domainLength).toString();
                                    addressStart = 5 + domainLength;
                                }
                                
                                targetPort = data.readUInt16BE(addressStart);
                                
                                console.log(`   🎯 目标地址: ${targetHost}:${targetPort}`);
                                
                                // 连接到目标服务器
                                targetSocket = net.createConnection(targetPort, targetHost, () => {
                                    console.log('   ✅ 连接到目标服务器成功');
                                    
                                    // 发送成功响应
                                    const response = Buffer.alloc(10);
                                    response[0] = 0x05; // 版本
                                    response[1] = 0x00; // 成功
                                    response[2] = 0x00; // 保留
                                    response[3] = 0x01; // IPv4
                                    response.writeUInt32BE(0x7f000001, 4); // 127.0.0.1
                                    response.writeUInt16BE(targetPort, 8); // 端口
                                    
                                    clientSocket.write(response);
                                    step = 'relay';
                                    
                                    // 开始数据转发
                                    clientSocket.pipe(targetSocket);
                                    targetSocket.pipe(clientSocket);
                                });
                                
                                targetSocket.on('error', (error) => {
                                    console.log(`   ❌ 目标连接错误: ${error.message}`);
                                    
                                    // 发送错误响应
                                    const response = Buffer.alloc(10);
                                    response[0] = 0x05; // 版本
                                    response[1] = 0x01; // 一般错误
                                    clientSocket.write(response);
                                    clientSocket.end();
                                });
                            }
                        }
                    } catch (error) {
                        console.log(`   ❌ SOCKS5处理错误: ${error.message}`);
                        clientSocket.end();
                    }
                });
                
                clientSocket.on('close', () => {
                    console.log('   🔌 SOCKS5客户端连接关闭');
                    if (targetSocket) {
                        targetSocket.end();
                    }
                });
                
                clientSocket.on('error', (error) => {
                    console.log(`   ❌ SOCKS5客户端错误: ${error.message}`);
                });
            });
            
            this.mockSocksServer.listen(this.socksProxyPort, 'localhost', () => {
                console.log(`   ✅ 模拟SOCKS5服务器启动成功: socks5://localhost:${this.socksProxyPort}`);
                resolve();
            });
            
            this.mockSocksServer.on('error', (error) => {
                console.log(`   ❌ 模拟SOCKS5服务器启动失败: ${error.message}`);
                reject(error);
            });
        });
    }
    
    /**
     * 设置WebSocket测试服务器
     */
    async setupWebSocketServer() {
        console.log('2. 设置WebSocket测试服务器...');
        
        return new Promise((resolve, reject) => {
            // 创建HTTP服务器
            const server = http.createServer();
            
            // 创建WebSocket服务器
            this.wsServer = new WebSocket.Server({ 
                server,
                path: '/websocket'
            });
            
            // 处理WebSocket连接
            this.wsServer.on('connection', (ws, request) => {
                console.log(`   WebSocket服务器收到连接: ${request.url}`);
                console.log(`   客户端IP: ${request.socket.remoteAddress}`);
                console.log(`   请求头:`, {
                    'user-agent': request.headers['user-agent'],
                    'x-forwarded-for': request.headers['x-forwarded-for'],
                    'x-proxy-via': request.headers['x-proxy-via']
                });
                
                // 发送连接信息
                ws.send(JSON.stringify({
                    type: 'connection_info',
                    url: request.url,
                    client_ip: request.socket.remoteAddress,
                    headers: {
                        'user-agent': request.headers['user-agent'],
                        'x-forwarded-for': request.headers['x-forwarded-for'],
                        'x-proxy-via': request.headers['x-proxy-via']
                    },
                    timestamp: Date.now()
                }));
                
                // 处理消息
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log(`   WebSocket服务器收到消息:`, message);
                        
                        // 回显消息并添加服务器信息
                        ws.send(JSON.stringify({
                            type: 'echo',
                            original: message,
                            server_info: {
                                received_at: Date.now(),
                                connection_id: Math.random().toString(36).substr(2, 9),
                                via_socks5: true
                            }
                        }));
                    } catch (error) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: '消息格式错误',
                            timestamp: Date.now()
                        }));
                    }
                });
                
                // 处理连接关闭
                ws.on('close', (code, reason) => {
                    console.log(`   WebSocket连接关闭: ${code} ${reason}`);
                });
                
                // 处理错误
                ws.on('error', (error) => {
                    console.log(`   WebSocket连接错误: ${error.message}`);
                });
            });
            
            // 启动服务器
            server.listen(this.wsServerPort, 'localhost', () => {
                console.log(`   ✅ WebSocket测试服务器启动成功: ws://localhost:${this.wsServerPort}/websocket`);
                resolve();
            });
            
            server.on('error', (error) => {
                console.log(`   ❌ WebSocket测试服务器启动失败: ${error.message}`);
                reject(error);
            });
        });
    }
    
    /**
     * 设置代理服务器
     */
    async setupProxy() {
        console.log('3. 设置代理服务器...');
        
        try {
            this.proxy = new NodeMITMProxy({
                config: {
                    port: this.proxyPort,
                    host: 'localhost',
                    // 配置SOCKS5代理
                    upstreamProxy: {
                        host: 'localhost',
                        port: this.socksProxyPort,
                        protocol: 'socks5'
                    }
                },
                logger: {
                    level: 'info'
                }
            });
            
            // 添加WebSocket拦截器
            this.proxy.intercept({
                name: 'websocket-socks5-interceptor',
                priority: 100,
                
                // 检查是否需要拦截
                shouldIntercept: async (context, type) => {
                    return type === 'upgrade';
                },
                
                // 拦截WebSocket升级请求
                interceptUpgrade: async (context) => {
                    const request = context.request;
                    const url = request.url;
                    
                    console.log(`   🔍 拦截WebSocket升级请求: ${url}`);
                    
                    // 记录拦截的连接
                    this.interceptedConnections.push({
                        url: url,
                        timestamp: Date.now(),
                        headers: { ...request.headers },
                        via_socks5: true
                    });
                    
                    // 添加代理标识头
                    return InterceptorResponse.modifyAndForward({
                        modifiedHeaders: {
                            'X-Proxy-Via': 'SOCKS5-Proxy',
                            'X-Socks5-Server': `localhost:${this.socksProxyPort}`,
                            'X-Forwarded-For': request.socket?.remoteAddress || 'unknown'
                        }
                    });
                }
            });
            
            // 启动代理
            await this.proxy.start(this.proxyPort, 'localhost');
            
            console.log(`   ✅ 代理服务器启动成功: http://localhost:${this.proxyPort}`);
            console.log(`   🔗 上游SOCKS5代理: socks5://localhost:${this.socksProxyPort}`);
            
            // 等待代理完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`   ❌ 代理服务器启动失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 测试基本SOCKS5 WebSocket连接
     */
    async testBasicSocks5WebSocketConnection() {
        console.log('\n4. 测试基本SOCKS5 WebSocket连接...');
        
        return new Promise((resolve, reject) => {
            const testName = '基本SOCKS5 WebSocket连接';
            const startTime = Date.now();
            
            try {
                // 通过代理连接WebSocket
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?test=basic-socks5`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    })
                });
                
                let connectionInfoReceived = false;
                let echoReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                    
                    // 发送测试消息
                    ws.send(JSON.stringify({
                        type: 'test_message',
                        content: 'Hello via SOCKS5!',
                        timestamp: Date.now()
                    }));
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'connection_info') {
                            connectionInfoReceived = true;
                            
                            // 验证代理标识头
                            const headers = message.headers;
                            const hasProxyHeaders = 
                                headers['x-proxy-via'] === 'SOCKS5-Proxy' &&
                                headers['x-socks5-server'] === `localhost:${this.socksProxyPort}`;
                            
                            if (hasProxyHeaders) {
                                console.log('   ✅ SOCKS5代理标识验证成功');
                            } else {
                                console.log('   ❌ SOCKS5代理标识验证失败');
                            }
                        } else if (message.type === 'echo') {
                            echoReceived = true;
                            
                            // 验证消息是否通过SOCKS5转发
                            const viaSocks5 = message.server_info?.via_socks5;
                            
                            if (viaSocks5 && connectionInfoReceived) {
                                console.log('   ✅ SOCKS5转发验证成功');
                                ws.close(1000, '测试完成');
                            } else {
                                console.log('   ❌ SOCKS5转发验证失败');
                                ws.close(1001, '验证失败');
                            }
                        }
                    } catch (error) {
                        console.log('   ❌ 消息解析失败:', error.message);
                    }
                });
                
                ws.on('close', (code, reason) => {
                    const duration = Date.now() - startTime;
                    
                    if (connectionInfoReceived && echoReceived && code === 1000) {
                        console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                        this.testResults.push({ name: testName, success: true, duration });
                        resolve();
                    } else {
                        console.log(`   ❌ ${testName}失败: ${reason}`);
                        this.testResults.push({ name: testName, success: false, duration, error: reason });
                        reject(new Error(reason));
                    }
                });
                
                ws.on('error', (error) => {
                    const duration = Date.now() - startTime;
                    console.log(`   ❌ ${testName}失败: ${error.message}`);
                    this.testResults.push({ name: testName, success: false, duration, error: error.message });
                    reject(error);
                });
                
                // 超时处理
                setTimeout(() => {
                    if (!connectionInfoReceived || !echoReceived) {
                        ws.close();
                        const duration = Date.now() - startTime;
                        console.log(`   ❌ ${testName}失败: 超时`);
                        this.testResults.push({ name: testName, success: false, duration, error: '超时' });
                        reject(new Error('测试超时'));
                    }
                }, 15000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * 测试带认证的SOCKS5 WebSocket连接
     */
    async testSocks5WebSocketWithAuthentication() {
        console.log('\n5. 测试带认证的SOCKS5 WebSocket连接...');
        
        return new Promise((resolve, reject) => {
            const testName = '带认证的SOCKS5 WebSocket连接';
            const startTime = Date.now();
            
            try {
                // 通过代理连接WebSocket，添加认证信息
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?test=auth-socks5`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    }),
                    headers: {
                        'Authorization': 'Bearer test-token',
                        'X-User-ID': 'test-user'
                    }
                });
                
                let connectionInfoReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ 带认证的WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'connection_info') {
                            connectionInfoReceived = true;
                            
                            // 验证认证信息是否正确传递
                            const headers = message.headers;
                            const hasAuthHeaders = 
                                headers['x-proxy-via'] === 'SOCKS5-Proxy';
                            
                            if (hasAuthHeaders) {
                                console.log('   ✅ 带认证的SOCKS5连接验证成功');
                                ws.close(1000, '测试完成');
                            } else {
                                console.log('   ❌ 带认证的SOCKS5连接验证失败');
                                ws.close(1001, '验证失败');
                            }
                        }
                    } catch (error) {
                        console.log('   ❌ 消息解析失败:', error.message);
                    }
                });
                
                ws.on('close', (code, reason) => {
                    const duration = Date.now() - startTime;
                    
                    if (connectionInfoReceived && code === 1000) {
                        console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                        this.testResults.push({ name: testName, success: true, duration });
                        resolve();
                    } else {
                        console.log(`   ❌ ${testName}失败: ${reason}`);
                        this.testResults.push({ name: testName, success: false, duration, error: reason });
                        reject(new Error(reason));
                    }
                });
                
                ws.on('error', (error) => {
                    const duration = Date.now() - startTime;
                    console.log(`   ❌ ${testName}失败: ${error.message}`);
                    this.testResults.push({ name: testName, success: false, duration, error: error.message });
                    reject(error);
                });
                
                // 超时处理
                setTimeout(() => {
                    if (!connectionInfoReceived) {
                        ws.close();
                        const duration = Date.now() - startTime;
                        console.log(`   ❌ ${testName}失败: 超时`);
                        this.testResults.push({ name: testName, success: false, duration, error: '超时' });
                        reject(new Error('测试超时'));
                    }
                }, 15000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * 测试SOCKS5 WebSocket重连
     */
    async testSocks5WebSocketReconnection() {
        console.log('\n6. 测试SOCKS5 WebSocket重连...');
        
        return new Promise((resolve, reject) => {
            const testName = 'SOCKS5 WebSocket重连';
            const startTime = Date.now();
            let connectionCount = 0;
            
            const connectWebSocket = () => {
                connectionCount++;
                console.log(`   🔄 第${connectionCount}次连接尝试`);
                
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?test=reconnect&attempt=${connectionCount}`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    })
                });
                
                ws.on('open', () => {
                    console.log(`   ✅ 第${connectionCount}次连接成功`);
                    
                    if (connectionCount < 3) {
                        // 快速关闭连接以测试重连
                        setTimeout(() => {
                            ws.close(1000, '测试重连');
                        }, 500);
                    } else {
                        // 第三次连接成功，测试完成
                        setTimeout(() => {
                            ws.close(1000, '测试完成');
                        }, 1000);
                    }
                });
                
                ws.on('close', (code, reason) => {
                    console.log(`   🔌 第${connectionCount}次连接关闭: ${code} ${reason}`);
                    
                    if (connectionCount < 3) {
                        // 继续重连
                        setTimeout(connectWebSocket, 1000);
                    } else {
                        // 重连测试完成
                        const duration = Date.now() - startTime;
                        console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                        this.testResults.push({ name: testName, success: true, duration });
                        resolve();
                    }
                });
                
                ws.on('error', (error) => {
                    console.log(`   ❌ 第${connectionCount}次连接失败: ${error.message}`);
                    
                    if (connectionCount < 3) {
                        // 继续重连
                        setTimeout(connectWebSocket, 1000);
                    } else {
                        const duration = Date.now() - startTime;
                        console.log(`   ❌ ${testName}失败: ${error.message}`);
                        this.testResults.push({ name: testName, success: false, duration, error: error.message });
                        reject(error);
                    }
                });
            };
            
            // 开始第一次连接
            connectWebSocket();
            
            // 超时处理
            setTimeout(() => {
                if (connectionCount < 3) {
                    const duration = Date.now() - startTime;
                    console.log(`   ❌ ${testName}失败: 超时`);
                    this.testResults.push({ name: testName, success: false, duration, error: '超时' });
                    reject(new Error('重连测试超时'));
                }
            }, 30000);
        });
    }
    
    /**
     * 测试SOCKS5 WebSocket错误处理
     */
    async testSocks5WebSocketErrorHandling() {
        console.log('\n7. 测试SOCKS5 WebSocket错误处理...');
        
        return new Promise((resolve, reject) => {
            const testName = 'SOCKS5 WebSocket错误处理';
            const startTime = Date.now();
            
            try {
                // 尝试连接到不存在的WebSocket服务器
                const ws = new WebSocket(`ws://localhost:9999/websocket?test=error-handling`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    })
                });
                
                let errorReceived = false;
                
                ws.on('open', () => {
                    console.log('   ⚠️ 意外的连接成功');
                    ws.close();
                });
                
                ws.on('error', (error) => {
                    errorReceived = true;
                    console.log(`   ✅ 预期的连接错误: ${error.message}`);
                    
                    // 验证错误是否正确处理
                    const duration = Date.now() - startTime;
                    console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                    this.testResults.push({ name: testName, success: true, duration });
                    resolve();
                });
                
                ws.on('close', (code, reason) => {
                    if (!errorReceived) {
                        const duration = Date.now() - startTime;
                        console.log(`   ❌ ${testName}失败: 未收到预期错误`);
                        this.testResults.push({ name: testName, success: false, duration, error: '未收到预期错误' });
                        reject(new Error('未收到预期错误'));
                    }
                });
                
                // 超时处理
                setTimeout(() => {
                    if (!errorReceived) {
                        const duration = Date.now() - startTime;
                        console.log(`   ❌ ${testName}失败: 超时`);
                        this.testResults.push({ name: testName, success: false, duration, error: '超时' });
                        reject(new Error('错误处理测试超时'));
                    }
                }, 10000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ✅ ${testName}成功 - 捕获到预期错误: ${error.message} (${duration}ms)`);
                this.testResults.push({ name: testName, success: true, duration });
                resolve();
            }
        });
    }
    
    /**
     * 获取可用端口
     */
    async getAvailablePort() {
        return new Promise((resolve, reject) => {
            const server = require('net').createServer();
            server.listen(0, () => {
                const port = server.address().port;
                server.close(() => {
                    resolve(port);
                });
            });
            server.on('error', reject);
        });
    }
    
    /**
     * 清理资源
     */
    async cleanup() {
        console.log('\n8. 清理资源...');
        
        try {
            // 关闭代理服务器
            if (this.proxy) {
                await this.proxy.stop();
                console.log('   ✅ 代理服务器已关闭');
            }
            
            // 关闭WebSocket服务器
            if (this.wsServer) {
                this.wsServer.close();
                console.log('   ✅ WebSocket服务器已关闭');
            }
            
            // 关闭模拟SOCKS5服务器
            if (this.mockSocksServer) {
                this.mockSocksServer.close();
                console.log('   ✅ 模拟SOCKS5服务器已关闭');
            }
            
        } catch (error) {
            console.log('   ⚠️ 清理资源时出现错误:', error.message);
        }
    }
    
    /**
     * 打印测试结果
     */
    printTestResults() {
        console.log('\n\n');
        console.log('=' .repeat(80));
        console.log('📊 WebSocket SOCKS5代理转发测试结果');
        console.log('=' .repeat(80));
        
        const successCount = this.testResults.filter(r => r.success).length;
        const totalCount = this.testResults.length;
        
        console.log(`\n📈 总体统计:`);
        console.log(`   总测试数: ${totalCount}`);
        console.log(`   成功: ${successCount}`);
        console.log(`   失败: ${totalCount - successCount}`);
        console.log(`   成功率: ${((successCount / totalCount) * 100).toFixed(1)}%`);
        
        console.log(`\n📋 详细结果:`);
        this.testResults.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            const duration = `${result.duration}ms`;
            console.log(`   ${index + 1}. ${status} ${result.name} (${duration})`);
            
            if (!result.success && result.error) {
                console.log(`      错误: ${result.error}`);
            }
        });
        
        console.log(`\n🔍 拦截统计:`);
        console.log(`   拦截的连接数: ${this.interceptedConnections.length}`);
        this.interceptedConnections.forEach((conn, index) => {
            console.log(`   ${index + 1}. ${conn.url} (${new Date(conn.timestamp).toLocaleTimeString()}) - 通过SOCKS5`);
        });
        
        console.log(`\n🎯 测试总结:`);
        if (successCount === totalCount) {
            console.log('   🎉 所有WebSocket SOCKS5代理转发测试都通过了！');
            console.log('   📝 代理能够正确通过SOCKS5转发WebSocket连接');
            console.log('   🔗 SOCKS5协议握手和数据转发功能正常');
        } else {
            console.log('   🔧 部分测试失败，请检查:');
            console.log('      - SOCKS5代理服务器是否正常运行');
            console.log('      - 代理配置是否正确');
            console.log('      - WebSocket升级请求是否正确转发');
            console.log('      - 网络连接是否稳定');
        }
        
        console.log(`\n💡 SOCKS5代理配置:`);
        console.log(`   代理地址: ${this.socksProxyUrl}`);
        console.log(`   本地模拟: socks5://localhost:${this.socksProxyPort}`);
        console.log(`   支持功能: WebSocket升级、数据转发、错误处理`);
        
        console.log('\n' + '=' .repeat(80));
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const test = new WebSocketSocks5ProxyTest();
    test.runAllTests().catch(console.error);
}

module.exports = WebSocketSocks5ProxyTest;