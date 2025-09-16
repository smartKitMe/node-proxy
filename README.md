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

```javascript
const { NodeMITMProxy } = require('node-proxy');

// 创建代理实例
const proxy = new NodeMITMProxy({
    port: 8080,
    host: '127.0.0.1'
});

// 启动代理服务器
async function startProxy() {
    await proxy.initialize();
    await proxy.start();
    console.log('代理服务器已启动在 http://127.0.0.1:8080');
}

startProxy().catch(console.error);
```

### 请求拦截示例

```javascript
const { NodeMITMProxy } = require('node-proxy');

const proxy = new NodeMITMProxy({
    port: 8080
});

// 添加请求拦截器
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

// 添加响应拦截器
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

```javascript
const proxy = new NodeMITMProxy({
    port: 8080,
    // 启用 WebSocket 支持
    enableWebSocket: true
});

// WebSocket 连接拦截
proxy.use({
    stage: 'upgrade',
    handler: async (context, next) => {
        const { request } = context;
        console.log(`WebSocket 连接: ${request.url}`);
        
        // 可以在这里添加认证逻辑
        if (!isAuthorized(request)) {
            context.response.statusCode = 401;
            return;
        }
        
        await next();
    }
});
```

## 📊 性能监控

```javascript
const proxy = new NodeMITMProxy({
    port: 8080,
    metrics: {
        enabled: true,
        interval: 5000, // 5秒输出一次统计
        historySize: 100 // 保留最近100条记录
    }
});

// 监听性能指标事件
proxy.on('metrics', (metrics) => {
    console.log('性能指标:', {
        requests: metrics.requests,
        responses: metrics.responses,
        connections: metrics.connections,
        avgResponseTime: metrics.avgResponseTime,
        memoryUsage: metrics.memoryUsage
    });
});

// 手动获取统计信息
setInterval(() => {
    const stats = proxy.getStats();
    console.log('当前统计:', stats);
}, 10000);
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
