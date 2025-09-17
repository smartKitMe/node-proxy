const { NodeMITMProxy } = require('../../src/index');
const assert = require('assert');
const http = require('http');
const https = require('https');

/**
 * 基础代理功能测试套件
 * 基于 test-cases-basic-proxy.md 文档
 */
describe('基础代理功能测试', function() {
    this.timeout(10000); // 设置超时时间为10秒

    let proxy;
    let testServer;
    let currentPort = 6789; // 起始端口
    const TEST_SERVER_PORT = 3001;

    // 获取下一个可用端口
    function getNextPort() {
        return ++currentPort;
    }

    // 创建测试用的HTTP服务器
    before(async function() {
        testServer = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                method: req.method,
                url: req.url,
                headers: req.headers,
                timestamp: new Date().toISOString()
            }));
        });

        await new Promise((resolve) => {
            testServer.listen(TEST_SERVER_PORT, resolve);
        });
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

    /**
     * TC-BASIC-001: 最小配置启动测试
     */
    describe('TC-BASIC-001: 最小配置启动测试', function() {
        it('应该能够使用最小配置成功启动代理服务器', async function() {
            const testPort = getNextPort();
            
            // 创建最小配置的代理实例
            proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost'
                },
                logger: {
                    level: 'info'
                }
            });

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
            assert.strictEqual(serverInfo.port, testPort, '端口配置应该正确');
            assert.strictEqual(serverInfo.host, 'localhost', '主机配置应该正确');
            assert.strictEqual(serverInfo.status, 'running', '服务器状态应该为运行中');

            console.log('✓ 端口和主机配置正确');
        });

        it('应该记录正确的启动时间', async function() {
            const startTime = Date.now();
            const testPort = getNextPort();
            
            proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost'
                }
            });

            await proxy.initialize();
            await proxy.start();

            const serverInfo = proxy.getServerInfo();
            const recordedStartTime = new Date(serverInfo.startTime).getTime();

            // 启动时间应该在测试开始时间之后，且不超过5秒
            assert(recordedStartTime >= startTime, '启动时间应该在测试开始之后');
            assert(recordedStartTime - startTime < 5000, '启动时间记录应该合理');
        });
    });

    /**
     * TC-BASIC-002: 默认配置启动测试
     */
    describe('TC-BASIC-002: 默认配置启动测试', function() {
        it('应该能够使用默认配置成功启动代理服务器', async function() {
            const testPort = getNextPort();
            
            // 使用指定端口配置（避免端口冲突）
            proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost'
                }
            });

            // 1. 初始化并启动
            await proxy.initialize();
            await proxy.start();
            console.log('✓ 默认配置代理启动成功');

            // 2. 验证配置
            const serverInfo = proxy.getServerInfo();
            assert.strictEqual(serverInfo.port, testPort, '端口应该正确');
            assert.strictEqual(serverInfo.host, 'localhost', '主机应该是localhost');
            console.log('✓ 配置正确');
        });

        it('应该支持优雅关闭', async function() {
            const testPort = getNextPort();
            
            proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: 'localhost'
                }
            });
            await proxy.initialize();
            await proxy.start();

            const serverInfo = proxy.getServerInfo();
            assert.strictEqual(serverInfo.status, 'running', '启动后状态应该为运行中');

            // 测试优雅关闭
            await proxy.stop();
            const stoppedInfo = proxy.getServerInfo();
            assert.notStrictEqual(stoppedInfo.status, 'running', '关闭后状态应该不是运行中');
            console.log('✓ 代理服务器已优雅关闭');
        });
    });

    /**
     * TC-BASIC-003: 服务器信息获取测试
     */
    describe('TC-BASIC-003: 服务器信息获取测试', function() {
        it('应该能够正确获取服务器运行信息', async function() {
            const testPort = getNextPort();
            
            proxy = new NodeMITMProxy({
                config: {
                    port: testPort,
                    host: '127.0.0.1'
                }
            });

            // 启动前获取信息
            let serverInfo = proxy.getServerInfo();
            console.log('启动前状态:', serverInfo.status);
            assert(serverInfo.status !== 'running', '启动前状态不应该是运行中');

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

            assert.strictEqual(missingFields.length, 0, `不应该缺少字段: ${missingFields.join(', ')}`);
            assert.strictEqual(serverInfo.status, 'running', '状态应该为运行中');
            assert.strictEqual(serverInfo.port, testPort, '端口应该正确');
            assert.strictEqual(serverInfo.host, '127.0.0.1', '主机应该正确');
            assert(serverInfo.startTime, '应该有启动时间');

            console.log('✓ 服务器信息完整');
        });

        it('应该提供运行时间信息', async function() {
            const testPort = getNextPort();
            
            proxy = new NodeMITMProxy({
                config: { port: testPort }
            });

            await proxy.initialize();
            await proxy.start();

            // 等待一小段时间
            await new Promise(resolve => setTimeout(resolve, 100));

            const serverInfo = proxy.getServerInfo();
            assert(serverInfo.uptime >= 0, '运行时间应该大于等于0');
            console.log(`✓ 运行时间: ${serverInfo.uptime}ms`);
        });
    });

    /**
     * TC-BASIC-004: 多端口配置测试
     */
    describe('TC-BASIC-004: 多端口配置测试', function() {
        let proxies = [];

        afterEach(async function() {
            // 关闭所有代理实例
            await Promise.all(proxies.map(p => p.stop()));
            proxies = [];
        });

        it('应该能够在不同端口启动多个代理实例', async function() {
            const testPort1 = getNextPort();
            const testPort2 = getNextPort();
            const testPort3 = getNextPort();
            
            const proxy1 = new NodeMITMProxy({ config: { port: testPort1 } });
            const proxy2 = new NodeMITMProxy({ config: { port: testPort2 } });
            const proxy3 = new NodeMITMProxy({ config: { port: testPort3 } });

            proxies = [proxy1, proxy2, proxy3];

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

            const testPorts = [testPort1, testPort2, testPort3];
            infos.forEach((info, index) => {
                const expectedPort = testPorts[index];
                assert.strictEqual(info.port, expectedPort, `代理 ${index + 1} 端口应该正确`);
                assert.strictEqual(info.status, 'running', `代理 ${index + 1} 状态应该为运行中`);
                console.log(`✓ 代理 ${index + 1} (端口 ${expectedPort}) 运行正常`);
            });
        });

        it('应该能够独立管理每个代理实例', async function() {
            const testPort1 = getNextPort();
            const testPort2 = getNextPort();
            
            const proxy1 = new NodeMITMProxy({ config: { port: testPort1 } });
            const proxy2 = new NodeMITMProxy({ config: { port: testPort2 } });

            proxies = [proxy1, proxy2];

            // 启动两个实例
            await proxy1.initialize();
            await proxy1.start();
            await proxy2.initialize();
            await proxy2.start();

            // 验证都在运行
            assert.strictEqual(proxy1.getServerInfo().status, 'running');
            assert.strictEqual(proxy2.getServerInfo().status, 'running');

            // 停止第一个实例
            await proxy1.stop();

            // 验证第一个已停止，第二个仍在运行
            assert.notStrictEqual(proxy1.getServerInfo().status, 'running');
            assert.strictEqual(proxy2.getServerInfo().status, 'running');

            console.log('✓ 代理实例可以独立管理');
        });
    });

    /**
     * TC-BASIC-005: 基础HTTP代理功能测试
     */
    describe('TC-BASIC-005: 基础HTTP代理功能测试', function() {
        it('应该能够代理HTTP请求', async function() {
            const testPort = getNextPort();
            
            proxy = new NodeMITMProxy({
                config: { port: testPort }
            });

            await proxy.initialize();
            await proxy.start();

            // 通过代理发送请求
            const proxyReq = http.request({
                host: 'localhost',
                port: testPort,
                path: `http://localhost:${TEST_SERVER_PORT}/test`,
                method: 'GET'
            });

            const response = await new Promise((resolve, reject) => {
                proxyReq.on('response', resolve);
                proxyReq.on('error', reject);
                proxyReq.end();
            });

            assert.strictEqual(response.statusCode, 200, '应该返回200状态码');
            console.log('✓ HTTP代理请求成功');

            // 读取响应数据
            let data = '';
            response.on('data', chunk => data += chunk);
            
            await new Promise(resolve => response.on('end', resolve));
            
            const responseData = JSON.parse(data);
            assert.strictEqual(responseData.method, 'GET', '请求方法应该正确');
            assert.strictEqual(responseData.url, '/test', '请求URL应该正确');
            
            console.log('✓ 代理请求数据正确');
        });
    });
});