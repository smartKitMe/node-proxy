const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const http = require('http');

/**
 * WebSocket最小配置示例
 * 演示如何使用最小配置启动代理服务器并处理WebSocket连接
 */

/**
 * 演示最小配置WebSocket代理
 */
async function demonstrateWebSocketMinimalConfig() {
    console.log('🚀 WebSocket最小配置代理示例\n');
    console.log('=' .repeat(60));
    
    let proxy = null;
    let wsServer = null;
    
    try {
        // 1. 创建WebSocket测试服务器
        console.log('1. 创建WebSocket测试服务器...');
        
        const server = http.createServer();
        wsServer = new WebSocket.Server({ 
            server,
            path: '/echo'
        });
        
        // WebSocket服务器处理连接
        wsServer.on('connection', (ws, request) => {
            console.log(`   📡 WebSocket连接建立: ${request.url}`);
            
            // 发送欢迎消息
            ws.send(JSON.stringify({
                type: 'welcome',
                message: '欢迎使用WebSocket服务',
                timestamp: new Date().toISOString()
            }));
            
            // 处理消息
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log(`   📨 收到消息:`, message);
                    
                    // 回显消息
                    ws.send(JSON.stringify({
                        type: 'echo',
                        original: message,
                        timestamp: new Date().toISOString()
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: '消息格式错误',
                        timestamp: new Date().toISOString()
                    }));
                }
            });
            
            ws.on('close', () => {
                console.log('   🔌 WebSocket连接关闭');
            });
        });
        
        // 启动WebSocket服务器
        await new Promise((resolve, reject) => {
            server.listen(8092, 'localhost', (error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log('   ✅ WebSocket服务器启动成功: ws://localhost:8092/echo');
                    resolve();
                }
            });
        });
        
        // 2. 创建并启动代理服务器
        console.log('\n2. 创建代理服务器...');
        
        proxy = new NodeMITMProxy({
            config: {
                port: 8093,
                host: 'localhost'
            },
            logger: {
                level: 'info'
            }
        });
        
        await proxy.start();
        console.log('   ✅ 代理服务器启动成功: http://localhost:8093');
        
        // 等待服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. 演示WebSocket连接
        console.log('\n3. 演示WebSocket连接...');
        
        await demonstrateWebSocketConnection();
        
        console.log('\n🎉 WebSocket最小配置代理示例完成！');
        
    } catch (error) {
        console.error('❌ 示例执行失败:', error.message);
        throw error;
    } finally {
        // 清理资源
        console.log('\n4. 清理资源...');
        
        if (proxy) {
            await proxy.stop();
            console.log('   ✅ 代理服务器已关闭');
        }
        
        if (wsServer) {
            wsServer.close();
            console.log('   ✅ WebSocket服务器已关闭');
        }
    }
}

/**
 * 演示WebSocket连接和消息交换
 */
async function demonstrateWebSocketConnection() {
    return new Promise((resolve, reject) => {
        console.log('   📡 通过代理连接WebSocket服务器...');
        
        // 通过代理连接WebSocket
        const ws = new WebSocket('ws://localhost:8092/echo', {
            agent: new (require('http').Agent)({
                host: 'localhost',
                port: 8093
            })
        });
        
        let messageCount = 0;
        const maxMessages = 3;
        
        ws.on('open', () => {
            console.log('   ✅ WebSocket连接已建立');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('   📨 收到消息:', message);
                
                if (message.type === 'welcome') {
                    // 发送第一条测试消息
                    sendTestMessage(ws, 1);
                } else if (message.type === 'echo') {
                    messageCount++;
                    
                    if (messageCount < maxMessages) {
                        // 发送下一条消息
                        setTimeout(() => {
                            sendTestMessage(ws, messageCount + 1);
                        }, 1000);
                    } else {
                        // 完成测试
                        setTimeout(() => {
                            ws.close(1000, '演示完成');
                        }, 1000);
                    }
                }
            } catch (error) {
                console.log('   ❌ 消息解析失败:', error.message);
            }
        });
        
        ws.on('close', (code, reason) => {
            if (code === 1000) {
                console.log('   ✅ WebSocket连接正常关闭');
                resolve();
            } else {
                console.log(`   ❌ WebSocket连接异常关闭: ${code} ${reason}`);
                reject(new Error(`连接异常关闭: ${code} ${reason}`));
            }
        });
        
        ws.on('error', (error) => {
            console.log('   ❌ WebSocket连接错误:', error.message);
            reject(error);
        });
        
        // 超时处理
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
                reject(new Error('WebSocket演示超时'));
            }
        }, 15000);
    });
}

/**
 * 发送测试消息
 */
function sendTestMessage(ws, messageNumber) {
    const testMessage = {
        type: 'test',
        content: `这是第${messageNumber}条测试消息`,
        number: messageNumber,
        timestamp: new Date().toISOString()
    };
    
    console.log('   📤 发送消息:', testMessage);
    ws.send(JSON.stringify(testMessage));
}

/**
 * 演示WebSocket代理的基本使用
 */
async function demonstrateBasicWebSocketUsage() {
    console.log('\n📚 WebSocket代理基本使用说明:');
    console.log('-'.repeat(60));
    
    console.log(`
1. 创建代理服务器:
   const proxy = new NodeMITMProxy({
       config: {
           port: 8080,
           host: 'localhost'
       }
   });
   await proxy.start();
`);
    
    console.log(`2. 通过代理连接WebSocket:
   const ws = new WebSocket('ws://target-server.com/websocket', {
       agent: new (require('http').Agent)({
           host: 'localhost',
           port: 8080
       })
   });
`);
    
    console.log(`3. 处理WebSocket事件:
   ws.on('open', () => console.log('连接已建立'));
   ws.on('message', (data) => console.log('收到消息:', data));
   ws.on('close', () => console.log('连接已关闭'));
`);
    
    console.log(`4. 发送消息:
   ws.send(JSON.stringify({ type: 'hello', message: 'Hello WebSocket!' }));
`);
    
    console.log(`5. 关闭连接:
   ws.close(1000, '正常关闭');
`);
}

// 主函数
async function main() {
    try {
        await demonstrateWebSocketMinimalConfig();
        await demonstrateBasicWebSocketUsage();
        
        console.log('\n' + '='.repeat(60));
        console.log('🎯 WebSocket代理功能特点:');
        console.log('   • 支持WebSocket协议升级');
        console.log('   • 透明代理WebSocket连接');
        console.log('   • 保持消息的双向传输');
        console.log('   • 支持连接池优化');
        console.log('   • 完整的错误处理机制');
        
        console.log('\n💡 使用建议:');
        console.log('   • 确保目标WebSocket服务器可访问');
        console.log('   • 合理设置连接超时时间');
        console.log('   • 处理连接异常和重连逻辑');
        console.log('   • 监控WebSocket连接状态');
        
    } catch (error) {
        console.error('❌ 示例执行失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    demonstrateWebSocketMinimalConfig,
    demonstrateBasicWebSocketUsage
};