#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const colors = require('colors');

console.log(colors.cyan('=== 选择性拦截功能部署工具 ===\n'));

// 检查文件是否存在
function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (e) {
        return false;
    }
}

// 备份文件
function backupFile(filePath) {
    const backupPath = filePath + '.backup.' + Date.now();
    try {
        fs.copyFileSync(filePath, backupPath);
        console.log(colors.green(`✓ 已备份: ${path.basename(filePath)} -> ${path.basename(backupPath)}`));
        return backupPath;
    } catch (error) {
        console.error(colors.red(`✗ 备份失败: ${error.message}`));
        return null;
    }
}

// 创建配置文件模板
function createConfigTemplate() {
    const configPath = path.join(__dirname, 'selective-intercept-config.js');
    
    if (fileExists(configPath)) {
        console.log(colors.yellow(`配置文件已存在: ${configPath}`));
        return configPath;
    }
    
    const configContent = `// 选择性拦截配置
module.exports = {
    // 需要拦截的域名列表（支持子域名匹配）
    domains: [
        // 'api.example.com',
        // 'auth.mysite.com'
    ],
    
    // 需要拦截的完整URL列表
    urls: [
        // 'cdn.example.com/api/v1/user'
    ],
    
    // 需要拦截的URL前缀列表
    urlPrefixes: [
        // 'api.example.com/v1/',
        // 'auth.mysite.com/oauth/'
    ],
    
    // 需要拦截的路径前缀列表
    pathPrefixes: [
        // '/api/',
        // '/auth/',
        // '/admin/'
    ],
    
    // 强制快速模式的域名列表
    fastDomains: [
        'cdn.jsdelivr.net',
        'fonts.googleapis.com',
        'ajax.googleapis.com',
        'unpkg.com',
        'cdnjs.cloudflare.com'
    ],
    
    // 静态资源扩展名（自动走快速模式）
    staticExtensions: [
        '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
        '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.pdf', '.zip',
        '.webp', '.avif', '.webm', '.ogg'
    ]
};
`;
    
    try {
        fs.writeFileSync(configPath, configContent);
        console.log(colors.green(`✓ 已创建配置文件: ${configPath}`));
        return configPath;
    } catch (error) {
        console.error(colors.red(`✗ 创建配置文件失败: ${error.message}`));
        return null;
    }
}

// 创建使用示例
function createUsageExample() {
    const examplePath = path.join(__dirname, 'selective-intercept-usage.js');
    
    if (fileExists(examplePath)) {
        console.log(colors.yellow(`使用示例已存在: ${examplePath}`));
        return examplePath;
    }
    
    const exampleContent = `const mitmproxy = require('./src/index');
const interceptConfig = require('./selective-intercept-config');

// 请求拦截器
function requestInterceptor(rOptions, req, res, ssl, next) {
    console.log('拦截请求:', req.headers.host + req.url);
    
    // 在这里添加你的请求处理逻辑
    // 例如：修改请求头、记录日志、验证权限等
    
    next();
}

// 响应拦截器
function responseInterceptor(req, res, proxyReq, proxyRes, ssl, next) {
    console.log('拦截响应:', req.headers.host + req.url, '状态码:', proxyRes.statusCode);
    
    // 在这里添加你的响应处理逻辑
    // 例如：修改响应头、记录日志、数据转换等
    
    next();
}

// 创建代理服务器
mitmproxy.createProxy({
    port: 8080,
    requestInterceptor,
    responseInterceptor,
    interceptConfig  // 使用选择性拦截配置
});

console.log('选择性拦截代理服务器已启动在端口 8080');
`;
    
    try {
        fs.writeFileSync(examplePath, exampleContent);
        console.log(colors.green(`✓ 已创建使用示例: ${examplePath}`));
        return examplePath;
    } catch (error) {
        console.error(colors.red(`✗ 创建使用示例失败: ${error.message}`));
        return null;
    }
}

