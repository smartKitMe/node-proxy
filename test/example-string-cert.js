const mitmproxy = require('../src/mitmproxy');
const tlsUtils = require('../src/tls/tlsUtils');
const forge = require('node-forge');

// 生成固定证书和密钥字符串
function generateFixedCertString() {
    console.log('生成固定证书和密钥字符串...');
    
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
        certPem: forge.pki.certificateToPem(cert),
        keyPem: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

// 示例1: 使用字符串模式的固定证书
function startProxyWithStringCert() {
    console.log('\n=== 示例1: 使用字符串模式的固定证书 ===');
    
    // 生成证书和密钥字符串
    const { certPem, keyPem } = generateFixedCertString();
    
    console.log('证书内容（前100字符）:', certPem.substring(0, 100) + '...');
    console.log('密钥内容（前100字符）:', keyPem.substring(0, 100) + '...');
    
    // 启动代理服务器，直接传入证书和密钥字符串
    mitmproxy.createProxy({
        port: 8082,
        // 直接传入证书和密钥字符串（不是文件路径）
        fixedCert: certPem,
        fixedKey: keyPem,
        useFixedCert: true,
        
        // 请求拦截器
        requestInterceptor: (rOptions, req, res, ssl, next) => {
            console.log(`[字符串证书模式] 请求: ${rOptions.protocol}//${rOptions.hostname}${rOptions.path}`);
            next();
        },
        
        // 响应拦截器
        responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
            console.log(`[字符串证书模式] 响应: ${proxyRes.statusCode}`);
            next();
        }
    });
    
    console.log('代理服务器已启动在端口 8082');
    console.log('使用字符串模式的固定证书，无需证书文件');
    console.log('\n配置浏览器代理: 127.0.0.1:8082');
}

// 示例2: 混合模式 - 同时支持文件路径和字符串
function startProxyWithMixedMode() {
    console.log('\n=== 示例2: 混合模式演示 ===');
    
    const { certPem, keyPem } = generateFixedCertString();
    
    // 方式1: 使用字符串模式
    console.log('\n方式1: 字符串模式');
    const proxyConfig1 = {
        port: 8083,
        fixedCert: certPem,  // 直接传入证书字符串
        fixedKey: keyPem,    // 直接传入密钥字符串
        useFixedCert: true
    };
    
    // 方式2: 使用文件路径模式（需要先有文件）
    console.log('方式2: 文件路径模式（需要先创建文件）');
    const proxyConfig2 = {
        port: 8084,
        fixedCertPath: './fixed-cert.pem',  // 证书文件路径
        fixedKeyPath: './fixed-key.pem',    // 密钥文件路径
        useFixedCert: true
    };
    
    console.log('两种配置方式都支持，字符串模式优先级更高');
    
    // 启动字符串模式的代理
    mitmproxy.createProxy({
        ...proxyConfig1,
        requestInterceptor: (rOptions, req, res, ssl, next) => {
            console.log(`[混合模式] 请求: ${rOptions.hostname}`);
            next();
        }
    });
    
    console.log('代理服务器已启动在端口 8083（字符串模式）');
}

// 示例3: 证书内容验证
function validateCertContent() {
    console.log('\n=== 示例3: 证书内容验证 ===');
    
    const { certPem, keyPem } = generateFixedCertString();
    
    try {
        // 验证证书格式
        const cert = forge.pki.certificateFromPem(certPem);
        const key = forge.pki.privateKeyFromPem(keyPem);
        
        console.log('✓ 证书格式验证通过');
        console.log('证书主题:', cert.subject.getField('CN').value);
        console.log('证书有效期:', cert.validity.notBefore, '至', cert.validity.notAfter);
        console.log('证书序列号:', cert.serialNumber);
        
        // 验证密钥匹配
        const publicKeyPem = forge.pki.publicKeyToPem(cert.publicKey);
        const privateKeyPublicPem = forge.pki.publicKeyToPem(key);
        
        if (publicKeyPem === privateKeyPublicPem) {
            console.log('✓ 证书和密钥匹配');
        } else {
            console.log('✗ 证书和密钥不匹配');
        }
        
    } catch (error) {
        console.error('✗ 证书验证失败:', error.message);
    }
}

// 运行示例
if (require.main === module) {
    console.log('Node-mitmproxy 字符串证书模式示例');
    console.log('===================================');
    
    // 验证证书内容
    validateCertContent();
    
    // 运行字符串模式示例
    startProxyWithStringCert();
    
    // 可以取消注释运行混合模式示例
    // startProxyWithMixedMode();
}

module.exports = {
    generateFixedCertString,
    startProxyWithStringCert,
    startProxyWithMixedMode,
    validateCertContent
};