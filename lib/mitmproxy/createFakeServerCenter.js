'use strict';

var fs = require('fs');
var forge = require('node-forge');
var FakeServersCenter = require('../tls/FakeServersCenter');
var colors = require('colors');

module.exports = function createFakeServerCenter(_ref) {
    var caCertPath = _ref.caCertPath,
        caKeyPath = _ref.caKeyPath,
        requestHandler = _ref.requestHandler,
        upgradeHandler = _ref.upgradeHandler,
        getCertSocketTimeout = _ref.getCertSocketTimeout,
        _ref$fixedCertPath = _ref.fixedCertPath,
        fixedCertPath = _ref$fixedCertPath === undefined ? null : _ref$fixedCertPath,
        _ref$fixedKeyPath = _ref.fixedKeyPath,
        fixedKeyPath = _ref$fixedKeyPath === undefined ? null : _ref$fixedKeyPath,
        _ref$fixedCert = _ref.fixedCert,
        fixedCert = _ref$fixedCert === undefined ? null : _ref$fixedCert,
        _ref$fixedKey = _ref.fixedKey,
        fixedKey = _ref$fixedKey === undefined ? null : _ref$fixedKey,
        _ref$useFixedCert = _ref.useFixedCert,
        useFixedCert = _ref$useFixedCert === undefined ? false : _ref$useFixedCert;

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
        console.log(colors.red('Can not find `CA certificate` or `CA key`.'), e);
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
                    console.log(colors.green('\u5DF2\u52A0\u8F7D\u56FA\u5B9A\u8BC1\u4E66: ' + fixedCertPath));
                    console.log(colors.green('\u5DF2\u52A0\u8F7D\u56FA\u5B9A\u5BC6\u94A5: ' + fixedKeyPath));
                } else {
                    throw new Error('启用固定证书模式时，必须提供证书和密钥（文件路径或字符串内容）');
                }
        } catch (e) {
            console.log(colors.yellow('\u65E0\u6CD5\u52A0\u8F7D\u56FA\u5B9A\u8BC1\u4E66\uFF0C\u5C06\u4F7F\u7528\u52A8\u6001\u8BC1\u4E66\u6A21\u5F0F: ' + e.message));
            useFixedCert = false;
        }
    }

    return new FakeServersCenter({
        caCert: caCert,
        caKey: caKey,
        maxLength: 100,
        requestHandler: requestHandler,
        upgradeHandler: upgradeHandler,
        getCertSocketTimeout: getCertSocketTimeout,
        fixedCert: fixedCertObj,
        fixedKey: fixedKeyObj,
        useFixedCert: useFixedCert
    });
};