// 创建性能测试脚本
function createPerformanceTest() {
    const testPath = path.join(__dirname, 'selective-intercept-test.js');
    
    if (fileExists(testPath)) {
        console.log(colors.yellow(`性能测试脚本已存在: ${testPath}`));
        return testPath;
    }
    
    const testContent = `const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

// 测试配置
const TEST_CONFIG = {
    proxyHost: 'localhost',
    proxyPort: 8080,
    testUrls: [
        'http://httpbin.org/get',  // 应该被拦截
        'http://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js',  // 快速模式
        'http://fonts.googleapis.com/css?family=Roboto',  // 快速模式
        'http://httpbin.org/api/test',  // 应该被拦截（如果配置了/api/前缀）
    ],
    concurrency: 10,
    totalRequests: 100
};

// 发送代理请求
function makeProxyRequest(url) {
    return new Promise((resolve, reject) => {
        const startTime = performance.now();
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const options = {
            hostname: TEST_CONFIG.proxyHost,
            port: TEST_CONFIG.proxyPort,
            path: url,
            method: 'GET',
            headers: {
                'Host': urlObj.hostname,
                'User-Agent': 'SelectiveInterceptTest/1.0'
            }
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const endTime = performance.now();
                resolve({
                    url,
                    statusCode: res.statusCode,
                    latency: endTime - startTime,
                    size: data.length,
                    intercepted: res.headers['x-proxy-processed'] === 'true'
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.abort();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// 运行性能测试
async function runPerformanceTest() {
    console.log('开始选择性拦截性能测试...');
    console.log('配置:', TEST_CONFIG);
    console.log('');
    
    const results = [];
    const startTime = performance.now();
    
    // 并发测试
    const promises = [];
    for (let i = 0; i < TEST_CONFIG.totalRequests; i++) {
        const url = TEST_CONFIG.testUrls[i % TEST_CONFIG.testUrls.length];
        promises.push(makeProxyRequest(url));
        
        // 控制并发数
        if (promises.length >= TEST_CONFIG.concurrency) {
            const batch = await Promise.allSettled(promises.splice(0, TEST_CONFIG.concurrency));
            batch.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    console.error('请求失败:', result.reason.message);
                }
            });
        }
    }
    
    // 处理剩余请求
    if (promises.length > 0) {
        const batch = await Promise.allSettled(promises);
        batch.forEach(result => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error('请求失败:', result.reason.message);
            }
        });
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // 统计结果
    const interceptedRequests = results.filter(r => r.intercepted);
    const fastRequests = results.filter(r => !r.intercepted);
    const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
    const avgInterceptedLatency = interceptedRequests.length > 0 ? 
        interceptedRequests.reduce((sum, r) => sum + r.latency, 0) / interceptedRequests.length : 0;
    const avgFastLatency = fastRequests.length > 0 ? 
        fastRequests.reduce((sum, r) => sum + r.latency, 0) / fastRequests.length : 0;
    
    console.log('\n=== 性能测试结果 ===');
    console.log('总请求数: ' + results.length);
    console.log('总耗时: ' + totalTime.toFixed(2) + 'ms');
    console.log('平均延迟: ' + avgLatency.toFixed(2) + 'ms');
    console.log('请求/秒: ' + (results.length / (totalTime / 1000)).toFixed(2));
    console.log('');
    console.log('拦截请求: ' + interceptedRequests.length + ' (' + (interceptedRequests.length / results.length * 100).toFixed(1) + '%)');
    console.log('拦截请求平均延迟: ' + avgInterceptedLatency.toFixed(2) + 'ms');
    console.log('');
    console.log('快速请求: ' + fastRequests.length + ' (' + (fastRequests.length / results.length * 100).toFixed(1) + '%)');
    console.log('快速请求平均延迟: ' + avgFastLatency.toFixed(2) + 'ms');
    console.log('');
    
    if (avgFastLatency > 0 && avgInterceptedLatency > 0) {
        const speedup = avgInterceptedLatency / avgFastLatency;
        console.log('快速模式提升: ' + speedup.toFixed(2) + 'x');
    }
}

// 检查代理服务器是否运行
function checkProxyServer() {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: TEST_CONFIG.proxyHost,
            port: TEST_CONFIG.proxyPort,
            path: 'http://httpbin.org/get',
            method: 'GET',
            timeout: 2000
        }, () => {
            resolve(true);
        });
        
        req.on('error', () => resolve(false));
        req.on('timeout', () => resolve(false));
        req.end();
    });
}

// 主函数
async function main() {
    console.log('检查代理服务器状态...');
    const isRunning = await checkProxyServer();
    
    if (!isRunning) {
        console.error('代理服务器未运行，请先启动代理服务器');
        console.log('运行: node selective-intercept-usage.js');
        process.exit(1);
    }
    
    console.log('代理服务器运行正常，开始测试...');
    await runPerformanceTest();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { runPerformanceTest: runPerformanceTest, checkProxyServer: checkProxyServer };
`;
    
    try {
        fs.writeFileSync(testPath, testContent);
        console.log(colors.green(`✓ 已创建性能测试脚本: ${testPath}`));
        return testPath;
    } catch (error) {
        console.error(colors.red(`✗ 创建性能测试脚本失败: ${error.message}`));
        return null;
    }
}

// 主函数
function main() {
    console.log('正在部署选择性拦截功能...');
    console.log('');
    
    // 检查核心文件
    const indexPath = path.join(__dirname, 'src/mitmproxy/index.js');
    const handlerPath = path.join(__dirname, 'src/mitmproxy/createRequestHandler.js');
    
    if (!fileExists(indexPath)) {
        console.error(colors.red(`✗ 核心文件不存在: ${indexPath}`));
        process.exit(1);
    }
    
    if (!fileExists(handlerPath)) {
        console.error(colors.red(`✗ 核心文件不存在: ${handlerPath}`));
        process.exit(1);
    }
    
    console.log(colors.green('✓ 核心文件检查通过'));
    console.log('');
    
    // 创建配置和示例文件
    const configPath = createConfigTemplate();
    const examplePath = createUsageExample();
    const testPath = createPerformanceTest();
    
    console.log('');
    console.log(colors.cyan('=== 部署完成 ==='));
    console.log('');
    console.log('📁 生成的文件:');
    if (configPath) console.log(`   ${colors.yellow('配置文件:')} ${path.basename(configPath)}`);
    if (examplePath) console.log(`   ${colors.yellow('使用示例:')} ${path.basename(examplePath)}`);
    if (testPath) console.log(`   ${colors.yellow('性能测试:')} ${path.basename(testPath)}`);
    console.log('');
    console.log('🚀 快速开始:');
    console.log(`   1. 编辑配置: ${colors.cyan('nano selective-intercept-config.js')}`);
    console.log(`   2. 启动代理: ${colors.cyan('node selective-intercept-usage.js')}`);
    console.log(`   3. 性能测试: ${colors.cyan('node selective-intercept-test.js')}`);
    console.log('');
    console.log('📖 功能说明:');
    console.log('   • 只有匹配配置规则的请求才会触发拦截器');
    console.log('   • 静态资源和快速域名自动走快速代理模式');
    console.log('   • 大幅提升非拦截请求的处理性能');
    console.log('   • 支持域名、URL、路径前缀等多种匹配方式');
    console.log('');
}

if (require.main === module) {
    main();
}

module.exports = {
    createConfigTemplate: createConfigTemplate,
    createUsageExample: createUsageExample,
    createPerformanceTest: createPerformanceTest
};