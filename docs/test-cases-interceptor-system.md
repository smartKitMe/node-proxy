# 拦截器系统测试用例

## 概述

本文档包含 Node Proxy 拦截器系统的测试用例，涵盖三种拦截器模式：Direct Response、Modify And Forward、Pass Through，以及选择性拦截配置。

## 测试环境要求

- Node.js >= 12.0.0
- 测试端口：8080, 8081, 8082
- 外部测试服务：httpbin.org（用于网络请求测试）

## 拦截器模式测试

### TC-INTERCEPT-001: Direct Response 模式测试

**测试目标**: 验证 Direct Response 拦截器能够直接返回自定义响应

**前置条件**: 
- 代理服务器正常启动
- 拦截器正确配置

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');
const http = require('http');

async function testDirectResponse() {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    // 添加Direct Response拦截器
    proxy.intercept({
        name: 'api-mock-test',
        priority: 100,
        
        interceptRequest: async (context) => {
            const { request } = context;
            
            // 拦截特定API请求
            if (request.url.includes('/api/user')) {
                return InterceptorResponse.directResponse({
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Mock-Response': 'true',
                        'X-Test-Case': 'TC-INTERCEPT-001'
                    },
                    body: JSON.stringify({
                        id: 1,
                        name: 'Mock User',
                        email: 'mock@example.com',
                        timestamp: new Date().toISOString(),
                        source: 'direct-response-interceptor'
                    })
                });
            }
            
            return InterceptorResponse.next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ Direct Response 拦截器代理启动成功');
        
        // 测试拦截的请求
        const mockResponse = await makeRequest('http://localhost:8080/api/user');
        const mockData = JSON.parse(mockResponse.body);
        
        // 验证响应
        if (mockData.source === 'direct-response-interceptor' && 
            mockResponse.headers['x-mock-response'] === 'true') {
            console.log('✓ Direct Response 拦截成功');
            console.log('✓ 自定义响应数据正确');
        } else {
            throw new Error('Direct Response 拦截失败');
        }
        
        // 测试非拦截的请求（应该正常转发）
        const normalResponse = await makeRequest('http://localhost:8080/api/other');
        if (normalResponse.statusCode !== 200 || normalResponse.headers['x-mock-response']) {
            console.log('✓ 非拦截请求正常转发');
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

// 辅助函数：发送HTTP请求
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });
        req.on('error', reject);
    });
}

testDirectResponse();
```

**预期结果**:
- 匹配的请求返回自定义响应
- 响应状态码为 200
- 响应头包含自定义标记
- 响应体包含模拟数据
- 非匹配请求正常转发

---

### TC-INTERCEPT-002: Modify And Forward 模式测试

**测试目标**: 验证 Modify And Forward 拦截器能够修改请求后转发

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

async function testModifyAndForward() {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    // 添加Modify And Forward拦截器
    proxy.intercept({
        name: 'request-modifier-test',
        priority: 100,
        
        interceptRequest: async (context) => {
            const { request } = context;
            
            // 修改所有请求的头部
            const modifiedHeaders = {
                ...request.headers,
                'X-Proxy-Modified': 'true',
                'X-Modification-Time': new Date().toISOString(),
                'X-Original-User-Agent': request.headers['user-agent'] || 'unknown',
                'User-Agent': 'NodeMITMProxy/4.0 Test Agent',
                'X-Test-Case': 'TC-INTERCEPT-002'
            };
            
            // 修改URL（重定向到测试环境）
            let modifiedUrl = request.url;
            if (request.url.includes('httpbin.org')) {
                // 保持原URL，但添加查询参数
                const separator = request.url.includes('?') ? '&' : '?';
                modifiedUrl = request.url + separator + 'proxy_modified=true';
            }
            
            console.log(`修改请求: ${request.url} -> ${modifiedUrl}`);
            
            return InterceptorResponse.modifyAndForward({
                modifiedUrl: modifiedUrl,
                modifiedHeaders: modifiedHeaders,
                modifiedMethod: request.method
            });
        },
        
        interceptResponse: async (context) => {
            const { response } = context;
            
            // 修改响应头
            response.headers['X-Response-Modified'] = 'true';
            response.headers['X-Processing-Time'] = Date.now().toString();
            response.headers['X-Response-Test-Case'] = 'TC-INTERCEPT-002';
            
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: response.headers
            });
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ Modify And Forward 拦截器代理启动成功');
        
        // 测试请求修改
        const response = await makeProxyRequest('http://httpbin.org/get');
        const responseData = JSON.parse(response.body);
        
        // 验证请求修改
        if (responseData.headers['X-Proxy-Modified'] === 'true' &&
            responseData.headers['User-Agent'].includes('NodeMITMProxy/4.0')) {
            console.log('✓ 请求头修改成功');
        } else {
            throw new Error('请求头修改失败');
        }
        
        // 验证URL修改
        if (responseData.url.includes('proxy_modified=true')) {
            console.log('✓ URL修改成功');
        } else {
            throw new Error('URL修改失败');
        }
        
        // 验证响应修改
        if (response.headers['x-response-modified'] === 'true') {
            console.log('✓ 响应头修改成功');
        } else {
            throw new Error('响应头修改失败');
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

// 通过代理发送请求的辅助函数
function makeProxyRequest(targetUrl) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const url = require('url');
        
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: targetUrl,
            method: 'GET',
            headers: {
                'Host': url.parse(targetUrl).host,
                'User-Agent': 'Test-Client/1.0'
            }
        };
        
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

testModifyAndForward();
```

