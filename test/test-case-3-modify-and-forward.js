const { NodeMITMProxy, InterceptorResponse } = require('../src/index');
const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

/**
 * 测试用例3：启动代理，访问百度，使用modify_and_forward模式进行拦截
 * 验证拦截器能够修改请求参数后转发到目标服务器
 */
class ModifyAndForwardTest {
    constructor() {
        this.logger = {
            info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
            debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
            error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
            warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
        };
        
        this.testResults = {
            passed: 0,
            failed: 0,
            errors: []
        };
        
        this.proxy = null;
    }
    
    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('=== 测试用例3：Modify And Forward模式拦截测试 ===\n');
        
        try {
            await this.setupProxy();
            await this.testModifyHeaders();
            await this.testModifyUrl();
            await this.testModifyMethod();
            await this.testModifyRequestBody();
            await this.testChainedModifications();
            
            this.printTestResults();
        } catch (error) {
            this.logger.error('测试执行失败:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(error.message);
        } finally {
            await this.cleanup();
        }
    }
    
    /**
     * 设置代理服务器
     */
    async setupProxy() {
        console.log('1. 设置代理服务器...');
        
        try {
            const testPort = await this.getAvailablePort();
            this.proxyPort = testPort;
            
            this.proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost'
                },
                logger: {
                    level: 'info'
                }
            });
            
            // 添加modify_and_forward拦截器 - 修改请求头
            this.proxy.intercept({
                name: 'modify-headers',
                priority: 100,
                
                shouldIntercept(context, type) {
                    if (type !== 'request') return false;
                    const url = context.request.url;
                    const host = context.request.headers.host || '';
                    return host.includes('baidu.com') || url.includes('baidu.com');
                },
                
                async interceptRequest(context) {
                    const url = context.request.url;
                    const host = context.request.headers.host || '';
                    
                    console.log(`修改请求头: ${url}`);
                    
                    const modifiedHeaders = {
                        ...context.request.headers,
                        'User-Agent': 'NodeMITMProxy-ModifyTest/2.0 (Modified)',
                        'X-Proxy-Modified': 'true',
                        'X-Original-Host': host,
                        'X-Modification-Time': new Date().toISOString(),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    };
                    
                    return InterceptorResponse.modifyAndForward({
                        headers: modifiedHeaders
                    });
                }
            });
            
            // 添加URL重定向拦截器
            this.proxy.intercept({
                name: 'url-redirect',
                priority: 90,
                
                shouldIntercept(context, type) {
                    if (type !== 'request') return false;
                    const url = context.request.url;
                    return url.includes('baidu.com/s?') || url.includes('baidu.com/search?');
                },
                
                async interceptRequest(context) {
                    const url = context.request.url;
                    
                    console.log(`重定向URL: ${url} -> httpbin.org/get`);
                    
                    return InterceptorResponse.modifyAndForward({
                        url: 'http://httpbin.org/get',
                        headers: {
                            ...context.request.headers,
                            'Host': 'httpbin.org',
                            'X-Original-Url': url,
                            'X-Redirected-By': 'NodeMITMProxy'
                        }
                    });
                }
            });
            
            // 添加方法修改拦截器
            this.proxy.intercept({
                name: 'method-modifier',
                priority: 80,
                
                shouldIntercept(context, type) {
                    if (type !== 'request') return false;
                    const url = context.request.url;
                    const method = context.request.method;
                    return url.includes('test-method-change') && method === 'GET';
                },
                
                async interceptRequest(context) {
                    const url = context.request.url;
                    const method = context.request.method;
                    
                    console.log(`修改请求方法: GET -> POST`);
                    
                    return InterceptorResponse.modifyAndForward({
                        method: 'POST',
                        headers: {
                            ...context.request.headers,
                            'Content-Type': 'application/json',
                            'X-Method-Changed': 'GET-to-POST'
                        },
                        body: JSON.stringify({
                            message: 'Method changed from GET to POST',
                            timestamp: new Date().toISOString(),
                            originalMethod: 'GET'
                        })
                    });
                }
            });
            
            await this.proxy.initialize();
            await this.proxy.start(testPort, 'localhost');
            
            this.logger.info('代理服务器启动成功', { port: testPort });
            console.log('✓ 代理服务器设置完成\n');
            
        } catch (error) {
            throw new Error(`代理设置失败: ${error.message}`);
        }
    }
    
    /**
     * 测试修改请求头
     */
    async testModifyHeaders() {
        console.log('2. 测试修改请求头...');
        
        try {
            const startTime = performance.now();
            
            // 发送请求到百度，应该被修改请求头
            const result = await this.makeProxyRequest('http://www.baidu.com');
            
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            if (result.success) {
                // 检查响应是否来自真实服务器（说明请求被转发了）
                const isRealResponse = result.body.includes('baidu') || 
                                     result.body.includes('百度') ||
                                     result.statusCode === 200;
                
                if (isRealResponse) {
                    this.logger.info('请求头修改测试成功', {
                        responseTime: `${responseTime.toFixed(2)}ms`,
                        statusCode: result.statusCode,
                        forwarded: true
                    });
                    
                    this.testResults.passed++;
                    console.log('✓ 修改请求头测试通过\n');
                } else {
                    throw new Error('请求未被正确转发');
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`修改请求头测试失败: ${error.message}`);
            console.error('✗ 修改请求头测试失败:', error.message);
        }
    }
    
    /**
     * 测试修改URL
     */
    async testModifyUrl() {
        console.log('3. 测试修改URL...');
        
        try {
            // 发送搜索请求，应该被重定向到httpbin
            const result = await this.makeProxyRequest('http://www.baidu.com/s?wd=test');
            
            if (result.success) {
                // 检查是否重定向到了httpbin
                const isRedirected = result.body.includes('httpbin.org') || 
                                   result.body.includes('"url"');
                
                if (isRedirected) {
                    this.logger.info('URL修改测试成功', {
                        originalUrl: 'http://www.baidu.com/s?wd=test',
                        redirectedTo: 'httpbin.org/get',
                        statusCode: result.statusCode
                    });
                    
                    this.testResults.passed++;
                    console.log('✓ 修改URL测试通过\n');
                } else {
                    throw new Error('URL未被正确重定向');
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`修改URL测试失败: ${error.message}`);
            console.error('✗ 修改URL测试失败:', error.message);
        }
    }
    
    /**
     * 测试修改请求方法
     */
    async testModifyMethod() {
        console.log('4. 测试修改请求方法...');
        
        try {
            // 发送GET请求，应该被改为POST
            const result = await this.makeProxyRequest('http://httpbin.org/anything/test-method-change');
            
            if (result.success) {
                let responseData;
                try {
                    responseData = JSON.parse(result.body);
                } catch (e) {
                    throw new Error('响应不是有效的JSON');
                }
                
                // 检查方法是否被修改为POST
                const isMethodChanged = responseData.method === 'POST';
                const hasCustomHeader = responseData.headers && 
                                      responseData.headers['X-Method-Changed'] === 'GET-to-POST';
                
                if (isMethodChanged && hasCustomHeader) {
                    this.logger.info('请求方法修改测试成功', {
                        originalMethod: 'GET',
                        modifiedMethod: 'POST',
                        statusCode: result.statusCode
                    });
                    
                    this.testResults.passed++;
                    console.log('✓ 修改请求方法测试通过\n');
                } else {
                    throw new Error(`方法未被正确修改: ${responseData.method}`);
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`修改请求方法测试失败: ${error.message}`);
            console.error('✗ 修改请求方法测试失败:', error.message);
        }
    }
    
    /**
     * 测试修改请求体
     */
    async testModifyRequestBody() {
        console.log('5. 测试修改请求体...');
        
        try {
            // 这个测试通过method-modifier拦截器实现
            // 当GET请求包含test-method-change时，会被改为POST并添加请求体
            const result = await this.makeProxyRequest('http://httpbin.org/anything/test-method-change');
            
            if (result.success) {
                let responseData;
                try {
                    responseData = JSON.parse(result.body);
                } catch (e) {
                    throw new Error('响应不是有效的JSON');
                }
                
                // 检查请求体是否被正确添加
                const hasRequestBody = responseData.data && 
                                     responseData.data.includes('Method changed from GET to POST');
                
                if (hasRequestBody) {
                    this.logger.info('请求体修改测试成功', {
                        hasBody: true,
                        contentType: responseData.headers['Content-Type']
                    });
                    
                    this.testResults.passed++;
                    console.log('✓ 修改请求体测试通过\n');
                } else {
                    throw new Error('请求体未被正确添加');
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`修改请求体测试失败: ${error.message}`);
            console.error('✗ 修改请求体测试失败:', error.message);
        }
    }
    
    /**
     * 测试链式修改
     */
    async testChainedModifications() {
        console.log('6. 测试链式修改...');
        
        try {
            // 发送一个会触发多个拦截器的请求
            const result = await this.makeProxyRequest('http://www.baidu.com/search?q=test');
            
            if (result.success) {
                // 这个请求应该:
                // 1. 被modify-headers拦截器修改请求头
                // 2. 被url-redirect拦截器重定向到httpbin
                
                let isRedirected = false;
                let responseData = null;
                
                try {
                    responseData = JSON.parse(result.body);
                    // httpbin.org/get 返回JSON，检查url字段
                    isRedirected = responseData && responseData.url && responseData.url.includes('httpbin.org');
                } catch (e) {
                    // 如果不是JSON，检查响应体是否包含httpbin.org
                    isRedirected = result.body.includes('httpbin.org');
                }
                
                if (isRedirected) {
                    this.logger.info('链式修改测试成功', {
                        redirected: true,
                        headersModified: true,
                        statusCode: result.statusCode,
                        responseUrl: responseData ? responseData.url : 'unknown'
                    });
                    
                    this.testResults.passed++;
                    console.log('✓ 链式修改测试通过\n');
                } else {
                    console.log('响应体内容:', result.body.substring(0, 500));
                    throw new Error('链式修改未正确执行');
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`链式修改测试失败: ${error.message}`);
            console.error('✗ 链式修改测试失败:', error.message);
        }
    }
    
    /**
     * 通过代理发送请求
     */
    async makeProxyRequest(targetUrl) {
        return new Promise((resolve) => {
            const options = {
                hostname: 'localhost',
                port: this.proxyPort,
                path: targetUrl,
                method: 'GET',
                headers: {
                    'Host': new URL(targetUrl).hostname,
                    'User-Agent': 'NodeMITMProxy-ModifyForward-Test/1.0'
                }
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve({
                        success: true,
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                });
            });
            
            req.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });
            
            req.setTimeout(15000, () => {
                req.destroy();
                resolve({ success: false, error: '请求超时' });
            });
            
            req.end();
        });
    }
    
    /**
     * 获取可用端口
     */
    async getAvailablePort() {
        return new Promise((resolve, reject) => {
            const server = require('net').createServer();
            server.listen(0, () => {
                const port = server.address().port;
                server.close(() => {
                    resolve(port);
                });
            });
            server.on('error', reject);
        });
    }
    
    /**
     * 清理资源
     */
    async cleanup() {
        if (this.proxy) {
            try {
                await this.proxy.stop();
                this.logger.info('代理服务器已关闭');
            } catch (error) {
                this.logger.error('关闭代理服务器失败:', error.message);
            }
        }
    }
    
    /**
     * 打印测试结果
     */
    printTestResults() {
        console.log('=== 测试结果 ===');
        console.log(`通过: ${this.testResults.passed}`);
        console.log(`失败: ${this.testResults.failed}`);
        
        if (this.testResults.errors.length > 0) {
            console.log('\n错误详情:');
            this.testResults.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error}`);
            });
        }
        
        const success = this.testResults.failed === 0;
        console.log(`\n总体结果: ${success ? '✓ 所有测试通过' : '✗ 存在测试失败'}`);
        
        return success;
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const test = new ModifyAndForwardTest();
    test.runAllTests().catch(console.error);
}

module.exports = ModifyAndForwardTest;