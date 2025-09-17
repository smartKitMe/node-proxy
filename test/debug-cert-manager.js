const { NodeMITMProxy } = require('../src/index');
const path = require('path');
const fs = require('fs');

/**
 * 调试证书管理器初始化过程的脚本
 */
async function debugCertManager() {
    console.log('🔍 调试证书管理器初始化...');
    
    try {
        // 检查证书文件是否存在
        const certPath = path.join(__dirname, '../certs/server.crt');
        const keyPath = path.join(__dirname, '../certs/server.key');
        const caPath = path.join(__dirname, '../certs/ca.crt');
        
        console.log('证书文件路径:');
        console.log(`  - 证书: ${certPath}`);
        console.log(`  - 私钥: ${keyPath}`);
        console.log(`  - CA证书: ${caPath}`);
        
        // 读取证书内容进行验证
        console.log('\n读取证书内容...');
        const certContent = fs.readFileSync(certPath, 'utf8');
        const keyContent = fs.readFileSync(keyPath, 'utf8');
        const caContent = fs.readFileSync(caPath, 'utf8');
        
        console.log('证书内容验证:');
        console.log(`  - 证书长度: ${certContent.length}`);
        console.log(`  - 私钥长度: ${keyContent.length}`);
        console.log(`  - CA证书长度: ${caContent.length}`);
        
        // 创建代理实例
        console.log('\n创建代理实例...');
        const config = {
            port: 8449,
            host: 'localhost',
            ssl: {
                enabled: true,
                certificate: {
                    type: 'fixed',
                    key: keyPath,
                    cert: certPath,
                    ca: caPath
                }
            }
        };
        
        console.log('配置对象:', JSON.stringify(config, null, 2));
        
        const proxy = new NodeMITMProxy({
            config: config
        });
        
        console.log('✅ 代理实例创建成功');
        
        // 检查证书管理器
        console.log('\n检查证书管理器...');
        const certManager = proxy.certificateManager;
        if (certManager) {
            console.log('证书管理器存在');
            
            // 检查CA证书状态
            console.log('CA证书状态:');
            console.log(`  - caCert: ${certManager.caCert ? '已加载' : '未加载'}`);
            console.log(`  - caKey: ${certManager.caKey ? '已加载' : '未加载'}`);
            
            // 手动调用初始化
            console.log('\n手动调用证书管理器初始化...');
            await certManager.initialize();
            
            // 再次检查CA证书状态
            console.log('初始化后CA证书状态:');
            console.log(`  - caCert: ${certManager.caCert ? '已加载' : '未加载'}`);
            console.log(`  - caKey: ${certManager.caKey ? '已加载' : '未加载'}`);
            
            if (certManager.caCert) {
                console.log('CA证书主题:', certManager.caCert.subject.getField('CN').value);
            }
            
            // 尝试获取CA证书
            console.log('\n尝试获取CA证书...');
            try {
                const caCert = certManager.getCACertificate();
                console.log('✅ CA证书获取成功');
                console.log(`CA证书长度: ${caCert.cert.length}`);
                console.log(`CA私钥长度: ${caCert.key.length}`);
            } catch (error) {
                console.error('❌ CA证书获取失败:', error.message);
            }
        } else {
            console.log('❌ 未找到证书管理器');
        }
        
        console.log('\n🎉 证书管理器调试完成!');
        
    } catch (error) {
        console.error('❌ 调试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    debugCertManager().catch(console.error);
}

module.exports = debugCertManager;