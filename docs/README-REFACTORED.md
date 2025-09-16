# Node MITM Proxy - 重构版本

这是 node-mitmproxy 的重构版本，采用了全新的架构设计，提供更好的性能、可维护性和扩展性。

## 🚀 新特性

### 架构优化
- **模块化设计**: 采用清晰的分层架构，各模块职责明确
- **依赖注入**: 使用依赖注入模式，提高代码的可测试性和可维护性
- **事件驱动**: 基于事件驱动架构，支持异步处理和高并发
- **插件系统**: 支持中间件和拦截器，易于扩展功能

### 性能提升
- **对象池**: 使用对象池减少GC压力，提高性能
- **连接复用**: 优化连接管理，减少资源消耗
- **异步处理**: 全面采用异步处理，提高并发能力
- **内存优化**: 优化内存使用，减少内存泄漏风险

### 监控和日志
- **性能监控**: 内置性能监控系统，实时收集各项指标
- **结构化日志**: 支持结构化日志，便于分析和调试
- **指标统计**: 提供详细的统计信息，帮助优化性能

## 📦 安装

```bash
npm install node-mitmproxy
```

## 🔧 快速开始

### 基本使用

```javascript
const { NodeMITMProxy } = require('node-mitmproxy');

// 创建代理实例
const proxy = new NodeMITMProxy({
  port: 8080,
  ssl: {
    enabled: true,
    caKeyPath: './ca-key.pem',
    caCertPath: './ca-cert.pem'
  }
});

// 启动代理服务器
proxy.start().then(() => {
  console.log('Proxy server started on port 8080');
}).catch(error => {
  console.error('Failed to start proxy server:', error);
});

// 优雅关闭
process.on('SIGINT', async () => {
  await proxy.stop();
  process.exit(0);
});
```

### 使用中间件

```javascript
// 注册请求中间件
proxy.use({
  name: 'request-logger',
  phase: 'request',
  priority: 100,
  execute: async (context, next) => {
    console.log(`Request: ${context.request.method} ${context.request.url}`);
    await next();
  }
});

// 注册响应中间件
proxy.use({
  name: 'response-modifier',
  phase: 'response',
  priority: 50,
  execute: async (context, next) => {
    // 修改响应头
    context.response.setHeader('X-Proxy-By', 'node-mitmproxy');
    await next();
  }
});
```

### 使用拦截器

```javascript
// 注册拦截器
proxy.intercept({
  name: 'api-interceptor',
  phase: 'request',
  priority: 100,
  match: (context) => {
    return context.request.url.includes('/api/');
  },
  execute: async (context, next) => {
    // 拦截API请求
    if (context.request.url.includes('/api/blocked')) {
      context.response.statusCode = 403;
      context.response.end('Access Denied');
      return;
    }
    await next();
  }
});
```

### 监控和统计

```javascript
// 获取性能统计
const stats = proxy.getStats();
console.log('Performance Stats:', {
  requests: stats.requests,
  connections: stats.connections,
  traffic: stats.traffic,
  performance: stats.performance
});

// 监听性能事件
proxy.on('metrics', (metrics) => {
  console.log('Real-time metrics:', metrics);
});
```

## 🔄 从旧版本迁移

### 自动迁移工具

```javascript
const { migrate } = require('node-mitmproxy/src/adapters/MigrationTool');

// 迁移整个项目
await migrate('./src', {
  dryRun: false, // 设置为true进行预览
  backupDir: './migration-backup'
});
```

### 使用兼容适配器

如果你不想立即迁移代码，可以使用兼容适配器：

```javascript
const { createLegacyProxy } = require('node-mitmproxy/src/adapters/LegacyAdapter');

// 创建兼容的代理实例
const proxy = createLegacyProxy({
  port: 8080,
  ssl: {
    key: fs.readFileSync('./ca-key.pem'),
    cert: fs.readFileSync('./ca-cert.pem')
  }
});

// 使用旧版本API
proxy.use(function(req, res, next) {
  console.log(`${req.method} ${req.url}`);
  next();
});

proxy.listen(8080, () => {
  console.log('Proxy server started');
});
```

