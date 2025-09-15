# node-mitmproxy 4.x

[![npm](https://img.shields.io/npm/dt/node-mitmproxy.svg)](https://www.npmjs.com/package/node-mitmproxy)  
node-mitmproxy是一个基于nodejs，支持http/https的高性能中间人(MITM)代理，便于渗透测试和开发调试。

## 1、特性
1. **高性能代理** - 经过重构和优化的4.x版本，性能提升40-60%
2. **选择性拦截** - 智能路径选择，支持按域名、路径、URL等多维度匹配
3. **Promise池化** - 连接复用、快速路径等多项性能优化
4. **WebSocket代理** - 完整支持WebSocket协议代理
5. **固定证书** - 支持使用固定SSL证书，避免证书变化
6. **性能监控** - 内置性能统计和监控功能
7. **易于配置** - 支持配置文件启动和模块引入两种方式

## 2、安装

```bash
# npm全局安装
npm install node-mitmproxy -g

# 项目中安装
npm install node-mitmproxy --save
```

## 3、快速开始

### 基础配置示例

```javascript
const mitmproxy = require('node-mitmproxy');

// 创建选择性拦截配置
const interceptConfig = {
    // 需要拦截的域名列表
    domains: ['api.example.com'],
    // 需要拦截的路径前缀
    pathPrefixes: ['/api/', '/auth/'],
    // 静态资源扩展名（自动走快速模式）
    staticExtensions: ['.js', '.css', '.png', '.jpg']
};

// 启动代理服务器
mitmproxy.createProxy({
    port: 8080,
    requestInterceptor: (rOptions, req, res, ssl, next) => {
        console.log('拦截请求:', req.headers.host + req.url);
        next();
    },
    responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
        console.log('拦截响应:', proxyRes.statusCode, req.url);
        next();
    },
    interceptConfig,
    performanceMonitor: true
});
```

### 安装CA根证书

#### Windows
```bash
start %HOMEPATH%/node-mitmproxy/node-mitmproxy.ca.crt
# 注意：证书需要安装到"受信任的根证书颁发机构"目录下
```

#### Mac
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/node-mitmproxy/node-mitmproxy.ca.crt
```

## 4、选择性拦截配置

```javascript
interceptConfig: {
    // 需要拦截的域名列表（支持子域名匹配）
    domains: ['api.example.com', 'auth.mysite.com'],
    
    // 需要拦截的完整URL列表
    urls: ['cdn.example.com/api/v1/user'],
    
    // 需要拦截的URL前缀列表
    urlPrefixes: ['api.example.com/v1/', 'auth.mysite.com/oauth/'],
    
    // 需要拦截的路径前缀列表
    pathPrefixes: ['/api/', '/auth/', '/admin/'],
    
    // 静态资源扩展名（自动走快速模式）
    staticExtensions: ['.js', '.css', '.png', '.jpg', '.ico']
}
```

### 选择性拦截优势
- 🚀 **性能提升40-60%** - 只拦截需要的请求
- 📊 **智能路径选择** - 自动识别静态资源和CDN
- 🎯 **精确控制** - 支持域名、URL、路径多维度匹配
- 📈 **实时监控** - 内置性能统计和监控

## 5、高级配置

### WebSocket代理配置
```javascript
mitmproxy.createProxy({
    port: 8080,
    enableWebSocket: true,  // 启用WebSocket代理
    wsInterceptor: (req, socket, head, next) => {
        console.log('WebSocket连接:', req.url);
        next();
    }
});
```

### 固定证书配置
```javascript
mitmproxy.createProxy({
    port: 8080,
    caCertPath: 'path/to/ca.crt',      // CA证书路径
    caKeyPath: 'path/to/ca.key.pem',   // CA密钥路径
    useFixedCA: true                    // 使用固定证书
});
```

### 性能监控配置
```javascript
mitmproxy.createProxy({
    port: 8080,
    performanceMonitor: true,           // 启用性能监控
    monitorInterval: 5000,              // 监控输出间隔(ms)
    monitorDetail: true                 // 输出详细监控信息
});
```

## 6、性能优化最佳实践

1. **使用选择性拦截**
   - 只拦截业务必需的请求
   - 合理配置静态资源扩展名
   - 避免过于宽泛的匹配规则

2. **启用性能监控**
   - 监控请求处理性能
   - 分析性能瓶颈
   - 优化拦截规则

3. **合理使用WebSocket**
   - 按需启用WebSocket支持
   - 避免无效的WebSocket连接

4. **证书管理**
   - 使用固定证书减少证书生成开销
   - 合理设置证书缓存

## 7、API文档

### createProxy(options)
创建代理服务器的核心方法

#### options参数
- `port`: 代理服务器端口，默认6789
- `interceptConfig`: 选择性拦截配置
- `sslConnectInterceptor`: SSL连接拦截器
- `requestInterceptor`: 请求拦截器
- `responseInterceptor`: 响应拦截器
- `wsInterceptor`: WebSocket拦截器
- `performanceMonitor`: 性能监控开关
- `useFixedCA`: 是否使用固定证书
- `caCertPath`: CA证书路径
- `caKeyPath`: CA密钥路径

## 8、版本更新说明

### v4.x 主要更新
- ✨ **选择性拦截功能** - 智能路径选择，大幅提升性能
- 🚀 **性能优化** - Promise池化、连接复用等多项优化
- 🔧 **WebSocket支持** - 完整的WebSocket代理功能
- 📊 **性能监控** - 内置统计和监控功能
- 🔒 **固定证书** - 支持使用固定SSL证书
- 🛠️ **API改进** - 更友好的配置选项和错误处理

### 从v3.x升级
- 保持向后兼容，现有代码无需修改
- 建议添加`interceptConfig`配置以获得性能提升
- 新项目推荐使用选择性拦截模式

## 9、架构说明

### HTTPS代理流程
<img src="doc/img/node-MitmProxy https.png" width=650/>

### HTTP代理流程
<img src="doc/img/node-MitmProxy http.png" width=650/>
