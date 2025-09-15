const mitmproxy = require('../src/index');
const http = require('http');
const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { performance } = require('perf_hooks');
const colors = require('colors');

/**
 * node-mitmproxy 完整功能测试脚本
 * 测试内容：
 * 1. 启动 node-mitmproxy 代理服务器
 * 2. 不使用 externalProxy 访问百度
 * 3. 使用 socks5 externalProxy 访问百度
 */

class MitmproxyTester {
    constructor() {
        this.proxyServer = null;
        this.proxyPort = 8888;
        this.testResults = {
            serverStart: false,
            directProxyTest: false,
            externalProxyTest: false
        };
    }

    /**
     * 启动 mitmproxy 代理服务器
     * @param {Object} options - 代理服务器配置选项
     * @returns {Promise<boolean>} 启动是否成功
     */
    async startProxyServer(options = {}) {
        return new Promise((resolve, reject) => {
            try {
                console.log(colors.cyan('\n=== 启动 node-mitmproxy 代理服务器 ==='));
                
                const defaultOptions = {
                    port: this.proxyPort,
                    enablePerformanceMetrics: true,
                    requestInterceptor: this.createRequestInterceptor(),
                    responseInterceptor: this.createResponseInterceptor(),
                    sslConnectInterceptor: this.createSSLConnectInterceptor(),
                    ...options
                };

                this.proxyServer = mitmproxy.createProxy(defaultOptions);
                
                this.proxyServer.listen(this.proxyPort, () => {
                    console.log(colors.green(`✓ 代理服务器启动成功，端口: ${this.proxyPort}`));
                    this.testResults.serverStart = true;
                    resolve(true);
                });

                this.proxyServer.on('error', (error) => {
                    console.error(colors.red('✗ 代理服务器启动失败:'), error.message);
                    reject(error);
                });

            } catch (error) {
                console.error(colors.red('✗ 创建代理服务器失败:'), error.message);
                reject(error);
            }
        });
    }

    /**
     * 创建请求拦截器
     * @returns {Function} 请求拦截器函数
     */
    createRequestInterceptor() {
        return (rOptions, req, res, ssl, next) => {
            const url = `${ssl ? 'https' : 'http'}://${req.headers.host}${req.url}`;
            console.log(colors.yellow(`→ 拦截请求: ${req.method} ${url}`));
            
            // 添加自定义请求头
            rOptions.headers['X-Mitmproxy-Test'] = 'true';
            rOptions.headers['X-Test-Timestamp'] = Date.now().toString();
            
            next();
        };
    }

    /**
     * 创建响应拦截器
     * @returns {Function} 响应拦截器函数
     */
    createResponseInterceptor() {
        return (req, res, proxyReq, proxyRes, ssl, next) => {
            const url = `${ssl ? 'https' : 'http'}://${req.headers.host}${req.url}`;
            console.log(colors.blue(`← 拦截响应: ${proxyRes.statusCode} ${url}`));
            
            // 添加自定义响应头
            proxyRes.headers['X-Mitmproxy-Processed'] = 'true';
            
            next();
        };
    }

    /**
     * 创建 SSL 连接拦截器
     * @returns {Function} SSL 连接拦截器函数
     */
    createSSLConnectInterceptor() {
        return (req, cltSocket, head) => {
            console.log(colors.magenta(`🔒 SSL 连接: ${req.url}`));
            // 返回 true 表示允许连接
            return true;
        };
    }

    /**
     * 通过代理发送 HTTP 请求
     * @param {string} targetUrl - 目标 URL
     * @param {Object} proxyOptions - 代理配置
     * @returns {Promise<Object>} 请求结果
     */
    async makeProxyRequest(targetUrl, proxyOptions = {}) {
        return new Promise((resolve, reject) => {
            const startTime = performance.now();
            const url = new URL(targetUrl);
            const isHttps = url.protocol === 'https:';
            
            if (isHttps) {
                // 对于 HTTPS 请求，使用 HTTP CONNECT 方法建立隧道
                this.makeHttpsProxyRequest(targetUrl, resolve, startTime);
            } else {
                // 对于 HTTP 请求，直接通过代理
                this.makeHttpProxyRequest(targetUrl, resolve, startTime, proxyOptions);
            }
        });
    }

