const NodeMITMProxy = require('../src/index');
const WebSocket = require('ws');
const { HttpProxyAgent } = require('http-proxy-agent');

async function testSimpleWebSocket() {
    console.log('🚀 简单WebSocket代理测试开始');
    
    // 1. 创建WebSocket测试服务器
    const wsServer = new WebSocket.Server({ port: 0 });
    const wsPort = wsServer.address().port;
    
    wsServer.on('connection', (ws) => {
        console.log('   📡 WebSocket服务器收到连接');
        ws.send(JSON.stringify({ message: 'Hello from server' }));
    });
    
    console.log(`   ✅ WebSocket测试服务器启动: ws://localhost:${wsPort}`);
    
    // 2. 创建代理服务器
    const proxy = new NodeMITMProxy({
        logger: {
            level: 'DEBUG'
        }
    });
    
    const proxyPort = await new Promise((resolve) => {
        proxy.start(0, 'localhost').then(() => {
            // 从日志中获取端口，或使用固定端口
            resolve(6789); // 临时使用固定端口
        });
    });
    console.log(`   ✅ 代理服务器启动: http://localhost:${proxyPort}`);
    
    // 3. 通过代理连接WebSocket
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${wsPort}`, {
            agent: new HttpProxyAgent(`http://localhost:${proxyPort}`)
        });
        
        ws.on('open', () => {
            console.log('   ✅ WebSocket连接成功');
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log('   📨 收到消息:', message);
            
            ws.close();
            proxy.stop();
            wsServer.close();
            
            console.log('   ✅ 测试成功完成');
            resolve();
        });
        
        ws.on('error', (error) => {
            console.log('   ❌ WebSocket错误:', error.message);
            proxy.stop();
            wsServer.close();
            reject(error);
        });
        
        // 超时处理
        setTimeout(() => {
            console.log('   ❌ 测试超时');
            ws.close();
            proxy.stop();
            wsServer.close();
            reject(new Error('测试超时'));
        }, 5000);
    });
}

if (require.main === module) {
    testSimpleWebSocket().catch(console.error);
}

module.exports = testSimpleWebSocket;