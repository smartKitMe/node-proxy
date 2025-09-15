/**
 * 代理 Agent 本地功能测试
 * 测试优化后的 ProxyHttpAgent 和 ProxyHttpsAgent 的基本功能
 */

const ProxyHttpAgent = require('../src/common/ProxyHttpAgent');
const ProxyHttpsAgent = require('../src/common/ProxyHttpsAgent');
const util = require('../src/common/util');
const colors = require('colors');

/**
 * 测试 Agent 实例化和配置
 */
function testAgentInstantiation() {
    console.log(colors.cyan('\n=== 测试 Agent 实例化 ==='));
    
    try {
        // 测试 HTTP Agent
        const httpAgent = new ProxyHttpAgent({
            enableDebugLogs: true,
            enablePerformanceMetrics: true,
            maxSockets: 128,
            maxFreeSockets: 128
        });
        
        console.log(colors.green('✅ ProxyHttpAgent 实例化成功'));
        console.log(`   maxSockets: ${httpAgent.maxSockets}`);
        console.log(`   maxFreeSockets: ${httpAgent.maxFreeSockets}`);
        console.log(`   keepAlive: ${httpAgent.keepAlive}`);
        
        // 测试 HTTPS Agent
        const httpsAgent = new ProxyHttpsAgent({
            enableDebugLogs: true,
            enablePerformanceMetrics: true,
            maxSockets: 128,
            maxFreeSockets: 128
        });
        
        console.log(colors.green('✅ ProxyHttpsAgent 实例化成功'));
        console.log(`   maxSockets: ${httpsAgent.maxSockets}`);
        console.log(`   maxFreeSockets: ${httpsAgent.maxFreeSockets}`);
        console.log(`   keepAlive: ${httpsAgent.keepAlive}`);
        console.log(`   rejectUnauthorized: ${httpsAgent.options.rejectUnauthorized}`);
        
        return { httpAgent, httpsAgent };
        
    } catch (error) {
        console.log(colors.red('❌ Agent 实例化失败:'), error.message);
        return null;
    }
}

/**
 * 测试性能统计功能
 */
function testPerformanceStats(agents) {
    console.log(colors.cyan('\n=== 测试性能统计功能 ==='));
    
    try {
        const { httpAgent, httpsAgent } = agents;
        
        // 测试获取初始统计
        const httpStats = httpAgent.getPerformanceStats();
        const httpsStats = httpsAgent.getPerformanceStats();
        
        console.log(colors.green('✅ HTTP Agent 统计获取成功:'));
        console.log(`   totalRequests: ${httpStats.totalRequests}`);
        console.log(`   activeConnections: ${httpStats.activeConnections}`);
        console.log(`   reuseRate: ${httpStats.reuseRate}%`);
        
        console.log(colors.green('✅ HTTPS Agent 统计获取成功:'));
        console.log(`   totalRequests: ${httpsStats.totalRequests}`);
        console.log(`   activeConnections: ${httpsStats.activeConnections}`);
        console.log(`   sslHandshakes: ${httpsStats.sslHandshakes}`);
        console.log(`   reuseRate: ${httpsStats.reuseRate}%`);
        
        // 测试重置统计
        httpAgent.resetStats();
        httpsAgent.resetStats();
        
        const resetHttpStats = httpAgent.getPerformanceStats();
        const resetHttpsStats = httpsAgent.getPerformanceStats();
        
        if (resetHttpStats.totalRequests === 0 && resetHttpsStats.totalRequests === 0) {
            console.log(colors.green('✅ 统计重置功能正常'));
        } else {
            console.log(colors.red('❌ 统计重置功能异常'));
        }
        
        return true;
        
    } catch (error) {
        console.log(colors.red('❌ 性能统计测试失败:'), error.message);
        return false;
    }
}

/**
 * 测试 getName 方法
 */
function testGetNameMethod(agents) {
    console.log(colors.cyan('\n=== 测试 getName 方法 ==='));
    
    try {
        const { httpAgent, httpsAgent } = agents;
        
        // 测试基本 getName
        const basicOptions = {
            host: 'example.com',
            port: 80
        };
        
        const httpName = httpAgent.getName(basicOptions);
        console.log(colors.green('✅ HTTP getName 基本功能:'), httpName);
        
        // 测试带 customSocketId 的 getName
        const ntlmOptions = {
            host: 'example.com',
            port: 80,
            customSocketId: 'ntlm_12345'
        };
        
        const httpNameWithId = httpAgent.getName(ntlmOptions);
        console.log(colors.green('✅ HTTP getName NTLM 功能:'), httpNameWithId);
        
        // 测试 HTTPS
        const httpsOptions = {
            host: 'secure.example.com',
            port: 443
        };
        
        const httpsName = httpsAgent.getName(httpsOptions);
        console.log(colors.green('✅ HTTPS getName 基本功能:'), httpsName);
        
        return true;
        
    } catch (error) {
        console.log(colors.red('❌ getName 方法测试失败:'), error.message);
        return false;
    }
}

/**
 * 测试 util 模块的代理相关功能
 */
