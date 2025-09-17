const { NodeMITMProxy } = require('../../src/index');
const assert = require('assert');
const http = require('http');

/**
 * 中间件系统测试套件
 * 基于 test-cases-middleware-system.md 文档
 */
describe('中间件系统测试', function() {
    this.timeout(15000); // 设置超时时间为15秒

    let proxy;
    let testServer;
    const PROXY_PORT = 8080;
    const TEST_SERVER_PORT = 8090;

    // 创建测试用的HTTP服务器
    before(async function() {
        testServer = http.createServer((req, res) => {
            // 收集请求体
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    message: 'Hello from test server',
                    url: req.url,
                    method: req.method,
                    headers: req.headers,
                    body: body || null,
                    timestamp: new Date().toISOString()
                }));
            });
        });

        await new Promise((resolve) => {
            testServer.listen(TEST_SERVER_PORT, resolve);
        });
        console.log(`✓ 测试服务器启动: http://localhost:${TEST_SERVER_PORT}`);
    });

    after(async function() {
        if (testServer) {
            testServer.close();
        }
    });

    afterEach(async function() {
        if (proxy) {
            await proxy.stop();
            proxy = null;
        }
    });

    // 辅助函数：发送HTTP请求
    function makeRequest(url, headers = {}, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: headers
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: JSON.parse(data)
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
            
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }

    // 辅助函数：通过代理发送请求
    function makeProxyRequest(targetUrl, headers = {}, method = 'GET', body = null, proxyPort = PROXY_PORT) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(targetUrl);
            const options = {
                hostname: 'localhost',
                port: proxyPort,
                path: targetUrl,
                method: method,
                headers: {
                    'Host': urlObj.hostname + (urlObj.port ? ':' + urlObj.port : ''),
                    'User-Agent': 'MiddlewareTest/1.0',
                    ...headers
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: jsonData
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
            
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }

    /**
     * TC-MW-001: 中间件注册和执行测试
     */
    describe('TC-MW-001: 中间件注册和执行测试', function() {
        it('应该能够注册和执行中间件', async function() {
            proxy = new NodeMITMProxy({
                config: {
                    port: PROXY_PORT,
                    host: 'localhost'
                },
                logger: {
                    level: 'info'
                }
            });

            const middlewareExecutionLog = [];

            // 注册请求日志中间件
            proxy.use({
                name: 'request-logger',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    const { request } = context;
                    middlewareExecutionLog.push('request-logger');
                    
                    console.log(`[请求日志] ${request.method} ${request.url}`);
                    request.headers['X-Request-Start-Time'] = new Date().toISOString();
                }
            });

            // 注册请求验证中间件
            proxy.use({
                name: 'request-validator',
                priority: 90,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    const { request } = context;
                    middlewareExecutionLog.push('request-validator');
                    
                    console.log(`[请求验证] 验证请求: ${request.url}`);
                    
                    if (request.url.includes('/forbidden')) {
                        context.response = {
                            statusCode: 403,
                            headers: { 'Content-Type': 'text/plain' },
                            body: 'Forbidden by middleware'
                        };
                        context.stopped = true; // 停止继续处理
                        return;
                    }
                    
                    request.headers['X-Request-Validated'] = 'true';
                }
            });

            // 注册响应修改中间件
            proxy.use({
                name: 'response-modifier',
                priority: 110,
                execute: async (context, phase) => {
                    // 只在响应后阶段执行
                    if (phase !== 'afterResponse') return;
                    
                    // 确保响应对象存在
                    if (!context.response) {
                        return;
                    }
                    
                    const { response } = context;
                    middlewareExecutionLog.push('response-modifier');
                    
                    console.log(`[响应修改] 状态码: ${response.statusCode}`);
                    
                    // 确保响应头对象存在
                    if (!response.headers) {
                        response.headers = {};
                    }
                    
                    response.headers['X-Proxy-Processed'] = 'true';
                    response.headers['X-Processing-Time'] = new Date().toISOString();
                    
                    // 处理响应体
                    if (response.headers['content-type']?.includes('application/json')) {
                        try {
                            // 确保响应体存在
                            let bodyData = response.body;
                            if (Buffer.isBuffer(bodyData)) {
                                bodyData = bodyData.toString();
                            }
                            
                            if (typeof bodyData === 'string' && bodyData.length > 0) {
                                const body = JSON.parse(bodyData);
                                body.middleware = {
                                    processed: true,
                                    timestamp: new Date().toISOString(),
                                    executionLog: [...middlewareExecutionLog]
                                };
                                const modifiedBody = JSON.stringify(body);
                                response.body = modifiedBody;
                                response.headers['content-length'] = Buffer.byteLength(modifiedBody).toString();
                            }
                        } catch (error) {
                            console.log('响应体不是有效的JSON');
                        }
                    }
                }
            });

            await proxy.initialize();
            await proxy.start();
            console.log('✓ 中间件代理启动成功');

            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 测试正常请求
            const response = await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/api/test`, {
                'User-Agent': 'Middleware-Test-Client/1.0',
                'X-Test-Case': 'TC-MW-001'
            });

            // 验证中间件执行
            assert.strictEqual(response.headers['x-proxy-processed'], 'true', '应该有代理处理标记');
            assert(response.headers['x-processing-time'], '应该有处理时间戳');
            
            console.log('✓ 中间件执行验证通过');
        });

        it('应该能够阻止被禁止的请求', async function() {
            // 使用新的端口避免冲突
            const testPort = PROXY_PORT + 100;
            proxy = new NodeMITMProxy({
                config: { 
                    port: testPort,
                    host: 'localhost'
                }
            });

            // 注册验证中间件
            proxy.use({
                name: 'request-validator',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    const { request, response } = context;
                    
                    if (request.url.includes('/forbidden')) {
                        // 直接使用response对象的方法
                        if (!response.headersSent) {
                            response.writeHead(403, { 'Content-Type': 'text/plain' });
                            response.end('Forbidden by middleware');
                        }
                        context.stopped = true; // 停止继续处理
                        return;
                    }
                }
            });

            await proxy.initialize();
            await proxy.start();
            
            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log(`✓ 代理服务器启动在端口 ${testPort}`);

            try {
                // 测试被禁止的请求
                const response = await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/forbidden/resource`, {}, 'GET', null, testPort);

                assert.strictEqual(response.statusCode, 403, '应该返回403状态码');
                assert.strictEqual(response.data, 'Forbidden by middleware', '应该返回中间件阻止消息');
                
                console.log('✓ 请求阻止功能验证通过');
            } finally {
                // 确保代理服务器被停止
                if (proxy) {
                    console.log('✓ 正在停止代理服务器');
                    await proxy.stop();
                    proxy = null;
                }
            }
        });
    });

    /**
     * TC-MW-002: 中间件优先级测试
     */
    describe('TC-MW-002: 中间件优先级测试', function() {
        it('应该按照优先级顺序执行中间件', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 2 }
            });

            const executionOrder = [];

            // 注册不同优先级的中间件
            proxy.use({
                name: 'low-priority',
                priority: 10, // 低优先级数字更大
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    executionOrder.push('low-priority');
                    context.request.headers['X-Low-Priority'] = 'executed';
                }
            });

            proxy.use({
                name: 'high-priority',
                priority: 1, // 高优先级数字更小
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    executionOrder.push('high-priority');
                    context.request.headers['X-High-Priority'] = 'executed';
                }
            });

            proxy.use({
                name: 'medium-priority',
                priority: 5, // 中等优先级
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    executionOrder.push('medium-priority');
                    context.request.headers['X-Medium-Priority'] = 'executed';
                }
            });

            await proxy.initialize();
            await proxy.start();
            
            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log(`✓ 代理服务器启动在端口 ${PROXY_PORT + 2}`);

            try {
                // 发送测试请求
                await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/priority-test`, {}, 'GET', null, PROXY_PORT + 2);

                // 验证执行顺序（高优先级先执行）
                assert.deepStrictEqual(executionOrder, ['high-priority', 'medium-priority', 'low-priority'], 
                    '中间件应该按优先级顺序执行');
                
                console.log('✓ 中间件优先级执行顺序正确');
            } finally {
                // 确保代理服务器被停止
                if (proxy) {
                    console.log('✓ 正在停止代理服务器');
                    await proxy.stop();
                    proxy = null;
                }
            }
        });
    });

    /**
     * TC-MW-003: 异步中间件处理测试
     */
    describe('TC-MW-003: 异步中间件处理测试', function() {
        it('应该能够处理异步中间件', async function() {
            proxy = new NodeMITMProxy({
                config: { port: PROXY_PORT + 3 }
            });

            const asyncResults = [];

            // 注册异步中间件
            proxy.use({
                name: 'async-middleware-1',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    // 模拟异步操作
                    await new Promise(resolve => setTimeout(resolve, 100));
                    asyncResults.push('async-1-start');
                    
                    context.request.headers['X-Async-1'] = 'processed';
                    
                    asyncResults.push('async-1-end');
                }
            });

            proxy.use({
                name: 'async-middleware-2',
                priority: 110,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    // 模拟异步操作
                    await new Promise(resolve => setTimeout(resolve, 50));
                    asyncResults.push('async-2-start');
                    
                    context.request.headers['X-Async-2'] = 'processed';
                    
                    asyncResults.push('async-2-end');
                }
            });

            await proxy.initialize();
            await proxy.start();
            
            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log(`✓ 代理服务器启动在端口 ${PROXY_PORT + 3}`);

            try {
                const startTime = Date.now();
                await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/async-test`, {}, 'GET', null, PROXY_PORT + 3);
                const endTime = Date.now();

                // 验证异步处理时间
                assert(endTime - startTime >= 150, '异步处理应该花费至少150ms');
                
                // 验证执行顺序
                assert.deepStrictEqual(asyncResults, 
                    ['async-1-start', 'async-1-end', 'async-2-start', 'async-2-end'],
                    '异步中间件应该按正确顺序执行');
                
                console.log('✓ 异步中间件处理验证通过');
            } finally {
                // 确保代理服务器被停止
                if (proxy) {
                    console.log('✓ 正在停止代理服务器');
                    await proxy.stop();
                    proxy = null;
                }
            }
        });
    });

    /**
     * TC-MW-004: 中间件错误处理测试
     */
    describe('TC-MW-004: 中间件错误处理测试', function() {
        it('应该能够处理中间件中的错误', async function() {
            const testPort = PROXY_PORT + 101;
            proxy = new NodeMITMProxy({
                config: { 
                    port: testPort,
                    host: 'localhost'
                }
            });

            let errorCaught = false;

            // 注册会抛出错误的中间件
            proxy.use({
                name: 'error-middleware',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    if (context.request.url.includes('/error')) {
                        throw new Error('Middleware error for testing');
                    }
                }
            });

            // 注册错误处理中间件
            proxy.use({
                name: 'error-handler',
                priority: 200, // 错误处理中间件优先级较低
                execute: async (context, phase) => {
                    // 只在错误阶段执行
                    if (phase !== 'onError') return;
                    
                    errorCaught = true;
                    console.log('错误被捕获:', context.error.message);
                    
                    context.response = {
                        statusCode: 500,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            error: 'Internal Server Error',
                            message: context.error.message,
                            handled: true
                        })
                    };
                }
            });

            await proxy.initialize();
            await proxy.start();
            
            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                // 测试触发错误的请求
                const response = await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/error-test`, {}, 'GET', null, testPort);

                assert.strictEqual(response.statusCode, 500, '应该返回500错误状态码');
                assert.strictEqual(response.data.handled, true, '错误应该被处理');
                assert(errorCaught, '错误应该被错误处理中间件捕获');
                
                console.log('✓ 中间件错误处理验证通过');
            } finally {
                // 确保代理服务器被停止
                if (proxy) {
                    await proxy.stop();
                    proxy = null;
                }
            }
        });

        it('应该能够从错误中恢复并继续处理', async function() {
            const testPort = PROXY_PORT + 102;
            proxy = new NodeMITMProxy({
                config: { 
                    port: testPort,
                    host: 'localhost'
                }
            });

            // 注册可能出错的中间件
            proxy.use({
                name: 'conditional-error',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    if (context.request.headers['x-trigger-error']) {
                        throw new Error('Conditional error');
                    }
                    context.request.headers['X-No-Error'] = 'true';
                }
            });

            // 注册错误恢复中间件
            proxy.use({
                name: 'error-recovery',
                priority: 200, // 错误处理中间件优先级较低
                execute: async (context, phase) => {
                    // 只在错误阶段执行
                    if (phase !== 'onError') return;
                    
                    console.log('从错误中恢复:', context.error.message);
                    
                    // 重置错误状态，允许请求继续
                    context.error = null;
                    context.stopped = false;
                    context.request.headers['X-Error-Recovered'] = 'true';
                }
            });

            await proxy.initialize();
            await proxy.start();
            
            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                // 测试错误恢复
                const response = await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/recovery-test`, {
                    'X-Trigger-Error': 'true'
                }, 'GET', null, testPort);

                assert.strictEqual(response.statusCode, 200, '请求应该成功完成');
                // 检查响应数据是否存在且有正确的头部
                if (response.data && response.data.headers) {
                    assert.strictEqual(response.data.headers['x-error-recovered'], 'true', '应该有错误恢复标记');
                }
                
                console.log('✓ 错误恢复功能验证通过');
            } finally {
                // 确保代理服务器被停止
                if (proxy) {
                    await proxy.stop();
                    proxy = null;
                }
            }
        });
    });

    /**
     * TC-MW-005: 条件中间件执行测试
     */
    describe('TC-MW-005: 条件中间件执行测试', function() {
        it('应该能够根据条件执行中间件', async function() {
            const testPort = PROXY_PORT + 103;
            proxy = new NodeMITMProxy({
                config: { 
                    port: testPort,
                    host: 'localhost'
                }
            });

            let apiMiddlewareExecuted = false;
            let staticMiddlewareExecuted = false;

            // 注册API路径中间件
            proxy.use({
                name: 'api-middleware',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    // 检查条件
                    if (context.request.url.startsWith('/api')) {
                        apiMiddlewareExecuted = true;
                        context.request.headers['X-API-Middleware'] = 'executed';
                    }
                }
            });

            // 注册静态资源中间件
            proxy.use({
                name: 'static-middleware',
                priority: 100,
                execute: async (context, phase) => {
                    // 只在请求阶段执行
                    if (phase !== 'beforeRequest') return;
                    
                    // 检查条件
                    if (context.request.url.startsWith('/static')) {
                        staticMiddlewareExecuted = true;
                        context.request.headers['X-Static-Middleware'] = 'executed';
                    }
                }
            });

            await proxy.initialize();
            await proxy.start();
            
            // 等待代理服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                // 测试API请求
                await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/api/users`, {}, 'GET', null, testPort);
                // 添加一些延迟确保中间件执行完成
                await new Promise(resolve => setTimeout(resolve, 100));
                assert(apiMiddlewareExecuted, 'API中间件应该被执行');
                assert(!staticMiddlewareExecuted, '静态资源中间件不应该被执行');

                // 重置状态
                apiMiddlewareExecuted = false;
                staticMiddlewareExecuted = false;

                // 测试静态资源请求
                await makeProxyRequest(`http://localhost:${TEST_SERVER_PORT}/static/image.png`, {}, 'GET', null, testPort);
                // 添加一些延迟确保中间件执行完成
                await new Promise(resolve => setTimeout(resolve, 100));
                assert(!apiMiddlewareExecuted, 'API中间件不应该被执行');
                assert(staticMiddlewareExecuted, '静态资源中间件应该被执行');

                console.log('✓ 条件中间件执行验证通过');
            } finally {
                // 确保代理服务器被停止
                if (proxy) {
                    await proxy.stop();
                    proxy = null;
                }
            }
        });
    });
});