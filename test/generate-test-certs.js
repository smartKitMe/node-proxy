#!/usr/bin/env node

/**
 * 生成测试证书脚本
 * 用于生成HTTPS测试所需的证书
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

// 确保证书目录存在
const certsDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
}

function generateCACertificate() {
    // 生成CA密钥对
    const caKeys = forge.pki.rsa.generateKeyPair(2048);
    
    // 生成CA证书
    const caCert = forge.pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.serialNumber = '01';
    caCert.validity.notBefore = new Date();
    caCert.validity.notAfter = new Date();
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);
    
    const caAttrs = [{
        name: 'commonName',
        value: 'NodeMITMProxy Test CA'
    }, {
        name: 'countryName',
        value: 'CN'
    }, {
        shortName: 'ST',
        value: 'Test State'
    }, {
        name: 'localityName',
        value: 'Test City'
    }, {
        name: 'organizationName',
        value: 'NodeMITMProxy'
    }, {
        shortName: 'OU',
        value: 'Test CA'
    }];
    
    caCert.setSubject(caAttrs);
    caCert.setIssuer(caAttrs);
    
    // 设置CA扩展
    caCert.setExtensions([{
        name: 'basicConstraints',
        cA: true
    }, {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
    }, {
        name: 'nsCertType',
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true
    }, {
        name: 'subjectKeyIdentifier'
    }]);
    
    // 自签名
    caCert.sign(caKeys.privateKey, forge.md.sha256.create());
    
    return { cert: caCert, keys: caKeys };
}

function generateServerCertificate(caCert, caKey) {
    // 生成服务器密钥对
    const serverKeys = forge.pki.rsa.generateKeyPair(2048);
    
    // 生成服务器证书
    const serverCert = forge.pki.createCertificate();
    serverCert.publicKey = serverKeys.publicKey;
    serverCert.serialNumber = '02';
    serverCert.validity.notBefore = new Date();
    serverCert.validity.notAfter = new Date();
    serverCert.validity.notAfter.setFullYear(serverCert.validity.notBefore.getFullYear() + 10);
    
    const serverAttrs = [{
        name: 'commonName',
        value: 'localhost'
    }, {
        name: 'countryName',
        value: 'CN'
    }, {
        shortName: 'ST',
        value: 'Test State'
    }, {
        name: 'localityName',
        value: 'Test City'
    }, {
        name: 'organizationName',
        value: 'NodeMITMProxy'
    }, {
        shortName: 'OU',
        value: 'Test Server'
    }];
    
    serverCert.setSubject(serverAttrs);
    serverCert.setIssuer(caCert.subject.attributes);
    
    // 设置服务器扩展
    serverCert.setExtensions([{
        name: 'basicConstraints',
        cA: false
    }, {
        name: 'keyUsage',
        keyEncipherment: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 2, // DNS
            value: 'localhost'
        }, {
            type: 2, // DNS
            value: '*.localhost'
        }, {
            type: 7, // IP
            ip: '127.0.0.1'
        }]
    }, {
        name: 'subjectKeyIdentifier'
    }]);
    
    // 用CA签名
    serverCert.sign(caKey, forge.md.sha256.create());
    
    return { cert: serverCert, keys: serverKeys };
}

function saveCertificate(cert, key, name) {
    const certPath = path.join(certsDir, `${name}-cert.pem`);
    const keyPath = path.join(certsDir, `${name}-key.pem`);
    
    // 保存证书
    const certPem = forge.pki.certificateToPem(cert);
    fs.writeFileSync(certPath, certPem);
    console.log(`✅ 证书已保存到: ${certPath}`);
    
    // 保存私钥
    const keyPem = forge.pki.privateKeyToPem(key);
    fs.writeFileSync(keyPath, keyPem);
    console.log(`✅ 私钥已保存到: ${keyPath}`);
}

function main() {
    console.log('🔐 正在生成测试证书...');
    
    try {
        // 生成CA证书
        console.log('📄 生成CA证书...');
        const { cert: caCert, keys: caKeys } = generateCACertificate();
        saveCertificate(caCert, caKeys.privateKey, 'ca');
        
        // 生成服务器证书
        console.log('📄 生成服务器证书...');
        const { cert: serverCert, keys: serverKeys } = generateServerCertificate(caCert, caKeys.privateKey);
        saveCertificate(serverCert, serverKeys.privateKey, 'server');
        
        console.log('\n🎉 所有测试证书生成完成!');
        console.log(`📁 证书目录: ${certsDir}`);
        console.log('\n📝 使用说明:');
        console.log('1. CA证书用于签署其他证书');
        console.log('2. 服务器证书用于HTTPS测试');
        console.log('3. 在测试中引用这些证书文件');
        
    } catch (error) {
        console.error('❌ 证书生成失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = {
    generateCACertificate,
    generateServerCertificate,
    saveCertificate
};