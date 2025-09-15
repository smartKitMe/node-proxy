const fs = require('fs');
const forge = require('node-forge');
const CertAndKeyContainer = require('../src/tls/CertAndKeyContainer');
const FakeServersCenter = require('../src/tls/FakeServersCenter');
const tlsUtils = require('../src/tls/tlsUtils');

// 示例：如何使用固定证书功能

// 方法1：从文件加载现有的证书和密钥
function loadCertFromFile() {
    try {
        // 假设你有现有的证书和密钥文件
        const certPem = fs.readFileSync('./scripts/certs/cert.pem', 'utf8');
        const keyPem = fs.readFileSync('./scripts/certs/key.pem', 'utf8');
        
        // 将PEM格式转换为forge对象
        const cert = forge.pki.certificateFromPem(certPem);
        const key = forge.pki.privateKeyFromPem(keyPem);
        
        return { cert, key };
    } catch (error) {
        console.log('无法加载现有证书文件，将生成新的证书');
        return null;
    }
}

// 方法2：生成一个通用的固定证书
function generateFixedCert() {
    // 首先需要CA证书和密钥
    const ca = tlsUtils.createCA('MyProxy CA');
    
    // 生成一个通用的证书，可以用于所有域名
    const cert = tlsUtils.createFakeCertificateByDomain(ca.key, ca.cert, '*.example.com');
    
    return {
        cert: cert.cert,
        key: cert.key,
        caCert: ca.cert,
        caKey: ca.key
    };
}

// 使用示例
function example() {
    // 尝试加载现有证书，如果失败则生成新的
    let fixedCertData = loadCertFromFile();
    
    if (!fixedCertData) {
        console.log('生成新的固定证书...');
        const generated = generateFixedCert();
        fixedCertData = {
            cert: generated.cert,
            key: generated.key
        };
        
        // 可选：保存生成的证书到文件
        const certPem = forge.pki.certificateToPem(generated.cert);
        const keyPem = forge.pki.privateKeyToPem(generated.key);
        
        console.log('生成的证书PEM:');
        console.log(certPem);
        console.log('生成的密钥PEM:');
        console.log(keyPem);
    }
    
    // 创建CA（如果没有现有的CA）
    const ca = tlsUtils.createCA('MyProxy CA');
    
    // 方式1：在构造函数中直接启用固定证书
    const certContainer1 = new CertAndKeyContainer({
        caCert: ca.cert,
        caKey: ca.key,
        fixedCert: fixedCertData.cert,
        fixedKey: fixedCertData.key,
        useFixedCert: true
    });
    
    // 方式2：先创建容器，然后设置固定证书
    const certContainer2 = new CertAndKeyContainer({
        caCert: ca.cert,
        caKey: ca.key
    });
    certContainer2.setFixedCert(fixedCertData.cert, fixedCertData.key, true);
    
    // 方式3：在FakeServersCenter中使用固定证书
    const fakeServersCenter = new FakeServersCenter({
        caCert: ca.cert,
        caKey: ca.key,
        fixedCert: fixedCertData.cert,
        fixedKey: fixedCertData.key,
        useFixedCert: true,
        requestHandler: (req, res) => {
            // 你的请求处理逻辑
            res.end('Hello from fixed cert proxy!');
        }
    });
    
    // 测试固定证书功能
    console.log('固定证书模式已启用:', certContainer1.isFixedCertEnabled());
    
    // 获取证书（现在会直接返回固定证书，不会进行网络请求）
    certContainer1.getCertPromise('example.com', 443)
        .then(certObj => {
            console.log('成功获取固定证书');
            console.log('证书序列号:', certObj.cert.serialNumber);
        })
        .catch(err => {
            console.error('获取证书失败:', err);
        });
    
    // 动态切换模式
    console.log('\n切换到动态证书模式...');
    certContainer1.enableFixedCert(false);
    console.log('固定证书模式已禁用:', certContainer1.isFixedCertEnabled());
    
    console.log('\n重新启用固定证书模式...');
    certContainer1.enableFixedCert(true);
    console.log('固定证书模式已启用:', certContainer1.isFixedCertEnabled());
}

// 运行示例
if (require.main === module) {
    example();
}

module.exports = {
    loadCertFromFile,
    generateFixedCert,
    example
};