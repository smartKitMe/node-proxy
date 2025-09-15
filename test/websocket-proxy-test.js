const WebSocket = require('ws');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

console.log('开始WebSocket代理测试...');

// 手动创建WebSocket握手请求通过代理
function testWebSocketThroughProxy() {
    return new Promise((resolve, reject) => {
        // 连接到代理服务器
        const proxySocket = net.connect(8080, '127.0.0.1', () => {
            console.log('✅ 已连接到代理服务器');
            
            // 生成WebSocket密钥
            const key = crypto.randomBytes(16).toString('base64');
            
            // 发送HTTP升级请求
            const upgradeRequest = [
                'GET / HTTP/1.1',
                'Host: localhost:8081',
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Key: ${key}`,
                'Sec-WebSocket-Version: 13',
                '',
                ''
            ].join('\r\n');
            
            console.log('📤 发送WebSocket升级请求:');
            console.log(upgradeRequest);
            
            proxySocket.write(upgradeRequest);
        });
        
        let responseData = '';
        let headersParsed = false;
        
        proxySocket.on('data', (data) => {
            responseData += data.toString();
            
            if (!headersParsed && responseData.includes('\r\n\r\n')) {
                const [headers, body] = responseData.split('\r\n\r\n', 2);
                console.log('📥 收到代理服务器响应:');
                console.log(headers);
                
                if (headers.includes('101 Switching Protocols')) {
                    console.log('✅ WebSocket协议升级成功!');
                    headersParsed = true;
                    
                    // 发送WebSocket帧
                    const message = 'Hello through proxy!';
                    const frame = createWebSocketFrame(message);
                    proxySocket.write(frame);
                    console.log('📤 发送WebSocket消息:', message);
                } else {
                    console.log('❌ WebSocket升级失败');
                    reject(new Error('WebSocket upgrade failed'));
                    return;
                }
            } else if (headersParsed) {
                // 解析WebSocket帧
                const messages = parseWebSocketFrames(data);
                messages.forEach(msg => {
                    console.log('📥 收到WebSocket消息:', msg);
                });
                
                // 测试完成，关闭连接
                setTimeout(() => {
                    console.log('🔚 测试完成，关闭连接');
                    proxySocket.end();
                    resolve();
                }, 2000);
            }
        });
        
        proxySocket.on('error', (error) => {
            console.error('❌ 代理连接错误:', error.message);
            reject(error);
        });
        
        proxySocket.on('close', () => {
            console.log('🔌 代理连接已关闭');
        });
        
        // 超时保护
        setTimeout(() => {
            console.log('⏰ 测试超时');
            proxySocket.destroy();
            reject(new Error('Test timeout'));
        }, 10000);
    });
}

// 创建WebSocket帧
function createWebSocketFrame(message) {
    const payload = Buffer.from(message, 'utf8');
    const payloadLength = payload.length;
    
    let frame;
    if (payloadLength < 126) {
        frame = Buffer.allocUnsafe(2 + 4 + payloadLength);
        frame[0] = 0x81; // FIN + text frame
        frame[1] = 0x80 | payloadLength; // MASK + payload length
    } else {
        // 简化处理，只支持小于126字节的消息
        throw new Error('Message too long for this simple implementation');
    }
    
    // 生成掩码
    const mask = crypto.randomBytes(4);
    mask.copy(frame, 2);
    
    // 应用掩码
    for (let i = 0; i < payloadLength; i++) {
        frame[6 + i] = payload[i] ^ mask[i % 4];
    }
    
    return frame;
}

// 解析WebSocket帧（简化版本）
function parseWebSocketFrames(buffer) {
    const messages = [];
    let offset = 0;
    
    while (offset < buffer.length) {
        if (buffer.length - offset < 2) break;
        
        const firstByte = buffer[offset];
        const secondByte = buffer[offset + 1];
        
        const fin = (firstByte & 0x80) === 0x80;
        const opcode = firstByte & 0x0f;
        const masked = (secondByte & 0x80) === 0x80;
        let payloadLength = secondByte & 0x7f;
        
        offset += 2;
        
        if (payloadLength === 126) {
            if (buffer.length - offset < 2) break;
            payloadLength = buffer.readUInt16BE(offset);
            offset += 2;
        } else if (payloadLength === 127) {
            if (buffer.length - offset < 8) break;
            payloadLength = buffer.readBigUInt64BE(offset);
            offset += 8;
        }
        
        if (buffer.length - offset < payloadLength) break;
        
        let payload = buffer.slice(offset, offset + Number(payloadLength));
        offset += Number(payloadLength);
        
        if (opcode === 1) { // text frame
            messages.push(payload.toString('utf8'));
        }
    }
    
    return messages;
}

// 运行测试
testWebSocketThroughProxy()
    .then(() => {
        console.log('🎉 WebSocket代理测试完成');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ WebSocket代理测试失败:', error.message);
        process.exit(1);
    });