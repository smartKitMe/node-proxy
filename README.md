# Node Proxy 2.x - 重构版

[![npm](https://img.shields.io/npm/dt/node-proxy.svg)](https://www.npmjs.com/package/node-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg)](https://nodejs.org/)

**Node Proxy** 是一个基于 Node.js 的高性能 HTTP/HTTPS 中间人代理服务器，专为渗透测试、开发调试和网络分析而设计。4.x 版本经过完全重构，采用模块化架构，性能提升 40-60%。

## ✨ 主要特性

- 🚀 **高性能架构** - 重构后性能提升 40-60%，支持高并发请求
- 🔧 **模块化设计** - 清晰的分层架构，易于扩展和维护
- 🎯 **智能拦截** - 支持选择性拦截，按需处理请求
- 🔒 **完整 HTTPS 支持** - 内置 CA 证书管理，支持固定证书
- 🌐 **WebSocket 代理** - 完整支持 WebSocket 协议代理
- 📊 **性能监控** - 内置性能统计和实时监控
- 🔌 **中间件系统** - 灵活的中间件和拦截器机制
- 🛠️ **连接池优化** - 智能连接复用和池化管理
- 📝 **完整日志** - 结构化日志记录和调试支持
- 🔄 **向后兼容** - 兼容 3.x 版本 API

## 📦 安装

```bash
# 全局安装
npm install -g node-proxy

# 项目中安装
npm install node-proxy --save

# 使用 yarn
yarn add node-proxy
```

## 🚀 快速开始

### 基础使用

#### 最小配置启动

```javascript
const { NodeMITMProxy } = require('node-proxy');

// 创建最小配置的代理实例
const proxy = new NodeMITMProxy({
    config: {
        port: 8080,
        host: 'localhost'
    },
    logger: {
        level: 'info'
    }
});

// 启动代理服务器
async function startProxy() {
    await proxy.initialize();
    await proxy.start();
    console.log('代理服务器已启动在 http://localhost:8080');
    
    // 获取服务器信息
    const serverInfo = proxy.getServerInfo();
    console.log('服务器状态:', serverInfo.status);
    console.log('启动时间:', new Date(serverInfo.startTime).toLocaleString());
}

startProxy().catch(console.error);
```

#### 使用默认配置

```javascript
const { NodeMITMProxy } = require('node-proxy');

// 使用默认配置（端口8080）
const proxy = new NodeMITMProxy();

async function startWithDefaults() {
    await proxy.initialize();
    await proxy.start(); // 默认端口8080，主机localhost
    
    console.log('代理已启动，可以进行以下操作:');
    console.log('1. 设置浏览器代理为 localhost:8080');
    console.log('2. 访问任意网站查看代理效果');
    
    // 优雅关闭处理
    process.on('SIGINT', async () => {
        console.log('正在关闭代理服务器...');
        await proxy.stop();
        console.log('代理服务器已关闭');
        process.exit(0);
    });
}

startWithDefaults().catch(console.error);
```

## 🎯 拦截器系统

### 拦截器模式

Node Proxy 支持三种拦截器模式：

1. **Direct Response** - 直接返回自定义响应，不进行实际网络请求
2. **Modify And Forward** - 修改请求参数后转发到目标服务器
3. **Pass Through** - 透明转发，不做任何修改

### Direct Response 模式

直接返回自定义响应，适用于模拟API、测试环境等场景：

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

const proxy = new NodeMITMProxy({ port: 8080 });

// 添加Direct Response拦截器
proxy.intercept({
    name: 'api-mock',
    priority: 100,
    
    // 拦截特定API请求
    interceptRequest: async (context) => {
        const { request } = context;
        
        // 拦截API请求并返回模拟数据
        if (request.url.includes('/api/user')) {
            return InterceptorResponse.directResponse({
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mock-Response': 'true'
                },
                body: JSON.stringify({
                    id: 1,
                    name: 'Mock User',
                    email: 'mock@example.com',
                    timestamp: new Date().toISOString()
                })
            });
        }
        
        // 其他请求继续转发
        return InterceptorResponse.next();
    }
});

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('Direct Response拦截器已启动');
}

start().catch(console.error);
```

### Modify And Forward 模式

修改请求参数后转发到目标服务器：

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

const proxy = new NodeMITMProxy({ port: 8080 });

// 添加Modify And Forward拦截器
proxy.intercept({
    name: 'request-modifier',
    priority: 100,
    
    interceptRequest: async (context) => {
        const { request } = context;
        
        // 修改请求头
        const modifiedHeaders = {
            ...request.headers,
            'X-Proxy-Modified': 'true',
            'X-Modification-Time': new Date().toISOString(),
            'User-Agent': 'NodeMITMProxy/4.0'
        };
        
        // 修改URL（例如：重定向到测试环境）
        let modifiedUrl = request.url;
        if (request.url.includes('api.production.com')) {
            modifiedUrl = request.url.replace('api.production.com', 'api.test.com');
        }
        
        return InterceptorResponse.modifyAndForward({
            modifiedUrl: modifiedUrl,
            modifiedHeaders: modifiedHeaders,
            modifiedMethod: request.method // 也可以修改HTTP方法
        });
    },
    
    // 也可以拦截响应
    interceptResponse: async (context) => {
        const { response } = context;
        
        // 修改响应头
        response.headers['X-Response-Modified'] = 'true';
        response.headers['X-Processing-Time'] = Date.now().toString();
        
        return InterceptorResponse.modifyAndForward({
            modifiedHeaders: response.headers
        });
    }
});

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('Modify And Forward拦截器已启动');
}

start().catch(console.error);
```

### 中间件系统

除了拦截器，还可以使用中间件进行更细粒度的控制：

```javascript
const { NodeMITMProxy } = require('node-proxy');

const proxy = new NodeMITMProxy({ port: 8080 });

// 添加请求中间件
proxy.use({
    stage: 'request',
    handler: async (context, next) => {
        const { request } = context;
        console.log(`拦截请求: ${request.method} ${request.url}`);
        
        // 修改请求头
        request.headers['X-Proxy-By'] = 'NodeMITMProxy';
        
        await next();
    }
});

// 添加响应中间件
proxy.use({
    stage: 'response',
    handler: async (context, next) => {
        const { response } = context;
        console.log(`拦截响应: ${response.statusCode}`);
        
        // 修改响应头
        response.headers['X-Processed-By'] = 'NodeMITMProxy';
        
        await next();
    }
});

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('代理服务器已启动，支持请求/响应拦截');
}

start().catch(console.error);
```

### 选择性拦截配置

```javascript
const { NodeMITMProxy } = require('node-proxy');

const proxy = new NodeMITMProxy({
    port: 8080,
    // 选择性拦截配置
    interceptor: {
        // 只拦截特定域名
        domains: ['api.example.com', 'auth.mysite.com'],
        
        // 只拦截特定路径
        pathPrefixes: ['/api/', '/auth/', '/admin/'],
        
        // 静态资源自动跳过拦截
        staticExtensions: ['.js', '.css', '.png', '.jpg', '.ico'],
        
        // 自定义匹配规则
        customMatcher: (url, headers) => {
            return url.includes('/api/') && headers['content-type']?.includes('json');
        }
    }
});

// 只有匹配规则的请求才会被拦截
proxy.use({
    stage: 'request',
    handler: async (context, next) => {
        console.log('拦截到匹配的请求:', context.request.url);
        await next();
    }
});

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('代理服务器已启动，启用选择性拦截');
}

start().catch(console.error);
```