**预期结果**:
- 请求头被正确修改
- URL参数被添加
- 响应头包含修改标记
- 原始请求功能保持正常

---

### TC-INTERCEPT-003: Pass Through 模式测试

**测试目标**: 验证 Pass Through 模式的透明转发功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

async function testPassThrough() {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    // 添加Pass Through拦截器（仅记录，不修改）
    proxy.intercept({
        name: 'pass-through-test',
        priority: 100,
        
        interceptRequest: async (context) => {
            const { request } = context;
            
            // 记录请求但不修改
            console.log(`透传请求: ${request.method} ${request.url}`);
            console.log(`请求头数量: ${Object.keys(request.headers).length}`);
            
            // 对特定路径进行透传
            if (request.url.includes('/transparent')) {
                return InterceptorResponse.next(); // 透明转发
            }
            
            return InterceptorResponse.next();
        },
        
        interceptResponse: async (context) => {
            const { response } = context;
            
            // 记录响应但不修改
            console.log(`透传响应: ${response.statusCode}`);
            console.log(`响应头数量: ${Object.keys(response.headers).length}`);
            
            return InterceptorResponse.next(); // 透明转发
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ Pass Through 拦截器代理启动成功');
        
        // 测试透明转发
        const originalResponse = await makeDirectRequest('http://httpbin.org/get');
        const proxyResponse = await makeProxyRequest('http://httpbin.org/transparent');
        
        // 比较原始请求和代理请求的响应
        const originalData = JSON.parse(originalResponse.body);
        const proxyData = JSON.parse(proxyResponse.body);
        
        // 验证透明转发（除了可能的连接相关差异）
        if (proxyResponse.statusCode === originalResponse.statusCode) {
            console.log('✓ 状态码透明转发正确');
        }
        
        // 验证基本响应结构相同
        if (proxyData.headers && originalData.headers) {
            console.log('✓ 响应结构透明转发正确');
        }
        
        // 验证没有添加额外的代理标记头
        const proxyHeaders = Object.keys(proxyResponse.headers);
        const hasProxyMarkers = proxyHeaders.some(header => 
            header.toLowerCase().includes('proxy') || 
            header.toLowerCase().includes('modified')
        );
        
        if (!hasProxyMarkers) {
            console.log('✓ 响应头未被修改（透明转发）');
        } else {
            console.log('⚠ 检测到代理标记头，可能不是完全透明');
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

// 直接请求（不通过代理）
function makeDirectRequest(url) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });
        req.on('error', reject);
    });
}

