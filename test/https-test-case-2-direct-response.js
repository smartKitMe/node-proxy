const { NodeMITMProxy, InterceptorResponse } = require('../src/index');
const https = require('https');
const http = require('http');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

/**
 * HTTPS测试用例2：启动代理，访问HTTPS站点，使用direct_response模式进行拦截
 * 验证拦截器能够直接返回自定义响应，不进行实际的网络请求
 */
class HttpsDirectResponseTest {
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
        console.log('=== HTTPS测试用例2：Direct Response模式拦截测试 ===\n');
        
        try {
            await this.setupProxy();
            await this.testDirectResponseInterception();
            await this.testMultipleRequests();
            await this.testDifferentStatusCodes();
            await this.testCustomHeaders();
            
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
            // 获取随机可用端口
            const testPort = await this.getAvailablePort();
            
            this.proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost',
                    ssl: {
                        enabled: true,
                        certificate: {
                            type: 'fixed',
                            key: path.join(__dirname, '../certs/server.key'),
                            cert: path.join(__dirname, '../certs/server.crt'),
                            ca: path.join(__dirname, '../certs/ca.crt')
                        }
                    }
                },
                logger: {
                    level: 'info'
                }
            });
            
            // 添加direct_response拦截器
            this.proxy.intercept({
                name: 'https-direct-response',
                priority: 100,
                
                shouldIntercept(context, type) {
                    // 只拦截请求类型
                    if (type !== 'request') return false;
                    
                    const url = context.request.url;
                    const host = context.request.headers.host || '';
                    
                    console.log(`[DEBUG] shouldIntercept called - URL: ${url}, Host: ${host}, Type: ${type}`);
                    
                    // 不拦截test-404请求，让专门的404拦截器处理
                    if (url.includes('test-404')) {
                        console.log(`[DEBUG] shouldIntercept result: false (test-404 excluded)`);
                        return false;
                    }
                    
                    // 拦截HTTPS请求
                    const shouldIntercept = host.includes('httpbin.org') || url.includes('httpbin.org');
                    console.log(`[DEBUG] shouldIntercept result: ${shouldIntercept}`);
                    return shouldIntercept;
                },
                
                async interceptRequest(context) {
                    const url = context.request.url;
                    const host = context.request.headers.host || '';
                    
                    console.log(`[DEBUG] interceptRequest called - URL: ${url}, Host: ${host}`);
                    
                    // 拦截对httpbin.org的请求
                    if (host.includes('httpbin.org') || url.includes('httpbin.org')) {
                        console.log(`拦截到HTTPS请求: ${url}`);
                        
                        // 返回自定义响应
                        const customResponse = {
                            statusCode: 200,
                            headers: {
                                'Content-Type': 'text/html; charset=utf-8',
                                'X-Intercepted-By': 'NodeMITMProxy',
                                'X-Original-Host': host,
                                'X-Timestamp': new Date().toISOString()
                            },
                            body: `
<!DOCTYPE html>
<html>
<head>
    <title>HTTPS拦截响应 - NodeMITMProxy</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; }
        .info { background: #ecf0f1; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .success { color: #27ae60; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="header">🚫 HTTPS请求已被拦截</h1>
        <div class="info">
            <p><strong>原始请求:</strong> ${url}</p>
            <p><strong>目标主机:</strong> ${host}</p>
            <p><strong>拦截时间:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>拦截器:</strong> https-direct-response</p>
        </div>
        <p class="success">✅ HTTPS Direct Response模式测试成功！</p>
        <p>这个响应是由NodeMITMProxy拦截器直接返回的，没有访问真实的HTTPS服务器。</p>
        <hr>
        <small>NodeMITMProxy v2.0.0 - HTTPS Direct Response Interceptor</small>
    </div>
</body>
</html>
                            `
                        };
                        
                        return InterceptorResponse.directResponse(customResponse);
                    }
                    
                    // 其他请求继续正常处理
                    return InterceptorResponse.continue();
                }
            });
            
            await this.proxy.initialize();
            await this.proxy.start(8445, 'localhost');
            this.proxyPort = 8445;
            
            this.logger.info('HTTPS代理服务器启动成功', { port: 8445 });
            console.log('✓ HTTPS代理服务器设置完成\n');
            
        } catch (error) {
            throw new Error(`HTTPS代理设置失败: ${error.message}`);
        }
    }
    
    /**
     * 测试direct_response拦截功能
     */
    async testDirectResponseInterception() {
        console.log('2. 测试Direct Response拦截功能...');
        
        try {
            const startTime = performance.now();
            
            // 发送HTTPS请求到httpbin.org
            const result = await this.makeProxyRequest('https://httpbin.org');
            
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            // 验证响应
            if (result.success) {
                // 检查是否是拦截的响应
                const isIntercepted = result.headers['x-intercepted-by'] === 'NodeMITMProxy' || result.headers['X-Intercepted-By'] === 'NodeMITMProxy';
                const hasCustomContent = result.body.includes('HTTPS请求已被拦截');
                
                if (isIntercepted && hasCustomContent) {
                    this.logger.info('HTTPS Direct Response拦截成功', {
                        responseTime: `${responseTime.toFixed(2)}ms`,
                        statusCode: result.statusCode,
                        intercepted: true
                    });
                    
                    this.testResults.passed++;
                    console.log('✓ HTTPS Direct Response拦截测试通过\n');
                } else {
                    throw new Error('响应未被正确拦截');
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`HTTPS Direct Response拦截测试失败: ${error.message}`);
            console.error('✗ HTTPS Direct Response拦截测试失败:', error.message);
        }
    }
    
    /**
     * 测试多个HTTPS请求的拦截
     */
    async testMultipleRequests() {
        console.log('3. 测试多个HTTPS请求的拦截...');
        
        try {
            const urls = [
                'https://httpbin.org',
                'https://httpbin.org/get',
                'https://httpbin.org/headers'
            ];
            
            const results = [];
            
            for (const url of urls) {
                const result = await this.makeProxyRequest(url);
                results.push({
                    url,
                    success: result.success,
                    intercepted: result.headers && result.headers['x-intercepted-by'] === 'NodeMITMProxy'
                });
            }
            
            // 验证所有请求都被拦截
            const allIntercepted = results.every(r => r.success && r.intercepted);
            
            if (allIntercepted) {
                this.logger.info('HTTPS多请求拦截测试成功', { count: results.length });
                this.testResults.passed++;
                console.log('✓ HTTPS多个请求拦截测试通过\n');
            } else {
                throw new Error('部分HTTPS请求未被正确拦截');
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`HTTPS多请求拦截测试失败: ${error.message}`);
            console.error('✗ HTTPS多个请求拦截测试失败:', error.message);
        }
    }
    
    /**
     * 测试不同状态码的响应
     */
    async testDifferentStatusCodes() {
        console.log('4. 测试不同状态码的响应...');
        
        try {
            // 添加一个返回404的拦截器
            this.proxy.intercept({
                name: 'https-test-404-response',
                priority: 200,
                
                shouldIntercept(context, type) {
                    if (type !== 'request') return false;
                    const url = context.request.url;
                    return url.includes('test-404');
                },
                
                async interceptRequest(context) {
                    const url = context.request.url;
                    
                    if (url.includes('test-404')) {
                        return InterceptorResponse.directResponse({
                            statusCode: 404,
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Test-Response': 'true'
                            },
                            body: JSON.stringify({
                                error: 'Not Found',
                                message: 'This is a test 404 response for HTTPS',
                                timestamp: new Date().toISOString()
                            })
                        });
                    }
                    
                    return InterceptorResponse.continue();
                }
            });
            
            // 测试404响应
            const result = await this.makeProxyRequest('https://httpbin.org/test-404');
            
            if (result.success && result.statusCode === 404) {
                const responseData = JSON.parse(result.body);
                if (responseData.error === 'Not Found') {
                    this.logger.info('HTTPS自定义状态码测试成功', { statusCode: 404 });
                    this.testResults.passed++;
                    console.log('✓ HTTPS不同状态码响应测试通过\n');
                } else {
                    throw new Error('404响应内容不正确');
                }
            } else {
                throw new Error(`期望404状态码，实际收到: ${result.statusCode}`);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`HTTPS状态码测试失败: ${error.message}`);
            console.error('✗ HTTPS不同状态码响应测试失败:', error.message);
        }
    }
    
    /**
     * 测试自定义响应头
     */
    async testCustomHeaders() {
        console.log('5. 测试自定义响应头...');
        
        try {
            const result = await this.makeProxyRequest('https://httpbin.org');
            
            if (result.success) {
                const expectedHeaders = [
                    'x-intercepted-by',
                    'x-original-host',
                    'x-timestamp'
                ];
                
                const missingHeaders = expectedHeaders.filter(header => 
                    !result.headers[header]
                );
                
                if (missingHeaders.length === 0) {
                    this.logger.info('HTTPS自定义响应头测试成功', {
                        headers: expectedHeaders
                    });
                    this.testResults.passed++;
                    console.log('✓ HTTPS自定义响应头测试通过\n');
                } else {
                    throw new Error(`缺少响应头: ${missingHeaders.join(', ')}`);
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`HTTPS自定义响应头测试失败: ${error.message}`);
            console.error('✗ HTTPS自定义响应头测试失败:', error.message);
        }
    }
    
    /**
     * 通过代理发送HTTPS请求
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
                    'User-Agent': 'NodeMITMProxy-HTTPS-DirectResponse-Test/1.0'
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
                this.logger.info('HTTPS代理服务器已停止');
            } catch (error) {
                this.logger.error('停止HTTPS代理服务器失败:', error.message);
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
    const test = new HttpsDirectResponseTest();
    test.runAllTests().catch(console.error);
}

module.exports = HttpsDirectResponseTest;