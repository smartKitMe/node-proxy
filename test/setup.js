/**
 * 测试环境设置文件
 * 在所有测试运行前进行全局配置
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

// 配置 Chai 断言库
chai.use(chaiHttp);
chai.use(chaiAsPromised);
chai.use(sinonChai);

// 设置全局变量
global.expect = chai.expect;
global.should = chai.should();
global.sinon = sinon;

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // 减少测试期间的日志输出

// 全局测试配置
const TEST_CONFIG = {
    // 测试端口范围
    ports: {
        proxy: {
            start: 18000,
            end: 18099
        },
        target: {
            start: 19000,
            end: 19099
        },
        websocket: {
            start: 20000,
            end: 20099
        }
    },
    
    // 测试超时配置
    timeouts: {
        short: 5000,    // 5秒
        medium: 15000,  // 15秒
        long: 30000     // 30秒
    },
    
    // 测试证书路径
    certificates: {
        key: './certs/test-key.pem',
        cert: './certs/test-cert.pem',
        ca: './certs/test-ca.pem'
    },
    
    // 测试数据目录
    testDataDir: './test/data',
    
    // 性能测试配置
    performance: {
        warmupRequests: 100,
        testRequests: 1000,
        concurrency: 10,
        maxResponseTime: 1000, // 1秒
        minThroughput: 500     // 每秒500请求
    }
};

// 导出测试配置
global.TEST_CONFIG = TEST_CONFIG;

/**
 * 端口管理器 - 避免测试间端口冲突
 */
class PortManager {
    constructor() {
        this.usedPorts = new Set();
        this.portCounters = {
            proxy: TEST_CONFIG.ports.proxy.start,
            target: TEST_CONFIG.ports.target.start,
            websocket: TEST_CONFIG.ports.websocket.start
        };
    }
    
    /**
     * 获取可用端口
     */
    getAvailablePort(type = 'proxy') {
        const config = TEST_CONFIG.ports[type];
        if (!config) {
            throw new Error(`未知的端口类型: ${type}`);
        }
        
        let port = this.portCounters[type];
        
        // 查找未使用的端口
        while (this.usedPorts.has(port) && port <= config.end) {
            port++;
        }
        
        if (port > config.end) {
            throw new Error(`${type} 端口范围已用完`);
        }
        
        this.usedPorts.add(port);
        this.portCounters[type] = port + 1;
        
        return port;
    }
    
    /**
     * 释放端口
     */
    releasePort(port) {
        this.usedPorts.delete(port);
    }
    
    /**
     * 释放所有端口
     */
    releaseAllPorts() {
        this.usedPorts.clear();
        this.portCounters = {
            proxy: TEST_CONFIG.ports.proxy.start,
            target: TEST_CONFIG.ports.target.start,
            websocket: TEST_CONFIG.ports.websocket.start
        };
    }
}

// 创建全局端口管理器
global.portManager = new PortManager();

/**
 * 测试工具函数
 */
const TestUtils = {
    /**
     * 等待指定时间
     */
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    /**
     * 等待条件满足
     */
    waitFor: async (condition, timeout = 5000, interval = 100) => {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return true;
            }
            await TestUtils.delay(interval);
        }
        
        throw new Error(`等待条件超时 (${timeout}ms)`);
    },
    
    /**
     * 创建测试服务器
     */
    createTestServer: (port, handler) => {
        const http = require('http');
        const server = http.createServer(handler);
        
        return new Promise((resolve, reject) => {
            server.listen(port, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(server);
                }
            });
        });
    },
    
    /**
     * 关闭服务器
     */
    closeServer: (server) => {
        return new Promise((resolve) => {
            if (server && server.listening) {
                server.close(() => resolve());
            } else {
                resolve();
            }
        });
    },
    
    /**
     * 生成随机字符串
     */
    randomString: (length = 10) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },
    
    /**
     * 生成测试数据
     */
    generateTestData: (size = 1024) => {
        return Buffer.alloc(size, 'A');
    }
};

// 导出测试工具
global.TestUtils = TestUtils;

/**
 * 全局测试钩子
 */

// 每个测试套件开始前
beforeEach(function() {
    // 重置 sinon
    sinon.restore();
    
    // 设置测试超时
    this.timeout(TEST_CONFIG.timeouts.medium);
});

// 每个测试套件结束后
afterEach(function() {
    // 清理 sinon
    sinon.restore();
});

// 所有测试结束后
after(function() {
    // 释放所有端口
    global.portManager.releaseAllPorts();
    
    // 清理定时器
    if (global.gc) {
        global.gc();
    }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('测试中出现未捕获的异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('测试中出现未处理的Promise拒绝:', reason);
    process.exit(1);
});

console.log('✅ 测试环境设置完成');
console.log(`📊 测试配置:`, {
    环境: process.env.NODE_ENV,
    日志级别: process.env.LOG_LEVEL,
    端口范围: TEST_CONFIG.ports,
    超时配置: TEST_CONFIG.timeouts
});