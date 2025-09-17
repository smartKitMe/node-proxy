const { NodeMITMProxy } = require('../src/index');
const path = require('path');
const fs = require('fs');

/**
 * 调试配置传递的脚本
 */
async function debugConfig() {
    console.log('🔍 调试配置传递...');
    
    try {
        // 检查证书文件是否存在
        const certPath = path.join(__dirname, '../certs/server.crt');
        const keyPath = path.join(__dirname, '../certs/server.key');
        const caPath = path.join(__dirname, '../certs/ca.crt');
        
        console.log('证书文件路径:');
        console.log(`  - 证书: ${certPath}`);
        console.log(`  - 私钥: ${keyPath}`);
        console.log(`  - CA证书: ${caPath}`);
        
        // 创建代理实例
        console.log('\n创建代理实例...');
        const config = {
            port: 8448,
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
        
        // 检查证书管理器配置
        console.log('\n检查证书管理器配置...');
        const certManager = proxy.certificateManager;
        if (certManager) {
            console.log('证书管理器配置:', certManager.config);
            console.log('SSL配置:', certManager.config.get('ssl'));
            console.log('证书配置:', certManager.config.get('certificate'));
            
            // 尝试手动调用_loadOrGenerateCA
            console.log('\n手动调用_loadOrGenerateCA...');
            await certManager._loadOrGenerateCA();
            
            // 检查CA证书是否加载
            if (certManager.caCert) {
                console.log('✅ CA证书已加载');
                console.log('CA证书主题:', certManager.caCert.subject.getField('CN').value);
            } else {
                console.log('❌ CA证书未加载');
            }
        } else {
            console.log('⚠️ 未找到证书管理器');
        }
        
        console.log('\n🎉 配置调试完成!');
        
    } catch (error) {
        console.error('❌ 调试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    debugConfig().catch(console.error);
}

module.exports = debugConfig;