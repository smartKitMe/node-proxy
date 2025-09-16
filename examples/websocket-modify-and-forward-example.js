const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const { InterceptorResponse } = require('../src/types/InterceptorTypes');

/**
 * WebSocket Modify And Forward模式示例
 * 演示如何在modify_and_forward模式下拦截和修改WebSocket连接
 */

/**
 * 演示WebSocket Modify And Forward功能
 */
async function demonstrateWebSocketModifyAndForward() {
    console.log('🚀 WebSocket Modify And Forward模式演示');
    console.log('=' .repeat(60));
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8096,
            host: 'localhost'
        },
        logger: {
            level: 'info'
        }
    });
    
    // 添加WebSocket拦截器
    proxy.intercept({
        name: 'websocket-modifier',
        priority: 100,
        
        // 拦截WebSocket升级请求
        interceptUpgrade: async (context) => {
            const request = context.request;
            console.log(`🔍 拦截WebSocket升级请求: ${request.url}`);
            
            // 修改请求头
            const modifiedHeaders = {
                'X-Proxy-Modified': 'true',
                'X-Modification-Time': new Date().toISOString(),
                'User-Agent': 'Modified-WebSocket-Client/1.0'
            };
            
            console.log('📝 修改请求头:', modifiedHeaders);
            
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: modifiedHeaders
            });
        }
    });
    
    try {
        // 启动代理
        await proxy.start();
        console.log('✅ 代理服务器启动成功: http://localhost:8096');
        
        // 显示使用说明
        console.log('\n📖 使用说明:');
        console.log('1. 代理服务器已启动在端口8096');
        console.log('2. 所有WebSocket升级请求都会被拦截并修改请求头');
        console.log('3. 修改后的请求会被转发到目标服务器');
        console.log('4. 代理将在10秒后自动关闭');
        
        // 演示基本使用
        await demonstrateBasicWebSocketModification();
        
        // 等待一段时间后关闭
        setTimeout(async () => {
            console.log('\n🔄 正在关闭代理服务器...');
            await proxy.stop();
            console.log('✅ 代理服务器已关闭');
        }, 10000);
        
    } catch (error) {
        console.error('❌ 启动失败:', error.message);
        throw error;
    }
    
    return proxy;
}

/**
 * 演示基本的WebSocket修改功能
 */
async function demonstrateBasicWebSocketModification() {
    console.log('\n🔧 演示WebSocket修改功能...');
    
    // 创建一个简单的WebSocket服务器用于测试
    const http = require('http');
    const server = http.createServer();
    const wsServer = new WebSocket.Server({ server, path: '/test' });
    
    wsServer.on('connection', (ws, request) => {
        console.log('📡 WebSocket服务器收到连接');
        console.log('   修改后的请求头:', {
            'x-proxy-modified': request.headers['x-proxy-modified'],
            'x-modification-time': request.headers['x-modification-time'],
            'user-agent': request.headers['user-agent']
        });
        
        // 发送连接确认
        ws.send(JSON.stringify({
            type: 'connection_confirmed',
            modified_headers: {
                'x-proxy-modified': request.headers['x-proxy-modified'],
                'x-modification-time': request.headers['x-modification-time'],
                'user-agent': request.headers['user-agent']
            },
            timestamp: Date.now()
        }));
        
        ws.on('message', (data) => {
            console.log('📨 WebSocket服务器收到消息:', data.toString());
            ws.send(`Echo: ${data.toString()}`);
        });
    });
    
    // 启动测试服务器
    await new Promise((resolve) => {
        server.listen(8097, 'localhost', () => {
            console.log('✅ 测试WebSocket服务器启动: ws://localhost:8097/test');
            resolve();
        });
    });
    
    // 等待服务器完全启动
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 通过代理连接WebSocket
    console.log('🔗 通过代理连接WebSocket服务器...');
    
    const ws = new WebSocket('ws://localhost:8097/test', {
        agent: new (require('http').Agent)({
            host: 'localhost',
            port: 8096
        })
    });
    
    ws.on('open', () => {
        console.log('✅ 通过代理的WebSocket连接已建立');
        
        // 发送测试消息
        ws.send(JSON.stringify({
            type: 'test_message',
            content: 'Hello from modified WebSocket client!',
            timestamp: Date.now()
        }));
    });
    
    ws.on('message', (data) => {
        console.log('📨 收到服务器响应:', data.toString());
        
        // 关闭连接
        setTimeout(() => {
            ws.close();
            server.close();
            console.log('✅ WebSocket修改演示完成');
        }, 1000);
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket连接错误:', error.message);
        server.close();
    });
}

/**
 * 演示高级WebSocket修改功能
 */
