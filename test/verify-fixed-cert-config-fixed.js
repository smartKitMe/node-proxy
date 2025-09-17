const { NodeMITMProxy } = require('../src/index');
const path = require('path');
const fs = require('fs');

/**
 * 验证固定证书配置的修复版本测试脚本
 */
async function verifyFixedCertConfig() {
    console.log('🔍 验证固定证书配置(修复版本)...');
    
    try {
        // 检查证书文件是否存在
        const certPath = path.join(__dirname, '../certs/server.crt');
        const keyPath = path.join(__dirname, '../certs/server.key');
        const caPath = path.join(__dirname, '../certs/ca.crt');
        
        console.log('检查证书文件...');
        if (!fs.existsSync(certPath)) {
            throw new Error(`证书文件不存在: ${certPath}`);
        }
        if (!fs.existsSync(keyPath)) {
            throw new Error(`私钥文件不存在: ${keyPath}`);
        }
        if (!fs.existsSync(caPath)) {
            throw new Error(`CA证书文件不存在: ${caPath}`);
        }
        
        console.log('✅ 所有证书文件存在');
        
        // 读取证书内容
        const certContent = fs.readFileSync(certPath, 'utf8');
        const keyContent = fs.readFileSync(keyPath, 'utf8');
        const caContent = fs.readFileSync(caPath, 'utf8');
        
        console.log('证书内容长度:');
        console.log(`  - 证书: ${certContent.length} 字符`);
        console.log(`  - 私钥: ${keyContent.length} 字符`);
        console.log(`  - CA证书: ${caContent.length} 字符`);
        
        // 创建代理实例
        console.log('\n创建代理实例...');
        const proxy = new NodeMITMProxy({
            config: {
                port: 8446,
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
            }
        });
        
        console.log('✅ 代理实例创建成功');
        
        // 初始化代理
        console.log('\n初始化代理...');
        await proxy.initialize();
        console.log('✅ 代理初始化成功');
        
        // 获取证书管理器并检查CA证书
        console.log('\n检查CA证书...');
        const certManager = proxy.certificateManager;
        if (certManager) {
            try {
                // 确保证书管理器已初始化
                if (!certManager.caCert) {
                    await certManager.initialize();
                }
                
                const caCert = certManager.getCACertificate();
                console.log('✅ CA证书获取成功');
                console.log(`CA证书长度: ${caCert.cert.length} 字符`);
                console.log(`CA私钥长度: ${caCert.key.length} 字符`);
            } catch (error) {
                console.error('❌ CA证书获取失败:', error.message);
            }
        } else {
            console.log('⚠️  未找到证书管理器');
        }
        
        // 启动代理
        console.log('\n启动代理服务器...');
        await proxy.start();
        console.log('✅ 代理服务器启动成功');
        
        // 获取服务器信息
        const serverInfo = proxy.getServerInfo();
        console.log('服务器信息:', JSON.stringify(serverInfo, null, 2));
        
        // 再次尝试获取CA证书
        console.log('\n再次检查CA证书...');
        try {
            const caCert = proxy.getCACertificate();
            console.log('✅ CA证书获取成功');
            console.log(`CA证书长度: ${caCert.cert.length} 字符`);
            console.log(`CA私钥长度: ${caCert.key.length} 字符`);
        } catch (error) {
            console.error('❌ CA证书获取失败:', error.message);
        }
        
        // 关闭代理
        console.log('\n关闭代理服务器...');
        await proxy.stop();
        console.log('✅ 代理服务器关闭成功');
        
        console.log('\n🎉 固定证书配置验证完成!');
        
    } catch (error) {
        console.error('❌ 验证失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    verifyFixedCertConfig().catch(console.error);
}

module.exports = verifyFixedCertConfig;