# 中间件系统测试用例

## 概述

本文档包含 Node Proxy 中间件系统的测试用例，涵盖中间件注册、执行顺序、错误处理、异步处理等功能。

## 测试环境要求

- Node.js >= 12.0.0
- 测试端口：8080（代理），8090-8095（目标服务器）
- 网络连接正常

## 基础中间件测试

### TC-MW-001: 中间件注册和执行测试

**测试目标**: 验证中间件的注册和基本执行功能

**前置条件**: 
- 代理服务器正常启动
- 测试目标服务器可用

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testMiddlewareRegistrationAndExecution() {
    // 创建测试目标服务器
    const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'Hello from test server',
            url: req.url,
            method: req.method,
            headers: req.headers
        }));
    });
    
    await new Promise(resolve => testServer.listen(8090, resolve));
    console.log('✓ 测试服务器启动: http://localhost:8090');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost'
        },
        logger: {
            level: 'info'
        }
    });
    
    const middlewareExecutionLog = [];
    
    // 注册多个中间件
    proxy.use({
        name: 'request-logger',
        stage: 'request',
        handler: async (context, next) => {
            const { request } = context;
            middlewareExecutionLog.push('request-logger');
            
            console.log(`[请求日志] ${request.method} ${request.url}`);
            console.log(`[请求日志] User-Agent: ${request.headers['user-agent']}`);
            
            // 添加请求处理时间戳
            request.headers['X-Request-Start-Time'] = new Date().toISOString();
            
            await next();
        }
    });
    
    proxy.use({
        name: 'request-validator',
        stage: 'request',
        handler: async (context, next) => {
            const { request } = context;
            middlewareExecutionLog.push('request-validator');
            
            console.log(`[请求验证] 验证请求: ${request.url}`);
            
            // 简单的请求验证
            if (request.url.includes('/forbidden')) {
                context.response = {
                    statusCode: 403,
                    headers: { 'Content-Type': 'text/plain' },
                    body: 'Forbidden by middleware'
                };
                return; // 不调用 next()，中断请求
            }
            
            // 添加验证标记
            request.headers['X-Request-Validated'] = 'true';
            
            await next();
        }
    });
    
    proxy.use({
        name: 'response-modifier',
        stage: 'response',
        handler: async (context, next) => {
            const { response } = context;
            middlewareExecutionLog.push('response-modifier');
            
            console.log(`[响应修改] 状态码: ${response.statusCode}`);
            
            // 修改响应头
            response.headers['X-Proxy-Processed'] = 'true';
            response.headers['X-Processing-Time'] = new Date().toISOString();
            
            // 如果是JSON响应，添加中间件信息
            if (response.headers['content-type']?.includes('application/json')) {
                try {
                    const body = JSON.parse(response.body.toString());
                    body.middleware = {
                        processed: true,
                        timestamp: new Date().toISOString(),
                        executionLog: [...middlewareExecutionLog]
                    };
                    response.body = JSON.stringify(body);
                    response.headers['content-length'] = Buffer.byteLength(response.body).toString();
                } catch (error) {
                    console.log('响应体不是有效的JSON');
                }
            }
            
            await next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 中间件代理启动成功');
        
        // 测试正常请求
        console.log('\n=== 测试正常请求 ===');
        const normalResponse = await makeRequest('http://localhost:8090/api/test', {
            'User-Agent': 'Middleware-Test-Client/1.0',
            'X-Test-Case': 'TC-MW-001'
        });
        
        console.log('正常请求响应:', normalResponse.data);
        console.log('响应头:', normalResponse.headers);
        
        // 验证中间件执行
        if (normalResponse.headers['x-proxy-processed'] === 'true' &&
            normalResponse.headers['x-processing-time'] &&
            normalResponse.data.middleware?.processed === true) {
            console.log('✓ 中间件正确执行并修改了响应');
        } else {
            throw new Error('中间件未正确执行');
        }
        
        // 测试被拦截的请求
        console.log('\n=== 测试被拦截的请求 ===');
        const forbiddenResponse = await makeRequest('http://localhost:8090/forbidden/resource', {
            'User-Agent': 'Middleware-Test-Client/1.0',
            'X-Test-Case': 'TC-MW-001-forbidden'
        });
        
        if (forbiddenResponse.statusCode === 403 && 
            forbiddenResponse.data === 'Forbidden by middleware') {
            console.log('✓ 请求验证中间件正确拦截了禁止的请求');
        } else {
            throw new Error('请求验证中间件未正确工作');
        }
        
        // 验证中间件执行顺序
        console.log('\n=== 验证中间件执行顺序 ===');
        console.log('中间件执行日志:', middlewareExecutionLog);
        
        const expectedOrder = ['request-logger', 'request-validator', 'response-modifier'];
        const actualOrder = middlewareExecutionLog.filter((item, index) => 
            middlewareExecutionLog.indexOf(item) === index
        );
        
        if (JSON.stringify(actualOrder) === JSON.stringify(expectedOrder)) {
            console.log('✓ 中间件执行顺序正确');
        } else {
            console.log('⚠ 中间件执行顺序异常');
            console.log('期望顺序:', expectedOrder);
            console.log('实际顺序:', actualOrder);
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

async function makeRequest(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8080, // 通过代理
            path: url.replace('http://localhost:8090', ''),
            method: 'GET',
            headers: {
                'Host': 'localhost:8090',
                ...headers
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

testMiddlewareRegistrationAndExecution();
```

**预期结果**:
- 所有中间件正确注册
- 中间件按预期顺序执行
- 请求和响应被正确修改
- 拦截功能正常工作

---

### TC-MW-002: 中间件优先级测试

**测试目标**: 验证中间件的优先级排序功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testMiddlewarePriority() {
    const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Test server response');
    });
    
    await new Promise(resolve => testServer.listen(8091, resolve));
    
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    const executionOrder = [];
    
    // 注册不同优先级的中间件
    proxy.use({
        name: 'low-priority',
        stage: 'request',
        priority: 1, // 低优先级
        handler: async (context, next) => {
            executionOrder.push('low-priority');
            console.log('执行低优先级中间件');
            context.request.headers['X-Low-Priority'] = 'executed';
            await next();
        }
    });
    
    proxy.use({
        name: 'high-priority',
        stage: 'request',
        priority: 100, // 高优先级
        handler: async (context, next) => {
            executionOrder.push('high-priority');
            console.log('执行高优先级中间件');
            context.request.headers['X-High-Priority'] = 'executed';
            await next();
        }
    });
    
    proxy.use({
        name: 'medium-priority',
        stage: 'request',
        priority: 50, // 中等优先级
        handler: async (context, next) => {
            executionOrder.push('medium-priority');
            console.log('执行中等优先级中间件');
            context.request.headers['X-Medium-Priority'] = 'executed';
            await next();
        }
    });
    
    proxy.use({
        name: 'default-priority',
        stage: 'request',
        // 不指定优先级，使用默认值
        handler: async (context, next) => {
            executionOrder.push('default-priority');
            console.log('执行默认优先级中间件');
            context.request.headers['X-Default-Priority'] = 'executed';
            await next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 优先级测试代理启动成功');
        
        // 发送测试请求
        const response = await makeRequest('http://localhost:8091/priority-test');
        
        console.log('中间件执行顺序:', executionOrder);
        
        // 验证执行顺序（高优先级先执行）
        const expectedOrder = ['high-priority', 'medium-priority', 'default-priority', 'low-priority'];
        
        if (JSON.stringify(executionOrder) === JSON.stringify(expectedOrder)) {
            console.log('✓ 中间件优先级排序正确');
        } else {
            console.log('✗ 中间件优先级排序错误');
            console.log('期望顺序:', expectedOrder);
            console.log('实际顺序:', executionOrder);
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

testMiddlewarePriority();
```

**预期结果**:
- 高优先级中间件先执行
- 相同优先级按注册顺序执行
- 默认优先级正确处理

---

### TC-MW-003: 异步中间件测试

**测试目标**: 验证异步中间件的处理能力

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testAsyncMiddleware() {
    const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Async test response' }));
    });
    
    await new Promise(resolve => testServer.listen(8092, resolve));
    
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    const asyncOperationResults = [];
    
    // 异步数据库查询中间件（模拟）
    proxy.use({
        name: 'async-database-middleware',
        stage: 'request',
        handler: async (context, next) => {
            const { request } = context;
            
            console.log('开始异步数据库查询...');
            
            // 模拟异步数据库查询
            const userData = await simulateAsyncDatabaseQuery(request.headers['x-user-id']);
            asyncOperationResults.push('database-query');
            
            if (userData) {
                request.headers['X-User-Data'] = JSON.stringify(userData);
                console.log('✓ 异步数据库查询完成');
            } else {
                console.log('⚠ 用户数据未找到');
            }
            
            await next();
        }
    });
    
    // 异步缓存中间件
    proxy.use({
        name: 'async-cache-middleware',
        stage: 'request',
        handler: async (context, next) => {
            const { request } = context;
            const cacheKey = `cache_${request.url}`;
            
            console.log('检查缓存...');
            
            // 模拟异步缓存查询
            const cachedData = await simulateAsyncCacheQuery(cacheKey);
            asyncOperationResults.push('cache-query');
            
            if (cachedData) {
                console.log('✓ 缓存命中');
                request.headers['X-Cache-Hit'] = 'true';
                request.headers['X-Cached-Data'] = JSON.stringify(cachedData);
            } else {
                console.log('缓存未命中');
                request.headers['X-Cache-Hit'] = 'false';
            }
            
            await next();
        }
    });
    
    // 异步日志记录中间件
    proxy.use({
        name: 'async-logging-middleware',
        stage: 'response',
        handler: async (context, next) => {
            const { request, response } = context;
            
            console.log('开始异步日志记录...');
            
            // 模拟异步日志写入
            await simulateAsyncLogWrite({
                timestamp: new Date().toISOString(),
                method: request.method,
                url: request.url,
                statusCode: response.statusCode,
                userAgent: request.headers['user-agent']
            });
            
            asyncOperationResults.push('log-write');
            console.log('✓ 异步日志记录完成');
            
            await next();
        }
    });
    
    // 异步通知中间件
    proxy.use({
        name: 'async-notification-middleware',
        stage: 'response',
        handler: async (context, next) => {
            const { request, response } = context;
            
            // 只对特定请求发送通知
            if (request.url.includes('/important')) {
                console.log('发送异步通知...');
                
                await simulateAsyncNotification({
                    type: 'important_request',
                    url: request.url,
                    timestamp: new Date().toISOString()
                });
                
                asyncOperationResults.push('notification-sent');
                console.log('✓ 异步通知发送完成');
            }
            
            await next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 异步中间件代理启动成功');
        
        // 测试普通请求
        console.log('\n=== 测试普通请求 ===');
        const normalResponse = await makeRequest('http://localhost:8092/api/test', {
            'X-User-Id': 'user123'
        });
        
        console.log('普通请求完成，异步操作结果:', asyncOperationResults);
        
        // 测试重要请求（触发通知）
        console.log('\n=== 测试重要请求 ===');
        asyncOperationResults.length = 0; // 清空结果
        
        const importantResponse = await makeRequest('http://localhost:8092/api/important/data', {
            'X-User-Id': 'user456'
        });
        
        console.log('重要请求完成，异步操作结果:', asyncOperationResults);
        
        // 验证异步操作
        const expectedOperations = ['database-query', 'cache-query', 'log-write', 'notification-sent'];
        const allOperationsCompleted = expectedOperations.every(op => 
            asyncOperationResults.includes(op)
        );
        
        if (allOperationsCompleted) {
            console.log('✓ 所有异步中间件操作正确完成');
        } else {
            console.log('✗ 部分异步操作未完成');
            console.log('期望操作:', expectedOperations);
            console.log('实际操作:', asyncOperationResults);
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

// 模拟异步数据库查询
async function simulateAsyncDatabaseQuery(userId) {
    await new Promise(resolve => setTimeout(resolve, 100)); // 模拟延迟
    
    if (userId) {
        return {
            id: userId,
            name: `User ${userId}`,
            role: 'user',
            lastLogin: new Date().toISOString()
        };
    }
    
    return null;
}

// 模拟异步缓存查询
async function simulateAsyncCacheQuery(key) {
    await new Promise(resolve => setTimeout(resolve, 50)); // 模拟延迟
    
    // 模拟缓存命中率
    if (Math.random() > 0.5) {
        return {
            key: key,
            data: 'cached data',
            timestamp: new Date().toISOString()
        };
    }
    
    return null;
}

// 模拟异步日志写入
async function simulateAsyncLogWrite(logData) {
    await new Promise(resolve => setTimeout(resolve, 80)); // 模拟延迟
    console.log('日志已写入:', JSON.stringify(logData, null, 2));
}

// 模拟异步通知发送
async function simulateAsyncNotification(notificationData) {
    await new Promise(resolve => setTimeout(resolve, 120)); // 模拟延迟
    console.log('通知已发送:', JSON.stringify(notificationData, null, 2));
}

testAsyncMiddleware();
```

**预期结果**:
- 异步操作不阻塞请求处理
- 所有异步中间件正确执行
- 异步操作结果正确记录
- 请求响应时间合理

---

### TC-MW-004: 中间件错误处理测试

**测试目标**: 验证中间件的错误处理和恢复机制

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testMiddlewareErrorHandling() {
    const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Normal response');
    });
    
    await new Promise(resolve => testServer.listen(8093, resolve));
    
    const proxy = new NodeMITMProxy({ 
        config: { port: 8080 },
        logger: { level: 'debug' }
    });
    
    const errorLog = [];
    const executionLog = [];
    
    // 正常中间件
    proxy.use({
        name: 'normal-middleware-1',
        stage: 'request',
        handler: async (context, next) => {
            executionLog.push('normal-middleware-1');
            console.log('正常中间件1执行');
            context.request.headers['X-Normal-1'] = 'executed';
            await next();
        }
    });
    
    // 会抛出错误的中间件
    proxy.use({
        name: 'error-middleware',
        stage: 'request',
        handler: async (context, next) => {
            executionLog.push('error-middleware');
            console.log('错误中间件执行');
            
            const { request } = context;
            
            // 根据请求路径决定是否抛出错误
            if (request.url.includes('/trigger-error')) {
                const error = new Error('Middleware intentional error');
                error.middlewareName = 'error-middleware';
                throw error;
            }
            
            await next();
        },
        // 错误处理函数
        onError: async (error, context) => {
            errorLog.push({
                middlewareName: 'error-middleware',
                error: error.message,
                url: context.request.url,
                timestamp: new Date().toISOString()
            });
            
            console.log('错误中间件捕获错误:', error.message);
            
            // 返回错误响应
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Error-Handled': 'true'
                },
                body: JSON.stringify({
                    error: 'Middleware Error',
                    message: error.message,
                    middleware: 'error-middleware'
                })
            };
        }
    });
    
    // 后续正常中间件
    proxy.use({
        name: 'normal-middleware-2',
        stage: 'request',
        handler: async (context, next) => {
            executionLog.push('normal-middleware-2');
            console.log('正常中间件2执行');
            context.request.headers['X-Normal-2'] = 'executed';
            await next();
        }
    });
    
    // 异步错误中间件
    proxy.use({
        name: 'async-error-middleware',
        stage: 'request',
        handler: async (context, next) => {
            executionLog.push('async-error-middleware');
            console.log('异步错误中间件执行');
            
            const { request } = context;
            
            if (request.url.includes('/async-error')) {
                // 模拟异步操作错误
                await new Promise((resolve, reject) => {
                    setTimeout(() => {
                        reject(new Error('Async operation failed'));
                    }, 100);
                });
            }
            
            await next();
        },
        onError: async (error, context) => {
            errorLog.push({
                middlewareName: 'async-error-middleware',
                error: error.message,
                url: context.request.url,
                timestamp: new Date().toISOString()
            });
            
            console.log('异步错误中间件捕获错误:', error.message);
            
            return {
                statusCode: 503,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Async-Error-Handled': 'true'
                },
                body: JSON.stringify({
                    error: 'Async Middleware Error',
                    message: error.message,
                    middleware: 'async-error-middleware'
                })
            };
        }
    });
    
    // 全局错误处理中间件
    proxy.use({
        name: 'global-error-handler',
        stage: 'request',
        priority: -1, // 最低优先级，最后执行
        handler: async (context, next) => {
            executionLog.push('global-error-handler');
            console.log('全局错误处理中间件执行');
            
            try {
                await next();
            } catch (error) {
                errorLog.push({
                    middlewareName: 'global-error-handler',
                    error: error.message,
                    url: context.request.url,
                    timestamp: new Date().toISOString(),
                    type: 'unhandled'
                });
                
                console.log('全局错误处理器捕获未处理错误:', error.message);
                
                // 返回通用错误响应
                context.response = {
                    statusCode: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Global-Error-Handled': 'true'
                    },
                    body: JSON.stringify({
                        error: 'Internal Server Error',
                        message: 'An unexpected error occurred',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 错误处理测试代理启动成功');
        
        // 测试正常请求
        console.log('\n=== 测试正常请求 ===');
        executionLog.length = 0;
        errorLog.length = 0;
        
        const normalResponse = await makeRequest('http://localhost:8093/normal');
        console.log('正常请求执行日志:', executionLog);
        console.log('错误日志:', errorLog);
        
        if (errorLog.length === 0 && normalResponse.statusCode === 200) {
            console.log('✓ 正常请求处理成功');
        } else {
            console.log('✗ 正常请求处理异常');
        }
        
        // 测试中间件错误
        console.log('\n=== 测试中间件错误 ===');
        executionLog.length = 0;
        errorLog.length = 0;
        
        const errorResponse = await makeRequest('http://localhost:8093/trigger-error');
        console.log('错误请求执行日志:', executionLog);
        console.log('错误日志:', errorLog);
        
        if (errorResponse.statusCode === 500 && 
            errorResponse.headers['x-error-handled'] === 'true' &&
            errorLog.length > 0) {
            console.log('✓ 中间件错误正确处理');
        } else {
            console.log('✗ 中间件错误处理异常');
        }
        
        // 测试异步错误
        console.log('\n=== 测试异步错误 ===');
        executionLog.length = 0;
        errorLog.length = 0;
        
        const asyncErrorResponse = await makeRequest('http://localhost:8093/async-error');
        console.log('异步错误请求执行日志:', executionLog);
        console.log('异步错误日志:', errorLog);
        
        if (asyncErrorResponse.statusCode === 503 && 
            asyncErrorResponse.headers['x-async-error-handled'] === 'true' &&
            errorLog.some(log => log.middlewareName === 'async-error-middleware')) {
            console.log('✓ 异步中间件错误正确处理');
        } else {
            console.log('✗ 异步中间件错误处理异常');
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

testMiddlewareErrorHandling();
```

**预期结果**:
- 中间件错误被正确捕获
- 错误处理函数正确执行
- 后续中间件不受影响
- 全局错误处理器作为最后防线

---

### TC-MW-005: 中间件条件执行测试

**测试目标**: 验证中间件的条件执行功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testConditionalMiddleware() {
    const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            message: 'Conditional test response',
            path: req.url 
        }));
    });
    
    await new Promise(resolve => testServer.listen(8094, resolve));
    
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    const executionLog = [];
    
    // 基于路径的条件中间件
    proxy.use({
        name: 'api-only-middleware',
        stage: 'request',
        condition: (context) => {
            return context.request.url.startsWith('/api/');
        },
        handler: async (context, next) => {
            executionLog.push('api-only-middleware');
            console.log('API专用中间件执行');
            context.request.headers['X-API-Middleware'] = 'executed';
            await next();
        }
    });
    
    // 基于HTTP方法的条件中间件
    proxy.use({
        name: 'post-only-middleware',
        stage: 'request',
        condition: (context) => {
            return context.request.method === 'POST';
        },
        handler: async (context, next) => {
            executionLog.push('post-only-middleware');
            console.log('POST专用中间件执行');
            context.request.headers['X-POST-Middleware'] = 'executed';
            await next();
        }
    });
    
    // 基于请求头的条件中间件
    proxy.use({
        name: 'auth-required-middleware',
        stage: 'request',
        condition: (context) => {
            return context.request.headers['authorization'] !== undefined;
        },
        handler: async (context, next) => {
            executionLog.push('auth-required-middleware');
            console.log('认证中间件执行');
            
            const token = context.request.headers['authorization'];
            if (token === 'Bearer valid-token') {
                context.request.headers['X-Auth-Valid'] = 'true';
                console.log('✓ 认证成功');
            } else {
                context.request.headers['X-Auth-Valid'] = 'false';
                console.log('✗ 认证失败');
            }
            
            await next();
        }
    });
    
    // 基于时间的条件中间件
    proxy.use({
        name: 'business-hours-middleware',
        stage: 'request',
        condition: (context) => {
            const hour = new Date().getHours();
            return hour >= 9 && hour <= 17; // 工作时间 9:00-17:00
        },
        handler: async (context, next) => {
            executionLog.push('business-hours-middleware');
            console.log('工作时间中间件执行');
            context.request.headers['X-Business-Hours'] = 'true';
            await next();
        }
    });
    
    // 基于用户类型的条件中间件
    proxy.use({
        name: 'admin-only-middleware',
        stage: 'request',
        condition: (context) => {
            const userType = context.request.headers['x-user-type'];
            return userType === 'admin';
        },
        handler: async (context, next) => {
            executionLog.push('admin-only-middleware');
            console.log('管理员专用中间件执行');
            context.request.headers['X-Admin-Access'] = 'granted';
            await next();
        }
    });
    
    // 复合条件中间件
    proxy.use({
        name: 'complex-condition-middleware',
        stage: 'request',
        condition: (context) => {
            const { request } = context;
            return request.url.includes('/secure/') && 
                   request.method === 'GET' &&
                   request.headers['x-api-version'] === 'v2';
        },
        handler: async (context, next) => {
            executionLog.push('complex-condition-middleware');
            console.log('复合条件中间件执行');
            context.request.headers['X-Complex-Condition'] = 'matched';
            await next();
        }
    });
    
    // 总是执行的中间件（用于对比）
    proxy.use({
        name: 'always-execute-middleware',
        stage: 'request',
        handler: async (context, next) => {
            executionLog.push('always-execute-middleware');
            console.log('总是执行的中间件');
            context.request.headers['X-Always-Execute'] = 'true';
            await next();
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 条件中间件代理启动成功');
        
        // 测试场景1: API路径请求
        console.log('\n=== 测试API路径请求 ===');
        executionLog.length = 0;
        
        const apiResponse = await makeRequest('http://localhost:8094/api/users', {
            'Content-Type': 'application/json'
        });
        
        console.log('API请求执行的中间件:', executionLog);
        
        if (executionLog.includes('api-only-middleware') && 
            executionLog.includes('always-execute-middleware')) {
            console.log('✓ API路径条件中间件正确执行');
        } else {
            console.log('✗ API路径条件中间件执行异常');
        }
        
        // 测试场景2: POST请求
        console.log('\n=== 测试POST请求 ===');
        executionLog.length = 0;
        
        const postResponse = await makeRequest('http://localhost:8094/data', {
            'Content-Type': 'application/json'
        }, 'POST');
        
        console.log('POST请求执行的中间件:', executionLog);
        
        if (executionLog.includes('post-only-middleware') && 
            executionLog.includes('always-execute-middleware')) {
            console.log('✓ POST方法条件中间件正确执行');
        } else {
            console.log('✗ POST方法条件中间件执行异常');
        }
        
        // 测试场景3: 带认证的请求
        console.log('\n=== 测试带认证的请求 ===');
        executionLog.length = 0;
        
        const authResponse = await makeRequest('http://localhost:8094/profile', {
            'Authorization': 'Bearer valid-token',
            'X-User-Type': 'admin'
        });
        
        console.log('认证请求执行的中间件:', executionLog);
        
        if (executionLog.includes('auth-required-middleware') && 
            executionLog.includes('admin-only-middleware') &&
            executionLog.includes('always-execute-middleware')) {
            console.log('✓ 认证和管理员条件中间件正确执行');
        } else {
            console.log('✗ 认证条件中间件执行异常');
        }
        
        // 测试场景4: 复合条件请求
        console.log('\n=== 测试复合条件请求 ===');
        executionLog.length = 0;
        
        const complexResponse = await makeRequest('http://localhost:8094/secure/data', {
            'X-API-Version': 'v2'
        });
        
        console.log('复合条件请求执行的中间件:', executionLog);
        
        if (executionLog.includes('complex-condition-middleware') && 
            executionLog.includes('always-execute-middleware')) {
            console.log('✓ 复合条件中间件正确执行');
        } else {
            console.log('✗ 复合条件中间件执行异常');
        }
        
        // 测试场景5: 不匹配任何条件的请求
        console.log('\n=== 测试普通请求 ===');
        executionLog.length = 0;
        
        const normalResponse = await makeRequest('http://localhost:8094/home');
        
        console.log('普通请求执行的中间件:', executionLog);
        
        // 应该只有总是执行的中间件运行
        const conditionalMiddlewares = [
            'api-only-middleware', 
            'post-only-middleware', 
            'auth-required-middleware',
            'admin-only-middleware',
            'complex-condition-middleware'
        ];
        
        const noConditionalExecuted = !conditionalMiddlewares.some(mw => 
            executionLog.includes(mw)
        );
        
        if (noConditionalExecuted && executionLog.includes('always-execute-middleware')) {
            console.log('✓ 条件不匹配时中间件正确跳过');
        } else {
            console.log('✗ 条件中间件跳过逻辑异常');
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.close();
    }
}

async function makeRequest(url, headers = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: url.replace('http://localhost:8094', ''),
            method: method,
            headers: {
                'Host': 'localhost:8094',
                ...headers
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

testConditionalMiddleware();
```

**预期结果**:
- 条件匹配的中间件正确执行
- 条件不匹配的中间件被跳过
- 复合条件正确判断
- 总是执行的中间件不受影响

---

## 性能测试

### TC-MW-PERF-001: 中间件性能测试

**测试目标**: 验证中间件对代理性能的影响

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const http = require('http');

async function testMiddlewarePerformance() {
    const testServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Performance test response');
    });
    
    await new Promise(resolve => testServer.listen(8095, resolve));
    
    // 测试无中间件的性能
    console.log('=== 测试无中间件性能 ===');
    const noMiddlewareResults = await performanceTest(0);
    
    // 测试少量中间件的性能
    console.log('\n=== 测试少量中间件性能 ===');
    const fewMiddlewareResults = await performanceTest(3);
    
    // 测试大量中间件的性能
    console.log('\n=== 测试大量中间件性能 ===');
    const manyMiddlewareResults = await performanceTest(10);
    
    // 性能分析
    analyzeMiddlewarePerformance(noMiddlewareResults, fewMiddlewareResults, manyMiddlewareResults);
    
    testServer.close();
    return true;
}

async function performanceTest(middlewareCount) {
    const proxy = new NodeMITMProxy({ config: { port: 8080 } });
    
    // 添加指定数量的中间件
    for (let i = 0; i < middlewareCount; i++) {
        proxy.use({
            name: `performance-middleware-${i}`,
            stage: 'request',
            handler: async (context, next) => {
                // 模拟轻量级处理
                context.request.headers[`X-Middleware-${i}`] = 'processed';
                await next();
            }
        });
    }
    
    await proxy.initialize();
    await proxy.start();
    
    const results = {
        middlewareCount: middlewareCount,
        requestTimes: [],
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0
    };
    
    const requestCount = 100;
    const startTime = Date.now();
    
    // 并发请求测试
    const promises = [];
    for (let i = 0; i < requestCount; i++) {
        promises.push(performSingleRequest(results));
    }
    
    await Promise.allSettled(promises);
    
    results.totalTime = Date.now() - startTime;
    results.avgTime = results.requestTimes.reduce((a, b) => a + b, 0) / results.requestTimes.length;
    results.minTime = Math.min(...results.requestTimes);
    results.maxTime = Math.max(...results.requestTimes);
    
    await proxy.stop();
    
    return results;
}

function performSingleRequest(results) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const req = http.request({
            hostname: 'localhost',
            port: 8080,
            path: '/performance-test',
            method: 'GET',
            headers: {
                'Host': 'localhost:8095'
            }
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const requestTime = Date.now() - startTime;
                results.requestTimes.push(requestTime);
                resolve();
            });
        });
        
        req.on('error', () => {
            results.errors++;
            resolve();
        });
        
        req.end();
    });
}

function analyzeMiddlewarePerformance(noMiddleware, fewMiddleware, manyMiddleware) {
    console.log('\n=== 中间件性能分析 ===');
    
    console.log('\n无中间件:');
    console.log(`平均响应时间: ${noMiddleware.avgTime.toFixed(2)}ms`);
    console.log(`最小响应时间: ${noMiddleware.minTime}ms`);
    console.log(`最大响应时间: ${noMiddleware.maxTime}ms`);
    console.log(`总耗时: ${noMiddleware.totalTime}ms`);
    console.log(`错误数: ${noMiddleware.errors}`);
    
    console.log('\n少量中间件 (3个):');
    console.log(`平均响应时间: ${fewMiddleware.avgTime.toFixed(2)}ms`);
    console.log(`最小响应时间: ${fewMiddleware.minTime}ms`);
    console.log(`最大响应时间: ${fewMiddleware.maxTime}ms`);
    console.log(`总耗时: ${fewMiddleware.totalTime}ms`);
    console.log(`错误数: ${fewMiddleware.errors}`);
    
    console.log('\n大量中间件 (10个):');
    console.log(`平均响应时间: ${manyMiddleware.avgTime.toFixed(2)}ms`);
    console.log(`最小响应时间: ${manyMiddleware.minTime}ms`);
    console.log(`最大响应时间: ${manyMiddleware.maxTime}ms`);
    console.log(`总耗时: ${manyMiddleware.totalTime}ms`);
    console.log(`错误数: ${manyMiddleware.errors}`);
    
    // 性能对比
    const fewOverhead = ((fewMiddleware.avgTime - noMiddleware.avgTime) / noMiddleware.avgTime) * 100;
    const manyOverhead = ((manyMiddleware.avgTime - noMiddleware.avgTime) / noMiddleware.avgTime) * 100;
    
    console.log('\n性能开销:');
    console.log(`3个中间件开销: ${fewOverhead.toFixed(2)}%`);
    console.log(`10个中间件开销: ${manyOverhead.toFixed(2)}%`);
    
    // 性能评估
    if (fewOverhead < 20 && manyOverhead < 50) {
        console.log('✓ 中间件性能开销在可接受范围内');
    } else {
        console.log('⚠ 中间件性能开销较高，需要优化');
    }
}

testMiddlewarePerformance();
```

**预期结果**:
- 少量中间件性能开销 < 20%
- 大量中间件性能开销 < 50%
- 错误率 < 1%
- 响应时间稳定

---

## 测试执行指南

### 运行单个测试
```bash
node test-mw-001.js
```

### 运行所有中间件测试
```bash
# 创建中间件测试套件
node -e "
const tests = [
    'test-mw-001.js', // 基础功能
    'test-mw-002.js', // 优先级
    'test-mw-003.js', // 异步处理
    'test-mw-004.js', // 错误处理
    'test-mw-005.js'  // 条件执行
];

async function runMiddlewareTests() {
    console.log('=== 中间件系统测试套件 ===\\n');
    
    for (const test of tests) {
        console.log(\`运行测试: \${test}\`);
        try {
            require(\`./\${test}\`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(\`测试失败: \${error.message}\`);
        }
        console.log('---');
    }
}

runMiddlewareTests();
"
```

### 性能测试
```bash
node test-mw-perf-001.js
```

## 故障排除

### 常见问题

1. **中间件未执行**
   - 检查中间件注册是否成功
   - 验证条件函数返回值
   - 确认优先级设置

2. **执行顺序错误**
   - 检查优先级配置
   - 验证注册顺序
   - 确认stage设置

3. **异步处理问题**
   - 确保使用await关键字
   - 检查Promise处理
   - 验证错误捕获

4. **性能问题**
   - 减少中间件数量
   - 优化处理逻辑
   - 使用条件执行