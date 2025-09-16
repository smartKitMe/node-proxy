const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const net = require('net');
const { InterceptorResponse } = require('../src/types/InterceptorTypes');

/**
 * WebSocket SOCKS5代理转发示例
 * 演示如何通过SOCKS5代理转发WebSocket连接
 */

/**
 * 演示WebSocket SOCKS5代理转发功能
 */
async function demonstrateWebSocketSocks5Proxy() {
    console.log('🚀 WebSocket SOCKS5代理转发演示');
    console.log('=' .repeat(60));
    
    // 首先创建一个模拟的SOCKS5代理服务器
    const mockSocksServer = await createMockSocksServer();
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8102,
            host: 'localhost',
            // 配置上游SOCKS5代理
            upstreamProxy: {
                host: 'localhost',
                port: 8103, // 模拟SOCKS5服务器端口
                protocol: 'socks5'
            }
        },
        logger: {
            level: 'info'
        }
    });
    
    // 添加WebSocket拦截器
    proxy.intercept({
        name: 'websocket-socks5-tracker',
        priority: 100,
        
        // 拦截WebSocket升级请求
        interceptUpgrade: async (context) => {
            const request = context.request;
            console.log(`🔍 拦截WebSocket升级请求: ${request.url}`);
            console.log(`📡 将通过SOCKS5代理转发到目标服务器`);
            
            // 添加SOCKS5代理标识
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    'X-Proxy-Type': 'SOCKS5',
                    'X-Proxy-Server': 'localhost:8103',
                    'X-Forwarded-Via': 'WebSocket-SOCKS5-Proxy'
                }
            });
        }
    });
    
    try {
        // 启动代理
        await proxy.start();
        console.log('✅ WebSocket SOCKS5代理启动成功: http://localhost:8102');
        console.log('🔗 上游SOCKS5代理: socks5://localhost:8103');
        
        // 显示使用说明
        console.log('\n📖 使用说明:');
        console.log('1. 代理服务器已启动在端口8102');
        console.log('2. 所有WebSocket连接都会通过SOCKS5代理转发');
        console.log('3. SOCKS5代理地址: socks5://localhost:8103');
        console.log('4. 支持WebSocket协议升级和数据转发');
        console.log('5. 代理将在15秒后自动关闭');
        
        // 演示基本使用
        await demonstrateBasicSocks5WebSocketConnection();
        
        // 等待一段时间后关闭
        setTimeout(async () => {
            console.log('\n🔄 正在关闭代理服务器...');
            await proxy.stop();
            mockSocksServer.close();
            console.log('✅ 代理服务器和SOCKS5服务器已关闭');
        }, 15000);
        
    } catch (error) {
        console.error('❌ 启动失败:', error.message);
        mockSocksServer.close();
        throw error;
    }
    
    return { proxy, mockSocksServer };
}

/**
 * 创建模拟SOCKS5服务器
 */