## 🔒 HTTPS 和证书管理

### 自动证书生成

```javascript
const proxy = new NodeMITMProxy({
    port: 8080,
    certificate: {
        // 自动生成 CA 证书
        autoGenerate: true,
        keySize: 2048,
        validityDays: 365,
        
        // 证书存储路径
        caKeyPath: './ca-key.pem',
        caCertPath: './ca-cert.pem'
    }
});
```

### 使用固定证书

```javascript
const fs = require('fs');

const proxy = new NodeMITMProxy({
    port: 8080,
    // 方式1：使用证书文件路径
    fixedCertPath: './path/to/cert.pem',
    fixedKeyPath: './path/to/key.pem',
    
    // 方式2：直接使用证书内容
    fixedCertString: fs.readFileSync('./cert.pem', 'utf8'),
    fixedKeyString: fs.readFileSync('./key.pem', 'utf8')
});
```

### 获取 CA 证书

```javascript
// 获取 CA 证书用于客户端安装
const caCert = proxy.getCACertificate();
console.log('CA 证书:', caCert);

// 保存 CA 证书到文件
fs.writeFileSync('./ca-cert.crt', caCert);
```

## 🌐 WebSocket 代理

### 基础 WebSocket 代理

```javascript
const { NodeMITMProxy } = require('node-proxy');

// 创建支持WebSocket的代理
const proxy = new NodeMITMProxy({
    config: {
        port: 8080,
        host: 'localhost'
    },
    // WebSocket支持默认启用
    enableWebSocket: true,
    logger: {
        level: 'info'
    }
});

async function startWebSocketProxy() {
    await proxy.initialize();
    await proxy.start();
    console.log('WebSocket代理已启动在 ws://localhost:8080');
    
    // 显示使用说明
    console.log('使用方法:');
    console.log('1. 设置WebSocket客户端代理为 ws://localhost:8080');
    console.log('2. 连接任意WebSocket服务器');
}

startWebSocketProxy().catch(console.error);
```

### WebSocket 连接拦截

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

const proxy = new NodeMITMProxy({ port: 8080 });

// WebSocket升级请求拦截
proxy.intercept({
    name: 'websocket-interceptor',
    priority: 100,
    
    // 拦截WebSocket升级请求
    interceptUpgrade: async (context) => {
        const { request } = context;
        console.log(`WebSocket连接请求: ${request.url}`);
        
        // 认证检查
        const token = request.headers['authorization'];
        if (!token || !isValidToken(token)) {
            return InterceptorResponse.directResponse({
                statusCode: 401,
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: 'Unauthorized WebSocket connection'
            });
        }
        
        // 修改请求头后转发
        return InterceptorResponse.modifyAndForward({
            modifiedHeaders: {
                ...request.headers,
                'X-Proxy-WebSocket': 'true',
                'X-Connection-Time': new Date().toISOString()
            }
        });
    }
});

// 使用中间件进行WebSocket连接处理
proxy.use({
    stage: 'upgrade',
    handler: async (context, next) => {
        const { request } = context;
        console.log(`WebSocket升级: ${request.url}`);
        
        // 记录连接信息
        console.log('WebSocket Headers:', {
            'sec-websocket-key': request.headers['sec-websocket-key'],
            'sec-websocket-version': request.headers['sec-websocket-version'],
            'sec-websocket-protocol': request.headers['sec-websocket-protocol']
        });
        
        await next();
    }
});

function isValidToken(token) {
    // 实现你的token验证逻辑
    return token === 'Bearer valid-token';
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('WebSocket拦截代理已启动');
}

start().catch(console.error);
```

### WebSocket 消息拦截

```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');

const proxy = new NodeMITMProxy({ port: 8080 });

// WebSocket消息拦截器
proxy.intercept({
    name: 'websocket-message-interceptor',
    priority: 100,
    
    // 拦截WebSocket消息
    interceptWebSocketMessage: async (context) => {
        const { message, direction, connection } = context;
        
        console.log(`WebSocket消息 [${direction}]:`, message.toString());
        
        // 可以修改消息内容
        if (direction === 'client-to-server') {
            try {
                const data = JSON.parse(message.toString());
                data.timestamp = new Date().toISOString();
                data.proxied = true;
                
                return {
                    modifiedMessage: JSON.stringify(data)
                };
            } catch (e) {
                // 非JSON消息直接转发
                return { modifiedMessage: message };
            }
        }
        
        // 服务器到客户端的消息
        return { modifiedMessage: message };
    }
});

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('WebSocket消息拦截代理已启动');
}

start().catch(console.error);
```

### 完整的 WebSocket 代理示例

```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');
const http = require('http');

// 创建WebSocket测试服务器
function createWebSocketServer() {
    const server = http.createServer();
    const wsServer = new WebSocket.Server({ 
        server,
        path: '/echo'
    });
    
    wsServer.on('connection', (ws, request) => {
        console.log('WebSocket服务器收到连接');
        
        ws.send(JSON.stringify({
            type: 'welcome',
            message: '欢迎使用WebSocket服务'
        }));
        
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            ws.send(JSON.stringify({
                type: 'echo',
                original: message,
                timestamp: new Date().toISOString()
            }));
        });
    });
    
    return new Promise((resolve) => {
        server.listen(8092, () => {
            console.log('WebSocket服务器启动: ws://localhost:8092/echo');
            resolve({ server, wsServer });
        });
    });
}

async function demonstrateWebSocketProxy() {
    // 1. 启动WebSocket服务器
    const { server: wsServer } = await createWebSocketServer();
    
    // 2. 创建代理
    const proxy = new NodeMITMProxy({ port: 8080 });
    
    // 3. 添加WebSocket拦截
    proxy.intercept({
        name: 'websocket-demo',
        priority: 100,
        
        interceptUpgrade: async (context) => {
            console.log('拦截WebSocket升级请求');
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...context.request.headers,
                    'X-Proxied-By': 'NodeMITMProxy'
                }
            });
        }
    });
    
    // 4. 启动代理
    await proxy.initialize();
    await proxy.start();
    console.log('WebSocket代理已启动');
    
    // 5. 测试连接
    setTimeout(() => {
        const ws = new WebSocket('ws://localhost:8092/echo', {
            // 通过代理连接
            agent: new (require('ws').Agent)({
                proxy: 'http://localhost:8080'
            })
        });
        
        ws.on('open', () => {
            console.log('WebSocket连接已建立');
            ws.send(JSON.stringify({ message: 'Hello WebSocket!' }));
        });
        
        ws.on('message', (data) => {
            console.log('收到消息:', JSON.parse(data.toString()));
            ws.close();
        });
    }, 1000);
}

demonstrateWebSocketProxy().catch(console.error);
```

## 🔒 证书管理

### 固定证书配置

```javascript
const { NodeMITMProxy } = require('node-proxy');
const fs = require('fs');
const path = require('path');

// 使用固定证书的代理
const proxy = new NodeMITMProxy({
    config: {
        port: 8080,
        host: 'localhost'
    },
    // 固定证书配置
    certificate: {
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'server.crt')),
        key: fs.readFileSync(path.join(__dirname, 'certs', 'server.key')),
        // 可选：CA证书
        ca: fs.readFileSync(path.join(__dirname, 'certs', 'ca.crt'))
    },
    logger: {
        level: 'info'
    }
});

