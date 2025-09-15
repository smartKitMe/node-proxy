# 代理 Agent 性能优化使用指南

## 概述

本文档介绍了优化后的 `ProxyHttpAgent` 和 `ProxyHttpsAgent` 的使用方法，包括性能监控、调试日志和配置优化等功能。

## 主要优化内容

### 1. 连接池优化

- **增加连接数限制**：每个主机最大连接数提升至 256
- **优化连接复用**：空闲连接保持时间设置为 30 秒
- **改进调度策略**：使用 FIFO（先进先出）调度策略
- **超时控制**：请求超时时间设置为 60 秒

### 2. 性能监控功能

#### 统计指标

- 总请求数
- 活跃连接数
- 连接复用率
- 新建连接数
- 超时次数
- 错误次数
- SSL 握手次数（HTTPS）
- SSL 错误次数（HTTPS）

#### 连接池状态

- 每个主机的活跃连接数
- 每个主机的空闲连接数

### 3. 调试日志功能

- 连接创建/复用日志
- SSL 握手详情（HTTPS）
- 连接关闭/超时/错误日志
- NTLM 认证 Socket ID 跟踪

## 环境变量配置

### 启用调试日志

```bash
# 开发环境自动启用
export NODE_ENV=development

# 或者显式启用代理调试
export DEBUG_PROXY=true
```

### 启用性能监控

```bash
# 启用性能指标收集和定期报告
export ENABLE_PROXY_METRICS=true
```

## 编程接口

### 获取性能统计

```javascript
const util = require('./src/common/util');

// 获取代理 Agent 性能统计
const stats = util.getAgentStats();
console.log('HTTP Agent 统计:', stats.http);
console.log('HTTPS Agent 统计:', stats.https);
```

### 重置统计数据

```javascript
// 重置所有代理 Agent 的性能统计
util.resetAgentStats();
```

### 动态控制日志和监控

```javascript
// 启用/禁用调试日志
util.setProxyDebugLogs(true);  // 启用
util.setProxyDebugLogs(false); // 禁用

// 启用/禁用性能监控
util.setProxyPerformanceMetrics(true);  // 启用
util.setProxyPerformanceMetrics(false); // 禁用
```

## 性能统计数据结构

```javascript
{
  http: {
    totalRequests: 1250,        // 总请求数
    activeConnections: 15,      // 当前活跃连接数
    newConnections: 200,        // 新建连接数
    reuseConnections: 1050,     // 复用连接数
    reuseRate: 84.0,           // 连接复用率 (%)
    timeouts: 2,               // 超时次数
    errors: 1,                 // 错误次数
    errorRate: 0.08,           // 错误率 (%)
    poolStatus: {              // 连接池状态
      'example.com:80': {
        active: 2,             // 活跃连接
        free: 5                // 空闲连接
      }
    },
    uptime: 3600000            // 运行时间 (ms)
  },
  https: {
    // HTTPS Agent 统计（包含额外的 SSL 相关指标）
    sslHandshakes: 180,        // SSL 握手次数
    sslErrors: 1,              // SSL 错误次数
    sslErrorRate: 0.56,        // SSL 错误率 (%)
    // ... 其他指标同 HTTP
  },
  timestamp: 1640995200000     // 统计时间戳
}
```

## 调试日志示例

### HTTP Agent 日志

```
[ProxyHttpAgent] 初始化完成，配置: { maxSockets: 256, maxFreeSockets: 256, keepAliveMsecs: 30000, timeout: 60000 }
[ProxyHttpAgent] 新建连接: example.com:80
[ProxyHttpAgent] 复用连接: example.com:80
[ProxyHttpAgent] NTLM Socket ID: auth_12345
[ProxyHttpAgent] 连接超时: slow-server.com:80
[ProxyHttpAgent] 连接关闭: example.com:80
```

### HTTPS Agent 日志

```
[ProxyHttpsAgent] 初始化完成，配置: { maxSockets: 256, maxFreeSockets: 256, keepAliveMsecs: 30000, timeout: 60000, rejectUnauthorized: false }
[ProxyHttpsAgent] 新建 HTTPS 连接: secure.example.com:443
[ProxyHttpsAgent] SSL 握手完成: secure.example.com:443 { protocol: 'TLSv1.3', cipher: 'AES256-GCM-SHA384', authorized: true, subject: 'secure.example.com' }
[ProxyHttpsAgent] 复用 HTTPS 连接: secure.example.com:443
```

### 性能统计报告

```
[ProxyHttpAgent] 性能统计: {
  总请求数: 1250,
  活跃连接: 15,
  连接复用率: '84.0%',
  连接池状态: { 'example.com:80': { active: 2, free: 5 } },
  错误率: '0.08%'
}

[ProxyHttpsAgent] HTTPS 性能统计: {
  总请求数: 890,
  活跃连接: 12,
  连接复用率: '78.5%',
  SSL握手次数: 180,
  SSL错误率: '0.56%',
  连接池状态: { 'secure.example.com:443': { active: 3, free: 4 } },
  错误率: '0.11%'
}
```

## 性能优化建议

### 1. 连接池配置

- 根据并发需求调整 `maxSockets` 和 `maxFreeSockets`
- 在高并发场景下可以适当增加连接数限制
- 调整 `keepAliveMsecs` 以平衡连接复用和资源占用

### 2. 监控和调试

- 生产环境建议禁用详细调试日志，只启用性能监控
- 定期检查连接复用率，低于 70% 时需要优化
- 监控错误率和超时率，及时发现网络问题

### 3. SSL/TLS 优化

- 在代理场景下，`rejectUnauthorized: false` 可以避免自签名证书问题
- 监控 SSL 握手次数和错误率，优化 HTTPS 连接性能

## 故障排查

### 连接复用率低

1. 检查 `keepAliveMsecs` 配置是否合适
2. 确认目标服务器支持 Keep-Alive
3. 检查网络稳定性和延迟

### 连接超时频繁

1. 调整 `timeout` 配置
2. 检查网络质量
3. 确认目标服务器响应时间

### SSL 错误率高

1. 检查证书配置
2. 确认 TLS 协议版本兼容性
3. 检查 `rejectUnauthorized` 设置

## 注意事项

1. **内存使用**：启用详细日志和性能监控会增加内存使用
2. **性能影响**：事件监听器会带来轻微的性能开销
3. **日志量**：高并发场景下调试日志量可能很大，建议谨慎使用
4. **统计精度**：性能统计基于事件触发，在极高并发下可能存在轻微误差