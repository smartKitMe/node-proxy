const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

console.log('开始WebSocket客户端测试...');

// 创建代理agent
const proxyAgent = new HttpProxyAgent('http://127.0.0.1:8080');

// 连接到WebSocket服务器（通过代理）
const ws = new WebSocket('ws://localhost:8081', {
    agent: proxyAgent
});

ws.on('open', () => {
    console.log('✅ WebSocket连接成功建立（通过代理）');
    ws.send('Hello from WebSocket client!');
});

ws.on('message', (data) => {
    console.log('📨 收到服务器消息:', data.toString());
    
    // 发送另一条测试消息
    setTimeout(() => {
        ws.send('这是第二条测试消息');
    }, 1000);
    
    // 3秒后关闭连接
    setTimeout(() => {
        console.log('🔚 测试完成，关闭连接');
        ws.close();
    }, 3000);
});

ws.on('close', (code, reason) => {
    console.log(`❌ WebSocket连接关闭: code=${code}, reason=${reason}`);
    process.exit(0);
});

ws.on('error', (error) => {
    console.error('❌ WebSocket连接错误:', error.message);
    process.exit(1);
});

// 超时保护
setTimeout(() => {
    console.log('⏰ 测试超时，强制退出');
    ws.close();
    process.exit(1);
}, 10000);