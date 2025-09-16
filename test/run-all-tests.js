const MinimalConfigTest = require('./test-case-1-minimal-config');
const DirectResponseTest = require('./test-case-2-direct-response');
const ModifyAndForwardTest = require('./test-case-3-modify-and-forward');
const Socks5ProxyTest = require('./test-case-4-socks5-proxy');

/**
 * 综合测试运行器
 * 运行所有测试用例并生成汇总报告
 */
class TestRunner {
    constructor() {
        this.logger = {
            info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
            debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || ''),
            error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
            warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
        };
        
        this.testSuites = [
            {
                name: '测试用例1：最小配置启动代理',
                class: MinimalConfigTest,
                description: '验证代理服务器能够使用最小配置正常启动和关闭'
            },
            {
                name: '测试用例2：Direct Response拦截',
                class: DirectResponseTest,
                description: '验证拦截器能够直接返回自定义响应，不进行实际网络请求'
            },
            {
                name: '测试用例3：Modify And Forward拦截',
                class: ModifyAndForwardTest,
                description: '验证拦截器能够修改请求参数后转发到目标服务器'
            },
            {
                name: '测试用例4：SOCKS5代理转发',
                class: Socks5ProxyTest,
                description: '验证代理服务器能够通过SOCKS5代理进行转发'
            }
        ];
        
        this.results = [];
    }
    
    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🚀 NodeMITMProxy 综合测试开始\n');
        console.log('=' .repeat(80));
        
        const startTime = Date.now();
        
        for (let i = 0; i < this.testSuites.length; i++) {
            const suite = this.testSuites[i];
            
            console.log(`\n📋 运行 ${suite.name}`);
            console.log(`📝 描述: ${suite.description}`);
            console.log('-'.repeat(80));
            
            try {
                const testInstance = new suite.class();
                const suiteStartTime = Date.now();
                
                await testInstance.runAllTests();
                
                const suiteEndTime = Date.now();
                const duration = suiteEndTime - suiteStartTime;
                
                this.results.push({
                    name: suite.name,
                    success: true,
                    duration,
                    error: null
                });
                
                console.log(`✅ ${suite.name} 完成 (耗时: ${duration}ms)`);
                
            } catch (error) {
                const suiteEndTime = Date.now();
                const duration = suiteEndTime - (this.results[i]?.startTime || startTime);
                
                this.results.push({
                    name: suite.name,
                    success: false,
                    duration,
                    error: error.message
                });
                
                console.log(`❌ ${suite.name} 失败: ${error.message}`);
            }
            
            // 在测试之间等待一段时间，确保端口释放
            if (i < this.testSuites.length - 1) {
                console.log('⏳ 等待端口释放...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        const endTime = Date.now();
        const totalDuration = endTime - startTime;
        
        this.printSummaryReport(totalDuration);
    }
    
    /**
     * 运行单个测试
     */
    async runSingleTest(testNumber) {
        if (testNumber < 1 || testNumber > this.testSuites.length) {
            console.error(`❌ 无效的测试编号: ${testNumber}`);
            console.log(`可用的测试编号: 1-${this.testSuites.length}`);
            return;
        }
        
        const suite = this.testSuites[testNumber - 1];
        
        console.log(`🚀 运行单个测试: ${suite.name}\n`);
        console.log('=' .repeat(80));
        
        try {
            const testInstance = new suite.class();
            const startTime = Date.now();
            
            await testInstance.runAllTests();
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.log(`\n✅ 测试完成 (耗时: ${duration}ms)`);
            
        } catch (error) {
            console.log(`\n❌ 测试失败: ${error.message}`);
        }
    }
    
    /**
     * 打印汇总报告
     */
    printSummaryReport(totalDuration) {
        console.log('\n\n');
        console.log('=' .repeat(80));
        console.log('📊 测试汇总报告');
        console.log('=' .repeat(80));
        
        const successCount = this.results.filter(r => r.success).length;
        const failureCount = this.results.filter(r => !r.success).length;
        
        console.log(`\n📈 总体统计:`);
        console.log(`   总测试数: ${this.results.length}`);
        console.log(`   成功: ${successCount}`);
        console.log(`   失败: ${failureCount}`);
        console.log(`   成功率: ${((successCount / this.results.length) * 100).toFixed(1)}%`);
        console.log(`   总耗时: ${totalDuration}ms`);
        
        console.log(`\n📋 详细结果:`);
        this.results.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            const duration = `${result.duration}ms`;
            console.log(`   ${index + 1}. ${status} ${result.name} (${duration})`);
            
            if (!result.success && result.error) {
                console.log(`      错误: ${result.error}`);
            }
        });
        
        if (failureCount > 0) {
            console.log(`\n⚠️  失败的测试:`);
            this.results
                .filter(r => !r.success)
                .forEach((result, index) => {
                    console.log(`   ${index + 1}. ${result.name}`);
                    console.log(`      错误: ${result.error}`);
                });
        }
        
        console.log(`\n🎯 建议:`);
        if (successCount === this.results.length) {
            console.log('   🎉 所有测试都通过了！代理功能工作正常。');
        } else {
            console.log('   🔧 请检查失败的测试，确保:');
            console.log('      - 网络连接正常');
            console.log('      - 端口没有被占用');
            console.log('      - SOCKS5代理服务器可访问（如果测试SOCKS5功能）');
        }
        
        console.log(`\n📚 使用说明:`);
        console.log('   - 运行所有测试: node test/run-all-tests.js');
        console.log('   - 运行单个测试: node test/run-all-tests.js --test <编号>');
        console.log('   - 查看帮助: node test/run-all-tests.js --help');
        
        console.log('\n' + '=' .repeat(80));
        
        const overallSuccess = failureCount === 0;
        console.log(`🏁 测试${overallSuccess ? '全部通过' : '存在失败'} - ${new Date().toLocaleString()}`);
        
        return overallSuccess;
    }
    
    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log('NodeMITMProxy 测试运行器\n');
        
        console.log('用法:');
        console.log('  node test/run-all-tests.js [选项]\n');
        
        console.log('选项:');
        console.log('  --help, -h          显示帮助信息');
        console.log('  --test <编号>       运行指定编号的测试');
        console.log('  --list, -l          列出所有可用的测试\n');
        
        console.log('示例:');
        console.log('  node test/run-all-tests.js                    # 运行所有测试');
        console.log('  node test/run-all-tests.js --test 1           # 运行测试1');
        console.log('  node test/run-all-tests.js --list             # 列出所有测试\n');
    }
    
    /**
     * 列出所有测试
     */
    listTests() {
        console.log('可用的测试用例:\n');
        
        this.testSuites.forEach((suite, index) => {
            console.log(`${index + 1}. ${suite.name}`);
            console.log(`   描述: ${suite.description}\n`);
        });
    }
}

// 命令行参数处理
if (require.main === module) {
    const args = process.argv.slice(2);
    const runner = new TestRunner();
    
    if (args.includes('--help') || args.includes('-h')) {
        runner.showHelp();
    } else if (args.includes('--list') || args.includes('-l')) {
        runner.listTests();
    } else if (args.includes('--test')) {
        const testIndex = args.indexOf('--test');
        const testNumber = parseInt(args[testIndex + 1]);
        
        if (isNaN(testNumber)) {
            console.error('❌ 请提供有效的测试编号');
            runner.listTests();
        } else {
            runner.runSingleTest(testNumber).catch(console.error);
        }
    } else {
        runner.runAllTests().catch(console.error);
    }
}

module.exports = TestRunner;