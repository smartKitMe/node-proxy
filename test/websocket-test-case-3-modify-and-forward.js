const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const http = require('http');
const { InterceptorResponse } = require('../src/types/InterceptorTypes');

/**
 * WebSocket测试用例3：Modify And Forward模式拦截
 * 验证代理服务器能够在modify_and_forward模式下正确处理WebSocket连接
 */
class WebSocketModifyAndForwardTest {
    constructor() {
        this.logger = {
            info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
            debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
            error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
            warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
        };
        
        this.proxy = null;
        this.wsServer = null;
        this.testResults = [];
        this.proxyPort = null;
        this.wsServerPort = null;
        this.interceptedConnections = [];
    }
    
    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🚀 WebSocket Modify And Forward拦截测试开始\n');
        console.log('=' .repeat(80));
        
        try {
            // 获取随机端口
            this.proxyPort = await this.getAvailablePort();
            this.wsServerPort = await this.getAvailablePort();
            
            await this.setupWebSocketServer();
            await this.setupProxy();
            await this.testModifyWebSocketHeaders();
            await this.testModifyWebSocketUrl();
            await this.testModifyWebSocketProtocol();
            await this.testChainedModifications();
            
            this.printTestResults();
            
        } catch (error) {
            this.logger.error('测试执行失败', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
    
    /**
     * 设置WebSocket测试服务器
     */
    async setupWebSocketServer() {
        console.log('1. 设置WebSocket测试服务器...');
        
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
                console.log(`   请求头:`, {
                    'user-agent': request.headers['user-agent'],
                    'x-custom-header': request.headers['x-custom-header'],
                    'x-modified-by': request.headers['x-modified-by'],
                    'sec-websocket-protocol': request.headers['sec-websocket-protocol']
                });
                
                // 发送连接信息
                ws.send(JSON.stringify({
                    type: 'connection_info',
                    url: request.url,
                    headers: {
                        'user-agent': request.headers['user-agent'],
                        'x-custom-header': request.headers['x-custom-header'],
                        'x-modified-by': request.headers['x-modified-by'],
                        'x-chain-step': request.headers['x-chain-step'],
                        'x-timestamp': request.headers['x-timestamp'],
                        'sec-websocket-protocol': request.headers['sec-websocket-protocol']
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
                                connection_id: Math.random().toString(36).substr(2, 9)
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
        console.log('2. 设置代理服务器...');
        
        try {
            this.proxy = new NodeMITMProxy({
                config: {
                    port: this.proxyPort,
                    host: 'localhost'
                },
                logger: {
                    level: 'info'
                }
            });
            
            // 添加WebSocket拦截器
            this.proxy.intercept({
                name: 'websocket-modify-interceptor',
                priority: 100,
                
                // 决定是否拦截请求
                shouldIntercept: (context) => {
                    // 拦截所有WebSocket升级请求
                    return context.request.headers.upgrade === 'websocket';
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
                        headers: { ...request.headers }
                    });
                    
                    // 根据不同的测试场景进行不同的修改
                    if (url.includes('modify-headers')) {
                        return this.modifyWebSocketHeaders(context);
                    } else if (url.includes('modify-url')) {
                        return this.modifyWebSocketUrl(context);
                    } else if (url.includes('modify-protocol')) {
                        return this.modifyWebSocketProtocol(context);
                    } else if (url.includes('chained-modifications')) {
                        return this.applyChainedModifications(context);
                    }
                    
                    // 默认不修改，直接转发
                    return InterceptorResponse.modifyAndForward();
                }
            });
            
            // 启动代理
            await this.proxy.start(this.proxyPort, 'localhost');
            
            console.log(`   ✅ 代理服务器启动成功: http://localhost:${this.proxyPort}`);
            
            // 等待代理完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`   ❌ 代理服务器启动失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 修改WebSocket请求头
     */
    modifyWebSocketHeaders(context) {
        console.log('   📝 修改WebSocket请求头');
        
        return InterceptorResponse.modifyAndForward({
            modifiedHeaders: {
                'X-Custom-Header': 'Modified-Value',
                'X-Modified-By': 'WebSocket-Interceptor',
                'User-Agent': 'Modified-WebSocket-Client/1.0'
            }
        });
    }
    
    /**
     * 修改WebSocket URL
     */
    modifyWebSocketUrl(context) {
        console.log('   📝 修改WebSocket URL');
        
        // 将URL从 /websocket?modify-url=true 修改为 /websocket
        const modifiedUrl = `/websocket`;
        
        return InterceptorResponse.modifyAndForward({
            modifiedUrl: `ws://localhost:${this.wsServerPort}${modifiedUrl}`
        });
    }
    
    /**
     * 修改WebSocket协议
     */
    modifyWebSocketProtocol(context) {
        console.log('   📝 修改WebSocket协议');
        
        return InterceptorResponse.modifyAndForward({
            modifiedProtocol: 'chat'
        });
    }
    
    /**
     * 应用链式修改
     */
    applyChainedModifications(context) {
        console.log('   📝 应用链式修改');
        
        return InterceptorResponse.modifyAndForward({
            modifiedHeaders: {
                'X-Chain-Step': '1',
                'X-Modified-By': 'Chain-Interceptor',
                'X-Timestamp': Date.now().toString()
            },
            modifiedUrl: `ws://localhost:${this.wsServerPort}/websocket`,
            modifiedProtocol: 'echo-protocol'
        });
    }
    
    /**
     * 测试修改WebSocket请求头
     */
    async testModifyWebSocketHeaders() {
        console.log('\n3. 测试修改WebSocket请求头...');
        
        return new Promise((resolve, reject) => {
            const testName = '修改WebSocket请求头';
            const startTime = Date.now();
            
            try {
                // 通过代理连接WebSocket，URL包含modify-headers标识
                const { HttpProxyAgent } = require('http-proxy-agent');
                
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?modify-headers=true`, {
                    agent: new HttpProxyAgent(`http://localhost:${this.proxyPort}`),
                    headers: {
                        'X-Original-Header': 'Original-Value'
                    }
                });
                
                let connectionInfoReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'connection_info') {
                            connectionInfoReceived = true;
                            
                            // 验证请求头是否被正确修改
                            const headers = message.headers;
                            const hasModifiedHeaders = 
                                headers['x-custom-header'] === 'Modified-Value' &&
                                headers['x-modified-by'] === 'WebSocket-Interceptor' &&
                                headers['user-agent'] === 'Modified-WebSocket-Client/1.0';
                            
                            if (hasModifiedHeaders) {
                                console.log('   ✅ 请求头修改验证成功');
                                ws.close(1000, '测试完成');
                            } else {
                                console.log('   ❌ 请求头修改验证失败');
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
                }, 10000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * 测试修改WebSocket URL
     */
    async testModifyWebSocketUrl() {
        console.log('\n4. 测试修改WebSocket URL...');
        
        return new Promise((resolve, reject) => {
            const testName = '修改WebSocket URL';
            const startTime = Date.now();
            
            try {
                // 通过代理连接WebSocket，URL包含modify-url标识
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?modify-url=true&param=test`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    })
                });
                
                let connectionInfoReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'connection_info') {
                            connectionInfoReceived = true;
                            
                            // 验证URL是否被正确修改（应该去掉查询参数）
                            const receivedUrl = message.url;
                            const isUrlModified = receivedUrl === '/websocket';
                            
                            if (isUrlModified) {
                                console.log('   ✅ URL修改验证成功');
                                ws.close(1000, '测试完成');
                            } else {
                                console.log(`   ❌ URL修改验证失败，期望: /websocket，实际: ${receivedUrl}`);
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
                }, 10000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * 测试修改WebSocket协议
     */
    async testModifyWebSocketProtocol() {
        console.log('\n5. 测试修改WebSocket协议...');
        
        return new Promise((resolve, reject) => {
            const testName = '修改WebSocket协议';
            const startTime = Date.now();
            
            try {
                // 通过代理连接WebSocket，URL包含modify-protocol标识
                // 使用正确的WebSocket构造函数参数
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?modify-protocol=true`, 
                    ['original-protocol', 'chat'],  // 协议参数应该是数组，包含原始协议和期望的协议
                    {
                        agent: new (require('http').Agent)({
                            host: 'localhost',
                            port: this.proxyPort
                        })
                    }
                );
                
                let connectionInfoReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'connection_info') {
                            connectionInfoReceived = true;
                            
                            // 验证协议是否被正确修改
                            const protocol = message.headers['sec-websocket-protocol'];
                            // 修改验证逻辑，检查是否为'chat'
                            const isProtocolModified = protocol === 'chat';
                            
                            if (isProtocolModified) {
                                console.log('   ✅ 协议修改验证成功');
                                ws.close(1000, '测试完成');
                            } else {
                                console.log(`   ❌ 协议修改验证失败，协议: ${protocol}`);
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
                }, 10000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * 测试链式修改
     */
    async testChainedModifications() {
        console.log('\n6. 测试链式修改...');
        
        return new Promise((resolve, reject) => {
            const testName = '链式修改';
            const startTime = Date.now();
            
            try {
                // 通过代理连接WebSocket，URL包含chained-modifications标识
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket?chained-modifications=true`, 
                    ['original-protocol', 'echo-protocol'],  // 协议参数应该是数组
                    {
                        agent: new (require('http').Agent)({
                            host: 'localhost',
                            port: this.proxyPort
                        })
                    }
                );
                
                let connectionInfoReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'connection_info') {
                            connectionInfoReceived = true;
                            
                            // 验证链式修改是否都生效
                            const headers = message.headers;
                            const url = message.url;
                            
                            const hasChainHeaders = 
                                headers['x-chain-step'] === '1' &&
                                headers['x-modified-by'] === 'Chain-Interceptor' &&
                                headers['x-timestamp'];
                            
                            const hasCorrectUrl = url === '/websocket';
                            const hasCorrectProtocol = headers['sec-websocket-protocol'] === 'echo-protocol';
                            
                            if (hasChainHeaders && hasCorrectUrl && hasCorrectProtocol) {
                                console.log('   ✅ 链式修改验证成功');
                                ws.close(1000, '测试完成');
                            } else {
                                console.log('   ❌ 链式修改验证失败');
                                console.log('     Headers:', hasChainHeaders);
                                console.log('     URL:', hasCorrectUrl);
                                console.log('     Protocol:', hasCorrectProtocol);
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
                }, 10000);
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
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
        console.log('\n7. 清理资源...');
        
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
        console.log('📊 WebSocket Modify And Forward拦截测试结果');
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
            console.log(`   ${index + 1}. ${conn.url} (${new Date(conn.timestamp).toLocaleTimeString()})`);
        });
        
        console.log(`\n🎯 测试总结:`);
        if (successCount === totalCount) {
            console.log('   🎉 所有WebSocket Modify And Forward测试都通过了！');
            console.log('   📝 拦截器能够正确修改WebSocket升级请求的各种参数');
        } else {
            console.log('   🔧 部分测试失败，请检查:');
            console.log('      - 拦截器逻辑是否正确');
            console.log('      - WebSocket升级请求修改是否生效');
            console.log('      - 目标服务器是否正确接收修改后的请求');
        }
        
        console.log('\n' + '=' .repeat(80));
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const test = new WebSocketModifyAndForwardTest();
    test.runAllTests().catch(console.error);
}

module.exports = WebSocketModifyAndForwardTest;