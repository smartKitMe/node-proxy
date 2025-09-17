#!/usr/bin/env node

/**
 * HTTPS测试运行器
 * 用于运行单个或所有HTTPS测试用例
 */

const path = require('path');
const fs = require('fs');

// 获取命令行参数
const args = process.argv.slice(2);
const testCases = {
    '1': 'https-test-case-1-minimal-config.js',
    '2': 'https-test-case-2-direct-response.js',
    '3': 'https-test-case-3-modify-and-forward.js',
    '4': 'https-test-case-4-socks5-proxy.js',
    'all': 'run-all-https-tests.js'
};

function showHelp() {
    console.log(`
HTTPS测试运行器
==============

用法:
  node https-test-runner.js [选项] [测试用例]

选项:
  -h, --help    显示帮助信息

测试用例:
  1    运行测试用例1: 最小配置启动HTTPS代理
  2    运行测试用例2: Direct Response模式测试
  3    运行测试用例3: Modify And Forward模式测试
  4    运行测试用例4: SOCKS5代理转发测试
  all  运行所有HTTPS测试用例

示例:
  node https-test-runner.js 1
  node https-test-runner.js all
  node https-test-runner.js --help
    `);
}

async function runTest(testFile) {
    try {
        const testPath = path.join(__dirname, testFile);
        if (!fs.existsSync(testPath)) {
            console.error(`❌ 测试文件不存在: ${testFile}`);
            return false;
        }
        
        console.log(`🚀 正在运行测试: ${testFile}`);
        const testModule = require(testPath);
        
        if (typeof testModule === 'function') {
            // 如果是函数，直接调用
            await testModule();
        } else if (testModule && typeof testModule.runAllTests === 'function') {
            // 如果有runAllTests方法，调用它
            await testModule.runAllTests();
        } else if (testModule && typeof testModule.default === 'function') {
            // 如果有default导出，调用它
            await testModule.default();
        } else {
            console.error(`❌ 测试文件格式不正确: ${testFile}`);
            return false;
        }
        
        console.log(`✅ 测试完成: ${testFile}\n`);
        return true;
    } catch (error) {
        console.error(`❌ 测试执行失败: ${testFile}`);
        console.error(`错误信息: ${error.message}`);
        return false;
    }
}

async function main() {
    // 检查帮助参数
    if (args.includes('-h') || args.includes('--help') || args.length === 0) {
        showHelp();
        return;
    }
    
    const testCase = args[0];
    
    if (testCase === 'all') {
        // 运行所有测试
        await runTest(testCases['all']);
    } else if (testCases[testCase]) {
        // 运行指定测试用例
        await runTest(testCases[testCase]);
    } else {
        console.error(`❌ 未知的测试用例: ${testCase}`);
        showHelp();
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main().catch(error => {
        console.error('运行测试时发生错误:', error);
        process.exit(1);
    });
}

module.exports = { runTest, testCases };