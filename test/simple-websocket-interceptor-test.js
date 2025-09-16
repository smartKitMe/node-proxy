const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const { InterceptorResponse } = require('../src/types/InterceptorTypes');
const { HttpProxyAgent } = require('http-proxy-agent');

async function testWebSocketInterceptor() {
    console.log('🚀 简单WebSocket拦截器测试开始');
    
    // 1. 创建WebSocket测试服务器
    const wsServer = new WebSocket.Server({ port: 0 });
    const wsPort = wsServer.address().port;
    console.log(`   ✅ WebSocket测试服务器启动: ws://localhost:${wsPort}`);
    
    // 记录收到的连接信息
    let connectionHeaders = null;
    
    wsServer.on('connection', (ws, request) => {
        console.log('   📡 WebSocket服务器收到连接');
        connectionHeaders = request.headers;
        
        // 发送连接信息给客户端
        ws.send(JSON.stringify({
            type: 'connection_info',
            headers: request.headers
        }));
    });
    
    // 2. 创建代理服务器
    const proxy = new NodeMITMProxy({
        config: {
            port: 0,
            host: 'localhost'
        },
        logger: {
            level: 'debug'
        }
    });
    
    // 添加WebSocket拦截器
    proxy.intercept({
        name: 'simple-websocket-interceptor',
        priority: 100,
        
        shouldIntercept: (context) => {
            return context.request.headers.upgrade === 'websocket';
        },
        
        interceptUpgrade: async (context) => {
            console.log('   🔍 拦截WebSocket升级请求');
            
            // 修改请求头
            const result = InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    'X-Custom-Header': 'Modified-Value',
                    'X-Modified-By': 'Simple-Interceptor'
                }
            });
            
            console.log('   📤 拦截器返回结果:', {
                hasResult: !!result,
                resultType: typeof result,
                shouldModifyAndForward: result ? result.shouldModifyAndForward() : false
            });
            
            return result;
        }
    });
    
    await proxy.start(0, 'localhost');
    const proxyPort = 6789; // 使用固定端口
    console.log(`   ✅ 代理服务器启动: http://localhost:${proxyPort}`);
    
    // 3. 通过代理连接WebSocket
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${wsPort}/`, {
            agent: new HttpProxyAgent(`http://localhost:${proxyPort}`),
            headers: {
                'X-Original-Header': 'Original-Value'
            }
        });
        
        let testResult = null;
        
        ws.on('open', () => {
            console.log('   ✅ WebSocket连接成功');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('   📨 收到消息:', message);
                
                if (message.type === 'connection_info') {
                    const headers = message.headers;
                    
                    // 验证请求头是否被正确修改
                    const hasModifiedHeaders = 
                        headers['x-custom-header'] === 'Modified-Value' &&
                        headers['x-modified-by'] === 'Simple-Interceptor';
                    
                    if (hasModifiedHeaders) {
                        console.log('   ✅ 请求头修改验证成功');
                        testResult = { success: true, message: '请求头修改成功' };
                    } else {
                        console.log('   ❌ 请求头修改验证失败');
                        console.log('   📋 实际收到的请求头:', headers);
                        testResult = { success: false, message: '请求头修改失败' };
                    }
                    
                    ws.close();
                }
            } catch (error) {
                console.log('   ❌ 消息解析失败:', error.message);
                testResult = { success: false, message: '消息解析失败' };
                ws.close();
            }
        });
        
        ws.on('close', () => {
            console.log('   🔌 WebSocket连接关闭');
            
            // 清理资源
            wsServer.close();
            proxy.stop();
            
            if (testResult) {
                if (testResult.success) {
                    console.log('   ✅ 测试成功完成');
                    resolve(testResult);
                } else {
                    console.log('   ❌ 测试失败:', testResult.message);
                    reject(new Error(testResult.message));
                }
            } else {
                console.log('   ❌ 测试未完成');
                reject(new Error('测试未完成'));
            }
        });
        
        ws.on('error', (error) => {
            console.log('   ❌ WebSocket连接错误:', error.message);
            testResult = { success: false, message: `连接错误: ${error.message}` };
            ws.close();
        });
        
        // 设置超时
        setTimeout(() => {
            if (!testResult) {
                console.log('   ❌ 测试超时');
                ws.close();
                reject(new Error('测试超时'));
            }
        }, 10000);
    });
}

if (require.main === module) {
    testWebSocketInterceptor()
        .then(result => {
            console.log('🎉 测试完成:', result.message);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 测试失败:', error.message);
            process.exit(1);
        });
}

module.exports = testWebSocketInterceptor;