async function createMockSocksServer() {
    console.log('🔧 创建模拟SOCKS5服务器...');
    
    return new Promise((resolve, reject) => {
        const server = net.createServer((clientSocket) => {
            console.log('📡 SOCKS5服务器收到客户端连接');
            
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
                                console.log('   ✅ SOCKS5成功连接到目标服务器');
                                
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
                                console.log(`   ❌ SOCKS5目标连接错误: ${error.message}`);
                                
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
        
        server.listen(8103, 'localhost', () => {
            console.log('✅ 模拟SOCKS5服务器启动成功: socks5://localhost:8103');
            resolve(server);
        });
        
        server.on('error', (error) => {
            console.log(`❌ 模拟SOCKS5服务器启动失败: ${error.message}`);
            reject(error);
        });
    });
}

/**
 * 演示基本的SOCKS5 WebSocket连接
 */
async function demonstrateBasicSocks5WebSocketConnection() {
    console.log('\n🔧 演示SOCKS5 WebSocket连接...');
    
    // 创建一个简单的WebSocket服务器用于测试
    const http = require('http');
    const server = http.createServer();
    const wsServer = new WebSocket.Server({ server, path: '/socks5-test' });
    
    wsServer.on('connection', (ws, request) => {
        console.log('📡 WebSocket服务器收到连接（通过SOCKS5）');
        console.log('   请求头:', {
            'x-proxy-type': request.headers['x-proxy-type'],
            'x-proxy-server': request.headers['x-proxy-server'],
            'x-forwarded-via': request.headers['x-forwarded-via']
        });
        
        // 发送连接确认
        ws.send(JSON.stringify({
            type: 'socks5_connection_confirmed',
            proxy_info: {
                'x-proxy-type': request.headers['x-proxy-type'],
                'x-proxy-server': request.headers['x-proxy-server'],
                'x-forwarded-via': request.headers['x-forwarded-via']
            },
            timestamp: Date.now()
        }));
        
        ws.on('message', (data) => {
            console.log('📨 WebSocket服务器收到消息（通过SOCKS5）:', data.toString());
            ws.send(`SOCKS5 Echo: ${data.toString()}`);
        });
        
        ws.on('close', () => {
            console.log('🔌 WebSocket连接关闭（通过SOCKS5）');
        });
    });
    
    // 启动测试服务器
    await new Promise((resolve) => {
        server.listen(8104, 'localhost', () => {
            console.log('✅ 测试WebSocket服务器启动: ws://localhost:8104/socks5-test');
            resolve();
        });
    });
    
    // 等待服务器完全启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 通过代理连接WebSocket
    console.log('🔗 通过SOCKS5代理连接WebSocket服务器...');
    
    const ws = new WebSocket('ws://localhost:8104/socks5-test', {
        agent: new (require('http').Agent)({
            host: 'localhost',
            port: 8102
        })
    });
    
    ws.on('open', () => {
        console.log('✅ 通过SOCKS5代理的WebSocket连接已建立');
        
        // 发送测试消息
        ws.send(JSON.stringify({
            type: 'socks5_test_message',
            content: 'Hello from SOCKS5 WebSocket client!',
            timestamp: Date.now()
        }));
    });
    
    ws.on('message', (data) => {
        console.log('📨 收到服务器响应（通过SOCKS5）:', data.toString());
        
        // 发送另一条消息测试双向通信
        setTimeout(() => {
            ws.send('SOCKS5 bidirectional test');
        }, 1000);
        
        // 关闭连接
        setTimeout(() => {
            ws.close();
            server.close();
            console.log('✅ SOCKS5 WebSocket演示完成');
        }, 3000);
    });
    
    ws.on('error', (error) => {
        console.error('❌ SOCKS5 WebSocket连接错误:', error.message);
        server.close();
    });
}

/**
 * 演示高级SOCKS5代理功能
 */
async function demonstrateAdvancedSocks5Features() {
    console.log('\n🔧 演示高级SOCKS5代理功能...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8105,
            host: 'localhost',
            upstreamProxy: {
                host: '192.168.182.100', // 实际的SOCKS5代理地址
                port: 11080,
                protocol: 'socks5',
                // 可选：SOCKS5认证
                auth: {
                    username: 'user',
                    password: 'pass'
                }
            }
        },
        logger: {
            level: 'debug'
        }
    });
    
    // 添加高级WebSocket拦截器
    proxy.intercept({
        name: 'advanced-socks5-websocket-interceptor',
        priority: 100,
        
        interceptUpgrade: async (context) => {
            const request = context.request;
            const url = new URL(request.url, `http://${request.headers.host}`);
            
            console.log(`🔍 高级SOCKS5拦截WebSocket请求: ${url.href}`);
            
            // 根据不同的目标应用不同的策略
            if (url.hostname.includes('secure')) {
                return InterceptorResponse.modifyAndForward({
                    modifiedHeaders: {
                        'X-Secure-Proxy': 'SOCKS5-Enabled',
                        'X-Encryption': 'TLS-over-SOCKS5',
                        'X-Auth-Required': 'true'
                    }
                });
            } else if (url.hostname.includes('api')) {
                return InterceptorResponse.modifyAndForward({
                    modifiedHeaders: {
                        'X-API-Proxy': 'SOCKS5-Gateway',
                        'X-Rate-Limit-Bypass': 'enabled',
                        'X-Geo-Location': 'proxy-server'
                    }
                });
            }
            
            // 默认SOCKS5代理标识
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    'X-Proxy-Chain': 'HTTP-Proxy -> SOCKS5-Proxy -> Target',
                    'X-Proxy-Timestamp': Date.now().toString()
                }
            });
        }
    });
    
    await proxy.start();
    console.log('✅ 高级SOCKS5 WebSocket代理启动成功: http://localhost:8105');
    
    console.log('\n📖 高级功能说明:');
    console.log('- 支持SOCKS5认证（用户名/密码）');
    console.log('- 智能路由：根据目标域名应用不同策略');
    console.log('- 安全增强：为secure域名添加额外安全标识');
    console.log('- API网关：为api域名提供速率限制绕过');
    console.log('- 代理链：HTTP代理 -> SOCKS5代理 -> 目标服务器');
    
    return proxy;
}

