const fs = require('fs');
const forge = require('node-forge');
const FakeServersCenter = require('../tls/FakeServersCenter');
const colors = require('colors');

module.exports = function createFakeServerCenter({
    caCertPath,
    caKeyPath,
    requestHandler,
    upgradeHandler,
    getCertSocketTimeout,
    fixedCertPath = null,
    fixedKeyPath = null,
    fixedCert = null,
    fixedKey = null,
    useFixedCert = false
}) {
    var caCert;
    var caKey;
    try {
        fs.accessSync(caCertPath, fs.F_OK);
        fs.accessSync(caKeyPath, fs.F_OK);
        var caCertPem = fs.readFileSync(caCertPath);
        var caKeyPem = fs.readFileSync(caKeyPath);
        caCert = forge.pki.certificateFromPem(caCertPem);
        caKey = forge.pki.privateKeyFromPem(caKeyPem);
    } catch (e) {
        console.log(colors.red(`Can not find \`CA certificate\` or \`CA key\`.`), e);
        process.exit(1);
    }

    // 加载固定证书（支持文件路径或直接传入字符串）
    var fixedCertObj = null;
    var fixedKeyObj = null;
    
    if (useFixedCert) {
        try {
            // 优先使用直接传入的证书和密钥字符串
            if (fixedCert && fixedKey) {
                fixedCertObj = forge.pki.certificateFromPem(fixedCert);
                fixedKeyObj = forge.pki.privateKeyFromPem(fixedKey);
                console.log(colors.green('已加载固定证书（字符串模式）'));
                console.log(colors.green('已加载固定密钥（字符串模式）'));
            }
            // 如果没有直接传入字符串，则尝试从文件路径加载
            else if (fixedCertPath && fixedKeyPath) {
                fs.accessSync(fixedCertPath, fs.F_OK);
                fs.accessSync(fixedKeyPath, fs.F_OK);
                var fixedCertPem = fs.readFileSync(fixedCertPath);
                var fixedKeyPem = fs.readFileSync(fixedKeyPath);
                fixedCertObj = forge.pki.certificateFromPem(fixedCertPem);
                fixedKeyObj = forge.pki.privateKeyFromPem(fixedKeyPem);
                console.log(colors.green(`已加载固定证书: ${fixedCertPath}`));
                console.log(colors.green(`已加载固定密钥: ${fixedKeyPath}`));
            }
            else {
                throw new Error('启用固定证书模式时，必须提供证书和密钥（文件路径或字符串内容）');
            }
        } catch (e) {
            console.log(colors.yellow(`无法加载固定证书，将使用动态证书模式: ${e.message}`));
            useFixedCert = false;
        }
    }

    return new FakeServersCenter({
        caCert,
        caKey,
        maxLength: 100,
        requestHandler,
        upgradeHandler,
        getCertSocketTimeout,
        fixedCert: fixedCertObj,
        fixedKey: fixedKeyObj,
        useFixedCert
    });
}