// 固定证书中间件
proxy.use({
    name: 'fixed-cert-middleware',
    stage: 'request',
    handler: async (context, next) => {
        const { request } = context;
        
        // 记录使用固定证书的连接
        console.log(`固定证书连接: ${request.method} ${request.url}`);
        console.log('证书信息: 使用预配置的固定证书');
        
        // 添加证书相关头部
        context.response.setHeader('X-Certificate-Type', 'Fixed');
        context.response.setHeader('X-Certificate-Source', 'Preconfigured');
        
        await next();
    }
});

async function startFixedCertProxy() {
    await proxy.initialize();
    await proxy.start();
    console.log('固定证书代理已启动');
    console.log('证书类型: 固定证书');
    console.log('优势: 快速启动，无需动态生成');
}

startFixedCertProxy().catch(console.error);
```

### 动态证书生成

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { CertificateManager } = require('node-proxy/lib/CertificateManager');

// 使用动态证书生成的代理
const proxy = new NodeMITMProxy({
    config: {
        port: 8080,
        host: 'localhost'
    },
    // 启用动态证书生成
    enableDynamicCert: true,
    // 证书缓存配置
    certCache: {
        maxSize: 1000,        // 最大缓存证书数量
        ttl: 24 * 60 * 60 * 1000, // 缓存时间：24小时
        cleanupInterval: 60 * 60 * 1000 // 清理间隔：1小时
    },
    // 证书生成配置
    certificateGenerator: {
        keySize: 2048,        // RSA密钥长度
        validityDays: 365,    // 证书有效期
        algorithm: 'sha256',  // 签名算法
        // CA证书配置
        ca: {
            commonName: 'NodeMITMProxy CA',
            countryName: 'US',
            organizationName: 'NodeMITMProxy'
        }
    },
    logger: {
        level: 'info'
    }
});

// 动态证书生成中间件
proxy.use({
    name: 'dynamic-cert-middleware',
    stage: 'request',
    handler: async (context, next) => {
        const { request } = context;
        const hostname = request.headers.host?.split(':')[0];
        
        if (hostname) {
            // 获取证书管理器
            const certManager = proxy.getCertificateManager();
            
            // 检查证书缓存
            const cachedCert = await certManager.getCachedCertificate(hostname);
            if (cachedCert) {
                console.log(`使用缓存证书: ${hostname}`);
                context.response.setHeader('X-Certificate-Source', 'Cache');
            } else {
                console.log(`动态生成证书: ${hostname}`);
                context.response.setHeader('X-Certificate-Source', 'Generated');
            }
            
            context.response.setHeader('X-Certificate-Type', 'Dynamic');
            context.response.setHeader('X-Certificate-Hostname', hostname);
        }
        
        await next();
    }
});

// 证书生成监听器
proxy.on('certificateGenerated', (hostname, certificate) => {
    console.log(`新证书已生成: ${hostname}`);
    console.log('证书指纹:', certificate.fingerprint);
});

proxy.on('certificateCached', (hostname, cacheSize) => {
    console.log(`证书已缓存: ${hostname}, 缓存大小: ${cacheSize}`);
});

async function startDynamicCertProxy() {
    await proxy.initialize();
    await proxy.start();
    console.log('动态证书代理已启动');
    console.log('证书类型: 动态生成');
    console.log('优势: 支持任意域名，自动缓存优化');
}

startDynamicCertProxy().catch(console.error);
```

### 证书缓存管理

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { CertificateManager } = require('node-proxy/lib/CertificateManager');

const proxy = new NodeMITMProxy({
    config: { port: 8080 },
    enableDynamicCert: true,
    certCache: {
        maxSize: 500,
        ttl: 12 * 60 * 60 * 1000, // 12小时
        cleanupInterval: 30 * 60 * 1000 // 30分钟清理一次
    }
});

// 证书缓存管理中间件
proxy.use({
    name: 'cert-cache-manager',
    stage: 'request',
    handler: async (context, next) => {
        const { request } = context;
        const hostname = request.headers.host?.split(':')[0];
        
        if (hostname) {
            const certManager = proxy.getCertificateManager();
            
            // 获取缓存统计
            const cacheStats = await certManager.getCacheStats();
            console.log('证书缓存统计:', {
                size: cacheStats.size,
                maxSize: cacheStats.maxSize,
                hitRate: cacheStats.hitRate,
                totalRequests: cacheStats.totalRequests
            });
            
            // 预热常用域名证书
            if (isCommonDomain(hostname)) {
                await certManager.preloadCertificate(hostname);
            }
        }
        
        await next();
    }
});

// 证书缓存API
proxy.addRoute('GET', '/api/certificates/cache', async (req, res) => {
    const certManager = proxy.getCertificateManager();
    const cacheInfo = await certManager.getCacheInfo();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        cache: cacheInfo,
        operations: {
            clear: '/api/certificates/cache/clear',
            preload: '/api/certificates/cache/preload'
        }
    }, null, 2));
});

// 清理证书缓存
proxy.addRoute('POST', '/api/certificates/cache/clear', async (req, res) => {
    const certManager = proxy.getCertificateManager();
    const clearedCount = await certManager.clearCache();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        message: 'Certificate cache cleared',
        clearedCount
    }));
});

// 预加载证书
proxy.addRoute('POST', '/api/certificates/cache/preload', async (req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const { hostnames } = JSON.parse(body);
            const certManager = proxy.getCertificateManager();
            
            const results = await Promise.allSettled(
                hostnames.map(hostname => certManager.preloadCertificate(hostname))
            );
            
            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Certificate preload completed',
                total: hostnames.length,
                successful,
                failed: hostnames.length - successful
            }));
        } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
});

function isCommonDomain(hostname) {
    const commonDomains = [
        'google.com', 'github.com', 'stackoverflow.com',
        'npmjs.com', 'nodejs.org'
    ];
    return commonDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
    );
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('证书缓存管理代理已启动');
    console.log('缓存管理API:');
    console.log('- GET  /api/certificates/cache - 查看缓存状态');
    console.log('- POST /api/certificates/cache/clear - 清理缓存');
    console.log('- POST /api/certificates/cache/preload - 预加载证书');
}

start().catch(console.error);
```

### 证书性能监控

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { PerformanceMonitor } = require('node-proxy/lib/PerformanceMonitor');

const proxy = new NodeMITMProxy({
    config: { port: 8080 },
    enableDynamicCert: true,
    // 启用性能监控
    enablePerformanceMonitoring: true
});

// 证书性能监控中间件
proxy.use({
    name: 'cert-performance-monitor',
    stage: 'request',
    handler: async (context, next) => {
        const startTime = Date.now();
        const { request } = context;
        const hostname = request.headers.host?.split(':')[0];
        
        await next();
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // 记录证书处理性能
        if (hostname) {
            const perfMonitor = proxy.getPerformanceMonitor();
            await perfMonitor.recordCertificatePerformance(hostname, {
                duration,
                timestamp: startTime,
                cacheHit: context.response.getHeader('X-Certificate-Source') === 'Cache'
            });
        }
        
        // 添加性能头部
        context.response.setHeader('X-Certificate-Duration', `${duration}ms`);
    }
});

// 性能统计API
proxy.addRoute('GET', '/api/certificates/performance', async (req, res) => {
    const perfMonitor = proxy.getPerformanceMonitor();
    const stats = await perfMonitor.getCertificateStats();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        performance: {
            averageDuration: stats.averageDuration,
            totalRequests: stats.totalRequests,
            cacheHitRate: stats.cacheHitRate,
            slowestDomains: stats.slowestDomains,
            fastestDomains: stats.fastestDomains
        },
        recommendations: generatePerformanceRecommendations(stats)
    }, null, 2));
});

function generatePerformanceRecommendations(stats) {
    const recommendations = [];
    
    if (stats.cacheHitRate < 0.8) {
        recommendations.push({
            type: 'cache',
            message: '证书缓存命中率较低，建议增加缓存大小或TTL',
            priority: 'high'
        });
    }
    
    if (stats.averageDuration > 100) {
        recommendations.push({
            type: 'performance',
            message: '证书处理平均耗时较高，建议使用固定证书或优化缓存',
            priority: 'medium'
        });
    }
    
    return recommendations;
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('证书性能监控代理已启动');
    console.log('性能监控API: GET /api/certificates/performance');
}

start().catch(console.error);
```

