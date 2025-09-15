const mitmproxy = require('../src/index');
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

// 创建一个简单的WebSocket测试服务器
function createTestWebSocketServer() {
    const server = http.createServer();
    const wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws, req) => {
        console.log('WebSocket连接建立:', req.url);
        
        ws.on('message', (message) => {
            console.log('收到消息:', message.toString());
            ws.send(`回复: ${message}`);
        });
        
        ws.on('close', () => {
            console.log('WebSocket连接关闭');
        });
        
        // 发送欢迎消息
        ws.send('欢迎连接到WebSocket测试服务器!');
    });
    
    server.listen(8081, () => {
        console.log('WebSocket测试服务器启动在端口 8081');
    });
    
    return server;
}

// 启动测试服务器
const testServer = createTestWebSocketServer();

// 创建代理服务器
mitmproxy.createProxy({
    port: 8080,
    sslConnectInterceptor: (req, cltSocket, head) => {
        console.log('SSL Connect请求:', req.url);
        return true;
    },
    requestInterceptor: (rOptions, req, res, ssl, next) => {
        console.log(`${ssl ? 'HTTPS' : 'HTTP'} 请求: ${rOptions.protocol}//${rOptions.hostname}:${rOptions.port}${rOptions.path}`);
        
        // 检查是否为WebSocket升级请求
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            console.log('检测到WebSocket升级请求');
            console.log('Connection:', req.headers.connection);
            console.log('Sec-WebSocket-Key:', req.headers['sec-websocket-key']);
            console.log('Sec-WebSocket-Version:', req.headers['sec-websocket-version']);
        }
        
        next();
    },
    responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
        if (proxyRes.statusCode === 101) {
            console.log('WebSocket协议升级成功 (101 Switching Protocols)');
            console.log('响应头:', proxyRes.headers);
        }
        next();
    }
});

console.log('代理服务器启动在端口 8080');
console.log('WebSocket测试服务器启动在端口 8081');
console.log('');
console.log('测试步骤:');
console.log('1. 设置浏览器代理为 127.0.0.1:8080');
console.log('2. 访问 http://localhost:8081 或使用WebSocket客户端连接');
console.log('3. 观察控制台输出的WebSocket代理日志');
console.log('');
console.log('或者运行以下命令测试WebSocket客户端连接:');
console.log('node -e "const WebSocket = require(\'ws\'); const ws = new WebSocket(\'ws://localhost:8081\', { agent: require(\'http-proxy-agent\')(\'http://127.0.0.1:8080\') }); ws.on(\'open\', () => { console.log(\'连接成功\'); ws.send(\'测试消息\'); }); ws.on(\'message\', (data) => { console.log(\'收到:\', data.toString()); ws.close(); });"');

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    testServer.close(() => {
        console.log('WebSocket测试服务器已关闭');
        process.exit(0);
    });
});