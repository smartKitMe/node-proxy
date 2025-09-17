# Node Proxy 测试套件

本文档介绍 Node Proxy 项目的完整测试套件，包括测试结构、运行方法和测试覆盖范围。

## 📁 测试结构

```
test/
├── setup.js                           # 测试环境设置
├── mocha.opts                         # Mocha 配置文件
├── test-runner.js                     # 测试运行器
├── unit/                              # 单元测试
│   ├── basic-proxy.test.js           # 基础代理功能测试
│   ├── middleware-system.test.js     # 中间件系统测试
│   ├── interceptor-system.test.js    # 拦截器系统测试
│   ├── websocket-proxy.test.js       # WebSocket代理测试
│   └── certificate-management.test.js # 证书管理测试
├── integration/                       # 集成测试
│   └── integration.test.js           # 端到端集成测试
└── performance/                       # 性能测试
    └── performance-monitoring.test.js # 性能监控测试
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 运行所有测试

```bash
# 使用 npm 脚本
npm test

# 或使用测试运行器
node test/test-runner.js
```

### 运行特定类型的测试

```bash
# 只运行单元测试
node test/test-runner.js unit

# 只运行集成测试
node test/test-runner.js integration

# 只运行性能测试
node test/test-runner.js performance
```

### 运行特定的测试文件

```bash
# 运行包含 'basic' 的测试
node test/test-runner.js --specific basic

# 运行中间件相关测试
node test/test-runner.js --specific middleware

# 运行WebSocket相关测试
node test/test-runner.js --specific websocket
```

## 📋 测试用例覆盖

### 单元测试 (Unit Tests)

#### 1. 基础代理功能测试 (`basic-proxy.test.js`)
- **TC-BASIC-001**: 基础HTTP代理功能
- **TC-BASIC-002**: 默认配置启动测试
- **TC-BASIC-003**: 服务器信息获取测试
- **TC-BASIC-004**: 多端口配置测试
- **TC-BASIC-005**: 代理服务器停止测试

#### 2. 中间件系统测试 (`middleware-system.test.js`)
- **TC-MW-001**: 中间件注册和执行测试
- **TC-MW-002**: 中间件优先级测试
- **TC-MW-003**: 异步中间件处理测试
- **TC-MW-004**: 中间件错误处理测试
- **TC-MW-005**: 条件中间件执行测试

#### 3. 拦截器系统测试 (`interceptor-system.test.js`)
- **TC-INT-001**: 请求拦截和修改测试
- **TC-INT-002**: 响应拦截和修改测试
- **TC-INT-003**: 拦截器链测试
- **TC-INT-004**: 条件拦截器测试

#### 4. WebSocket代理测试 (`websocket-proxy.test.js`)
- **TC-WS-001**: 基础WebSocket连接测试
- **TC-WS-002**: 并发WebSocket连接测试
- **TC-WS-003**: WebSocket连接拦截测试
- **TC-WS-004**: WebSocket消息拦截和错误处理测试

#### 5. 证书管理测试 (`certificate-management.test.js`)
- **TC-CERT-001**: 固定证书配置测试
- **TC-CERT-002**: 动态证书生成测试
- **TC-CERT-003**: 证书验证测试
- **TC-CERT-004**: HTTPS代理功能测试

### 集成测试 (Integration Tests)

#### 集成测试 (`integration.test.js`)
- **TC-INT-001**: 完整代理流程集成测试
  - HTTP API请求处理
  - HTTPS安全请求处理
  - WebSocket代理支持
  - 静态文件服务
  - 性能监控集成
- **TC-INT-002**: 多组件协同测试
  - 中间件和拦截器协调
  - 复杂请求路由
- **TC-INT-003**: 真实场景模拟测试
  - 高并发请求处理
  - 长时间连接维护

### 性能测试 (Performance Tests)

#### 性能监控测试 (`performance-monitoring.test.js`)
- **TC-PERF-001**: 基础性能指标收集测试
  - 请求计数、响应时间、吞吐量
  - 错误率、连接数、资源使用
  - 性能历史数据管理
- **TC-PERF-002**: 性能报告生成测试
  - 详细性能报告
  - 趋势分析
  - 优化建议生成
- **TC-PERF-003**: 负载测试
  - 高并发性能指标收集
  - 内存管理验证
- **TC-PERF-004**: 性能阈值监控
  - 性能异常检测
  - 阈值告警

## ⚙️ 测试配置

### 环境要求
- Node.js >= 12.0.0
- 测试端口范围：
  - 代理端口: 18000-18099
  - 目标服务器端口: 19000-19099
  - WebSocket端口: 20000-20099

### 测试配置 (`setup.js`)
- 全局测试环境设置
- 端口管理器（避免端口冲突）
- 测试工具函数
- 性能测试配置

### Mocha 配置 (`mocha.opts`)
- 测试超时时间: 30秒
- 报告格式: spec
- 递归测试文件查找
- 颜色输出支持

## 🔧 测试运行器功能

测试运行器 (`test-runner.js`) 提供以下功能：

### 基本用法
```bash
node test/test-runner.js [选项] [测试模式]
```

### 选项
- `--help, -h`: 显示帮助信息
- `--specific <pattern>`: 运行匹配指定模式的测试

### 测试模式
- `all`: 运行所有测试（默认）
- `unit`: 只运行单元测试
- `integration`: 只运行集成测试
- `performance`: 只运行性能测试

### 功能特性
- 🎯 智能测试文件匹配
- 📊 详细的测试结果统计
- ⏱️ 测试执行时间统计
- 🔍 失败测试的详细错误信息
- 📈 测试成功率计算

## 📊 测试报告

测试运行后会显示详细的测试结果摘要：

```
📊 测试结果摘要
============================================================
总测试文件: 8
✅ 通过: 7
❌ 失败: 1
⚠️  跳过: 0
⏱️  耗时: 45.32s
📈 成功率: 87.5%
```

## 🐛 调试测试

### 运行单个测试文件
```bash
npx mocha test/unit/basic-proxy.test.js --timeout 30000
```

### 启用详细日志
```bash
LOG_LEVEL=debug node test/test-runner.js
```

### 调试特定测试用例
```bash
npx mocha test/unit/basic-proxy.test.js --grep "应该成功启动HTTP代理服务器"
```

## 📝 编写新测试

### 测试文件结构
```javascript
describe('测试模块名称', function() {
    this.timeout(TEST_CONFIG.timeouts.medium);
    
    beforeEach(async function() {
        // 测试前准备
    });
    
    afterEach(async function() {
        // 测试后清理
    });
    
    describe('TC-XXX-001: 测试用例名称', function() {
        it('应该满足特定条件', async function() {
            // 测试实现
            expect(result).to.equal(expected);
        });
    });
});
```

### 使用测试工具
```javascript
// 获取可用端口
const port = portManager.getAvailablePort('proxy');