## 🔗 SOCKS5 代理

### 基础 SOCKS5 代理

```javascript
const { NodeMITMProxy } = require('node-proxy');

// 创建支持SOCKS5的代理
const proxy = new NodeMITMProxy({
    config: {
        port: 1080,  // SOCKS5标准端口
        host: 'localhost'
    },
    // 启用SOCKS5支持
    enableSOCKS5: true,
    logger: {
        level: 'info'
    }
});

async function startSOCKS5Proxy() {
    await proxy.initialize();
    await proxy.start();
    console.log('SOCKS5代理已启动在 localhost:1080');
    
    // 显示使用说明
    console.log('使用方法:');
    console.log('1. 设置应用程序SOCKS5代理为 localhost:1080');
    console.log('2. 或使用curl: curl --socks5 localhost:1080 http://example.com');
}

startSOCKS5Proxy().catch(console.error);
```

### SOCKS5 连接拦截和控制

```javascript
const { NodeMITMProxy } = require('node-proxy');
const net = require('net');

const proxy = new NodeMITMProxy({
    config: { port: 1080 },
    enableSOCKS5: true
});

// SOCKS5连接拦截器
proxy.intercept({
    name: 'socks5-interceptor',
    priority: 100,
    
    // 拦截SOCKS5连接请求
    interceptSOCKS5Connect: async (context) => {
        const { target, clientSocket } = context;
        console.log(`SOCKS5连接请求: ${target.host}:${target.port}`);
        
        // 访问控制
        if (isBlocked(target.host)) {
            console.log(`拒绝连接到被阻止的主机: ${target.host}`);
            return {
                reject: true,
                reason: 'Host blocked by policy'
            };
        }
        
        // 端口限制
        if (target.port < 1024 && !isAllowedPrivilegedPort(target.port)) {
            console.log(`拒绝连接到特权端口: ${target.port}`);
            return {
                reject: true,
                reason: 'Privileged port access denied'
            };
        }
        
        // 记录连接信息
        console.log(`允许SOCKS5连接: ${target.host}:${target.port}`);
        return {
            allow: true,
            // 可以修改目标地址
            modifiedTarget: {
                host: target.host,
                port: target.port
            }
        };
    }
});

// 使用中间件进行SOCKS5连接处理
proxy.use({
    stage: 'socks5-connect',
    handler: async (context, next) => {
        const { target, clientSocket } = context;
        const clientInfo = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
        
        console.log(`SOCKS5连接 [${clientInfo}] -> ${target.host}:${target.port}`);
        
        // 连接统计
        incrementConnectionCount(target.host);
        
        // 速率限制
        if (getConnectionCount(target.host) > 10) {
            throw new Error('Too many connections to this host');
        }
        
        await next();
        
        console.log(`SOCKS5连接建立成功: ${target.host}:${target.port}`);
    }
});

// 辅助函数
function isBlocked(host) {
    const blockedHosts = ['malicious.com', 'blocked.example.com'];
    return blockedHosts.includes(host) || host.includes('ads.');
}

function isAllowedPrivilegedPort(port) {
    const allowedPorts = [22, 80, 443, 993, 995]; // SSH, HTTP, HTTPS, IMAPS, POP3S
    return allowedPorts.includes(port);
}

const connectionCounts = new Map();

function incrementConnectionCount(host) {
    const count = connectionCounts.get(host) || 0;
    connectionCounts.set(host, count + 1);
}

function getConnectionCount(host) {
    return connectionCounts.get(host) || 0;
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('SOCKS5拦截代理已启动');
}

start().catch(console.error);
```

### SOCKS5 WebSocket 代理转发

```javascript
const { NodeMITMProxy } = require('node-proxy');
const WebSocket = require('ws');
const { SocksClient } = require('socks');

// 创建支持WebSocket的SOCKS5代理
const proxy = new NodeMITMProxy({
    config: { port: 1080 },
    enableSOCKS5: true,
    enableWebSocket: true
});

// WebSocket通过SOCKS5代理转发
proxy.intercept({
    name: 'websocket-socks5-forwarder',
    priority: 100,
    
    interceptUpgrade: async (context) => {
        const { request } = context;
        const url = new URL(request.url, `http://${request.headers.host}`);
        
        console.log(`WebSocket SOCKS5转发: ${url.href}`);
        
        // 检查是否需要通过SOCKS5转发
        if (shouldUseSocks5(url.hostname)) {
            return await forwardWebSocketThroughSocks5(context, url);
        }
        
        // 直接转发
        return InterceptorResponse.passThrough();
    }
});

async function forwardWebSocketThroughSocks5(context, targetUrl) {
    const { request } = context;
    
    try {
        // 通过SOCKS5建立连接
        const socksConnection = await SocksClient.createConnection({
            proxy: {
                host: 'socks5-server.example.com',
                port: 1080,
                type: 5
            },
            command: 'connect',
            destination: {
                host: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'wss:' ? 443 : 80)
            }
        });
        
        console.log('SOCKS5连接建立成功，开始WebSocket握手');
        
        // 返回修改后的转发配置
        return InterceptorResponse.modifyAndForward({
            modifiedHeaders: {
                ...request.headers,
                'X-Forwarded-Via': 'SOCKS5',
                'X-Socks5-Server': 'socks5-server.example.com:1080'
            },
            // 使用SOCKS5连接的socket
            customSocket: socksConnection.socket
        });
        
    } catch (error) {
        console.error('SOCKS5转发失败:', error.message);
        return InterceptorResponse.directResponse({
            statusCode: 502,
            headers: { 'Content-Type': 'text/plain' },
            body: 'SOCKS5 proxy connection failed'
        });
    }
}

function shouldUseSocks5(hostname) {
    // 定义需要通过SOCKS5转发的域名规则
    const socks5Domains = [
        'restricted.example.com',
        'internal.company.com'
    ];
    
    return socks5Domains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
    );
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('WebSocket SOCKS5代理已启动');
}

start().catch(console.error);
```

### 完整的 SOCKS5 代理示例

```javascript
const { NodeMITMProxy } = require('node-proxy');
const net = require('net');
const http = require('http');

// 创建测试HTTP服务器
function createTestServer() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'Hello from test server',
            url: req.url,
            method: req.method,
            headers: req.headers,
            timestamp: new Date().toISOString()
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(8093, () => {
            console.log('测试服务器启动: http://localhost:8093');
            resolve(server);
        });
    });
}

