const { NodeMITMProxy } = require('../src/index');
const fs = require('fs');
const path = require('path');

/**
 * 演示重构版本的固定证书功能
 */
async function demonstrateFixedCert() {
    console.log('=== 固定证书功能演示 ===');
    
    // 示例1：使用证书文件
    console.log('\n1. 使用证书文件方式');
    const proxy1 = new NodeMITMProxy({
        port: 8081,
        fixedCertPath: path.join(__dirname, '../test/fixed-cert.pem'),
        fixedKeyPath: path.join(__dirname, '../test/fixed-key.pem')
    });
    
    await proxy1.initialize();
    await proxy1.start(8081);
    console.log('代理服务器1已启动（使用证书文件）');
    
    // 获取服务器信息
    const info1 = proxy1.getServerInfo();
    console.log('服务器1信息:', info1);
    
    // 示例2：使用证书字符串
    console.log('\n2. 使用证书字符串方式');
    const certStr = fs.readFileSync(path.join(__dirname, '../test/fixed-cert.pem'), 'utf8');
    const keyStr = fs.readFileSync(path.join(__dirname, '../test/fixed-key.pem'), 'utf8');
    
    const proxy2 = new NodeMITMProxy({
        port: 8082,
        fixedCertString: certStr,
        fixedKeyString: keyStr
    });
    
    await proxy2.initialize();
    await proxy2.start(8082);
    console.log('代理服务器2已启动（使用证书字符串）');
    
    // 获取服务器信息
    const info2 = proxy2.getServerInfo();
    console.log('服务器2信息:', info2);
    
    // 等待一段时间后关闭服务器
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 关闭服务器
    await proxy1.stop();
    await proxy2.stop();
    console.log('\n代理服务器已关闭');
    
    // 输出性能统计
    console.log('\n=== 性能统计 ===');
    console.log('服务器1统计:', proxy1.getStats());
    console.log('服务器2统计:', proxy2.getStats());
}

// 运行演示
if (require.main === module) {
    demonstrateFixedCert().catch(error => {
        console.error('演示失败:', error);
        process.exit(1);
    });
}

module.exports = demonstrateFixedCert;