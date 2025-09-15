# 性能优化实施指南

本指南详细说明如何在现有的 node-mitmproxy 项目中实施性能优化措施。

## 📋 实施概览

### 优化文件说明
- `createRequestHandler.optimized.js` - 优化的HTTP请求处理器
- `createConnectHandler.optimized.js` - 优化的HTTPS连接处理器
- `performance-comparison-test.js` - 性能对比测试脚本
- `ADVANCED-PERFORMANCE-OPTIMIZATION.md` - 详细优化策略文档

## 🚀 快速开始

### 1. 备份原始文件
```bash
# 备份原始文件
cp src/mitmproxy/createRequestHandler.js src/mitmproxy/createRequestHandler.original.js
cp src/mitmproxy/createConnectHandler.js src/mitmproxy/createConnectHandler.original.js
```

### 2. 应用优化版本
```bash
# 替换为优化版本
cp src/mitmproxy/createRequestHandler.optimized.js src/mitmproxy/createRequestHandler.js
cp src/mitmproxy/createConnectHandler.optimized.js src/mitmproxy/createConnectHandler.js
```

### 3. 运行性能测试
```bash
# 安装测试依赖（如果需要）
npm install colors

# 运行性能对比测试
node performance-comparison-test.js
```

## 📊 性能测试结果解读

### 测试指标说明
- **平均延迟 (avg)**: 所有请求的平均处理时间
- **50th百分位 (p50)**: 50%的请求处理时间低于此值
- **90th百分位 (p90)**: 90%的请求处理时间低于此值
- **95th百分位 (p95)**: 95%的请求处理时间低于此值
- **99th百分位 (p99)**: 99%的请求处理时间低于此值
- **吞吐量**: 每秒处理的请求数量

### 预期性能提升
- **RequestHandler**: 30-50% 延迟降低
- **ConnectHandler**: 25-40% 延迟降低
- **整体吞吐量**: 40-60% 提升
- **内存使用**: 20-30% 优化

## 🔧 分步实施策略

### 阶段1: 核心优化（推荐优先实施）
1. **Promise池化** - 减少Promise创建开销
2. **缓存机制** - 缓存常用对象和计算结果
3. **快速路径** - 为简单请求提供快速处理路径

### 阶段2: 连接优化
1. **连接池管理** - 复用TCP连接
2. **URL解析缓存** - 避免重复解析
3. **错误处理优化** - 分类处理不同类型错误

### 阶段3: 高级优化
1. **性能监控** - 实时性能指标收集
2. **自适应优化** - 根据负载动态调整
3. **内存管理** - 优化内存分配和回收

## ⚙️ 配置优化

### Node.js 运行时优化
```bash
# 启动时的推荐参数
node --max-old-space-size=4096 \
     --optimize-for-size \
     --gc-interval=100 \
     your-proxy-server.js
```

### 环境变量配置
```bash
# 设置性能相关环境变量
export NODE_ENV=production
export UV_THREADPOOL_SIZE=16
export MITMPROXY_PERFORMANCE_MODE=true
export MITMPROXY_CACHE_SIZE=10000
```

## 📈 监控和调试

### 性能监控
优化版本包含内置的性能监控功能：

```javascript
// 启用性能监控
process.env.MITMPROXY_PERFORMANCE_MONITORING = 'true';

// 监控数据将输出到控制台
// 每1000个请求输出一次统计信息
```

### 调试模式
```javascript
// 启用详细调试信息
process.env.MITMPROXY_DEBUG_PERFORMANCE = 'true';

// 这将输出每个请求的详细性能数据
```

## 🧪 测试验证

### 1. 功能测试
```bash
# 确保基本功能正常
npm test

# 运行特定的代理测试
npm run test:proxy
```

### 2. 性能基准测试
```bash
# 运行完整的性能对比测试
node performance-comparison-test.js

# 查看详细报告
cat performance-report.json
```

### 3. 压力测试
```bash
# 使用 Apache Bench 进行压力测试
ab -n 10000 -c 100 http://localhost:8080/

# 使用 wrk 进行更高级的压力测试
wrk -t12 -c400 -d30s http://localhost:8080/
```

## 🔄 回滚策略

如果优化版本出现问题，可以快速回滚：

```bash
# 回滚到原始版本
cp src/mitmproxy/createRequestHandler.original.js src/mitmproxy/createRequestHandler.js
cp src/mitmproxy/createConnectHandler.original.js src/mitmproxy/createConnectHandler.js

# 重启服务
npm restart
```

## 📝 自定义优化

### 调整缓存大小
```javascript
// 在优化文件中调整缓存配置
const CACHE_CONFIG = {
    maxSize: process.env.MITMPROXY_CACHE_SIZE || 5000,
    ttl: process.env.MITMPROXY_CACHE_TTL || 300000, // 5分钟
    checkPeriod: 60000 // 1分钟清理一次
};
```

### 调整Promise池大小
```javascript
// 根据服务器配置调整池大小
const PROMISE_POOL_SIZE = process.env.MITMPROXY_PROMISE_POOL_SIZE || 1000;
```

### 调整性能监控频率
```javascript
// 调整监控输出频率
const MONITORING_INTERVAL = process.env.MITMPROXY_MONITORING_INTERVAL || 1000;
```

## 🎯 最佳实践

### 1. 渐进式部署
- 先在测试环境验证
- 使用A/B测试对比性能
- 逐步扩展到生产环境

### 2. 监控关键指标
- 响应时间
- 吞吐量
- 错误率
- 内存使用
- CPU使用率

### 3. 定期优化
- 定期运行性能测试
- 根据实际负载调整配置
- 关注新的优化机会

## 🆘 故障排除

### 常见问题

**Q: 优化后出现内存泄漏？**
A: 检查缓存配置，确保设置了合适的TTL和最大大小。

**Q: 某些请求变慢了？**
A: 可能是缓存未命中，检查缓存策略是否适合你的使用场景。

**Q: 错误率增加？**
A: 检查错误处理逻辑，确保所有异常都被正确处理。

### 调试步骤
1. 启用详细日志
2. 检查性能监控数据
3. 对比优化前后的行为
4. 必要时回滚到原始版本

## 📞 支持

如果在实施过程中遇到问题：
1. 查看详细的优化文档 `ADVANCED-PERFORMANCE-OPTIMIZATION.md`
2. 运行性能测试获取具体数据
3. 检查系统资源使用情况
4. 考虑根据实际场景调整优化参数

---

**注意**: 性能优化效果可能因具体使用场景、硬件配置和网络环境而异。建议在实际环境中进行充分测试后再部署到生产环境。