async function demonstrateSOCKS5Proxy() {
    // 1. 启动测试服务器
    const testServer = await createTestServer();
    
    // 2. 创建SOCKS5代理
    const proxy = new NodeMITMProxy({
        config: { port: 1080 },
        enableSOCKS5: true
    });
    
    // 3. 添加SOCKS5拦截
    proxy.intercept({
        name: 'socks5-demo',
        priority: 100,
        
        interceptSOCKS5Connect: async (context) => {
            const { target } = context;
            console.log(`SOCKS5代理连接: ${target.host}:${target.port}`);
            
            // 记录所有连接
            return {
                allow: true,
                modifiedTarget: target
            };
        }
    });
    
    // 4. 启动代理
    await proxy.initialize();
    await proxy.start();
    console.log('SOCKS5代理已启动');
    
    // 5. 测试SOCKS5连接
    setTimeout(async () => {
        try {
            // 使用SOCKS5代理发送HTTP请求
            const response = await makeSOCKS5Request(
                'localhost', 1080,
                'localhost', 8093,
                '/test'
            );
            console.log('SOCKS5请求成功:', response);
        } catch (error) {
            console.error('SOCKS5请求失败:', error.message);
        }
    }, 1000);
}

// 通过SOCKS5发送HTTP请求的辅助函数
function makeSOCKS5Request(proxyHost, proxyPort, targetHost, targetPort, path) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(proxyPort, proxyHost);
        
        socket.on('connect', () => {
            // SOCKS5握手
            const authMethods = Buffer.from([0x05, 0x01, 0x00]); // VER, NMETHODS, NO AUTH
            socket.write(authMethods);
        });
        
        let step = 0;
        socket.on('data', (data) => {
            if (step === 0) {
                // 认证响应
                if (data[0] === 0x05 && data[1] === 0x00) {
                    // 发送连接请求
                    const connectRequest = Buffer.concat([
                        Buffer.from([0x05, 0x01, 0x00, 0x01]), // VER, CMD, RSV, ATYP
                        Buffer.from(targetHost.split('.').map(n => parseInt(n))), // IP
                        Buffer.from([(targetPort >> 8) & 0xFF, targetPort & 0xFF]) // PORT
                    ]);
                    socket.write(connectRequest);
                    step = 1;
                }
            } else if (step === 1) {
                // 连接响应
                if (data[0] === 0x05 && data[1] === 0x00) {
                    // 发送HTTP请求
                    const httpRequest = [
                        `GET ${path} HTTP/1.1`,
                        `Host: ${targetHost}:${targetPort}`,
                        'Connection: close',
                        '',
                        ''
                    ].join('\r\n');
                    socket.write(httpRequest);
                    step = 2;
                }
            } else {
                // HTTP响应
                const response = data.toString();
                resolve(response);
                socket.end();
            }
        });
        
        socket.on('error', reject);
    });
}

demonstrateSOCKS5Proxy().catch(console.error);
```
```

## 📊 性能监控

### 基础性能监控

```javascript
const { NodeMITMProxy } = require('node-proxy');
const { PerformanceMonitor } = require('node-proxy/lib/PerformanceMonitor');

// 创建启用性能监控的代理
const proxy = new NodeMITMProxy({
    config: {
        port: 8080,
        host: 'localhost'
    },
    // 启用性能监控
    enablePerformanceMonitoring: true,
    // 监控配置
    monitoring: {
        collectMetrics: true,
        metricsInterval: 5000,     // 指标收集间隔：5秒
        enableRequestLogging: true, // 启用请求日志
        enableResponseTiming: true, // 启用响应时间统计
        maxLogEntries: 10000,      // 最大日志条目数
        // 性能阈值配置
        thresholds: {
            slowRequest: 1000,      // 慢请求阈值：1秒
            errorRate: 0.05,        // 错误率阈值：5%
            memoryUsage: 0.8        // 内存使用率阈值：80%
        }
    },
    logger: {
        level: 'info'
    }
});

// 性能监控中间件
proxy.use({
    name: 'performance-monitor',
    stage: 'request',
    handler: async (context, next) => {
        const startTime = Date.now();
        const { request } = context;
        
        // 记录请求开始
        const perfMonitor = proxy.getPerformanceMonitor();
        const requestId = await perfMonitor.startRequest({
            method: request.method,
            url: request.url,
            headers: request.headers,
            timestamp: startTime
        });
        
        try {
            await next();
            
            // 记录成功请求
            const endTime = Date.now();
            await perfMonitor.endRequest(requestId, {
                statusCode: context.response.statusCode,
                duration: endTime - startTime,
                success: true
            });
            
        } catch (error) {
            // 记录失败请求
            const endTime = Date.now();
            await perfMonitor.endRequest(requestId, {
                statusCode: context.response.statusCode || 500,
                duration: endTime - startTime,
                success: false,
                error: error.message
            });
            throw error;
        }
    }
});

// 定期输出性能统计
setInterval(async () => {
    const stats = await proxy.getStats();
    console.log('代理性能统计:', {
        requests: {
            total: stats.totalRequests,
            successful: stats.successfulRequests,
            failed: stats.failedRequests,
            errorRate: stats.errorRate
        },
        performance: {
            averageResponseTime: stats.averageResponseTime,
            slowRequests: stats.slowRequests,
            fastestRequest: stats.fastestRequest,
            slowestRequest: stats.slowestRequest
        },
        system: {
            memoryUsage: stats.memoryUsage,
            cpuUsage: stats.cpuUsage,
            uptime: stats.uptime
        }
    });
}, 30000); // 每30秒输出一次

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('性能监控代理已启动');
}

start().catch(console.error);
```

### 详细性能统计API