async function demonstrateAdvancedWebSocketModification() {
    console.log('\n🔧 演示高级WebSocket修改功能...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8098,
            host: 'localhost'
        },
        logger: {
            level: 'debug'
        }
    });
    
    // 添加高级WebSocket拦截器
    proxy.intercept({
        name: 'advanced-websocket-modifier',
        priority: 100,
        
        interceptUpgrade: async (context) => {
            const request = context.request;
            const url = new URL(request.url, `http://${request.headers.host}`);
            
            console.log(`🔍 高级拦截WebSocket请求: ${url.href}`);
            
            // 根据不同的路径应用不同的修改策略
            if (url.pathname.includes('/chat')) {
                return InterceptorResponse.modifyAndForward({
                    modifiedHeaders: {
                        'X-Chat-Mode': 'enabled',
                        'X-Max-Message-Size': '1024',
                        'Sec-WebSocket-Protocol': 'chat, superchat'
                    }
                });
            } else if (url.pathname.includes('/api')) {
                return InterceptorResponse.modifyAndForward({
                    modifiedHeaders: {
                        'X-API-Version': '2.0',
                        'X-Rate-Limit': '100',
                        'Authorization': 'Bearer modified-token'
                    },
                    modifiedUrl: url.href.replace('/api/v1/', '/api/v2/')
                });
            }
            
            // 默认修改
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    'X-Proxy-Enhanced': 'true',
                    'X-Timestamp': Date.now().toString()
                }
            });
        }
    });
    
    await proxy.start();
    console.log('✅ 高级WebSocket代理启动成功: http://localhost:8098');
    
    console.log('\n📖 高级功能说明:');
    console.log('- /chat路径: 启用聊天模式，设置消息大小限制');
    console.log('- /api路径: 升级API版本，添加认证令牌');
    console.log('- 其他路径: 添加基本的代理增强标识');
    
    return proxy;
}

/**
 * 演示WebSocket修改的实际应用场景
 */
async function demonstrateRealWorldScenarios() {
    console.log('\n🌍 实际应用场景演示...');
    
    const scenarios = [
        {
            name: '添加认证信息',
            description: '为WebSocket连接自动添加认证头',
            modifier: (context) => {
                return InterceptorResponse.modifyAndForward({
                    modifiedHeaders: {
                        'Authorization': 'Bearer auto-injected-token',
                        'X-User-ID': '12345',
                        'X-Session-ID': 'session-' + Math.random().toString(36).substr(2, 9)
                    }
                });
            }
        },
        {
            name: '协议升级',
            description: '将WebSocket协议从v1升级到v2',
            modifier: (context) => {
                const originalUrl = context.request.url;
                const upgradedUrl = originalUrl.replace('/v1/', '/v2/');
                
                return InterceptorResponse.modifyAndForward({
                    modifiedUrl: upgradedUrl,
                    modifiedHeaders: {
                        'X-Protocol-Version': '2.0',
                        'X-Upgraded-From': 'v1'
                    }
                });
            }
        },
        {
            name: '负载均衡',
            description: '根据负载情况重定向到不同的WebSocket服务器',
            modifier: (context) => {
                const servers = ['ws1.example.com', 'ws2.example.com', 'ws3.example.com'];
                const selectedServer = servers[Math.floor(Math.random() * servers.length)];
                
                return InterceptorResponse.modifyAndForward({
                    modifiedUrl: context.request.url.replace('localhost:8097', selectedServer),
                    modifiedHeaders: {
                        'X-Load-Balancer': 'enabled',
                        'X-Selected-Server': selectedServer
                    }
                });
            }
        }
    ];
    
    scenarios.forEach((scenario, index) => {
        console.log(`\n${index + 1}. ${scenario.name}`);
        console.log(`   描述: ${scenario.description}`);
        console.log(`   实现: 通过拦截器修改WebSocket升级请求`);
    });
    
    console.log('\n💡 提示: 这些场景都可以通过modify_and_forward模式实现');
}

// 主函数
async function main() {
    try {
        console.log('🎯 WebSocket Modify And Forward模式完整演示\n');
        
        // 基本演示
        const basicProxy = await demonstrateWebSocketModifyAndForward();
        
        // 等待基本演示完成
        await new Promise(resolve => setTimeout(resolve, 12000));
        
        // 高级演示
        console.log('\n' + '=' .repeat(60));
        const advancedProxy = await demonstrateAdvancedWebSocketModification();
        
        // 实际应用场景
        await demonstrateRealWorldScenarios();
        
        // 清理
        setTimeout(async () => {
            await advancedProxy.stop();
            console.log('\n🎉 所有演示完成！');
        }, 5000);
        
    } catch (error) {
        console.error('❌ 演示失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    demonstrateWebSocketModifyAndForward,
    demonstrateAdvancedWebSocketModification,
    demonstrateRealWorldScenarios
};