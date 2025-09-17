const { NodeMITMProxy } = require('../src/index');
const https = require('https');
const http = require('http');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

/**
 * HTTPS测试用例1：使用最小配置启动代理，确保测试无问题
 * 验证HTTPS代理服务器能够正常启动和关闭
 */
class HttpsMinimalConfigTest {
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
    }
    
    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('=== HTTPS测试用例1：最小配置启动代理测试 ===\n');
        
        try {
            await this.testMinimalProxyStartup();
            await this.testHttpsProxyBasicFunctionality();
            await this.testProxyShutdown();
            
            this.printTestResults();
        } catch (error) {
            this.logger.error('测试执行失败:', error.message);
            this.testResults.failed++;
            this.testResults.errors.push(error.message);
        }
    }
    
    /**
     * 测试最小配置HTTPS代理启动
     */
    async testMinimalProxyStartup() {
        console.log('1. 测试最小配置HTTPS代理启动...');
        
        try {
            // 获取随机可用端口
            const testPort = await this.getAvailablePort();
            
            // 创建最小配置的代理实例 - 使用固定服务器证书
            const proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost',
                    // HTTPS配置 - 使用固定服务器证书
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
            
            // 初始化代理
            await proxy.initialize();
            this.logger.info('HTTPS代理初始化成功');
            
            // 启动代理服务器
            await proxy.start();
            this.logger.info('HTTPS代理服务器启动成功', { port: testPort, host: 'localhost' });
            
            // 验证服务器信息
            const serverInfo = proxy.getServerInfo();
            console.log('服务器信息:', serverInfo);
            
            // 验证配置
            const config = proxy.getConfig();
            console.log('代理配置:', config);
            
            // 等待一秒确保服务器完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 关闭代理
            await proxy.stop();
            this.logger.info('HTTPS代理服务器关闭成功');
            
            this.testResults.passed++;
            console.log('✓ 最小配置HTTPS代理启动测试通过\n');
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`最小配置HTTPS启动测试失败: ${error.message}`);
            console.error('✗ 最小配置HTTPS代理启动测试失败:', error.message);
        }
    }
    
    /**
     * 测试HTTPS代理基本功能
     */
    async testHttpsProxyBasicFunctionality() {
        console.log('2. 测试HTTPS代理基本功能...');
        
        try {
            const proxy = new NodeMITMProxy({
                config: {
                    port: 8443,
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
                }
            });
            
            await proxy.initialize();
            await proxy.start(8443, 'localhost');
            
            // 测试代理是否能够处理简单的HTTPS请求
            const testResult = await this.makeHttpsTestRequest(8443);
            
            if (testResult.success) {
                this.logger.info('HTTPS代理基本功能测试成功');
                this.testResults.passed++;
                console.log('✓ HTTPS代理基本功能测试通过\n');
            } else {
                throw new Error(testResult.error);
            }
            
            await proxy.stop();
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`HTTPS代理基本功能测试失败: ${error.message}`);
            console.error('✗ HTTPS代理基本功能测试失败:', error.message);
        }
    }
    
    /**
     * 测试代理关闭功能
     */
    async testProxyShutdown() {
        console.log('3. 测试代理关闭功能...');
        
        try {
            const proxy = new NodeMITMProxy({
                config: {
                    port: 8444,
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
                }
            });
            
            await proxy.initialize();
            await proxy.start(8444, 'localhost');
            
            // 测试优雅关闭
            const startTime = performance.now();
            await proxy.stop();
            const shutdownTime = performance.now() - startTime;
            
            this.logger.info(`HTTPS代理关闭耗时: ${shutdownTime.toFixed(2)}ms`);
            
            // 验证端口已释放
            const portReleased = await this.checkPortReleased(8444);
            
            if (portReleased) {
                this.testResults.passed++;
                console.log('✓ HTTPS代理关闭功能测试通过\n');
            } else {
                throw new Error('端口未正确释放');
            }
            
        } catch (error) {
            this.testResults.failed++;
            this.testResults.errors.push(`HTTPS代理关闭测试失败: ${error.message}`);
            console.error('✗ HTTPS代理关闭功能测试失败:', error.message);
        }
    }
    
    /**
     * 发送HTTPS测试请求
     */
    async makeHttpsTestRequest(proxyPort) {
        return new Promise((resolve) => {
            const options = {
                hostname: 'httpbin.org',
                port: 443,
                path: '/get',
                method: 'GET',
                headers: {
                    'User-Agent': 'NodeMITMProxy-HTTPS-Test/1.0'
                }
            };
            
            // 使用代理
            const proxyOptions = {
                hostname: 'localhost',
                port: proxyPort,
                path: `https://httpbin.org/get`,
                method: 'GET',
                headers: {
                    'Host': 'httpbin.org',
                    'User-Agent': 'NodeMITMProxy-HTTPS-Test/1.0'
                },
                rejectUnauthorized: false // 忽略证书验证错误
            };
            
            const req = http.request(proxyOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    this.logger.info('HTTPS响应数据长度:', data.length);
                    if (res.statusCode === 200) {
                        resolve({ success: true, data });
                    } else {
                        resolve({ success: false, error: `HTTP ${res.statusCode}` });
                    }
                });
            });
            
            req.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });
            
            req.setTimeout(10000, () => {
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
     * 检查端口是否已释放
     */
    async checkPortReleased(port) {
        return new Promise((resolve) => {
            const server = require('net').createServer();
            
            server.listen(port, () => {
                server.close(() => {
                    resolve(true);
                });
            });
            
            server.on('error', () => {
                resolve(false);
            });
        });
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
    const test = new HttpsMinimalConfigTest();
    test.runAllTests().catch(console.error);
}

module.exports = HttpsMinimalConfigTest;