// 等待异步操作
await TestUtils.delay(1000);

// 等待条件满足
await TestUtils.waitFor(() => server.listening, 5000);

// 创建测试服务器
const server = await TestUtils.createTestServer(port, handler);
```

## 🔄 持续集成

### GitHub Actions 配置示例
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '14'
      - run: npm install
      - run: npm test
```

### 测试覆盖率
```bash
# 安装覆盖率工具
npm install --save-dev nyc

# 运行覆盖率测试
npx nyc node test/test-runner.js
```

## 📚 相关文档

- [测试用例文档](./docs/) - 详细的测试用例规范
- [API 文档](./docs/api.md) - 代理服务器 API 参考
- [配置指南](./docs/configuration.md) - 配置选项说明

## 🤝 贡献指南

1. 添加新功能时，请同时添加相应的测试用例
2. 确保所有测试通过后再提交代码
3. 测试用例应该覆盖正常流程和异常情况
4. 遵循现有的测试代码风格和命名规范

## ❓ 常见问题

### Q: 测试运行时端口冲突怎么办？
A: 测试套件使用端口管理器自动分配端口，避免冲突。如果仍有问题，请检查端口范围配置。

### Q: 某些测试偶尔失败怎么办？
A: 可能是时序问题，尝试增加测试超时时间或添加适当的等待。

### Q: 如何跳过某些测试？
A: 使用 `describe.skip()` 或 `it.skip()` 跳过特定测试。

### Q: 如何添加新的测试类型？
A: 在相应目录下创建测试文件，并更新测试运行器的配置。