function testUtilFunctions() {
    console.log(colors.cyan('\n=== 测试 Util 模块功能 ==='));
    
    try {
        // 测试获取 Agent 统计
        const agentStats = util.getAgentStats();
        console.log(colors.green('✅ getAgentStats 功能正常'));
        console.log(`   HTTP Agent 存在: ${agentStats.http !== null}`);
        console.log(`   HTTPS Agent 存在: ${agentStats.https !== null}`);
        
        // 测试设置调试日志
        util.setProxyDebugLogs(false);
        console.log(colors.green('✅ setProxyDebugLogs 功能正常'));
        
        // 测试设置性能监控
        util.setProxyPerformanceMetrics(false);
        console.log(colors.green('✅ setProxyPerformanceMetrics 功能正常'));
        
        // 测试重置统计
        util.resetAgentStats();
        console.log(colors.green('✅ resetAgentStats 功能正常'));
        
        return true;
        
    } catch (error) {
        console.log(colors.red('❌ Util 模块测试失败:'), error.message);
        return false;
    }
}

/**
 * 测试配置参数验证
 */
function testConfigurationValidation() {
    console.log(colors.cyan('\n=== 测试配置参数验证 ==='));
    
    try {
        // 测试自定义配置
        const customHttpAgent = new ProxyHttpAgent({
            maxSockets: 512,
            maxFreeSockets: 256,
            timeout: 30000,
            keepAliveMsecs: 15000,
            enableDebugLogs: false,
            enablePerformanceMetrics: false
        });
        
        console.log(colors.green('✅ 自定义 HTTP Agent 配置成功'));
        console.log(`   maxSockets: ${customHttpAgent.maxSockets}`);
        console.log(`   timeout: ${customHttpAgent.timeout}`);
        
        const customHttpsAgent = new ProxyHttpsAgent({
            maxSockets: 512,
            maxFreeSockets: 256,
            timeout: 30000,
            keepAliveMsecs: 15000,
            rejectUnauthorized: true,
            enableDebugLogs: false,
            enablePerformanceMetrics: false
        });
        
        console.log(colors.green('✅ 自定义 HTTPS Agent 配置成功'));
        console.log(`   maxSockets: ${customHttpsAgent.maxSockets}`);
        console.log(`   rejectUnauthorized: ${customHttpsAgent.options.rejectUnauthorized}`);
        
        // 测试销毁功能
        customHttpAgent.destroy();
        customHttpsAgent.destroy();
        console.log(colors.green('✅ Agent 销毁功能正常'));
        
        return true;
        
    } catch (error) {
        console.log(colors.red('❌ 配置参数验证失败:'), error.message);
        return false;
    }
}

/**
 * 主测试函数
 */
function runLocalTest() {
    console.log(colors.rainbow('\n🧪 代理 Agent 本地功能测试开始'));
    
    const results = {
        instantiation: false,
        performanceStats: false,
        getNameMethod: false,
        utilFunctions: false,
        configValidation: false
    };
    
    // 1. 测试实例化
    const agents = testAgentInstantiation();
    if (agents) {
        results.instantiation = true;
        
        // 2. 测试性能统计
        results.performanceStats = testPerformanceStats(agents);
        
        // 3. 测试 getName 方法
        results.getNameMethod = testGetNameMethod(agents);
        
        // 清理
        agents.httpAgent.destroy();
        agents.httpsAgent.destroy();
    }
    
    // 4. 测试 util 功能
    results.utilFunctions = testUtilFunctions();
    
    // 5. 测试配置验证
    results.configValidation = testConfigurationValidation();
    
    // 输出测试结果
    console.log(colors.blue('\n=== 测试结果汇总 ==='));
    
    const testItems = [
        { name: 'Agent 实例化', result: results.instantiation },
        { name: '性能统计功能', result: results.performanceStats },
        { name: 'getName 方法', result: results.getNameMethod },
        { name: 'Util 模块功能', result: results.utilFunctions },
        { name: '配置参数验证', result: results.configValidation }
    ];
    
    let passedCount = 0;
    testItems.forEach(item => {
        const status = item.result ? colors.green('✅ 通过') : colors.red('❌ 失败');
        console.log(`${item.name}: ${status}`);
        if (item.result) passedCount++;
    });
    
    const totalTests = testItems.length;
    const successRate = ((passedCount / totalTests) * 100).toFixed(1);
    
    console.log(colors.cyan(`\n测试通过率: ${passedCount}/${totalTests} (${successRate}%)`));
    
    if (passedCount === totalTests) {
        console.log(colors.green('🎉 所有测试通过！代理 Agent 优化功能正常'));
    } else {
        console.log(colors.yellow('⚠️  部分测试失败，请检查相关功能'));
    }
    
    console.log(colors.rainbow('\n🏁 本地功能测试完成'));
    
    return passedCount === totalTests;
}

// 如果直接运行此脚本
if (require.main === module) {
    runLocalTest();
}

module.exports = {
    runLocalTest,
    testAgentInstantiation,
    testPerformanceStats,
    testGetNameMethod,
    testUtilFunctions,
    testConfigurationValidation
};