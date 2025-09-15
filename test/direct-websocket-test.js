const WebSocket = require('ws');

console.log('测试直接连接WebSocket服务器...');

// 直接连接到WebSocket服务器（不通过代理）
const ws = new WebSocket('ws://localhost:8081');

ws.on('open', () => {
    console.log('✅ 直接WebSocket连接成功建立');
    ws.send('Hello from direct WebSocket client!');
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