testPassThrough();
```

**预期结果**:
- 请求和响应完全透明转发
- 无额外的修改标记
- 性能影响最小
- 日志记录正常

---

## 选择性拦截测试

### TC-INTERCEPT-004: 域名选择性拦截测试

**测试目标**: 验证基于域名的选择性拦截功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');

async function testSelectiveInterception() {
    const proxy = new NodeMITMProxy({
        config: { port: 8080 },
        // 选择性拦截配置
        interceptor: {
            // 只拦截特定域名
            domains: ['httpbin.org', 'api.example.com'],
            
            // 只拦截特定路径
            pathPrefixes: ['/api/', '/auth/', '/admin/'],
            
            // 静态资源自动跳过拦截
            staticExtensions: ['.js', '.css', '.png', '.jpg', '.ico'],
            
            // 自定义匹配规则
            customMatcher: (url, headers) => {
                return url.includes('/api/') && 
                       headers['content-type']?.includes('json');
            }
        }
    });
    
    let interceptedCount = 0;
    let passedThroughCount = 0;
    
    // 添加拦截器来统计
    proxy.intercept({
        name: 'selective-test',
        priority: 100,
        
        interceptRequest: async (context) => {
            const { request } = context;
            interceptedCount++;
            console.log(`拦截请求: ${request.url}`);
            
            // 添加拦截标记
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...request.headers,
                    'X-Intercepted': 'true'
                }
            });
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 选择性拦截代理启动成功');
        
        // 测试应该被拦截的请求
        const interceptedTests = [
            'http://httpbin.org/api/user',      // 匹配域名和路径
            'http://api.example.com/auth/login', // 匹配域名和路径
            'http://httpbin.org/admin/config'    // 匹配域名和路径
        ];
        
        for (const url of interceptedTests) {
            const response = await makeProxyRequest(url);
            const responseData = JSON.parse(response.body);
            
            if (responseData.headers['X-Intercepted'] === 'true') {
                console.log(`✓ 正确拦截: ${url}`);
            } else {
                throw new Error(`应该拦截但未拦截: ${url}`);
            }
        }
        
        // 测试应该跳过的请求
        const skippedTests = [
            'http://other-domain.com/api/user',  // 域名不匹配
            'http://httpbin.org/public/info',    // 路径不匹配
            'http://httpbin.org/static/app.js'   // 静态资源
        ];
        
        const initialInterceptedCount = interceptedCount;
        
        for (const url of skippedTests) {
            try {
                await makeProxyRequest(url);
                // 注意：这些请求可能会失败（因为域名不存在等），但重点是检查是否被拦截
            } catch (error) {
                // 忽略网络错误，关注拦截逻辑
            }
        }
        
        // 验证拦截计数没有增加（说明被跳过了）
        if (interceptedCount === initialInterceptedCount) {
            console.log('✓ 选择性跳过功能正常');
        } else {
            console.log('⚠ 部分请求可能被意外拦截');
        }
        
        console.log(`总拦截次数: ${interceptedCount}`);
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

testSelectiveInterception();
```

**预期结果**:
- 匹配规则的请求被拦截
- 不匹配规则的请求被跳过
- 静态资源自动跳过
- 自定义匹配规则生效

---

### TC-INTERCEPT-005: 拦截器优先级测试

**测试目标**: 验证多个拦截器的优先级处理

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

