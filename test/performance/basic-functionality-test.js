/**
 * 基本功能测试脚本
 * 验证NodeMITMProxy的基本功能是否正常工作
 */

const { NodeMITMProxy } = require('../../src/index');
const http = require('http');

async function testBasicFunctionality() {
    console.log('开始基本功能测试...\n');
    
    let proxy;
    
    try {
        // 启动代理服务器
        console.log('1. 启动代理服务器...');
        proxy = new NodeMITMProxy({
            config: {
                port: 8080,
                host: 'localhost'
            },
            logger: {
                level: 'info'
            }
        });
        
        await proxy.initialize();
        await proxy.start(8080, 'localhost');
        console.log('   ✓ 代理服务器启动成功\n');
        
        // 测试服务器信息获取
        console.log('2. 测试服务器信息获取...');
        const serverInfo = proxy.getServerInfo();
        console.log('   服务器信息:', serverInfo);
        console.log('   ✓ 服务器信息获取成功\n');
        
        // 测试配置获取
        console.log('3. 测试配置获取...');
        const config = proxy.getConfig();
        console.log('   配置信息:', typeof config);
        console.log('   ✓ 配置获取成功\n');
        
        // 测试统计信息获取
        console.log('4. 测试统计信息获取...');
        const stats = proxy.getStats();
        console.log('   统计信息:', Object.keys(stats));
        console.log('   ✓ 统计信息获取成功\n');
        
        console.log('所有基本功能测试通过!');
        
    } catch (error) {
        console.error('测试过程中发生错误:', error.message);
        console.error(error.stack);
    } finally {
        // 关闭代理服务器
        if (proxy) {
            try {
                console.log('\n5. 关闭代理服务器...');
                await proxy.stop();
                console.log('   ✓ 代理服务器关闭成功');
            } catch (error) {
                console.error('关闭代理服务器时发生错误:', error.message);
            }
        }
    }
}

// 如果直接运行此文件
if (require.main === module) {
    testBasicFunctionality().catch(console.error);
}

module.exports = {
    testBasicFunctionality
};