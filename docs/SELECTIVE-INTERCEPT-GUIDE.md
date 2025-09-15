# 选择性拦截功能使用指南

## 概述

选择性拦截功能允许您精确控制哪些请求需要经过拦截器处理，哪些请求直接走快速代理模式。这样可以显著提升代理服务器的性能，同时保持对关键请求的完整控制。

## 核心优势

- **🚀 性能提升**: 非拦截请求走快速路径，延迟降低60-80%
- **🎯 精确控制**: 支持域名、URL、路径等多种匹配方式
- **📊 智能分类**: 自动识别静态资源，优化处理策略
- **🔧 严格匹配**: 必须同时满足域名和路径配置才会拦截
- **📈 实时监控**: 内置性能统计和监控功能

## 快速开始

### 1. 部署功能

```bash
node apply-selective-intercept.js
```

### 2. 配置拦截规则

编辑生成的 `selective-intercept-config.js` 文件：

```javascript
module.exports = {
    // 需要拦截的域名
    domains: [
        'api.example.com',
        'auth.mysite.com'
    ],
    
    // 需要拦截的路径前缀
    pathPrefixes: [
        '/api/',
        '/auth/',
        '/admin/'
    ],
    
    // 强制快速模式的域名
    fastDomains: [
        'cdn.jsdelivr.net',
        'fonts.googleapis.com'
    ]
};
```

### 3. 启动代理服务器

```bash
node selective-intercept-usage.js
```

### 4. 性能测试

```bash
node selective-intercept-test.js
```

## 配置选项详解

### domains (域名匹配)

匹配指定域名及其子域名的所有请求。

```javascript
domains: [
    'api.example.com',     // 精确匹配
    'example.com'          // 匹配 example.com 及所有子域名
]
```

**匹配示例**:
- `api.example.com` ✅
- `v1.api.example.com` ✅ (子域名)
- `other.com` ❌

### urls (完整URL匹配)

匹配完整的URL路径。

```javascript
urls: [
    'api.example.com/v1/users',
    'cdn.example.com/config.json'
]
```

**匹配示例**:
- `api.example.com/v1/users` ✅
- `api.example.com/v1/users/123` ❌

### urlPrefixes (URL前缀匹配)

匹配以指定前缀开头的URL。

```javascript
urlPrefixes: [
    'api.example.com/v1/',
    'auth.mysite.com/oauth/'
]
```

**匹配示例**:
- `api.example.com/v1/users` ✅
- `api.example.com/v1/posts/123` ✅
- `api.example.com/v2/users` ❌

### pathPrefixes (路径前缀匹配)

匹配以指定路径前缀开头的请求，不考虑域名。

```javascript
pathPrefixes: [
    '/api/',
    '/auth/',
    '/admin/'
]
```

**匹配示例**:
- `example.com/api/users` ✅
- `other.com/api/posts` ✅
- `example.com/public/file.js` ❌

### fastDomains (快速域名)

强制指定域名走快速模式，即使匹配其他拦截规则。

```javascript
fastDomains: [
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'ajax.googleapis.com'
]
```

**用途**: CDN、字体服务、公共库等不需要拦截的服务。

### staticExtensions (静态资源)

自动识别静态资源文件，走快速模式。

```javascript
staticExtensions: [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif',
    '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot',
    '.mp4', '.mp3', '.pdf', '.zip'
]
```

## 匹配优先级

拦截判断按以下优先级进行：

1. **fastDomains** (最高优先级) - 强制快速模式
2. **staticExtensions** - 静态资源快速模式
3. **域名配置检查** - 如果没有配置任何域名，直接走快速模式
4. **域名匹配检查** - 检查请求域名是否在配置的域名列表中
5. **路径配置检查** - 如果域名匹配但没有配置任何路径规则，直接走快速模式
6. **路径匹配检查** - 按顺序检查：
   - urls
   - urlPrefixes
   - pathPrefixes
7. **默认行为** - 只有同时满足域名和路径匹配才会进行拦截

## 使用场景

### 场景1: API网关代理

只拦截API请求，其他资源走快速模式：

```javascript
{
    pathPrefixes: ['/api/', '/graphql'],
    fastDomains: ['cdn.example.com', 'static.example.com'],
    staticExtensions: ['.js', '.css', '.png', '.jpg']
}
```

### 场景2: 认证代理

只拦截认证相关请求：

```javascript
{
    domains: ['auth.example.com'],
    pathPrefixes: ['/login', '/logout', '/oauth'],
    fastDomains: ['cdn.jsdelivr.net', 'fonts.googleapis.com']
}
```

### 场景3: 开发调试

拦截特定开发环境的请求：

