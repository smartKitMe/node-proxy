# WebSocket代理功能指南

## 📋 功能概述

`node-mitmproxy` **完全支持WebSocket协议的代理转发**，包括：

- ✅ HTTP WebSocket (`ws://`) 代理
- ✅ HTTPS WebSocket (`wss://`) 代理  
- ✅ 协议升级处理（HTTP/1.1 101 Switching Protocols）
- ✅ 双向数据流转发
- ✅ 连接生命周期管理

## 🔧 技术实现

### 核心组件

1. **升级处理器** (`src/mitmproxy/createUpgradeHandler.js`)
   - 处理HTTP到WebSocket的协议升级
   - 建立客户端与目标服务器的代理连接
   - 实现双向数据流管道

2. **主代理服务器** (`src/mitmproxy/index.js`)
   - 集成WebSocket升级处理器
   - 监听`upgrade`事件

3. **HTTPS支持** (`src/tls/FakeServersCenter.js`)
   - 在伪造的HTTPS服务器中支持WebSocket升级
   - 确保WSS协议的代理支持

### 工作流程

```
客户端 → 代理服务器 → 目标WebSocket服务器
   ↓         ↓              ↓
1. 发送升级请求
2. 转发升级请求
3. 返回101响应
4. 建立WebSocket连接
5. 双向数据流转发
```

## 🚀 使用方法

### 基本配置

```javascript
const mitmproxy = require('node-mitmproxy');

mitmproxy.createProxy({
    port: 8080,
    sslConnectInterceptor: (req, cltSocket, head) => {
        // 允许HTTPS WebSocket连接
        return true;
    },
    requestInterceptor: (rOptions, req, res, ssl, next) => {
        // 检测WebSocket升级请求
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            console.log('检测到WebSocket升级请求');
            console.log('目标:', `${ssl ? 'wss' : 'ws'}://${rOptions.hostname}:${rOptions.port}`);
        }
        next();
    },
    responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
        // 检测WebSocket协议升级成功
        if (proxyRes.statusCode === 101) {
            console.log('WebSocket协议升级成功');
        }
        next();
    }
});
```

### 客户端使用

#### 1. 浏览器代理设置

```javascript
// 设置浏览器HTTP代理为 127.0.0.1:8080
// WebSocket连接会自动通过代理转发
const ws = new WebSocket('ws://example.com/websocket');
```

#### 2. Node.js客户端

```javascript
const WebSocket = require('ws');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

// HTTP WebSocket代理
const httpAgent = new HttpProxyAgent('http://127.0.0.1:8080');
const ws1 = new WebSocket('ws://example.com/websocket', { agent: httpAgent });

// HTTPS WebSocket代理
const httpsAgent = new HttpsProxyAgent('http://127.0.0.1:8080');
const ws2 = new WebSocket('wss://example.com/websocket', { agent: httpsAgent });
```

## 🧪 测试验证

项目提供了完整的测试套件：

### 1. 启动测试环境

```bash
# 启动代理服务器和WebSocket测试服务器
node websocket-test.js
```

### 2. 直连测试

```bash
# 测试WebSocket服务器是否正常工作
node direct-websocket-test.js
```

### 3. 代理测试

```bash
# 测试通过代理的WebSocket连接
node websocket-client-test.js
```

### 4. 手动协议测试

```bash
# 测试HTTP升级到WebSocket的完整过程
node websocket-proxy-test.js
```

## 📊 支持的功能特性

| 功能 | 支持状态 | 说明 |
|------|----------|------|
| HTTP WebSocket (ws://) | ✅ | 完全支持 |
| HTTPS WebSocket (wss://) | ✅ | 通过SSL证书伪造支持 |
| 协议升级处理 | ✅ | 正确处理101响应 |
| 双向数据转发 | ✅ | 透明转发WebSocket帧 |
| 连接管理 | ✅ | 处理连接建立和关闭 |
| 错误处理 | ✅ | 完善的错误处理机制 |
| 性能优化 | ✅ | 使用管道提高转发效率 |

## 🔍 调试和监控

### 启用详细日志

```javascript
mitmproxy.createProxy({
    port: 8080,
    requestInterceptor: (rOptions, req, res, ssl, next) => {
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            console.log('=== WebSocket升级请求 ===');
            console.log('目标:', `${ssl ? 'wss' : 'ws'}://${rOptions.hostname}:${rOptions.port}`);
            console.log('Sec-WebSocket-Key:', req.headers['sec-websocket-key']);
            console.log('Sec-WebSocket-Version:', req.headers['sec-websocket-version']);
            console.log('Sec-WebSocket-Protocol:', req.headers['sec-websocket-protocol']);
        }
        next();
    },
    responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
        if (proxyRes.statusCode === 101) {
            console.log('=== WebSocket升级成功 ===');
            console.log('状态码:', proxyRes.statusCode);
            console.log('Sec-WebSocket-Accept:', proxyRes.headers['sec-websocket-accept']);
            console.log('Sec-WebSocket-Protocol:', proxyRes.headers['sec-websocket-protocol']);
        }
        next();
    }
});
```

## ⚠️ 注意事项

1. **HTTPS WebSocket (WSS)**
   - 需要正确配置SSL证书
   - 客户端需要信任代理的CA证书

2. **性能考虑**
   - WebSocket连接是长连接，注意连接数限制
   - 大量并发连接时可能需要调整系统参数

3. **安全性**
   - 代理会解密HTTPS WebSocket流量
   - 确保在安全环境中使用

## 🎯 总结

**`node-mitmproxy` 完全支持WebSocket协议代理**，无需任何修改即可使用。项目提供了：

- 完整的WebSocket代理实现
- 详细的测试用例
- 灵活的配置选项
- 完善的错误处理

如果遇到WebSocket代理问题，请检查：
1. 目标服务器是否支持WebSocket
2. 网络连接是否正常
3. SSL证书配置是否正确（对于WSS）
4. 客户端代理配置是否正确