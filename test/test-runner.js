#!/usr/bin/env node

/**
 * Node Proxy 测试运行器
 * 统一管理和执行所有测试用例
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TestRunner {
    constructor() {
        this.testSuites = {
            unit: [
                'basic-proxy.test.js',
                'middleware-system.test.js',
                'interceptor-system.test.js',
                'websocket-proxy.test.js',
                'certificate-management.test.js'
            ],
            integration: [
                'integration.test.js'
            ],
            performance: [
                'performance-monitoring.test.js'
            ]
        };
        
        this.results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0
        };
    }

    /**
     * 运行所有测试
     */
    async runAll() {
        console.log('🚀 开始运行 Node Proxy 测试套件\n');
        
        const startTime = Date.now();
        
        try {
            // 运行单元测试
            await this.runTestSuite('unit', '单元测试');
            
            // 运行集成测试
            await this.runTestSuite('integration', '集成测试');
            
            // 运行性能测试
            await this.runTestSuite('performance', '性能测试');
            
        } catch (error) {
            console.error('❌ 测试运行过程中出现错误:', error.message);
        }
        
        const duration = Date.now() - startTime;
        this.printSummary(duration);
    }

    /**
     * 运行指定类型的测试套件
     */
    async runTestSuite(type, displayName) {
        console.log(`\n📋 运行 ${displayName}`);
        console.log('='.repeat(50));
        
        const testFiles = this.testSuites[type];
        const testDir = path.join(__dirname, type);
        
        // 检查测试目录是否存在
        if (!fs.existsSync(testDir)) {
            console.log(`⚠️  ${displayName} 目录不存在: ${testDir}`);
            return;
        }
        
        for (const testFile of testFiles) {
            const testPath = path.join(testDir, testFile);
            
            // 检查测试文件是否存在
            if (!fs.existsSync(testPath)) {
                console.log(`⚠️  测试文件不存在: ${testFile}`);
                this.results.skipped++;
                continue;
            }
            
            await this.runSingleTest(testPath, testFile);
        }
    }

    /**
     * 运行单个测试文件
     */
    async runSingleTest(testPath, testFile) {
        console.log(`\n🧪 运行测试: ${testFile}`);
        
        return new Promise((resolve) => {
            const mocha = spawn('npx', ['mocha', testPath, '--timeout', '30000', '--reporter', 'spec'], {
                stdio: 'pipe',
                cwd: path.join(__dirname, '..')
            });
            
            let output = '';
            let errorOutput = '';
            
            mocha.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                process.stdout.write(text);
            });
            
            mocha.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                process.stderr.write(text);
            });
            
            mocha.on('close', (code) => {
                this.results.total++;
                
                if (code === 0) {
                    console.log(`✅ ${testFile} 测试通过`);
                    this.results.passed++;
                } else {
                    console.log(`❌ ${testFile} 测试失败 (退出码: ${code})`);
                    this.results.failed++;
                    
                    if (errorOutput) {
                        console.log('错误输出:', errorOutput);
                    }
                }
                
                resolve();
            });
            
            mocha.on('error', (error) => {
                console.error(`❌ 运行 ${testFile} 时出错:`, error.message);
                this.results.failed++;
                this.results.total++;
                resolve();
            });
        });
    }

    /**
     * 运行指定的测试文件
     */
    async runSpecific(testPattern) {
        console.log(`🎯 运行指定测试: ${testPattern}\n`);
        
        const startTime = Date.now();
        
        // 查找匹配的测试文件
        const matchedFiles = this.findMatchingTests(testPattern);
        
        if (matchedFiles.length === 0) {
            console.log(`❌ 未找到匹配的测试文件: ${testPattern}`);
            return;
        }
        
        console.log(`找到 ${matchedFiles.length} 个匹配的测试文件:`);
        matchedFiles.forEach(file => console.log(`  - ${file}`));
        console.log();
        
        for (const testPath of matchedFiles) {
            const testFile = path.basename(testPath);
            await this.runSingleTest(testPath, testFile);
        }
        
        const duration = Date.now() - startTime;
        this.printSummary(duration);
    }

    /**
     * 查找匹配的测试文件
     */
    findMatchingTests(pattern) {
        const matchedFiles = [];
        
        // 遍历所有测试套件
        for (const [type, files] of Object.entries(this.testSuites)) {
            const testDir = path.join(__dirname, type);
            
            if (!fs.existsSync(testDir)) {
                continue;
            }
            
            for (const file of files) {
                const testPath = path.join(testDir, file);
                
                if (fs.existsSync(testPath) && (file.includes(pattern) || type.includes(pattern))) {
                    matchedFiles.push(testPath);
                }
            }
        }
        
        return matchedFiles;
    }

    /**
     * 打印测试结果摘要
     */
    printSummary(duration) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 测试结果摘要');
        console.log('='.repeat(60));
        
        console.log(`总测试文件: ${this.results.total}`);
        console.log(`✅ 通过: ${this.results.passed}`);
        console.log(`❌ 失败: ${this.results.failed}`);
        console.log(`⚠️  跳过: ${this.results.skipped}`);
        console.log(`⏱️  耗时: ${(duration / 1000).toFixed(2)}s`);
        
        const successRate = this.results.total > 0 ? 
            ((this.results.passed / this.results.total) * 100).toFixed(1) : 0;
        console.log(`📈 成功率: ${successRate}%`);
        
        if (this.results.failed > 0) {
            console.log('\n❌ 存在失败的测试，请检查上述错误信息');
            process.exit(1);
        } else {
            console.log('\n🎉 所有测试都通过了！');
        }
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log(`
Node Proxy 测试运行器

用法:
  node test-runner.js [选项] [测试模式]

选项:
  --help, -h          显示帮助信息
  --specific <pattern> 运行匹配指定模式的测试

测试模式:
  all                 运行所有测试 (默认)
  unit                只运行单元测试
  integration         只运行集成测试
  performance         只运行性能测试

示例:
  node test-runner.js                    # 运行所有测试
  node test-runner.js unit               # 只运行单元测试
  node test-runner.js --specific basic   # 运行包含 'basic' 的测试
  node test-runner.js --specific middleware # 运行中间件相关测试

可用的测试文件:
  单元测试:
    - basic-proxy.test.js           基础代理功能测试
    - middleware-system.test.js     中间件系统测试
    - interceptor-system.test.js    拦截器系统测试
    - websocket-proxy.test.js       WebSocket代理测试
    - certificate-management.test.js 证书管理测试
  
  集成测试:
    - integration.test.js           集成测试
  
  性能测试:
    - performance-monitoring.test.js 性能监控测试
`);
    }
}

// 主程序入口
async function main() {
    const args = process.argv.slice(2);
    const runner = new TestRunner();
    
    // 解析命令行参数
    if (args.includes('--help') || args.includes('-h')) {
        runner.showHelp();
        return;
    }
    
    const specificIndex = args.indexOf('--specific');
    if (specificIndex !== -1 && args[specificIndex + 1]) {
        const pattern = args[specificIndex + 1];
        await runner.runSpecific(pattern);
        return;
    }
    
    const mode = args[0] || 'all';
    
    switch (mode) {
        case 'unit':
            await runner.runTestSuite('unit', '单元测试');
            runner.printSummary(0);
            break;
        case 'integration':
            await runner.runTestSuite('integration', '集成测试');
            runner.printSummary(0);
            break;
        case 'performance':
            await runner.runTestSuite('performance', '性能测试');
            runner.printSummary(0);
            break;
        case 'all':
        default:
            await runner.runAll();
            break;
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 运行主程序
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 测试运行器启动失败:', error);
        process.exit(1);
    });
}

module.exports = TestRunner;