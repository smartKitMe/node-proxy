const { NodeMITMProxy } = require('../src/index');

/**
 * 最小配置示例
 * 演示如何使用最简单的配置启动代理服务器
 */
async function demonstrateMinimalConfig() {
    console.log('=== 最小配置代理示例 ===\n');
    
    try {
        // 创建最小配置的代理实例
        const proxy = new NodeMITMProxy({
            config: {
                port: 8080,
                host: 'localhost'
            },
            logger: {
                level: 'info'
            }
        });
        
        console.log('1. 初始化代理服务器...');
        await proxy.initialize();
        console.log('✓ 代理初始化完成');
        
        console.log('\n2. 启动代理服务器...');
        await proxy.start(8080, 'localhost');
        console.log('✓ 代理服务器已启动在 http://localhost:8080');
        
        // 显示服务器信息
        const serverInfo = proxy.getServerInfo();
        console.log('\n3. 服务器信息:');
        console.log(`   - 端口: ${serverInfo.port}`);
        console.log(`   - 主机: ${serverInfo.host}`);
        console.log(`   - 状态: ${serverInfo.status}`);
        console.log(`   - 启动时间: ${new Date(serverInfo.startTime).toLocaleString()}`);
        
        // 显示配置信息
        const config = proxy.getConfig();
        console.log('\n4. 代理配置:');
        console.log('   - 基本配置:', JSON.stringify(config, null, 2));
        
        console.log('\n5. 使用说明:');
        console.log('   - 在浏览器中设置HTTP代理为: localhost:8080');
        console.log('   - 或使用curl命令: curl -x http://localhost:8080 http://httpbin.org/get');
        
        // 运行30秒后自动关闭
        console.log('\n代理将在30秒后自动关闭...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        console.log('\n6. 关闭代理服务器...');
        await proxy.stop();
        console.log('✓ 代理服务器已关闭');
        
    } catch (error) {
        console.error('❌ 示例运行失败:', error.message);
        console.error(error.stack);
    }
}

/**
 * 演示代理的基本使用
 */
async function demonstrateBasicUsage() {
    console.log('\n=== 基本使用演示 ===\n');
    
    const proxy = new NodeMITMProxy();
    
    try {
        // 使用默认配置启动
        await proxy.initialize();
        await proxy.start(); // 默认端口8080
        
        console.log('代理已启动，可以进行以下操作:');
        console.log('1. 设置浏览器代理为 localhost:8080');
        console.log('2. 访问任意网站查看代理效果');
        console.log('3. 按 Ctrl+C 停止代理');
        
        // 监听进程退出信号
        process.on('SIGINT', async () => {
            console.log('\n正在关闭代理服务器...');
            await proxy.stop();
            console.log('代理服务器已关闭');
            process.exit(0);
        });
        
        // 保持运行
        await new Promise(() => {});
        
    } catch (error) {
        console.error('基本使用演示失败:', error.message);
        await proxy.stop();
    }
}

// 如果直接运行此文件
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--basic')) {
        demonstrateBasicUsage().catch(console.error);
    } else {
        demonstrateMinimalConfig().catch(console.error);
    }
}

module.exports = {
    demonstrateMinimalConfig,
    demonstrateBasicUsage
};