    /**
     * 通过代理发送 HTTP 请求
     * @param {string} targetUrl - 目标 URL
     * @param {Function} resolve - Promise resolve 函数
     * @param {number} startTime - 开始时间
     * @param {Object} proxyOptions - 代理配置
     */
    makeHttpProxyRequest(targetUrl, resolve, startTime, proxyOptions = {}) {
        const url = new URL(targetUrl);
        
        const requestOptions = {
            hostname: '127.0.0.1',
            port: this.proxyPort,
            path: targetUrl,
            method: 'GET',
            headers: {
                'Host': url.hostname,
                'User-Agent': 'Mozilla/5.0 (Linux; Ubuntu) node-mitmproxy-test/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'close'
            },
            ...proxyOptions
        };

        const req = http.request(requestOptions, (res) => {
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    success: true,
                    statusCode: res.statusCode,
                    headers: res.headers,
                    responseTime: responseTime,
                    dataLength: data.length,
                    hasProxyHeaders: {
                        processed: !!res.headers['x-mitmproxy-processed'],
                        testHeader: !!res.headers['x-mitmproxy-test']
                    }
                });
            });
        });
        
        req.on('error', (error) => {
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            resolve({
                success: false,
                error: error.message,
                responseTime: responseTime
            });
        });
        
        req.setTimeout(10000, () => {
            req.destroy();
            resolve({
                success: false,
                error: '请求超时',
                responseTime: 10000
            });
        });
        
        req.end();
    }

    /**
     * 通过代理发送 HTTPS 请求（使用 CONNECT 隧道）
     * @param {string} targetUrl - 目标 URL
     * @param {Function} resolve - Promise resolve 函数
     * @param {number} startTime - 开始时间
     */
    makeHttpsProxyRequest(targetUrl, resolve, startTime) {
        const url = new URL(targetUrl);
        const port = url.port || 443;
        
        // 第一步：建立 CONNECT 隧道
        const connectOptions = {
            hostname: '127.0.0.1',
            port: this.proxyPort,
            method: 'CONNECT',
            path: `${url.hostname}:${port}`,
            headers: {
                'Host': `${url.hostname}:${port}`,
                'User-Agent': 'Mozilla/5.0 (Linux; Ubuntu) node-mitmproxy-test/1.0'
            }
        };

        const connectReq = http.request(connectOptions);
        
        connectReq.on('connect', (res, socket, head) => {
            if (res.statusCode === 200) {
                // 隧道建立成功，发送 HTTPS 请求
                const httpsOptions = {
                    socket: socket,
                    hostname: url.hostname,
                    port: port,
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: {
                        'Host': url.hostname,
                        'User-Agent': 'Mozilla/5.0 (Linux; Ubuntu) node-mitmproxy-test/1.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Accept-Encoding': 'gzip, deflate',
                        'Connection': 'close'
                    },
                    // 忽略证书验证（测试环境）
                    rejectUnauthorized: false
                };

                const httpsReq = https.request(httpsOptions, (httpsRes) => {
                    const endTime = performance.now();
                    const responseTime = endTime - startTime;
                    
                    let data = '';
                    httpsRes.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    httpsRes.on('end', () => {
                        resolve({
                            success: true,
                            statusCode: httpsRes.statusCode,
                            headers: httpsRes.headers,
                            responseTime: responseTime,
                            dataLength: data.length,
                            hasProxyHeaders: {
                                processed: !!httpsRes.headers['x-mitmproxy-processed'],
                                testHeader: !!httpsRes.headers['x-mitmproxy-test']
                            }
                        });
                    });
                });
                
                httpsReq.on('error', (error) => {
                    const endTime = performance.now();
                    const responseTime = endTime - startTime;
                    
                    resolve({
                        success: false,
                        error: error.message,
                        responseTime: responseTime
                    });
                });
                
                httpsReq.setTimeout(10000, () => {
                    httpsReq.destroy();
                    resolve({
                        success: false,
                        error: 'HTTPS 请求超时',
                        responseTime: 10000
                    });
                });
                
                httpsReq.end();
            } else {
                const endTime = performance.now();
                const responseTime = endTime - startTime;
                
                resolve({
                    success: false,
                    error: `CONNECT 隧道建立失败: ${res.statusCode}`,
                    responseTime: responseTime
                });
            }
        });
        
        connectReq.on('error', (error) => {
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            resolve({
                success: false,
                error: `CONNECT 请求失败: ${error.message}`,
                responseTime: responseTime
            });
        });
        
        connectReq.setTimeout(10000, () => {
            connectReq.destroy();
            resolve({
                success: false,
                error: 'CONNECT 请求超时',
                responseTime: 10000
            });
        });
        
        connectReq.end();
    }

    /**
     * 测试不使用 externalProxy 的代理访问
     * @returns {Promise<boolean>} 测试是否成功
     */
    async testDirectProxy() {
        console.log(colors.cyan('\n=== 测试直接代理访问百度 ==='));
        
        try {
            const result = await this.makeProxyRequest('https://www.baidu.com/');
            
            if (result.success) {
                console.log(colors.green('✓ 直接代理访问成功'));
                console.log(`  状态码: ${result.statusCode}`);
                console.log(`  响应时间: ${result.responseTime.toFixed(2)} ms`);
                console.log(`  数据长度: ${result.dataLength} bytes`);
                console.log(`  代理处理标识: ${result.hasProxyHeaders.processed ? '是' : '否'}`);
                
                this.testResults.directProxyTest = result.statusCode === 200;
                return true;
            } else {
                console.log(colors.red('✗ 直接代理访问失败:'), result.error);
                return false;
            }
        } catch (error) {
            console.log(colors.red('✗ 直接代理测试异常:'), error.message);
            return false;
        }
    }

    /**
     * 测试使用 externalProxy 的代理访问
     * @returns {Promise<boolean>} 测试是否成功
     */
    async testExternalProxy() {
        console.log(colors.cyan('\n=== 测试使用外部 SOCKS5 代理访问百度 ==='));
        
        try {
            // 停止当前代理服务器
            if (this.proxyServer) {
                this.proxyServer.close();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 使用外部代理重新启动代理服务器
            const externalProxyUrl = 'socks5://192.168.182.100:11080';
            console.log(colors.yellow(`使用外部代理: ${externalProxyUrl}`));
            
            await this.startProxyServer({
                externalProxy: externalProxyUrl
            });
            
            // 等待服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const result = await this.makeProxyRequest('https://www.baidu.com/');
            
            if (result.success) {
                console.log(colors.green('✓ 外部代理访问成功'));
                console.log(`  状态码: ${result.statusCode}`);
                console.log(`  响应时间: ${result.responseTime.toFixed(2)} ms`);
                console.log(`  数据长度: ${result.dataLength} bytes`);
                console.log(`  代理处理标识: ${result.hasProxyHeaders.processed ? '是' : '否'}`);
                
                this.testResults.externalProxyTest = result.statusCode === 200;
                return true;
            } else {
                console.log(colors.red('✗ 外部代理访问失败:'), result.error);
                return false;
            }
        } catch (error) {
            console.log(colors.red('✗ 外部代理测试异常:'), error.message);
            return false;
        }
    }

    /**
     * 运行完整测试套件
     * @returns {Promise<Object>} 测试结果
     */
    async runCompleteTest() {
        console.log(colors.rainbow('\n🚀 开始 node-mitmproxy 完整功能测试\n'));
        
        const testStartTime = performance.now();
        
        try {
            // 1. 启动代理服务器（不使用外部代理）
            await this.startProxyServer();
            
            // 等待服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 2. 测试直接代理访问
            await this.testDirectProxy();
            
            // 3. 测试外部代理访问
            await this.testExternalProxy();
            
        } catch (error) {
            console.error(colors.red('\n测试过程中发生错误:'), error.message);
        } finally {
            // 清理资源
            if (this.proxyServer) {
                this.proxyServer.close();
                console.log(colors.gray('\n代理服务器已关闭'));
            }
        }
        
        const testEndTime = performance.now();
        const totalTime = testEndTime - testStartTime;
        
        // 输出测试结果
        this.printTestResults(totalTime);
        
        return this.testResults;
    }

    /**
     * 打印测试结果
     * @param {number} totalTime - 总测试时间
     */
    printTestResults(totalTime) {
        console.log(colors.rainbow('\n📊 测试结果汇总'));
        console.log('='.repeat(50));
        
        const results = [
            { name: '代理服务器启动', status: this.testResults.serverStart },
            { name: '直接代理访问', status: this.testResults.directProxyTest },
            { name: '外部代理访问', status: this.testResults.externalProxyTest }
        ];
        
        results.forEach(result => {
            const icon = result.status ? '✓' : '✗';
            const color = result.status ? colors.green : colors.red;
            console.log(color(`${icon} ${result.name}: ${result.status ? '成功' : '失败'}`));
        });
        
        const successCount = results.filter(r => r.status).length;
        const totalCount = results.length;
        
        console.log('\n' + '='.repeat(50));
        console.log(colors.cyan(`总计: ${successCount}/${totalCount} 项测试通过`));
        console.log(colors.cyan(`总耗时: ${(totalTime / 1000).toFixed(2)} 秒`));
        
        if (successCount === totalCount) {
            console.log(colors.green.bold('\n🎉 所有测试通过！node-mitmproxy 功能正常'));
        } else {
            console.log(colors.red.bold('\n❌ 部分测试失败，请检查配置和网络连接'));
        }
    }
}

/**
 * 主测试函数
 */
async function main() {
    const tester = new MitmproxyTester();
    
    try {
        await tester.runCompleteTest();
    } catch (error) {
        console.error(colors.red('测试执行失败:'), error);
        process.exit(1);
    }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    main().catch(error => {
        console.error(colors.red('程序异常退出:'), error);
        process.exit(1);
    });
}

module.exports = MitmproxyTester;