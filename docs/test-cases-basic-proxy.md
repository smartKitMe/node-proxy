# 基础代理功能测试用例

## 概述

本文档包含 Node Proxy 基础代理功能的测试用例，涵盖最小配置启动、默认配置使用、服务器信息获取等核心功能。

## 测试环境要求

- Node.js >= 12.0.0
- npm 或 yarn 包管理器
- 测试端口：8080, 8081, 8082（确保端口未被占用）

## 测试用例

### TC-BASIC-001: 最小配置启动测试

**测试目标**: 验证使用最小配置能够成功启动代理服务器

**前置条件**: 
- 端口 8080 未被占用
- Node.js 环境正常

**测试步骤**:
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

async function testMinimalConfig() {
    try {
        // 1. 初始化代理
        await proxy.initialize();
        console.log('✓ 代理初始化成功');
        
        // 2. 启动代理服务器
        await proxy.start();
        console.log('✓ 代理服务器启动成功');
        
        // 3. 验证服务器状态
        const serverInfo = proxy.getServerInfo();
        console.log('服务器信息:', serverInfo);
        
        // 4. 验证监听端口
        if (serverInfo.port === 8080 && serverInfo.host === 'localhost') {
            console.log('✓ 端口和主机配置正确');
        } else {
            throw new Error('端口或主机配置错误');
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

testMinimalConfig();
```

**预期结果**:
- 代理服务器成功启动在 localhost:8080
- 服务器状态为 'running'
- 启动时间正确记录
- 无错误日志输出

**验证方法**:
- 检查控制台输出
- 验证端口监听状态
- 测试简单的 HTTP 请求代理

---

### TC-BASIC-002: 默认配置启动测试

**测试目标**: 验证使用默认配置能够成功启动代理服务器

**前置条件**: 
- 端口 8080 未被占用
- Node.js 环境正常

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');

// 使用默认配置
const proxy = new NodeMITMProxy();

async function testDefaultConfig() {
    try {
        // 1. 初始化并启动
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 默认配置代理启动成功');
        
        // 2. 验证默认配置
        const serverInfo = proxy.getServerInfo();
        if (serverInfo.port === 8080 && serverInfo.host === 'localhost') {
            console.log('✓ 默认配置正确 (localhost:8080)');
        }
        
        // 3. 测试优雅关闭
        process.on('SIGINT', async () => {
            console.log('正在关闭代理服务器...');
            await proxy.stop();
            console.log('✓ 代理服务器已关闭');
            process.exit(0);
        });
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    }
}

testDefaultConfig();
```

**预期结果**:
- 代理服务器使用默认端口 8080 启动
- 支持优雅关闭
- 无配置错误

**验证方法**:
- 发送 SIGINT 信号测试优雅关闭
- 验证默认配置参数

---

### TC-BASIC-003: 服务器信息获取测试

**测试目标**: 验证能够正确获取服务器运行信息

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');

async function testServerInfo() {
    const proxy = new NodeMITMProxy({
        config: {
            port: 8081,
            host: '127.0.0.1'
        }
    });
    
    try {
        // 启动前获取信息
        let serverInfo = proxy.getServerInfo();
        console.log('启动前状态:', serverInfo.status);
        
        // 启动代理
        await proxy.initialize();
        await proxy.start();
        
        // 启动后获取信息
        serverInfo = proxy.getServerInfo();
        console.log('服务器信息:', {
            status: serverInfo.status,
            port: serverInfo.port,
            host: serverInfo.host,
            startTime: new Date(serverInfo.startTime).toLocaleString(),
            uptime: serverInfo.uptime
        });
        
        // 验证信息完整性
        const requiredFields = ['status', 'port', 'host', 'startTime'];
        const missingFields = requiredFields.filter(field => !serverInfo[field]);
        
        if (missingFields.length === 0) {
            console.log('✓ 服务器信息完整');
        } else {
            throw new Error(`缺少字段: ${missingFields.join(', ')}`);
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

testServerInfo();
```

**预期结果**:
- 启动前状态为 'stopped' 或 'not_started'
- 启动后状态为 'running'
- 所有必需字段都存在且正确
- 启动时间合理

---

### TC-BASIC-004: 多端口配置测试

**测试目标**: 验证能够在不同端口启动多个代理实例

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');

async function testMultipleProxies() {
    const proxy1 = new NodeMITMProxy({ config: { port: 8080 } });
    const proxy2 = new NodeMITMProxy({ config: { port: 8081 } });
    const proxy3 = new NodeMITMProxy({ config: { port: 8082 } });
    
    try {
        // 启动多个代理实例
        await Promise.all([
            proxy1.initialize().then(() => proxy1.start()),
            proxy2.initialize().then(() => proxy2.start()),
            proxy3.initialize().then(() => proxy3.start())
        ]);
        
        console.log('✓ 多个代理实例启动成功');
        
        // 验证每个实例的状态
        const infos = [
            proxy1.getServerInfo(),
            proxy2.getServerInfo(),
            proxy3.getServerInfo()
        ];
        
        infos.forEach((info, index) => {
            const expectedPort = 8080 + index;
            if (info.port === expectedPort && info.status === 'running') {
                console.log(`✓ 代理 ${index + 1} (端口 ${expectedPort}) 运行正常`);
            } else {
                throw new Error(`代理 ${index + 1} 状态异常`);
            }
        });
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        // 关闭所有代理
        await Promise.all([
            proxy1.stop(),
            proxy2.stop(),
            proxy3.stop()
        ]);
    }
}

testMultipleProxies();
```

**预期结果**:
- 三个代理实例都能成功启动
- 每个实例监听不同端口
- 实例间互不干扰

---

### TC-BASIC-005: 错误处理测试

**测试目标**: 验证代理服务器的错误处理机制

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');

async function testErrorHandling() {
    // 测试端口占用错误
    const proxy1 = new NodeMITMProxy({ config: { port: 8080 } });
    const proxy2 = new NodeMITMProxy({ config: { port: 8080 } }); // 相同端口
    
    try {
        // 启动第一个代理
        await proxy1.initialize();
        await proxy1.start();
        console.log('✓ 第一个代理启动成功');
        
        // 尝试启动第二个代理（应该失败）
        try {
            await proxy2.initialize();
            await proxy2.start();
            throw new Error('第二个代理不应该启动成功');
        } catch (error) {
            if (error.code === 'EADDRINUSE' || error.message.includes('port')) {
                console.log('✓ 端口占用错误正确处理');
            } else {
                throw error;
            }
        }
        
        // 测试无效配置
        try {
            const invalidProxy = new NodeMITMProxy({
                config: {
                    port: -1, // 无效端口
                    host: 'invalid-host'
                }
            });
            await invalidProxy.initialize();
            await invalidProxy.start();
            throw new Error('无效配置不应该启动成功');
        } catch (error) {
            console.log('✓ 无效配置错误正确处理');
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy1.stop();
        await proxy2.stop().catch(() => {}); // 可能已经失败
    }
}

testErrorHandling();
```

**预期结果**:
- 端口占用时抛出适当错误
- 无效配置被正确拒绝
- 错误信息清晰明确

---

## 性能测试用例

### TC-BASIC-PERF-001: 启动时间测试

**测试目标**: 验证代理服务器启动时间在合理范围内

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');

async function testStartupTime() {
    const proxy = new NodeMITMProxy();
    
    try {
        const startTime = Date.now();
        
        await proxy.initialize();
        await proxy.start();
        
        const endTime = Date.now();
        const startupTime = endTime - startTime;
        
        console.log(`启动时间: ${startupTime}ms`);
        
        // 启动时间应该在合理范围内（通常 < 1000ms）
        if (startupTime < 1000) {
            console.log('✓ 启动时间正常');
        } else {
            console.log('⚠ 启动时间较长，可能需要优化');
        }
        
        return startupTime;
    } finally {
        await proxy.stop();
    }
}

testStartupTime();
```

**预期结果**:
- 启动时间 < 1000ms
- 内存使用合理

---

## 集成测试用例

### TC-BASIC-INT-001: HTTP 请求代理测试

**测试目标**: 验证基础 HTTP 请求代理功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testHttpProxy() {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    try {
        await proxy.initialize();
        await proxy.start();
        
        // 创建测试请求
        const options = {
            hostname: 'httpbin.org',
            port: 80,
            path: '/get',
            method: 'GET',
            // 使用代理
            agent: new http.Agent({
                proxy: 'http://localhost:8080'
            })
        };
        
        return new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.url && response.headers) {
                            console.log('✓ HTTP 代理请求成功');
                            resolve(true);
                        } else {
                            reject(new Error('响应格式不正确'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', reject);
            req.end();
        });
        
    } finally {
        await proxy.stop();
    }
}

testHttpProxy();
```

**预期结果**:
- HTTP 请求成功通过代理
- 响应数据完整
- 无连接错误

---

## 测试执行指南

### 运行单个测试
```bash
node test-basic-001.js
```

### 运行所有基础测试
```bash
# 创建测试运行脚本
node -e "
const tests = [
    'test-basic-001.js',
    'test-basic-002.js',
    'test-basic-003.js',
    'test-basic-004.js',
    'test-basic-005.js'
];

async function runAllTests() {
    for (const test of tests) {
        console.log(\`\\n=== 运行 \${test} ===\`);
        try {
            require(\`./\${test}\`);
        } catch (error) {
            console.error(\`测试 \${test} 失败:\`, error.message);
        }
    }
}

runAllTests();
"
```

### 测试报告

每个测试用例都应该输出：
- ✓ 成功标记
- ✗ 失败标记  
- ⚠ 警告标记
- 详细的错误信息（如果有）

## 故障排除

### 常见问题

1. **端口占用错误**
   - 检查端口是否被其他进程占用
   - 使用 `netstat -an | grep 8080` 检查端口状态

2. **权限错误**
   - 确保有足够权限绑定端口
   - 避免使用系统保留端口（< 1024）

3. **内存不足**
   - 监控测试过程中的内存使用
   - 确保及时清理代理实例

4. **网络连接问题**
   - 检查防火墙设置
   - 验证网络连接状态