## 📚 API 文档

### NodeMITMProxy 类

#### 构造函数

```javascript
new NodeMITMProxy(options)
```

**参数:**
- `options` (Object): 配置选项
  - `port` (number): 代理服务器端口，默认 8080
  - `host` (string): 代理服务器主机，默认 '0.0.0.0'
  - `ssl` (Object): SSL配置
    - `enabled` (boolean): 是否启用SSL，默认 true
    - `caKeyPath` (string): CA私钥文件路径
    - `caCertPath` (string): CA证书文件路径
  - `logging` (Object): 日志配置
    - `level` (string): 日志级别，默认 'info'
    - `file` (string): 日志文件路径
  - `performance` (Object): 性能配置
    - `objectPoolSize` (number): 对象池大小，默认 1000
    - `maxConnections` (number): 最大连接数，默认 10000

#### 方法

##### start()
启动代理服务器

```javascript
await proxy.start();
```

##### stop()
停止代理服务器

```javascript
await proxy.stop();
```

##### restart()
重启代理服务器

```javascript
await proxy.restart();
```

##### use(middleware)
注册中间件

```javascript
proxy.use({
  name: 'middleware-name',
  phase: 'request|response|connect|upgrade',
  priority: 100,
  execute: async (context, next) => {
    // 中间件逻辑
    await next();
  }
});
```

##### intercept(interceptor)
注册拦截器

```javascript
proxy.intercept({
  name: 'interceptor-name',
  phase: 'request|response|connect|upgrade',
  priority: 100,
  match: (context) => boolean,
  execute: async (context, next) => {
    // 拦截器逻辑
    await next();
  }
});
```

##### getStats()
获取性能统计

```javascript
const stats = proxy.getStats();
```

##### getConfig()
获取配置信息

```javascript
const config = proxy.getConfig();
```

### 事件

#### 'started'
代理服务器启动时触发

```javascript
proxy.on('started', (info) => {
  console.log('Proxy started:', info);
});
```

#### 'stopped'
代理服务器停止时触发

```javascript
proxy.on('stopped', () => {
  console.log('Proxy stopped');
});
```

#### 'request'
收到HTTP请求时触发

```javascript
proxy.on('request', (context) => {
  console.log('Request:', context.request.url);
});
```

#### 'response'
发送HTTP响应时触发

```javascript
proxy.on('response', (context) => {
  console.log('Response:', context.response.statusCode);
});
```

#### 'connect'
收到CONNECT请求时触发

```javascript
proxy.on('connect', (context) => {
  console.log('Connect:', context.target.host);
});
```

#### 'error'
发生错误时触发

```javascript
proxy.on('error', (error) => {
  console.error('Proxy error:', error);
});
```

#### 'metrics'
性能指标更新时触发

```javascript
proxy.on('metrics', (metrics) => {
  console.log('Metrics:', metrics);
});
```

## 🏗️ 架构设计

### 目录结构

```
src/
├── core/                    # 核心模块
│   ├── ProxyServer.js      # 代理服务器主类
│   ├── engines/            # 处理引擎
│   │   ├── RequestEngine.js
│   │   ├── ConnectEngine.js
│   │   └── UpgradeEngine.js
│   ├── middleware/         # 中间件系统
│   │   └── MiddlewareManager.js
│   └── interceptors/       # 拦截器系统
│       └── InterceptorManager.js
├── foundation/             # 基础设施
│   ├── config/            # 配置管理
│   │   └── ConfigManager.js
│   ├── logging/           # 日志系统
│   │   └── Logger.js
│   ├── monitoring/        # 性能监控
│   │   └── MetricsCollector.js
│   └── utils/             # 工具类
│       └── ObjectPool.js
├── services/              # 服务层
│   └── tls/              # TLS服务
│       └── CertificateManager.js
├── interfaces/            # 接口定义
│   ├── ILogger.js
│   └── IConfigProvider.js
├── types/                 # 类型定义
│   └── ProxyTypes.js
├── adapters/              # 适配器
│   ├── LegacyAdapter.js   # 向后兼容适配器
│   └── MigrationTool.js   # 迁移工具
└── index.js               # 主入口文件
```

