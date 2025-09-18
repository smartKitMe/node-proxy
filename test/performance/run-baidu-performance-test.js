/**
 * 运行百度性能测试的脚本
 * 启动代理服务器并执行性能测试
 */

const { NodeMITMProxy } = require('../../src/index');
const { runPerformanceTest } = require('./simple-baidu-performance-test.js');
const path = require('path');

async function startProxyServer() {
    console.log('启动代理服务器...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            host: 'localhost',
            ssl: {
                // 注意：在实际测试中需要确保证书文件存在
                // 这里使用相对路径指向测试证书
                certPath: path.join(__dirname, '../test-certs/cert.pem'),
                keyPath: path.join(__dirname, '../test-certs/key.pem')
            }
        },
        logger: {
            level: 'warn' // 减少日志输出
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start(8080, 'localhost');
        console.log('代理服务器已启动在 http://localhost:8080');
        return proxy;
    } catch (error) {
        console.error('启动代理服务器失败:', error.message);
        throw error;
    }
}

async function startModifyProxyServer() {
    console.log('启动修改请求的代理服务器...');
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8081,
            host: 'localhost',
            ssl: {
                certPath: path.join(__dirname, '../test-certs/cert.pem'),
                keyPath: path.join(__dirname, '../test-certs/key.pem')
            }
        },
        logger: {
            level: 'warn'
        }
    });
    
    // 添加修改请求的拦截器
    proxy.intercept({
        id: 'modify-request',
        priority: 100,
        async request(ctx) {
            // 修改User-Agent
            ctx.requestOptions.headers['User-Agent'] = 'Modified-User-Agent/1.0';
            // 添加自定义头部
            ctx.requestOptions.headers['X-Proxy-Modified'] = 'true';
            return ctx;
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start(8081, 'localhost');
        console.log('修改请求的代理服务器已启动在 http://localhost:8081');
        return proxy;
    } catch (error) {
        console.error('启动修改请求的代理服务器失败:', error.message);
        throw error;
    }
}

async function main() {
    let proxy1, proxy2;
    
    try {
        // 启动代理服务器
        proxy1 = await startProxyServer();
        
        // 等待一段时间确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 启动修改请求的代理服务器
        proxy2 = await startModifyProxyServer();
        
        // 等待一段时间确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 运行性能测试
        await runPerformanceTest();
        
    } catch (error) {
        console.error('执行测试时发生错误:', error.message);
    } finally {
        // 关闭代理服务器
        if (proxy1) {
            try {
                await proxy1.stop();
                console.log('代理服务器已关闭');
            } catch (error) {
                console.error('关闭代理服务器时发生错误:', error.message);
            }
        }
        
        if (proxy2) {
            try {
                await proxy2.stop();
                console.log('修改请求的代理服务器已关闭');
            } catch (error) {
                console.error('关闭修改请求的代理服务器时发生错误:', error.message);
            }
        }
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}