```javascript
const { NodeMITMProxy } = require('node-proxy');
const os = require('os');

const proxy = new NodeMITMProxy({
    config: { port: 8080 },
    enablePerformanceMonitoring: true
});

// 实时性能统计API
proxy.addRoute('GET', '/api/stats', async (req, res) => {
    const stats = await proxy.getStats();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        proxy: {
            uptime: stats.uptime,
            version: stats.version,
            startTime: stats.startTime
        },
        requests: {
            total: stats.totalRequests,
            successful: stats.successfulRequests,
            failed: stats.failedRequests,
            pending: stats.pendingRequests,
            errorRate: stats.errorRate,
            requestsPerSecond: stats.requestsPerSecond
        },
        performance: {
            averageResponseTime: stats.averageResponseTime,
            medianResponseTime: stats.medianResponseTime,
            p95ResponseTime: stats.p95ResponseTime,
            p99ResponseTime: stats.p99ResponseTime,
            slowRequests: stats.slowRequests,
            fastestRequest: stats.fastestRequest,
            slowestRequest: stats.slowestRequest
        },
        certificates: {
            generated: stats.certificatesGenerated,
            cached: stats.certificatesCached,
            cacheHitRate: stats.certificateCacheHitRate
        },
        system: {
            memoryUsage: {
                used: stats.memoryUsage.used,
                total: stats.memoryUsage.total,
                percentage: stats.memoryUsage.percentage
            },
            cpuUsage: stats.cpuUsage,
            loadAverage: os.loadavg(),
            platform: os.platform(),
            nodeVersion: process.version
        }
    }, null, 2));
});

// 请求历史API
proxy.addRoute('GET', '/api/stats/requests', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    
    const perfMonitor = proxy.getPerformanceMonitor();
    const requests = await perfMonitor.getRequestHistory(limit, offset);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        requests,
        pagination: {
            limit,
            offset,
            total: await perfMonitor.getTotalRequestCount()
        }
    }, null, 2));
});

// 性能趋势API
proxy.addRoute('GET', '/api/stats/trends', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const period = url.searchParams.get('period') || '1h'; // 1h, 6h, 24h, 7d
    
    const perfMonitor = proxy.getPerformanceMonitor();
    const trends = await perfMonitor.getPerformanceTrends(period);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        period,
        trends: {
            responseTime: trends.responseTime,
            requestRate: trends.requestRate,
            errorRate: trends.errorRate,
            memoryUsage: trends.memoryUsage
        },
        analysis: {
            trend: analyzeTrend(trends),
            recommendations: generateRecommendations(trends)
        }
    }, null, 2));
});

// 慢请求分析API
proxy.addRoute('GET', '/api/stats/slow-requests', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const threshold = parseInt(url.searchParams.get('threshold')) || 1000;
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    
    const perfMonitor = proxy.getPerformanceMonitor();
    const slowRequests = await perfMonitor.getSlowRequests(threshold, limit);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        threshold: `${threshold}ms`,
        slowRequests: slowRequests.map(req => ({
            url: req.url,
            method: req.method,
            duration: req.duration,
            timestamp: req.timestamp,
            statusCode: req.statusCode,
            userAgent: req.headers['user-agent']
        })),
        analysis: {
            commonPatterns: findSlowRequestPatterns(slowRequests),
            recommendations: generateSlowRequestRecommendations(slowRequests)
        }
    }, null, 2));
});

// 错误统计API
proxy.addRoute('GET', '/api/stats/errors', async (req, res) => {
    const perfMonitor = proxy.getPerformanceMonitor();
    const errors = await perfMonitor.getErrorStats();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        errors: {
            total: errors.total,
            byStatusCode: errors.byStatusCode,
            byUrl: errors.byUrl,
            byTime: errors.byTime,
            recent: errors.recent
        },
        analysis: {
            mostCommonErrors: errors.mostCommon,
            errorTrends: errors.trends,
            recommendations: generateErrorRecommendations(errors)
        }
    }, null, 2));
});

// 辅助函数
function analyzeTrend(trends) {
    const latest = trends.responseTime.slice(-10);
    const average = latest.reduce((a, b) => a + b, 0) / latest.length;
    const previous = trends.responseTime.slice(-20, -10);
    const previousAverage = previous.reduce((a, b) => a + b, 0) / previous.length;
    
    if (average > previousAverage * 1.1) {
        return 'deteriorating';
    } else if (average < previousAverage * 0.9) {
        return 'improving';
    } else {
        return 'stable';
    }
}

function generateRecommendations(trends) {
    const recommendations = [];
    
    const avgResponseTime = trends.responseTime.reduce((a, b) => a + b, 0) / trends.responseTime.length;
    if (avgResponseTime > 500) {
        recommendations.push({
            type: 'performance',
            message: '平均响应时间较高，建议优化拦截器逻辑或增加缓存',
            priority: 'high'
        });
    }
    
    const avgErrorRate = trends.errorRate.reduce((a, b) => a + b, 0) / trends.errorRate.length;
    if (avgErrorRate > 0.05) {
        recommendations.push({
            type: 'reliability',
            message: '错误率较高，建议检查目标服务器状态和网络连接',
            priority: 'high'
        });
    }
    
    return recommendations;
}

function findSlowRequestPatterns(slowRequests) {
    const patterns = {};
    
    slowRequests.forEach(req => {
        const domain = new URL(req.url).hostname;
        patterns[domain] = (patterns[domain] || 0) + 1;
    });
    
    return Object.entries(patterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count }));
}

function generateSlowRequestRecommendations(slowRequests) {
    const recommendations = [];
    
    const patterns = findSlowRequestPatterns(slowRequests);
    if (patterns.length > 0) {
        recommendations.push({
            type: 'optimization',
            message: `域名 ${patterns[0].domain} 的请求较慢，建议检查网络连接或添加缓存`,
            priority: 'medium'
        });
    }
    
    return recommendations;
}

function generateErrorRecommendations(errors) {
    const recommendations = [];
    
    if (errors.byStatusCode['502'] > 10) {
        recommendations.push({
            type: 'infrastructure',
            message: '大量502错误，建议检查上游服务器状态',
            priority: 'high'
        });
    }
    
    if (errors.byStatusCode['404'] > 20) {
        recommendations.push({
            type: 'configuration',
            message: '大量404错误，建议检查URL路由配置',
            priority: 'medium'
        });
    }
    
    return recommendations;
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('性能统计API代理已启动');
    console.log('可用API端点:');
    console.log('- GET /api/stats - 实时统计');
    console.log('- GET /api/stats/requests - 请求历史');
    console.log('- GET /api/stats/trends - 性能趋势');
    console.log('- GET /api/stats/slow-requests - 慢请求分析');
    console.log('- GET /api/stats/errors - 错误统计');
}

start().catch(console.error);
```

## 🔧 高级配置

### 完整配置示例

```javascript
const proxy = new NodeMITMProxy({
    // 服务器配置
    port: 8080,
    host: '0.0.0.0',
    
    // 日志配置
    logger: {
        level: 'info', // debug, info, warn, error
        file: './proxy.log',
        maxSize: '10MB',
        maxFiles: 5,
        format: 'json' // json, text
    },
    
    // 性能配置
    config: {
        maxConnections: 10000,
        requestTimeout: 30000,
        keepAliveTimeout: 5000,
        maxHeaderSize: 8192,
        
        // 连接池配置
        connectionPool: {
            maxSockets: 256,
            maxFreeSockets: 256,
            keepAlive: true,
            keepAliveMsecs: 1000
        }
    },
    
    // 代理配置
    proxy: {
        upstream: 'http://upstream-proxy:8080',
        auth: 'username:password'
    },
    
    // 监控配置
    metrics: {
        enabled: true,
        interval: 5000,
        historySize: 100,
        
        // 自定义指标
        customMetrics: {
            trackUserAgent: true,
            trackResponseSize: true
        }
    }
});
```

## 🏗️ 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                    NodeMITMProxy                            │
├─────────────────────────────────────────────────────────────┤
│  ProxyServer (核心服务器)                                    │
│  ├── RequestEngine (HTTP请求处理)                           │
│  ├── ConnectEngine (HTTPS连接处理)                          │
│  └── UpgradeEngine (WebSocket升级处理)                      │
├─────────────────────────────────────────────────────────────┤
│  MiddlewareManager (中间件管理)                              │
│  ├── Request Middleware                                     │
│  ├── Response Middleware                                    │
│  └── Connect Middleware                                     │
├─────────────────────────────────────────────────────────────┤
│  InterceptorManager (拦截器管理)                             │
│  ├── Selective Interceptor                                  │
│  └── Rule Engine                                            │
├─────────────────────────────────────────────────────────────┤
│  Foundation Layer (基础设施层)                               │
│  ├── ConfigManager (配置管理)                               │
│  ├── Logger (日志系统)                                       │
│  ├── MetricsCollector (性能监控)                            │
│  └── ConnectionPoolManager (连接池)                         │
└─────────────────────────────────────────────────────────────┘
```

### 目录结构

```
src/
├── index.js                    # 主入口文件
├── core/                       # 核心模块
│   ├── ProxyServer.js          # 代理服务器主类
│   ├── engines/                # 处理引擎
│   │   ├── RequestEngine.js    # HTTP请求处理
│   │   ├── ConnectEngine.js    # HTTPS连接处理
│   │   └── UpgradeEngine.js    # WebSocket升级处理
│   ├── middleware/             # 中间件系统
│   │   └── MiddlewareManager.js
│   ├── interceptors/           # 拦截器系统
│   │   └── InterceptorManager.js
│   └── proxy/                  # 代理核心
│       ├── ConnectionPoolManager.js
│       └── ProxyConfigManager.js
├── foundation/                 # 基础设施
│   ├── config/                # 配置管理
│   ├── logging/               # 日志系统
│   ├── monitoring/            # 性能监控
│   └── utils/                 # 工具类
├── services/                  # 服务层
│   └── tls/                   # TLS服务
├── interfaces/                # 接口定义
├── types/                     # 类型定义
└── adapters/                  # 适配器
    └── LegacyAdapter.js       # 向后兼容
