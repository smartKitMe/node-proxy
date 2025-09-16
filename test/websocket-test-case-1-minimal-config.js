const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

/**
 * WebSocket测试用例1：最小配置启动代理
 * 验证代理服务器能够使用最小配置正常处理WebSocket连接
 */
class WebSocketMinimalConfigTest {
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
    }
    
    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🚀 WebSocket最小配置代理测试开始\n');
        console.log('=' .repeat(80));
        
        try {
            // 获取随机端口
            this.proxyPort = await this.getAvailablePort();
            this.wsServerPort = await this.getAvailablePort();
            
            await this.setupWebSocketServer();
            await this.setupProxy();
            await this.testBasicWebSocketConnection();
            await this.testWebSocketMessageExchange();
            await this.testWebSocketConnectionClose();
            await this.testMultipleWebSocketConnections();
            
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
                
                // 发送欢迎消息
                ws.send(JSON.stringify({
                    type: 'welcome',
                    message: 'WebSocket连接成功',
                    timestamp: Date.now()
                }));
                
                // 处理消息
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log(`   WebSocket服务器收到消息:`, message);
                        
                        // 回显消息
                        ws.send(JSON.stringify({
                            type: 'echo',
                            original: message,
                            timestamp: Date.now()
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
     * 测试基本WebSocket连接
     */
    async testBasicWebSocketConnection() {
        console.log('\n3. 测试基本WebSocket连接...');
        
        return new Promise((resolve, reject) => {
            const testName = '基本WebSocket连接';
            const startTime = Date.now();
            
            try {
                // 连接到代理服务器，代理服务器会转发WebSocket请求到目标服务器
                const ws = new WebSocket(`ws://localhost:${this.proxyPort}/websocket`, {
                    headers: {
                        'Host': `localhost:${this.wsServerPort}`
                    },
                    // 确保WebSocket客户端正确设置掩码
                    mask: true,
                    // 设置协议版本
                    protocolVersion: 13
                });
                
                let welcomeReceived = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'welcome') {
                            welcomeReceived = true;
                            ws.close(1000, '测试完成');
                        }
                    } catch (error) {
                        console.log('   ❌ 消息解析失败:', error.message);
                    }
                });
                
                ws.on('close', (code, reason) => {
                    const duration = Date.now() - startTime;
                    
                    if (welcomeReceived && code === 1000) {
                        console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                        this.testResults.push({ name: testName, success: true, duration });
                        resolve();
                    } else {
                        console.log(`   ❌ ${testName}失败: 连接异常关闭 ${code} ${reason}`);
                        this.testResults.push({ name: testName, success: false, duration, error: `连接异常关闭 ${code} ${reason}` });
                        reject(new Error(`连接异常关闭 ${code} ${reason}`));
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
                    if (!welcomeReceived) {
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
     * 测试WebSocket消息交换
     */
    async testWebSocketMessageExchange() {
        console.log('\n4. 测试WebSocket消息交换...');
        
        return new Promise((resolve, reject) => {
            const testName = 'WebSocket消息交换';
            const startTime = Date.now();
            
            try {
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    })
                });
                
                let welcomeReceived = false;
                let echoReceived = false;
                const testMessage = { type: 'test', content: 'Hello WebSocket!', id: Math.random() };
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                });
                
                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('   📨 收到消息:', message);
                        
                        if (message.type === 'welcome') {
                            welcomeReceived = true;
                            // 发送测试消息
                            console.log('   📤 发送测试消息:', testMessage);
                            ws.send(JSON.stringify(testMessage));
                        } else if (message.type === 'echo' && message.original.id === testMessage.id) {
                            echoReceived = true;
                            ws.close(1000, '测试完成');
                        }
                    } catch (error) {
                        console.log('   ❌ 消息解析失败:', error.message);
                    }
                });
                
                ws.on('close', (code, reason) => {
                    const duration = Date.now() - startTime;
                    
                    if (welcomeReceived && echoReceived && code === 1000) {
                        console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                        this.testResults.push({ name: testName, success: true, duration });
                        resolve();
                    } else {
                        console.log(`   ❌ ${testName}失败: 消息交换不完整`);
                        this.testResults.push({ name: testName, success: false, duration, error: '消息交换不完整' });
                        reject(new Error('消息交换不完整'));
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
                    if (!echoReceived) {
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
     * 测试WebSocket连接关闭
     */
    async testWebSocketConnectionClose() {
        console.log('\n5. 测试WebSocket连接关闭...');
        
        return new Promise((resolve, reject) => {
            const testName = 'WebSocket连接关闭';
            const startTime = Date.now();
            
            try {
                const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket`, {
                    agent: new (require('http').Agent)({
                        host: 'localhost',
                        port: this.proxyPort
                    })
                });
                
                let connected = false;
                
                ws.on('open', () => {
                    console.log('   ✅ WebSocket连接已建立');
                    connected = true;
                    
                    // 立即关闭连接
                    setTimeout(() => {
                        ws.close(1000, '主动关闭测试');
                    }, 500);
                });
                
                ws.on('close', (code, reason) => {
                    const duration = Date.now() - startTime;
                    
                    if (connected && code === 1000) {
                        console.log(`   ✅ ${testName}成功 (${duration}ms)`);
                        this.testResults.push({ name: testName, success: true, duration });
                        resolve();
                    } else {
                        console.log(`   ❌ ${testName}失败: 关闭异常 ${code} ${reason}`);
                        this.testResults.push({ name: testName, success: false, duration, error: `关闭异常 ${code} ${reason}` });
                        reject(new Error(`关闭异常 ${code} ${reason}`));
                    }
                });
                
                ws.on('error', (error) => {
                    const duration = Date.now() - startTime;
                    console.log(`   ❌ ${testName}失败: ${error.message}`);
                    this.testResults.push({ name: testName, success: false, duration, error: error.message });
                    reject(error);
                });
                
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   ❌ ${testName}失败: ${error.message}`);
                this.testResults.push({ name: testName, success: false, duration, error: error.message });
                reject(error);
            }
        });
    }
    
    /**
     * 测试多个WebSocket连接
     */
    async testMultipleWebSocketConnections() {
        console.log('\n6. 测试多个WebSocket连接...');
        
        const testName = '多个WebSocket连接';
        const startTime = Date.now();
        const connectionCount = 3;
        const connections = [];
        
        try {
            // 创建多个连接
            for (let i = 0; i < connectionCount; i++) {
                const connectionPromise = new Promise((resolve, reject) => {
                    const ws = new WebSocket(`ws://localhost:${this.wsServerPort}/websocket`, {
                        agent: new (require('http').Agent)({
                            host: 'localhost',
                            port: this.proxyPort
                        })
                    });
                    
                    let welcomeReceived = false;
                    
                    ws.on('open', () => {
                        console.log(`   ✅ WebSocket连接${i + 1}已建立`);
                    });
                    
                    ws.on('message', (data) => {
                        try {
                            const message = JSON.parse(data.toString());
                            if (message.type === 'welcome') {
                                welcomeReceived = true;
                                ws.close(1000, '测试完成');
                            }
                        } catch (error) {
                            console.log(`   ❌ 连接${i + 1}消息解析失败:`, error.message);
                        }
                    });
                    
                    ws.on('close', (code, reason) => {
                        if (welcomeReceived && code === 1000) {
                            console.log(`   ✅ WebSocket连接${i + 1}正常关闭`);
                            resolve();
                        } else {
                            reject(new Error(`连接${i + 1}异常关闭 ${code} ${reason}`));
                        }
                    });
                    
                    ws.on('error', (error) => {
                        reject(new Error(`连接${i + 1}错误: ${error.message}`));
                    });
                });
                
                connections.push(connectionPromise);
                
                // 间隔创建连接
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // 等待所有连接完成
            await Promise.all(connections);
            
            const duration = Date.now() - startTime;
            console.log(`   ✅ ${testName}成功 (${duration}ms)`);
            this.testResults.push({ name: testName, success: true, duration });
            
        } catch (error) {
            const duration = Date.now() - startTime;
            console.log(`   ❌ ${testName}失败: ${error.message}`);
            this.testResults.push({ name: testName, success: false, duration, error: error.message });
            throw error;
        }
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
        console.log('📊 WebSocket最小配置代理测试结果');
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
        
        console.log(`\n🎯 测试总结:`);
        if (successCount === totalCount) {
            console.log('   🎉 所有WebSocket测试都通过了！代理的WebSocket功能工作正常。');
        } else {
            console.log('   🔧 部分测试失败，请检查:');
            console.log('      - WebSocket服务器是否正常运行');
            console.log('      - 代理服务器WebSocket升级处理是否正确');
            console.log('      - 网络连接是否稳定');
        }
        
        console.log('\n' + '=' .repeat(80));
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const test = new WebSocketMinimalConfigTest();
    test.runAllTests().catch(console.error);
}

module.exports = WebSocketMinimalConfigTest;