const { NodeMITMProxy } = require('../src/index');
const http = require('http');

/**
 * 基础性能测试
 * 验证重构版本的基本性能指标
 */
class BasicPerformanceTest {
    constructor() {
        this.proxy = null;
        this.testServer = null;
        this.results = {
            startTime: 0,
            endTime: 0,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            requestsPerSecond: 0
        };
    }

    /**
     * 设置测试环境
     */
    async setup() {
        console.log('设置基础性能测试环境...');
        
        // 创建测试服务器
        this.testServer = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Hello from test server', timestamp: Date.now() }));
        });
        
        await new Promise((resolve) => {
            this.testServer.listen(3002, '127.0.0.1', resolve);
        });
        
        console.log('测试服务器启动在端口 3002');
        
        // 创建代理服务器
        this.proxy = new NodeMITMProxy({
            port: 8081,
            host: '127.0.0.1'
        });
        
        await this.proxy.initialize();
        await this.proxy.start(8081, '127.0.0.1');
        
        console.log('代理服务器启动在端口 8081');
    }

    /**
     * 运行性能测试
     */
    async runTest() {
        console.log('开始基础性能测试...');
        
        const concurrency = 10; // 并发数
        const requestsPerWorker = 10; // 每个工作者的请求数
        const totalRequests = concurrency * requestsPerWorker;
        
        this.results.startTime = Date.now();
        this.results.totalRequests = totalRequests;
        
        const workers = [];
        const responseTimes = [];
        
        // 创建并发工作者
        for (let i = 0; i < concurrency; i++) {
            workers.push(this.createWorker(requestsPerWorker, responseTimes));
        }
        
        // 等待所有工作者完成
        const results = await Promise.allSettled(workers);
        
        this.results.endTime = Date.now();
        
        // 统计结果
        let successCount = 0;
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                successCount += result.value;
            }
        });
        
        this.results.successfulRequests = successCount;
        this.results.failedRequests = totalRequests - successCount;
        
        // 计算平均响应时间
        if (responseTimes.length > 0) {
            this.results.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }
        
        // 计算每秒请求数
        const duration = (this.results.endTime - this.results.startTime) / 1000;
        this.results.requestsPerSecond = this.results.successfulRequests / duration;
        
        console.log('基础性能测试完成');
    }

    /**
     * 创建工作者
     */
    async createWorker(requestCount, responseTimes) {
        let successCount = 0;
        
        for (let i = 0; i < requestCount; i++) {
            try {
                const startTime = Date.now();
                
                const response = await this.makeRequest();
                
                const endTime = Date.now();
                responseTimes.push(endTime - startTime);
                
                if (response.statusCode === 200) {
                    successCount++;
                }
            } catch (error) {
                console.error('请求失败:', error.message);
            }
        }
        
        return successCount;
    }

    /**
     * 发送HTTP请求
     */
    makeRequest() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: '127.0.0.1',
                port: 3002,
                path: '/test',
                method: 'GET'
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.end();
        });
    }

    /**
     * 生成测试报告
     */
    generateReport() {
        const duration = (this.results.endTime - this.results.startTime) / 1000;
        
        console.log('\n=== 基础性能测试报告 ===');
        console.log(`测试时间: ${new Date().toISOString()}`);
        console.log(`测试持续时间: ${duration.toFixed(2)} 秒`);
        console.log(`总请求数: ${this.results.totalRequests}`);
        console.log(`成功请求数: ${this.results.successfulRequests}`);
        console.log(`失败请求数: ${this.results.failedRequests}`);
        console.log(`成功率: ${((this.results.successfulRequests / this.results.totalRequests) * 100).toFixed(2)}%`);
        console.log(`平均响应时间: ${this.results.averageResponseTime.toFixed(2)} ms`);
        console.log(`每秒请求数: ${this.results.requestsPerSecond.toFixed(2)} req/s`);
        console.log('========================\n');
        
        return this.results;
    }

    /**
     * 清理测试环境
     */
    async cleanup() {
        console.log('清理测试环境...');
        
        if (this.proxy) {
            await this.proxy.stop();
        }
        
        if (this.testServer) {
            this.testServer.close();
        }
        
        console.log('清理完成');
    }
}

/**
 * 运行基础性能测试
 */
async function runBasicPerformanceTest() {
    const test = new BasicPerformanceTest();
    
    try {
        await test.setup();
        await test.runTest();
        const results = test.generateReport();
        
        // 验证性能指标
        if (results.requestsPerSecond > 50) {
            console.log('✅ 性能测试通过！每秒请求数超过 50');
        } else {
            console.log('⚠️  性能警告：每秒请求数低于预期');
        }
        
        if (results.averageResponseTime < 100) {
            console.log('✅ 响应时间测试通过！平均响应时间低于 100ms');
        } else {
            console.log('⚠️  响应时间警告：平均响应时间高于预期');
        }
        
    } catch (error) {
        console.error('❌ 基础性能测试失败:', error.message);
        console.error('错误堆栈:', error.stack);
    } finally {
        await test.cleanup();
    }
}

// 运行测试
if (require.main === module) {
    runBasicPerformanceTest().then(() => {
        console.log('基础性能测试完成');
        process.exit(0);
    }).catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = BasicPerformanceTest;