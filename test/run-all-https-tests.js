const HttpsMinimalConfigTest = require('./https-test-case-1-minimal-config');
const HttpsDirectResponseTest = require('./https-test-case-2-direct-response');
const HttpsModifyAndForwardTest = require('./https-test-case-3-modify-and-forward');
const HttpsSocks5ProxyTest = require('./https-test-case-4-socks5-proxy');

/**
 * 运行所有HTTPS测试用例
 */
async function runAllHttpsTests() {
    console.log('开始运行所有HTTPS测试用例...\n');
    
    const testResults = {
        passed: 0,
        failed: 0,
        total: 4,
        details: []
    };
    
    // 测试用例1: 最小配置启动代理
    try {
        console.log('========== HTTPS测试用例1: 最小配置启动代理 ==========');
        const test1 = new HttpsMinimalConfigTest();
        await test1.runAllTests();
        const result1 = test1.testResults;
        testResults.passed += result1.passed;
        testResults.failed += result1.failed;
        testResults.details.push({
            name: 'HTTPS测试用例1: 最小配置启动代理',
            passed: result1.passed,
            failed: result1.failed,
            errors: result1.errors
        });
        console.log('\n');
    } catch (error) {
        console.error('HTTPS测试用例1执行失败:', error.message);
        testResults.failed += 1;
    }
    
    // 测试用例2: Direct Response模式
    try {
        console.log('========== HTTPS测试用例2: Direct Response模式 ==========');
        const test2 = new HttpsDirectResponseTest();
        await test2.runAllTests();
        const result2 = test2.testResults;
        testResults.passed += result2.passed;
        testResults.failed += result2.failed;
        testResults.details.push({
            name: 'HTTPS测试用例2: Direct Response模式',
            passed: result2.passed,
            failed: result2.failed,
            errors: result2.errors
        });
        console.log('\n');
    } catch (error) {
        console.error('HTTPS测试用例2执行失败:', error.message);
        testResults.failed += 1;
    }
    
    // 测试用例3: Modify And Forward模式
    try {
        console.log('========== HTTPS测试用例3: Modify And Forward模式 ==========');
        const test3 = new HttpsModifyAndForwardTest();
        await test3.runAllTests();
        const result3 = test3.testResults;
        testResults.passed += result3.passed;
        testResults.failed += result3.failed;
        testResults.details.push({
            name: 'HTTPS测试用例3: Modify And Forward模式',
            passed: result3.passed,
            failed: result3.failed,
            errors: result3.errors
        });
        console.log('\n');
    } catch (error) {
        console.error('HTTPS测试用例3执行失败:', error.message);
        testResults.failed += 1;
    }
    
    // 测试用例4: SOCKS5代理转发
    try {
        console.log('========== HTTPS测试用例4: SOCKS5代理转发 ==========');
        const test4 = new HttpsSocks5ProxyTest();
        await test4.runAllTests();
        const result4 = test4.testResults;
        testResults.passed += result4.passed;
        testResults.failed += result4.failed;
        testResults.details.push({
            name: 'HTTPS测试用例4: SOCKS5代理转发',
            passed: result4.passed,
            failed: result4.failed,
            errors: result4.errors
        });
        console.log('\n');
    } catch (error) {
        console.error('HTTPS测试用例4执行失败:', error.message);
        testResults.failed += 1;
    }
    
    // 打印总体结果
    console.log('========== HTTPS测试总体结果 ==========');
    console.log(`总测试用例数: ${testResults.total}`);
    console.log(`通过测试数: ${testResults.passed}`);
    console.log(`失败测试数: ${testResults.failed}`);
    
    console.log('\n详细信息:');
    testResults.details.forEach((detail, index) => {
        console.log(`${index + 1}. ${detail.name}`);
        console.log(`   通过: ${detail.passed}, 失败: ${detail.failed}`);
        if (detail.errors.length > 0) {
            console.log('   错误:');
            detail.errors.forEach((error, errorIndex) => {
                console.log(`     ${errorIndex + 1}. ${error}`);
            });
        }
    });
    
    const overallSuccess = testResults.failed === 0;
    console.log(`\n总体结果: ${overallSuccess ? '✓ 所有HTTPS测试通过' : '✗ 存在HTTPS测试失败'}`);
    
    return overallSuccess;
}

// 如果直接运行此文件
if (require.main === module) {
    runAllHttpsTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('运行HTTPS测试时发生错误:', error);
        process.exit(1);
    });
}

module.exports = runAllHttpsTests;