```javascript
{
    domains: ['localhost', '127.0.0.1', 'dev.example.com'],
    urlPrefixes: ['localhost:3000/api/', 'dev.example.com/debug/'],
    fastDomains: ['unpkg.com', 'cdnjs.cloudflare.com']
}
```

## 性能监控

代理服务器会自动输出性能统计信息：

```
Proxy Performance Stats: {
  requests: 1000,
  avgLatency: '45.23ms',
  errorRate: '0.12%',
  fastPathRate: '78.50%'
}
```

### 指标说明

- **requests**: 总请求数
- **avgLatency**: 平均延迟
- **errorRate**: 错误率
- **fastPathRate**: 快速路径使用率

## 调试和故障排除

### 启用详细日志

在拦截器中添加日志输出：

```javascript
function requestInterceptor(rOptions, req, res, ssl, next) {
    console.log('拦截请求:', {
        host: req.headers.host,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    next();
}
```

### 检查匹配规则

使用测试脚本验证配置：

```bash
node selective-intercept-test.js
```

### 常见问题

**Q: 为什么某些请求没有被拦截？**

A: 检查以下几点：
1. 是否在 `fastDomains` 中
2. 是否为静态资源文件
3. 匹配规则是否正确
4. 域名是否包含端口号

**Q: 性能提升不明显？**

A: 可能原因：
1. 拦截规则过于宽泛
2. 静态资源配置不完整
3. 快速域名配置不足

**Q: 如何回滚到原始版本？**

A: 使用备份文件：
```bash
# 查找备份文件
ls *.backup.*

# 恢复备份
cp src/mitmproxy/index.js.backup.1234567890 src/mitmproxy/index.js
cp src/mitmproxy/createRequestHandler.js.backup.1234567890 src/mitmproxy/createRequestHandler.js
```

## 最佳实践

### 1. 配置原则

- **最小化拦截**: 只拦截真正需要处理的请求
- **最大化快速路径**: 将CDN、静态资源等加入快速域名
- **定期优化**: 根据监控数据调整配置

### 2. 性能优化

- 使用 `fastDomains` 排除高频访问的CDN域名
- 完善 `staticExtensions` 配置
- 避免过于复杂的匹配规则

### 3. 安全考虑

- 确保敏感API路径在拦截规则中
- 定期审查快速域名列表
- 监控异常请求模式

### 4. 监控和维护

- 定期查看性能统计
- 监控错误率变化
- 根据业务变化调整配置

## 高级配置

### 动态配置更新

```javascript
// 支持运行时更新配置
const config = require('./selective-intercept-config');

// 监听配置文件变化
fs.watchFile('./selective-intercept-config.js', () => {
    delete require.cache[require.resolve('./selective-intercept-config')];
    const newConfig = require('./selective-intercept-config');
    console.log('配置已更新:', newConfig);
});
```

### 条件拦截

```javascript
function requestInterceptor(rOptions, req, res, ssl, next) {
    // 根据请求头决定是否处理
    if (req.headers['x-debug'] === 'true') {
        console.log('调试模式请求:', req.url);
        // 特殊处理逻辑
    }
    
    // 根据时间决定是否处理
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 6) {
        // 凌晨时段的特殊处理
    }
    
    next();
}
```

### 自定义匹配逻辑

```javascript
// 在 createRequestHandler.js 中扩展 shouldIntercept 函数
function shouldIntercept(req, interceptConfig) {
    // 原有逻辑...
    
    // 自定义匹配逻辑
    if (req.headers['user-agent'] && req.headers['user-agent'].includes('Bot')) {
        return false; // 爬虫请求走快速模式
    }
    
    if (req.method === 'OPTIONS') {
        return false; // CORS预检请求走快速模式
    }
    
    // 其他逻辑...
}
```

## 版本兼容性

- **Node.js**: >= 12.0.0
- **node-mitmproxy**: 当前版本
- **操作系统**: Linux, macOS, Windows

## 更新日志

### v1.0.0
- 初始版本发布
- 支持域名、URL、路径前缀匹配
- 内置性能监控
- 自动静态资源识别

## 技术支持

如果您在使用过程中遇到问题，请：

1. 查看本文档的故障排除部分
2. 运行性能测试脚本进行诊断
3. 检查控制台输出的错误信息
4. 提供详细的配置和错误日志

## 贡献指南

欢迎提交改进建议和代码贡献：

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 发起 Pull Request

---

**注意**: 选择性拦截功能采用严格匹配策略，只有明确配置的域名才会进行拦截判断，路径匹配规则只在域名匹配的前提下生效。默认行为是走快速模式，确保最佳性能表现。