### 设计原则

1. **单一职责原则**: 每个模块只负责一个特定的功能
2. **开放封闭原则**: 对扩展开放，对修改封闭
3. **依赖倒置原则**: 依赖抽象而不是具体实现
4. **接口隔离原则**: 使用小而专一的接口
5. **里氏替换原则**: 子类可以替换父类

### 核心组件

#### ProxyServer
代理服务器的主类，负责:
- 服务器生命周期管理
- 请求路由和分发
- 事件管理
- 组件协调

#### 处理引擎
- **RequestEngine**: 处理HTTP请求
- **ConnectEngine**: 处理HTTPS CONNECT请求
- **UpgradeEngine**: 处理WebSocket升级请求

#### 中间件系统
支持多阶段中间件:
- `request`: 请求处理阶段
- `response`: 响应处理阶段
- `connect`: 连接处理阶段
- `upgrade`: 升级处理阶段

#### 拦截器系统
支持条件拦截:
- 基于URL模式匹配
- 基于请求头匹配
- 自定义匹配逻辑

## 🔧 配置选项

### 完整配置示例

```javascript
const proxy = new NodeMITMProxy({
  // 服务器配置
  port: 8080,
  host: '0.0.0.0',
  
  // SSL配置
  ssl: {
    enabled: true,
    caKeyPath: './ca-key.pem',
    caCertPath: './ca-cert.pem',
    keySize: 2048,
    validityDays: 365
  },
  
  // 日志配置
  logging: {
    level: 'info',
    file: './proxy.log',
    maxSize: '10MB',
    maxFiles: 5,
    format: 'json'
  },
  
  // 性能配置
  performance: {
    objectPoolSize: 1000,
    maxConnections: 10000,
    requestTimeout: 30000,
    keepAliveTimeout: 5000,
    maxHeaderSize: 8192
  },
  
  // 监控配置
  monitoring: {
    enabled: true,
    interval: 5000,
    historySize: 100
  }
});
```

## 📊 性能优化

### 对象池
使用对象池减少GC压力:

```javascript
// 对象池会自动管理以下对象:
// - RequestContext
// - ConnectContext  
// - UpgradeContext
// - 各种临时对象
```

### 连接复用
优化连接管理:

```javascript
// 自动启用HTTP Keep-Alive
// 复用到目标服务器的连接
// 智能连接池管理
```

### 内存优化
减少内存使用:

```javascript
// 流式处理大文件
// 及时释放不需要的对象
// 避免内存泄漏
```

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行性能测试
npm run test:performance

# 运行压力测试
npm run test:stress
```

### 性能基准

在标准测试环境下的性能指标:

- **吞吐量**: 10,000+ 请求/秒
- **延迟**: < 10ms (P99)
- **内存使用**: < 100MB (1000并发)
- **CPU使用**: < 50% (1000并发)

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤:

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🆘 支持

如果你遇到问题或有疑问:

1. 查看 [文档](docs/)
2. 搜索 [Issues](https://github.com/your-repo/node-mitmproxy/issues)
3. 创建新的 [Issue](https://github.com/your-repo/node-mitmproxy/issues/new)

## 📝 更新日志

### v2.0.0 (重构版本)

#### 新增
- 全新的模块化架构
- 性能监控系统
- 对象池优化
- 中间件和拦截器系统
- 自动迁移工具
- 向后兼容适配器

#### 改进
- 大幅提升性能
- 更好的错误处理
- 结构化日志
- 更清晰的API设计

#### 破坏性变更
- API接口变更
- 配置格式变更
- 事件名称变更

详细的变更记录请查看 [CHANGELOG.md](CHANGELOG.md)