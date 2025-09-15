const https = require('https');
const tlsUtils = require('./tlsUtils');
const CertAndKeyContainer = require('./CertAndKeyContainer');
const forge = require('node-forge');
const pki = forge.pki;
const tls = require('tls');


module.exports = class FakeServersCenter {
    constructor({maxLength = 100, requestHandler, upgradeHandler, caCert, caKey, getCertSocketTimeout, fixedCert = null, fixedKey = null, useFixedCert = false}) {
        this.queue = [];
        this.maxLength = maxLength;
        this.requestHandler = requestHandler;
        this.upgradeHandler = upgradeHandler;
        this.certAndKeyContainer = new CertAndKeyContainer({
            getCertSocketTimeout,
            caCert,
            caKey,
            fixedCert,
            fixedKey,
            useFixedCert
        });
    }
    addServerPromise (serverPromiseObj) {
        if (this.queue.length >= this.maxLength) {
            var delServerObj = this.queue.shift();
            try {
                delServerObj.serverObj.server.close();
            } catch (e) {
                console.log(e);
            }
        }
        this.queue.push(serverPromiseObj);
        return serverPromiseObj;
    }
    getServerPromise (hostname, port) {
        for (let i = 0; i < this.queue.length; i++) {
            let serverPromiseObj = this.queue[i];
            let mappingHostNames = serverPromiseObj.mappingHostNames;
            for (let j = 0; j < mappingHostNames.length; j++) {
                let DNSName = mappingHostNames[j];
                if (tlsUtils.isMappingHostName(DNSName, hostname)) {
                    this.reRankServer(i);
                    return serverPromiseObj.promise;
                }
            }
        }

        var serverPromiseObj = {
            mappingHostNames: [hostname] // temporary hostname
        };

        let promise = new Promise((resolve, reject) => {

            (async () => {
                let certObj = await this.certAndKeyContainer.getCertPromise(hostname, port);
                var cert = certObj.cert;
                var key = certObj.key;
                var certPem = pki.certificateToPem(cert);
                var keyPem = pki.privateKeyToPem(key);
                var fakeServer = new https.Server({
                    key: keyPem,
                    cert: certPem,
                    SNICallback: (hostname, done) => {
                        (async () => {
                            let certObj = await this.certAndKeyContainer.getCertPromise(hostname, port);
                            done(null, tls.createSecureContext({
                                key: pki.privateKeyToPem(certObj.key),
                                cert: pki.certificateToPem(certObj.cert)
                            }))
                        })();
                    }
                });
                var serverObj = {
                    cert,
                    key,
                    server: fakeServer,
                    port: 0  // if prot === 0 ,should listen server's `listening` event.
                }
                serverPromiseObj.serverObj = serverObj;
                fakeServer.listen(0, () => {
                    var address = fakeServer.address();
                    serverObj.port = address.port;
                });
                fakeServer.on('request', (req, res) => {
                    var ssl = true;
                    this.requestHandler(req, res, ssl);
                });
                fakeServer.on('error', (e) => {
                    console.error(e);
                });
                fakeServer.on('listening', ()=>{
                    var mappingHostNames = tlsUtils.getMappingHostNamesFormCert(certObj.cert);
                    serverPromiseObj.mappingHostNames = mappingHostNames;
                    resolve(serverObj);
                });
                fakeServer.on('upgrade', (req, socket, head) => {
                    var ssl = true;
                    this.upgradeHandler (req, socket, head, ssl);
                });
            })();

        });

        serverPromiseObj.promise = promise;

        return (this.addServerPromise(serverPromiseObj)).promise;
    }
    reRankServer (index) {
        // index ==> queue foot
        this.queue.push((this.queue.splice(index, 1))[0]);
    }
    
    /**
     * 设置固定证书和密钥
     * @param {Object} cert - 证书对象
     * @param {Object} key - 私钥对象
     * @param {boolean} enable - 是否启用固定证书模式，默认为true
     */
    setFixedCert(cert, key, enable = true) {
        this.certAndKeyContainer.setFixedCert(cert, key, enable);
    }
    
    /**
     * 启用或禁用固定证书模式
     * @param {boolean} enable - 是否启用
     */
    enableFixedCert(enable) {
        this.certAndKeyContainer.enableFixedCert(enable);
    }
    
    /**
     * 检查是否启用了固定证书模式
     * @returns {boolean}
     */
    isFixedCertEnabled() {
        return this.certAndKeyContainer.isFixedCertEnabled();
    }
}