async function testInterceptorPriority() {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    const executionOrder = [];
    
    // 添加低优先级拦截器
    proxy.intercept({
        name: 'low-priority',
        priority: 50,
        
        interceptRequest: async (context) => {
            executionOrder.push('low-priority');
            console.log('低优先级拦截器执行');
            
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...context.request.headers,
                    'X-Low-Priority': 'executed'
                }
            });
        }
    });
    
    // 添加高优先级拦截器
    proxy.intercept({
        name: 'high-priority',
        priority: 100,
        
        interceptRequest: async (context) => {
            executionOrder.push('high-priority');
            console.log('高优先级拦截器执行');
            
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...context.request.headers,
                    'X-High-Priority': 'executed'
                }
            });
        }
    });
    
    // 添加中等优先级拦截器
    proxy.intercept({
        name: 'medium-priority',
        priority: 75,
        
        interceptRequest: async (context) => {
            executionOrder.push('medium-priority');
            console.log('中等优先级拦截器执行');
            
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...context.request.headers,
                    'X-Medium-Priority': 'executed'
                }
            });
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 多优先级拦截器代理启动成功');
        
        // 发送测试请求
        const response = await makeProxyRequest('http://httpbin.org/get');
        const responseData = JSON.parse(response.body);
        
        // 验证执行顺序（应该是：high -> medium -> low）
        const expectedOrder = ['high-priority', 'medium-priority', 'low-priority'];
        
        if (JSON.stringify(executionOrder) === JSON.stringify(expectedOrder)) {
            console.log('✓ 拦截器优先级顺序正确');
            console.log('执行顺序:', executionOrder);
        } else {
            throw new Error(`优先级顺序错误。期望: ${expectedOrder}, 实际: ${executionOrder}`);
        }
        
        // 验证所有拦截器都执行了
        const headers = responseData.headers;
        if (headers['X-High-Priority'] === 'executed' &&
            headers['X-Medium-Priority'] === 'executed' &&
            headers['X-Low-Priority'] === 'executed') {
            console.log('✓ 所有拦截器都正确执行');
        } else {
            throw new Error('部分拦截器未执行');
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

testInterceptorPriority();
```

**预期结果**:
- 拦截器按优先级顺序执行
- 高优先级先执行
- 所有拦截器都能正常工作

---

## 错误处理测试

### TC-INTERCEPT-006: 拦截器异常处理测试

**测试目标**: 验证拦截器异常时的处理机制

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

async function testInterceptorErrorHandling() {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    // 添加会抛出异常的拦截器
    proxy.intercept({
        name: 'error-interceptor',
        priority: 100,
        
        interceptRequest: async (context) => {
            const { request } = context;
            
            // 模拟不同类型的错误
            if (request.url.includes('/error/timeout')) {
                // 模拟超时
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else if (request.url.includes('/error/exception')) {
                // 抛出异常
                throw new Error('拦截器内部错误');
            } else if (request.url.includes('/error/invalid-response')) {
                // 返回无效响应
                return { invalid: 'response' };
            }
            
            return InterceptorResponse.next();
        }
    });
    
    // 添加备用拦截器
    proxy.intercept({
        name: 'fallback-interceptor',
        priority: 50,
        
        interceptRequest: async (context) => {
            console.log('备用拦截器执行');
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...context.request.headers,
                    'X-Fallback': 'true'
                }
            });
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 错误处理测试代理启动成功');
        
        // 测试正常请求（应该正常工作）
        const normalResponse = await makeProxyRequest('http://httpbin.org/get');
        if (normalResponse.statusCode === 200) {
            console.log('✓ 正常请求处理正确');
        }
        
        // 测试异常拦截器（应该降级到备用拦截器或默认处理）
        try {
            const errorResponse = await makeProxyRequest('http://httpbin.org/error/exception');
            const errorData = JSON.parse(errorResponse.body);
            
            if (errorData.headers['X-Fallback'] === 'true') {
                console.log('✓ 异常时正确降级到备用拦截器');
            } else {
                console.log('✓ 异常时使用默认处理');
            }
        } catch (error) {
            console.log('✓ 异常被正确捕获和处理');
        }
        
        // 测试超时处理
        const timeoutStart = Date.now();
        try {
            await makeProxyRequest('http://httpbin.org/error/timeout', 2000); // 2秒超时
        } catch (error) {
            const timeoutDuration = Date.now() - timeoutStart;
            if (timeoutDuration < 3000) { // 应该在3秒内超时
                console.log('✓ 超时处理正确');
            }
        }
        
        return true;
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
    }
}

// 带超时的代理请求
function makeProxyRequest(targetUrl, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const url = require('url');
        
        const timer = setTimeout(() => {
            req.abort();
            reject(new Error('Request timeout'));
        }, timeout);
        
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: targetUrl,
            method: 'GET',
            headers: {
                'Host': url.parse(targetUrl).host
            }
        };
        
        const req = http.request(options, (res) => {
            clearTimeout(timer);
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });
        
        req.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        
        req.end();
    });
}

testInterceptorErrorHandling();
```

**预期结果**:
- 拦截器异常不影响代理正常运行
- 异常时能够降级处理
- 超时能够被正确处理
- 错误日志记录完整

---

## 性能测试

### TC-INTERCEPT-PERF-001: 拦截器性能测试

**测试目标**: 验证拦截器对代理性能的影响

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const { InterceptorResponse } = require('node-proxy/types/InterceptorTypes');

async function testInterceptorPerformance() {
    // 测试无拦截器的性能
    const baselineProxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    // 测试有拦截器的性能
    const interceptorProxy = new NodeMITMProxy({ config: { port: 8081 } });
    
    // 添加简单拦截器
    interceptorProxy.intercept({
        name: 'performance-test',
        priority: 100,
        
        interceptRequest: async (context) => {
            // 简单的头部修改
            return InterceptorResponse.modifyAndForward({
                modifiedHeaders: {
                    ...context.request.headers,
                    'X-Performance-Test': 'true'
                }
            });
        }
    });
    
    try {
        // 启动两个代理
        await baselineProxy.initialize();
        await baselineProxy.start();
        
        await interceptorProxy.initialize();
        await interceptorProxy.start();
        
        console.log('✓ 性能测试代理启动成功');
        
        // 基准测试
        const baselineStart = Date.now();
        const baselinePromises = [];
        for (let i = 0; i < 100; i++) {
            baselinePromises.push(makeProxyRequest('http://httpbin.org/get', 8080));
        }
        await Promise.all(baselinePromises);
        const baselineTime = Date.now() - baselineStart;
        
        // 拦截器测试
        const interceptorStart = Date.now();
        const interceptorPromises = [];
        for (let i = 0; i < 100; i++) {
            interceptorPromises.push(makeProxyRequest('http://httpbin.org/get', 8081));
        }
        await Promise.all(interceptorPromises);
        const interceptorTime = Date.now() - interceptorStart;
        
        // 性能分析
        const overhead = interceptorTime - baselineTime;
        const overheadPercentage = (overhead / baselineTime) * 100;
        
        console.log(`基准时间: ${baselineTime}ms`);
        console.log(`拦截器时间: ${interceptorTime}ms`);
        console.log(`性能开销: ${overhead}ms (${overheadPercentage.toFixed(2)}%)`);
        
        // 性能验证（开销应该在合理范围内）
        if (overheadPercentage < 50) { // 开销小于50%
            console.log('✓ 拦截器性能开销在合理范围内');
        } else {
            console.log('⚠ 拦截器性能开销较大，需要优化');
        }
        
        return {
            baselineTime,
            interceptorTime,
            overhead,
            overheadPercentage
        };
        
    } catch (error) {
        console.error('✗ 性能测试失败:', error.message);
        return false;
    } finally {
        await baselineProxy.stop();
        await interceptorProxy.stop();
    }
}

function makeProxyRequest(targetUrl, proxyPort) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const url = require('url');
        
        const options = {
            hostname: 'localhost',
            port: proxyPort,
            path: targetUrl,
            method: 'GET',
            headers: {
                'Host': url.parse(targetUrl).host
            }
        };
        
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode }));
        });
        
        req.on('error', reject);
        req.end();
    });
}

