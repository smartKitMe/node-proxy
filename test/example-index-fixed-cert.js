const mitmproxy = require('../src/mitmproxy');
const path = require('path');
const fs = require('fs');
const tlsUtils = require('../src/tls/tlsUtils');
const forge = require('node-forge');

// 生成固定证书和密钥（仅用于演示）
function generateFixedCert() {
    console.log('生成固定证书和密钥...');
    
    // 生成密钥对
    const keys = forge.pki.rsa.generateKeyPair(2048);
    
    // 创建证书
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [{
        name: 'commonName',
        value: '*.example.com'
    }, {
        name: 'countryName',
        value: 'CN'
    }, {
        shortName: 'ST',
        value: 'Beijing'
    }, {
        name: 'localityName',
        value: 'Beijing'
    }, {
        name: 'organizationName',
        value: 'Test'
    }, {
        shortName: 'OU',
        value: 'Test'
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    
    // 添加扩展
    cert.setExtensions([{
        name: 'basicConstraints',
        cA: false
    }, {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    }, {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: false,
        emailProtection: false,
        timeStamping: false
    }, {
        name: 'subjectAltName',
        altNames: [{
            type: 2, // DNS
            value: '*.example.com'
        }, {
            type: 2,
            value: 'example.com'
        }, {
            type: 2,
            value: 'localhost'
        }]
    }]);
    
    // 自签名
    cert.sign(keys.privateKey);
    
    return {
        cert: forge.pki.certificateToPem(cert),
        key: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

// 保存证书到文件
function saveCertToFile() {
    const { cert, key } = generateFixedCert();
    const certPath = path.join(__dirname, 'fixed-cert.pem');
    const keyPath = path.join(__dirname, 'fixed-key.pem');
    
    fs.writeFileSync(certPath, cert);
    fs.writeFileSync(keyPath, key);
    
    console.log(`固定证书已保存到: ${certPath}`);
    console.log(`固定密钥已保存到: ${keyPath}`);
    
    return { certPath, keyPath };
}

// 示例1: 使用固定证书模式启动代理
function startProxyWithFixedCert() {
    console.log('\n=== 示例1: 使用固定证书模式启动代理 ===');
    
    // 生成并保存固定证书
    const { certPath, keyPath } = saveCertToFile();
    
    // 启动代理服务器
    mitmproxy.createProxy({
        port: 8080,
        // 固定证书配置
        fixedCertPath: certPath,
        fixedKeyPath: keyPath,
        useFixedCert: true,
        
        // 请求拦截器
        requestInterceptor: (rOptions, req, res, ssl, next) => {
            console.log(`[固定证书模式] 请求: ${rOptions.protocol}//${rOptions.hostname}${rOptions.path}`);
            next();
        },
        
        // 响应拦截器
        responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
            console.log(`[固定证书模式] 响应: ${proxyRes.statusCode}`);
            next();
        }
    });
    
    console.log('代理服务器已启动在端口 8080');
    console.log('使用固定证书模式，所有HTTPS请求将使用同一个证书');
    console.log('\n配置浏览器代理: 127.0.0.1:8080');
    console.log('注意: 浏览器可能会显示证书警告，这是正常的');
}

// 示例2: 动态切换证书模式
function startProxyWithDynamicSwitch() {
    console.log('\n=== 示例2: 支持动态切换的代理 ===');
    
    // 生成并保存固定证书
    const { certPath, keyPath } = saveCertToFile();
    
    // 启动代理服务器（初始为动态证书模式）
    const proxy = mitmproxy.createProxy({
        port: 8081,
        fixedCertPath: certPath,
        fixedKeyPath: keyPath,
        useFixedCert: false, // 初始为动态模式
        
        requestInterceptor: (rOptions, req, res, ssl, next) => {
            console.log(`请求: ${rOptions.protocol}//${rOptions.hostname}${rOptions.path}`);
            next();
        }
    });
    
    console.log('代理服务器已启动在端口 8081（动态证书模式）');
    
    // 10秒后切换到固定证书模式
    setTimeout(() => {
        console.log('\n切换到固定证书模式...');
        // 注意: 实际使用中需要通过fakeServersCenter来切换模式
        // 这里只是演示配置参数的使用
    }, 10000);
}

// 运行示例
if (require.main === module) {
    console.log('Node-mitmproxy 固定证书模式示例');
    console.log('================================');
    
    // 运行示例1
    startProxyWithFixedCert();
    
    // 可以取消注释运行示例2
    // startProxyWithDynamicSwitch();
}

module.exports = {
    generateFixedCert,
    saveCertToFile,
    startProxyWithFixedCert,
    startProxyWithDynamicSwitch
};