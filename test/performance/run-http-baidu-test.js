/**
 * 运行HTTP百度性能测试的脚本
 * 启动HTTP代理服务器并执行性能测试
 */

const { NodeMITMProxy } = require('../../src/index');
const { runPerformanceTest } = require('./http-baidu-performance-test.js');

async function startProxyServer(port, name) {
    console.log(`启动${name}...`);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: port,
            host: 'localhost'
        },
        logger: {
            level: 'warn' // 减少日志输出
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start(port, 'localhost');
        console.log(`${name}已启动在 http://localhost:${port}`);
        return proxy;
    } catch (error) {
        console.error(`启动${name}失败:`, error.message);
        throw error;
    }
}

async function startModifyProxyServer(port, name) {
    console.log(`启动${name}...`);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: port,
            host: 'localhost'
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
        await proxy.start(port, 'localhost');
        console.log(`${name}已启动在 http://localhost:${port}`);
        return proxy;
    } catch (error) {
        console.error(`启动${name}失败:`, error.message);
        throw error;
    }
}

async function main() {
    let proxy1, proxy2;
    
    try {
        // 启动HTTP代理服务器 (端口8080)
        proxy1 = await startProxyServer(8080, 'HTTP代理服务器');
        
        // 等待一段时间确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 启动修改请求的HTTP代理服务器 (端口8081)
        proxy2 = await startModifyProxyServer(8081, '修改请求的HTTP代理服务器');
        
        // 等待一段时间确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 运行性能测试
        await runPerformanceTest();
        
    } catch (error) {
        console.error('执行测试时发生错误:', error.message);
        console.error(error.stack);
    } finally {
        // 关闭代理服务器
        if (proxy1) {
            try {
                await proxy1.stop();
                console.log('HTTP代理服务器已关闭');
            } catch (error) {
                console.error('关闭HTTP代理服务器时发生错误:', error.message);
            }
        }
        
        if (proxy2) {
            try {
                await proxy2.stop();
                console.log('修改请求的HTTP代理服务器已关闭');
            } catch (error) {
                console.error('关闭修改请求的HTTP代理服务器时发生错误:', error.message);
            }
        }
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}