```

## 📚 API 文档

### NodeMITMProxy 类

#### 构造函数

```javascript
new NodeMITMProxy(options)
```

**参数:**
- `options` (Object): 配置选项
  - `port` (Number): 代理服务器端口，默认 8080
  - `host` (String): 绑定主机，默认 '127.0.0.1'
  - `logger` (Object): 日志配置
  - `metrics` (Object): 性能监控配置
  - `certificate` (Object): 证书配置
  - `interceptor` (Object): 拦截器配置

#### 方法

##### `async initialize()`
初始化代理服务器，准备所有组件。

##### `async start(port?, host?)`
启动代理服务器。

**参数:**
- `port` (Number, 可选): 覆盖构造函数中的端口
- `host` (String, 可选): 覆盖构造函数中的主机

##### `async stop()`
停止代理服务器。

##### `async restart()`
重启代理服务器。

##### `use(middleware)`
添加中间件。

**参数:**
- `middleware` (Object): 中间件对象
  - `stage` (String): 阶段 ('request', 'response', 'connect', 'upgrade')
  - `handler` (Function): 处理函数

##### `intercept(interceptor)`
添加拦截器。

##### `getStats()`
获取性能统计信息。

**返回:** Object - 包含各种性能指标的对象

##### `getCACertificate()`
获取 CA 证书内容。

**返回:** String - CA 证书 PEM 格式内容

##### `getServerInfo()`
获取服务器信息。

**返回:** Object - 服务器状态和配置信息

### 事件

#### 'started'
服务器启动时触发。

```javascript
proxy.on('started', (info) => {
    console.log('服务器已启动:', info);
});
```

#### 'stopped'
服务器停止时触发。

```javascript
proxy.on('stopped', () => {
    console.log('服务器已停止');
});
```

#### 'error'
发生错误时触发。

```javascript
proxy.on('error', (error) => {
    console.error('代理错误:', error);
});
```

#### 'metrics'
性能指标更新时触发。

```javascript
proxy.on('metrics', (metrics) => {
    console.log('性能指标:', metrics);
});
```

## 🔄 从 3.x 版本迁移

### 兼容性

4.x 版本保持与 3.x 版本的 API 兼容性，现有代码无需修改即可运行。

```javascript
// 3.x 版本代码仍然有效
const mitmproxy = require('node-proxy');

mitmproxy.createProxy({
    port: 8080,
    requestInterceptor: (rOptions, req, res, ssl, next) => {
        console.log('请求:', req.url);
        next();
    }
});
```

### 推荐的迁移方式

```javascript
// 新的 4.x 方式（推荐）
const { NodeMITMProxy } = require('node-proxy');

const proxy = new NodeMITMProxy({ port: 8080 });

proxy.use({
    stage: 'request',
    handler: async (context, next) => {
        console.log('请求:', context.request.url);
        await next();
    }
});

proxy.initialize().then(() => proxy.start());
```

## 🚨 错误处理和调试

### 错误处理API

```javascript
const { NodeMITMProxy, ProxyError } = require('node-proxy');

const proxy = new NodeMITMProxy({
    config: { port: 8080 },
    
    // 错误处理配置
    errorHandling: {
        // 启用详细错误信息
        verbose: true,
        
        // 错误重试配置
        retry: {
            enabled: true,
            maxAttempts: 3,
            backoffDelay: 1000,
            exponentialBackoff: true
        },
        
        // 错误恢复策略
        recovery: {
            // 连接错误时的处理
            connectionError: 'retry',     // retry, fallback, fail
            // 超时错误时的处理
            timeoutError: 'fallback',     // retry, fallback, fail
            // 证书错误时的处理
            certificateError: 'ignore'    // ignore, fail
        },
        
        // 自定义错误处理器
        customHandlers: {
            // 处理特定类型的错误
            'ECONNREFUSED': async (error, context) => {
                console.log('连接被拒绝，尝试备用服务器');
                context.request.url = context.request.url.replace(
                    'primary.example.com', 
                    'backup.example.com'
                );
                return 'retry';
            },
            
            'ETIMEDOUT': async (error, context) => {
                console.log('请求超时，返回缓存响应');
                const cachedResponse = await getCachedResponse(context.request.url);
                if (cachedResponse) {
                    context.response = cachedResponse;
                    return 'handled';
                }
                return 'fail';
            }
        }
    }
});

// 全局错误处理
proxy.on('error', (error, context) => {
    console.error('代理错误:', {
        type: error.constructor.name,
        message: error.message,
        code: error.code,
        url: context?.request?.url,
        timestamp: new Date().toISOString(),
        stack: error.stack
    });
    
    // 根据错误类型进行不同处理
    if (error instanceof ProxyError.ConnectionError) {
        console.log('连接错误，检查网络状态');
    } else if (error instanceof ProxyError.CertificateError) {
        console.log('证书错误，检查SSL配置');
    } else if (error instanceof ProxyError.TimeoutError) {
        console.log('超时错误，考虑增加超时时间');
    }
});

// 请求级别错误处理
proxy.use({
    name: 'error-handler',
    stage: 'request',
    handler: async (context, next) => {
        try {
            await next();
        } catch (error) {
            // 记录错误详情
            const errorInfo = {
                requestId: context.requestId,
                url: context.request.url,
                method: context.request.method,
                headers: context.request.headers,
                error: {
                    name: error.name,
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                timestamp: new Date().toISOString()
            };
            
            // 发送到错误监控服务
            await sendErrorToMonitoring(errorInfo);
            
            // 根据错误类型返回不同响应
            if (error.code === 'ENOTFOUND') {
                context.response.statusCode = 502;
                context.response.setHeader('Content-Type', 'application/json');
                context.response.end(JSON.stringify({
                    error: 'Bad Gateway',
                    message: '目标服务器无法访问',
                    requestId: context.requestId
                }));
            } else if (error.code === 'ETIMEDOUT') {
                context.response.statusCode = 504;
                context.response.setHeader('Content-Type', 'application/json');
                context.response.end(JSON.stringify({
                    error: 'Gateway Timeout',
                    message: '请求超时',
                    requestId: context.requestId
                }));
            } else {
                context.response.statusCode = 500;
                context.response.setHeader('Content-Type', 'application/json');
                context.response.end(JSON.stringify({
                    error: 'Internal Server Error',
                    message: '服务器内部错误',
                    requestId: context.requestId
                }));
            }
        }
    }
});

// 错误统计和分析
proxy.addRoute('GET', '/api/errors', async (req, res) => {
    const errorStats = await proxy.getErrorStats();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        summary: {
            total: errorStats.total,
            last24Hours: errorStats.last24Hours,
            errorRate: errorStats.errorRate
        },
        byType: errorStats.byType,
        byCode: errorStats.byCode,
        byUrl: errorStats.byUrl,
        recent: errorStats.recent.slice(0, 10),
        trends: errorStats.trends
    }, null, 2));
});

// 辅助函数
async function getCachedResponse(url) {
    // 实现缓存响应获取逻辑
    return null;
}

async function sendErrorToMonitoring(errorInfo) {
    // 发送错误信息到监控服务
    try {
        // 示例：发送到外部监控服务
        // await fetch('https://monitoring.example.com/api/errors', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(errorInfo)
        // });
    } catch (err) {
        console.error('发送错误监控失败:', err);
    }
}

