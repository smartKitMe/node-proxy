const { NodeMITMProxy } = require('../src/index');

/**
 * 简化的重构版本测试
 * 验证基本功能是否正常工作
 */
class SimpleRefactoredTest {
    constructor() {
        this.proxy = null;
    }

    /**
     * 运行简单测试
     */
    async run() {
        console.log('开始简化的重构版本测试...');
        
        try {
            // 创建代理实例
            this.proxy = new NodeMITMProxy({
                port: 8080,
                host: '127.0.0.1'
            });
            
            console.log('代理实例创建成功');
            
            // 初始化
            await this.proxy.initialize();
            console.log('代理初始化成功');
            
            // 启动代理
            await this.proxy.start(8080, '127.0.0.1');
            console.log('代理启动成功');
            
            // 获取服务器信息
            const serverInfo = this.proxy.getServerInfo();
            console.log('服务器信息:', serverInfo);
            
            // 获取版本信息
            const version = this.proxy.getVersion();
            console.log('版本信息:', version);
            
            // 等待一秒
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 停止代理
            await this.proxy.stop();
            console.log('代理停止成功');
            
            console.log('✅ 简化测试通过！重构版本基本功能正常');
            
        } catch (error) {
            console.error('❌ 测试失败:', error.message);
            console.error('错误堆栈:', error.stack);
            
            // 清理
            if (this.proxy) {
                try {
                    await this.proxy.stop();
                } catch (cleanupError) {
                    console.error('清理失败:', cleanupError.message);
                }
            }
            
            process.exit(1);
        }
    }
}

// 运行测试
if (require.main === module) {
    const test = new SimpleRefactoredTest();
    test.run().then(() => {
        console.log('测试完成');
        process.exit(0);
    }).catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = SimpleRefactoredTest;