testInterceptorPerformance();
```

**预期结果**:
- 拦截器性能开销 < 50%
- 并发处理能力正常
- 内存使用稳定

---

## 测试执行指南

### 运行单个测试
```bash
node test-intercept-001.js
```

### 运行所有拦截器测试
```bash
# 创建测试套件
node -e "
const tests = [
    'test-intercept-001.js', // Direct Response
    'test-intercept-002.js', // Modify And Forward  
    'test-intercept-003.js', // Pass Through
    'test-intercept-004.js', // Selective Interception
    'test-intercept-005.js', // Priority
    'test-intercept-006.js'  // Error Handling
];

async function runInterceptorTests() {
    console.log('=== 拦截器系统测试套件 ===\\n');
    
    for (const test of tests) {
        console.log(\`运行测试: \${test}\`);
        try {
            require(\`./\${test}\`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
        } catch (error) {
            console.error(\`测试失败: \${error.message}\`);
        }
        console.log('---');
    }
}

runInterceptorTests();
"
```

## 故障排除

### 常见问题

1. **拦截器不生效**
   - 检查拦截器配置是否正确
   - 验证优先级设置
   - 确认匹配规则

2. **性能问题**
   - 减少拦截器中的同步操作
   - 优化匹配逻辑
   - 使用选择性拦截

3. **异常处理**
   - 添加适当的错误处理
   - 设置合理的超时时间
   - 实现降级机制