async function start() {
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('错误处理代理已启动');
    } catch (error) {
        console.error('启动失败:', error);
        process.exit(1);
    }
}

start();
```

### 调试工具和API

```javascript
const { NodeMITMProxy, DebugTools } = require('node-proxy');

const proxy = new NodeMITMProxy({
    config: { port: 8080 },
    
    // 调试配置
    debug: {
        enabled: true,
        level: 'verbose',       // minimal, normal, verbose, trace
        
        // 请求/响应日志
        logRequests: true,
        logResponses: true,
        logHeaders: true,
        logBody: true,
        
        // 性能追踪
        tracing: {
            enabled: true,
            sampleRate: 1.0,    // 采样率：1.0 = 100%
            includeStack: true
        },
        
        // 调试输出配置
        output: {
            console: true,
            file: './debug.log',
            remote: {
                enabled: false,
                endpoint: 'https://debug.example.com/api/logs'
            }
        }
    }
});

// 调试中间件
proxy.use({
    name: 'debug-tracer',
    stage: 'request',
    handler: async (context, next) => {
        const startTime = Date.now();
        const traceId = generateTraceId();
        
        // 添加追踪信息
        context.traceId = traceId;
        context.startTime = startTime;
        
        console.log(`[${traceId}] 请求开始:`, {
            method: context.request.method,
            url: context.request.url,
            headers: context.request.headers,
            timestamp: new Date().toISOString()
        });
        
        try {
            await next();
            
            const duration = Date.now() - startTime;
            console.log(`[${traceId}] 请求完成:`, {
                statusCode: context.response.statusCode,
                duration: `${duration}ms`,
                responseHeaders: context.response.getHeaders()
            });
            
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[${traceId}] 请求失败:`, {
                error: error.message,
                duration: `${duration}ms`,
                stack: error.stack
            });
            throw error;
        }
    }
});

// 实时调试API
proxy.addRoute('GET', '/api/debug/requests', async (req, res) => {
    const debugInfo = await proxy.getDebugInfo();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        activeRequests: debugInfo.activeRequests,
        recentRequests: debugInfo.recentRequests,
        connectionPool: debugInfo.connectionPool,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
    }, null, 2));
});

// 调试工具：请求重放
proxy.addRoute('POST', '/api/debug/replay', async (req, res) => {
    const body = await getRequestBody(req);
    const { requestId } = JSON.parse(body);
    
    try {
        const originalRequest = await proxy.getRequestById(requestId);
        if (!originalRequest) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '请求未找到' }));
            return;
        }
        
        // 重放请求
        const replayResult = await proxy.replayRequest(originalRequest);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            originalRequest: {
                id: originalRequest.id,
                url: originalRequest.url,
                method: originalRequest.method,
                timestamp: originalRequest.timestamp
            },
            replayResult: {
                statusCode: replayResult.statusCode,
                duration: replayResult.duration,
                timestamp: new Date().toISOString()
            }
        }, null, 2));
        
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: '重放失败',
            message: error.message
        }));
    }
});

// 调试工具：流量分析
proxy.addRoute('GET', '/api/debug/traffic', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const timeRange = url.searchParams.get('range') || '1h';
    
    const trafficAnalysis = await proxy.analyzeTraffic(timeRange);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        timeRange,
        summary: {
            totalRequests: trafficAnalysis.totalRequests,
            uniqueHosts: trafficAnalysis.uniqueHosts,
            totalBytes: trafficAnalysis.totalBytes,
            averageResponseTime: trafficAnalysis.averageResponseTime
        },
        topHosts: trafficAnalysis.topHosts,
        topPaths: trafficAnalysis.topPaths,
        statusCodes: trafficAnalysis.statusCodes,
        timeline: trafficAnalysis.timeline
    }, null, 2));
});

// 辅助函数
function generateTraceId() {
    return Math.random().toString(36).substr(2, 9);
}

async function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

async function start() {
    await proxy.initialize();
    await proxy.start();
    console.log('调试代理已启动');
    console.log('调试API端点:');
    console.log('- GET /api/debug/requests - 活跃请求信息');
    console.log('- POST /api/debug/replay - 请求重放');
    console.log('- GET /api/debug/traffic - 流量分析');
}

start().catch(console.error);
```

## 🛠️ 开发和调试

### 启用调试日志

```bash
# 启用详细调试日志
export DEBUG=node-proxy:*
export NODE_ENV=development

# 或者在代码中配置
const proxy = new NodeMITMProxy({
    logger: {
        level: 'debug',
        console: true
    }
});
```

### 性能分析

```javascript
// 启用性能分析
const proxy = new NodeMITMProxy({
    metrics: {
        enabled: true,
        detailed: true,
        interval: 1000
    }
});

// 监听详细性能数据
proxy.on('metrics', (metrics) => {
    console.log('详细性能数据:', {
        requestsPerSecond: metrics.requestsPerSecond,
        avgResponseTime: metrics.avgResponseTime,
        memoryUsage: metrics.memoryUsage,
        connectionPool: metrics.connectionPool
    });
});
```

## 📋 最佳实践

### 1. 使用选择性拦截

```javascript
// ✅ 好的做法：只拦截需要的请求
const proxy = new NodeMITMProxy({
    interceptor: {
        domains: ['api.example.com'], // 只拦截特定域名
        pathPrefixes: ['/api/'],      // 只拦截API请求
        staticExtensions: ['.js', '.css', '.png'] // 跳过静态资源
    }
});

// ❌ 避免：拦截所有请求
// 这会显著影响性能
```

### 2. 合理配置连接池

```javascript
const proxy = new NodeMITMProxy({
    config: {
        connectionPool: {
            maxSockets: 256,        // 根据并发需求调整
            maxFreeSockets: 256,    // 保持足够的空闲连接
            keepAlive: true,        // 启用连接复用
            keepAliveMsecs: 1000    // 合理的保活时间
        }
    }
});
```

### 3. 错误处理

```javascript
proxy.on('error', (error) => {
    console.error('代理错误:', error);
    // 实现错误恢复逻辑
});

// 在中间件中处理错误
proxy.use({
    stage: 'request',
    handler: async (context, next) => {
        try {
            await next();
        } catch (error) {
            console.error('请求处理错误:', error);
            context.response.statusCode = 500;
            context.response.end('Internal Server Error');
        }
    }
});
```

### 4. 内存管理

```javascript
// 定期清理和监控内存使用
setInterval(() => {
    const stats = proxy.getStats();
    if (stats.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        console.warn('内存使用过高，考虑重启服务');
    }
}, 30000);

// 优雅关闭
process.on('SIGTERM', async () => {
    console.log('收到关闭信号，正在优雅关闭...');
    await proxy.stop();
    process.exit(0);
});
```

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/smartKitMe/node-proxy.git
cd node-proxy

# 安装依赖
npm install

# 运行测试
npm test

# 构建项目
npm run build
```

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 🙏 致谢

感谢所有贡献者和社区成员的支持！

## 📞 支持

- 🐛 [报告 Bug](https://github.com/smartKitMe/node-proxy/issues)
- 💡 [功能请求](https://github.com/smartKitMe/node-proxy/issues)
- 📖 [文档](https://github.com/smartKitMe/node-proxy/wiki)
- 💬 [讨论](https://github.com/smartKitMe/node-proxy/discussions)

---

**Node Proxy 4.x** - 让网络代理更简单、更强大！ 🚀