/**
 * 演示实际应用场景
 */
async function demonstrateRealWorldSocks5Scenarios() {
    console.log('\n🌍 实际SOCKS5应用场景演示...');
    
    const scenarios = [
        {
            name: '地理位置绕过',
            description: '通过SOCKS5代理访问地理限制的WebSocket服务',
            config: {
                upstreamProxy: {
                    host: '192.168.182.100',
                    port: 11080,
                    protocol: 'socks5'
                }
            },
            benefits: ['绕过地理限制', '隐藏真实IP', '访问受限服务']
        },
        {
            name: '企业网络代理',
            description: '在企业环境中通过SOCKS5代理访问外部WebSocket服务',
            config: {
                upstreamProxy: {
                    host: 'corporate-proxy.company.com',
                    port: 1080,
                    protocol: 'socks5',
                    auth: {
                        username: 'employee',
                        password: 'secure-password'
                    }
                }
            },
            benefits: ['符合企业安全策略', '统一网络出口', '访问控制']
        },
        {
            name: '负载均衡代理',
            description: '通过多个SOCKS5代理实现负载均衡',
            config: {
                upstreamProxies: [
                    { host: 'proxy1.example.com', port: 1080, protocol: 'socks5' },
                    { host: 'proxy2.example.com', port: 1080, protocol: 'socks5' },
                    { host: 'proxy3.example.com', port: 1080, protocol: 'socks5' }
                ]
            },
            benefits: ['提高可用性', '分散负载', '故障转移']
        },
        {
            name: '安全隧道',
            description: '通过加密的SOCKS5隧道保护WebSocket通信',
            config: {
                upstreamProxy: {
                    host: 'secure-tunnel.vpn.com',
                    port: 1080,
                    protocol: 'socks5',
                    tls: true,
                    auth: {
                        username: 'secure-user',
                        password: 'complex-password'
                    }
                }
            },
            benefits: ['端到端加密', '防止中间人攻击', '数据完整性保护']
        }
    ];
    
    scenarios.forEach((scenario, index) => {
        console.log(`\n${index + 1}. ${scenario.name}`);
        console.log(`   描述: ${scenario.description}`);
        console.log(`   配置示例:`);
        console.log(`   ${JSON.stringify(scenario.config, null, 6)}`);
        console.log(`   优势:`);
        scenario.benefits.forEach(benefit => {
            console.log(`     - ${benefit}`);
        });
    });
    
    console.log('\n💡 提示: 这些场景都可以通过配置upstreamProxy实现');
    console.log('🔧 实际使用时，请将192.168.182.100:11080替换为真实的SOCKS5代理地址');
}

// 主函数
async function main() {
    try {
        console.log('🎯 WebSocket SOCKS5代理转发完整演示\n');
        
        // 基本演示
        const { proxy: basicProxy, mockSocksServer } = await demonstrateWebSocketSocks5Proxy();
        
        // 等待基本演示完成
        await new Promise(resolve => setTimeout(resolve, 17000));
        
        // 高级演示
        console.log('\n' + '=' .repeat(60));
        const advancedProxy = await demonstrateAdvancedSocks5Features();
        
        // 实际应用场景
        await demonstrateRealWorldSocks5Scenarios();
        
        // 清理
        setTimeout(async () => {
            await advancedProxy.stop();
            console.log('\n🎉 所有SOCKS5演示完成！');
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
    demonstrateWebSocketSocks5Proxy,
    demonstrateAdvancedSocks5Features,
    demonstrateRealWorldSocks5Scenarios,
    createMockSocksServer
};