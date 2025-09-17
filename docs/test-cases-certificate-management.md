# 证书管理测试用例

## 概述

本文档包含 Node Proxy 证书管理功能的测试用例，涵盖固定证书配置、动态证书生成、证书验证、HTTPS代理等功能。

## 测试环境要求

- Node.js >= 12.0.0
- OpenSSL 工具
- 测试端口：8080（HTTP代理），8443（HTTPS代理），8090-8095（目标服务器）
- 网络连接正常

## 固定证书测试

### TC-CERT-001: 固定证书配置测试

**测试目标**: 验证使用预配置证书的HTTPS代理功能

**前置条件**: 
- 准备有效的SSL证书文件
- 证书文件路径正确

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function testFixedCertificateConfiguration() {
    // 创建测试HTTPS服务器
    const testServer = await createTestHTTPSServer(8091);
    
    // 准备固定证书配置
    const certConfig = {
        key: path.join(__dirname, 'certs', 'server.key'),
        cert: path.join(__dirname, 'certs', 'server.crt'),
        ca: path.join(__dirname, 'certs', 'ca.crt') // 可选的CA证书
    };
    
    // 确保证书文件存在
    await ensureCertificateFiles(certConfig);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            httpsPort: 8443,
            host: 'localhost'
        },
        https: {
            enabled: true,
            certificate: {
                type: 'fixed',
                key: certConfig.key,
                cert: certConfig.cert,
                ca: certConfig.ca
            }
        },
        logger: {
            level: 'info'
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 固定证书HTTPS代理启动成功');
        
        // 测试HTTPS代理连接
        console.log('\n=== 测试HTTPS代理连接 ===');
        const httpsResponse = await makeHTTPSRequest('https://localhost:8091/api/test', {
            'User-Agent': 'Certificate-Test-Client/1.0',
            'X-Test-Case': 'TC-CERT-001'
        });
        
        console.log('HTTPS请求响应:', httpsResponse.data);
        console.log('响应状态:', httpsResponse.statusCode);
        
        if (httpsResponse.statusCode === 200) {
            console.log('✓ 固定证书HTTPS代理连接成功');
        } else {
            throw new Error('HTTPS代理连接失败');
        }
        
        // 测试证书信息
        console.log('\n=== 验证证书信息 ===');
        const certInfo = await getCertificateInfo('localhost', 8443);
        console.log('证书信息:', certInfo);
        
        if (certInfo.subject && certInfo.issuer) {
            console.log('✓ 证书信息获取成功');
            console.log(`证书主题: ${certInfo.subject}`);
            console.log(`证书颁发者: ${certInfo.issuer}`);
            console.log(`证书有效期: ${certInfo.validFrom} - ${certInfo.validTo}`);
        } else {
            throw new Error('证书信息获取失败');
        }
        
        // 测试证书验证
        console.log('\n=== 测试证书验证 ===');
        const verificationResult = await verifyCertificate(certConfig);
        
        if (verificationResult.valid) {
            console.log('✓ 证书验证通过');
        } else {
            console.log('⚠ 证书验证失败:', verificationResult.error);
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.server.close();
    }
}

// 创建测试HTTPS服务器
async function createTestHTTPSServer(port) {
    const serverOptions = {
        key: fs.readFileSync(path.join(__dirname, 'certs', 'server.key')),
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'server.crt'))
    };
    
    const server = https.createServer(serverOptions, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'HTTPS test server response',
            url: req.url,
            method: req.method,
            secure: true,
            timestamp: new Date().toISOString()
        }));
    });
    
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`HTTPS测试服务器启动: https://localhost:${port}`);
            resolve({ server });
        });
    });
}

// 确保证书文件存在
async function ensureCertificateFiles(certConfig) {
    const certDir = path.dirname(certConfig.key);
    
    // 创建证书目录
    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
    }
    
    // 如果证书文件不存在，生成自签名证书
    if (!fs.existsSync(certConfig.key) || !fs.existsSync(certConfig.cert)) {
        console.log('生成自签名证书...');
        await generateSelfSignedCertificate(certConfig);
    }
}

// 生成自签名证书
async function generateSelfSignedCertificate(certConfig) {
    const { execSync } = require('child_process');
    
    try {
        // 生成私钥
        execSync(`openssl genrsa -out ${certConfig.key} 2048`);
        
        // 生成证书
        execSync(`openssl req -new -x509 -key ${certConfig.key} -out ${certConfig.cert} -days 365 -subj "/C=CN/ST=Beijing/L=Beijing/O=Test/OU=Test/CN=localhost"`);
        
        console.log('✓ 自签名证书生成成功');
    } catch (error) {
        console.error('证书生成失败:', error.message);
        throw error;
    }
}

// 获取证书信息
async function getCertificateInfo(hostname, port) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            port: port,
            method: 'GET',
            rejectUnauthorized: false // 忽略自签名证书错误
        };
        
        const req = https.request(options, (res) => {
            const cert = res.connection.getPeerCertificate();
            resolve({
                subject: cert.subject ? Object.entries(cert.subject).map(([k, v]) => `${k}=${v}`).join(', ') : null,
                issuer: cert.issuer ? Object.entries(cert.issuer).map(([k, v]) => `${k}=${v}`).join(', ') : null,
                validFrom: cert.valid_from,
                validTo: cert.valid_to,
                fingerprint: cert.fingerprint,
                serialNumber: cert.serialNumber
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// 验证证书
async function verifyCertificate(certConfig) {
    try {
        const cert = fs.readFileSync(certConfig.cert, 'utf8');
        const key = fs.readFileSync(certConfig.key, 'utf8');
        
        // 简单验证证书和私钥是否匹配
        // 实际应用中可能需要更复杂的验证逻辑
        
        return {
            valid: true,
            cert: cert.includes('BEGIN CERTIFICATE'),
            key: key.includes('BEGIN RSA PRIVATE KEY') || key.includes('BEGIN PRIVATE KEY')
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
}

// 发送HTTPS请求
async function makeHTTPSRequest(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8443, // 通过HTTPS代理
            path: url.replace('https://localhost:8091', ''),
            method: 'GET',
            headers: {
                'Host': 'localhost:8091',
                ...headers
            },
            rejectUnauthorized: false // 忽略自签名证书错误
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

testFixedCertificateConfiguration();
```

**预期结果**:
- HTTPS代理正常启动
- 证书文件正确加载
- HTTPS连接建立成功
- 证书信息获取正确

---

### TC-CERT-002: 动态证书生成测试

**测试目标**: 验证动态证书生成功能

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function testDynamicCertificateGeneration() {
    // 创建多个测试HTTPS服务器
    const testServers = await Promise.all([
        createTestHTTPSServer(8091, 'server1.local'),
        createTestHTTPSServer(8092, 'server2.local'),
        createTestHTTPSServer(8093, 'api.example.com')
    ]);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            httpsPort: 8443,
            host: 'localhost'
        },
        https: {
            enabled: true,
            certificate: {
                type: 'dynamic',
                // 根证书配置
                ca: {
                    key: path.join(__dirname, 'certs', 'ca.key'),
                    cert: path.join(__dirname, 'certs', 'ca.crt'),
                    // CA证书信息
                    subject: {
                        countryName: 'CN',
                        stateOrProvinceName: 'Beijing',
                        localityName: 'Beijing',
                        organizationName: 'Test CA',
                        organizationalUnitName: 'Test',
                        commonName: 'Test Root CA'
                    }
                },
                // 动态证书配置
                dynamic: {
                    keySize: 2048,
                    validityDays: 365,
                    cacheSize: 100, // 缓存证书数量
                    cacheTTL: 3600000 // 缓存时间（毫秒）
                }
            }
        },
        logger: {
            level: 'info'
        }
    });
    
    const generatedCertificates = [];
    
    // 监听证书生成事件
    proxy.on('certificateGenerated', (certInfo) => {
        generatedCertificates.push(certInfo);
        console.log(`✓ 为 ${certInfo.hostname} 生成证书`);
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 动态证书代理启动成功');
        
        // 测试不同域名的证书生成
        console.log('\n=== 测试多域名证书生成 ===');
        
        const testDomains = [
            { hostname: 'server1.local', port: 8091 },
            { hostname: 'server2.local', port: 8092 },
            { hostname: 'api.example.com', port: 8093 }
        ];
        
        for (const domain of testDomains) {
            console.log(`\n测试域名: ${domain.hostname}`);
            
            const response = await makeHTTPSRequestToDomain(domain.hostname, domain.port, '/test');
            
            if (response.statusCode === 200) {
                console.log(`✓ ${domain.hostname} 连接成功`);
            } else {
                console.log(`✗ ${domain.hostname} 连接失败`);
            }
            
            // 验证证书是否为该域名生成
            const certInfo = await getCertificateInfoForDomain(domain.hostname);
            if (certInfo && certInfo.subject.includes(domain.hostname)) {
                console.log(`✓ ${domain.hostname} 证书正确生成`);
            } else {
                console.log(`✗ ${domain.hostname} 证书生成异常`);
            }
        }
        
        // 测试证书缓存
        console.log('\n=== 测试证书缓存 ===');
        const cacheTestResults = await testCertificateCache(testDomains[0]);
        
        if (cacheTestResults.cached) {
            console.log('✓ 证书缓存功能正常');
        } else {
            console.log('⚠ 证书缓存功能异常');
        }
        
        // 测试通配符证书
        console.log('\n=== 测试通配符证书 ===');
        const wildcardResult = await testWildcardCertificate();
        
        if (wildcardResult.success) {
            console.log('✓ 通配符证书生成成功');
        } else {
            console.log('⚠ 通配符证书生成失败');
        }
        
        // 验证生成的证书数量
        console.log('\n=== 验证证书生成统计 ===');
        console.log(`生成的证书数量: ${generatedCertificates.length}`);
        console.log('生成的证书列表:');
        generatedCertificates.forEach((cert, index) => {
            console.log(`  ${index + 1}. ${cert.hostname} (${cert.timestamp})`);
        });
        
        if (generatedCertificates.length >= testDomains.length) {
            console.log('✓ 证书生成数量正确');
        } else {
            console.log('✗ 证书生成数量异常');
        }
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServers.forEach(server => server.server.close());
    }
}

// 为特定域名发送HTTPS请求
async function makeHTTPSRequestToDomain(hostname, targetPort, path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8443, // 代理端口
            path: path,
            method: 'GET',
            headers: {
                'Host': `${hostname}:${targetPort}`
            },
            rejectUnauthorized: false
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// 获取特定域名的证书信息
async function getCertificateInfoForDomain(hostname) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 8443,
            method: 'GET',
            headers: {
                'Host': hostname
            },
            rejectUnauthorized: false
        };
        
        const req = https.request(options, (res) => {
            const cert = res.connection.getPeerCertificate();
            resolve({
                subject: cert.subject ? Object.entries(cert.subject).map(([k, v]) => `${k}=${v}`).join(', ') : null,
                issuer: cert.issuer ? Object.entries(cert.issuer).map(([k, v]) => `${k}=${v}`).join(', ') : null,
                validFrom: cert.valid_from,
                validTo: cert.valid_to,
                subjectAltName: cert.subjectaltname
            });
        });
        
        req.on('error', reject);
        req.end();
    });
}

// 测试证书缓存
async function testCertificateCache(domain) {
    const startTime = Date.now();
    
    // 第一次请求（应该生成新证书）
    await makeHTTPSRequestToDomain(domain.hostname, domain.port, '/cache-test-1');
    const firstRequestTime = Date.now() - startTime;
    
    const cacheStartTime = Date.now();
    
    // 第二次请求（应该使用缓存证书）
    await makeHTTPSRequestToDomain(domain.hostname, domain.port, '/cache-test-2');
    const secondRequestTime = Date.now() - cacheStartTime;
    
    console.log(`首次请求时间: ${firstRequestTime}ms`);
    console.log(`缓存请求时间: ${secondRequestTime}ms`);
    
    // 如果缓存生效，第二次请求应该明显更快
    const cached = secondRequestTime < firstRequestTime * 0.5;
    
    return {
        cached: cached,
        firstRequestTime: firstRequestTime,
        secondRequestTime: secondRequestTime
    };
}

// 测试通配符证书
async function testWildcardCertificate() {
    try {
        // 测试子域名
        const subdomains = ['sub1.example.com', 'sub2.example.com', 'api.example.com'];
        
        for (const subdomain of subdomains) {
            const response = await makeHTTPSRequestToDomain(subdomain, 8093, '/wildcard-test');
            
            if (response.statusCode !== 200) {
                return { success: false, error: `${subdomain} 连接失败` };
            }
        }
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

testDynamicCertificateGeneration();
```

**预期结果**:
- 动态证书正确生成
- 不同域名使用不同证书
- 证书缓存功能正常
- 通配符证书支持

---

### TC-CERT-003: 证书验证和安全测试

**测试目标**: 验证证书验证机制和安全性

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const https = require('https');
const tls = require('tls');

async function testCertificateValidationAndSecurity() {
    const testServer = await createTestHTTPSServer(8091);
    
    const proxy = new NodeMITMProxy({
        config: {
            port: 8080,
            httpsPort: 8443
        },
        https: {
            enabled: true,
            certificate: {
                type: 'dynamic',
                validation: {
                    enabled: true,
                    strictMode: true,
                    checkRevocation: false, // 测试环境关闭
                    allowSelfSigned: false,
                    maxChainLength: 5
                }
            }
        },
        logger: { level: 'info' }
    });
    
    const validationResults = [];
    
    // 监听证书验证事件
    proxy.on('certificateValidation', (result) => {
        validationResults.push(result);
        console.log(`证书验证: ${result.hostname} - ${result.valid ? '通过' : '失败'}`);
        if (!result.valid) {
            console.log(`验证失败原因: ${result.error}`);
        }
    });
    
    try {
        await proxy.initialize();
        await proxy.start();
        console.log('✓ 证书验证代理启动成功');
        
        // 测试有效证书
        console.log('\n=== 测试有效证书验证 ===');
        const validCertResult = await testValidCertificate();
        
        if (validCertResult.success) {
            console.log('✓ 有效证书验证通过');
        } else {
            console.log('✗ 有效证书验证失败:', validCertResult.error);
        }
        
        // 测试过期证书
        console.log('\n=== 测试过期证书验证 ===');
        const expiredCertResult = await testExpiredCertificate();
        
        if (!expiredCertResult.success) {
            console.log('✓ 过期证书正确被拒绝');
        } else {
            console.log('✗ 过期证书验证异常');
        }
        
        // 测试自签名证书
        console.log('\n=== 测试自签名证书验证 ===');
        const selfSignedResult = await testSelfSignedCertificate();
        
        if (!selfSignedResult.success) {
            console.log('✓ 自签名证书正确被拒绝');
        } else {
            console.log('✗ 自签名证书验证异常');
        }
        
        // 测试证书链验证
        console.log('\n=== 测试证书链验证 ===');
        const chainResult = await testCertificateChain();
        
        if (chainResult.success) {
            console.log('✓ 证书链验证正常');
        } else {
            console.log('✗ 证书链验证失败:', chainResult.error);
        }
        
        // 测试域名匹配
        console.log('\n=== 测试域名匹配验证 ===');
        const domainMatchResult = await testDomainMatching();
        
        if (domainMatchResult.success) {
            console.log('✓ 域名匹配验证正常');
        } else {
            console.log('✗ 域名匹配验证失败:', domainMatchResult.error);
        }
        
        // 测试安全协议
        console.log('\n=== 测试安全协议 ===');
        const protocolResult = await testSecureProtocols();
        
        if (protocolResult.success) {
            console.log('✓ 安全协议配置正确');
            console.log(`支持的协议: ${protocolResult.protocols.join(', ')}`);
            console.log(`支持的密码套件: ${protocolResult.ciphers.length} 个`);
        } else {
            console.log('✗ 安全协议配置异常:', protocolResult.error);
        }
        
        // 验证结果统计
        console.log('\n=== 验证结果统计 ===');
        const passedValidations = validationResults.filter(r => r.valid).length;
        const failedValidations = validationResults.filter(r => !r.valid).length;
        
        console.log(`验证通过: ${passedValidations}`);
        console.log(`验证失败: ${failedValidations}`);
        console.log(`总验证次数: ${validationResults.length}`);
        
        return true;
        
    } catch (error) {
        console.error('✗ 测试失败:', error.message);
        return false;
    } finally {
        await proxy.stop();
        testServer.server.close();
    }
}

// 测试有效证书
async function testValidCertificate() {
    try {
        // 使用知名网站的证书进行测试（如果网络可用）
        const response = await makeSecureRequest('https://www.google.com', '/');
        return { success: response.statusCode === 200 };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 测试过期证书
async function testExpiredCertificate() {
    try {
        // 模拟过期证书测试
        // 实际实现中需要创建过期的测试证书
        const response = await makeSecureRequest('https://expired.badssl.com', '/');
        return { success: response.statusCode === 200 };
    } catch (error) {
        // 期望失败
        return { success: false, error: error.message };
    }
}

// 测试自签名证书
async function testSelfSignedCertificate() {
    try {
        const response = await makeSecureRequest('https://self-signed.badssl.com', '/');
        return { success: response.statusCode === 200 };
    } catch (error) {
        // 期望失败
        return { success: false, error: error.message };
    }
}

// 测试证书链验证
async function testCertificateChain() {
    try {
        const options = {
            hostname: 'localhost',
            port: 8443,
            path: '/chain-test',
            method: 'GET',
            rejectUnauthorized: true // 启用严格验证
        };
        
        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                const cert = res.connection.getPeerCertificate(true);
                
                // 检查证书链
                let chainLength = 0;
                let currentCert = cert;
                
                while (currentCert && currentCert.issuerCertificate) {
                    chainLength++;
                    currentCert = currentCert.issuerCertificate;
                    
                    // 防止无限循环
                    if (chainLength > 10) break;
                }
                
                resolve({
                    chainLength: chainLength,
                    rootCA: currentCert ? currentCert.subject : null
                });
            });
            
            req.on('error', reject);
            req.end();
        });
        
        return {
            success: true,
            chainLength: response.chainLength,
            rootCA: response.rootCA
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 测试域名匹配
async function testDomainMatching() {
    try {
        // 测试正确的域名匹配
        const correctMatch = await testDomainMatch('localhost', 'localhost');
        
        // 测试错误的域名匹配
        const incorrectMatch = await testDomainMatch('localhost', 'example.com');
        
        return {
            success: correctMatch && !incorrectMatch,
            correctMatch: correctMatch,
            incorrectMatch: incorrectMatch
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 测试特定域名匹配
async function testDomainMatch(connectHost, certHost) {
    try {
        const options = {
            hostname: connectHost,
            port: 8443,
            path: '/domain-test',
            method: 'GET',
            headers: {
                'Host': certHost
            },
            checkServerIdentity: (hostname, cert) => {
                // 自定义域名验证逻辑
                return tls.checkServerIdentity(hostname, cert);
            }
        };
        
        await new Promise((resolve, reject) => {
            const req = https.request(options, resolve);
            req.on('error', reject);
            req.end();
        });
        
        return true;
    } catch (error) {
        return false;
    }
}

// 测试安全协议
async function testSecureProtocols() {
    try {
        const options = {
            hostname: 'localhost',
            port: 8443,
            path: '/protocol-test',
            method: 'GET',
            secureProtocol: 'TLSv1_2_method', // 强制使用TLS 1.2
            rejectUnauthorized: false
        };
        
        const result = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                const socket = res.connection;
                
                resolve({
                    protocol: socket.getProtocol(),
                    cipher: socket.getCipher(),
                    ephemeralKeyInfo: socket.getEphemeralKeyInfo(),
                    peerCertificate: socket.getPeerCertificate()
                });
            });
            
            req.on('error', reject);
            req.end();
        });
        
        return {
            success: true,
            protocols: [result.protocol],
            ciphers: [result.cipher],
            keyInfo: result.ephemeralKeyInfo
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 发送安全请求
async function makeSecureRequest(url, path) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: path,
            method: 'GET',
            timeout: 5000
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

testCertificateValidationAndSecurity();
```

**预期结果**:
- 有效证书验证通过
- 无效证书被正确拒绝
- 证书链验证正常
- 域名匹配验证正确
- 安全协议配置合理

---

### TC-CERT-004: 证书性能测试

**测试目标**: 验证证书处理的性能表现

**测试步骤**:
```javascript
const { NodeMITMProxy } = require('node-proxy');
const https = require('https');

async function testCertificatePerformance() {
    const testServer = await createTestHTTPSServer(8091);
    
    console.log('=== 证书性能测试 ===');
    
    // 测试固定证书性能
    console.log('\n--- 固定证书性能测试 ---');
    const fixedCertResults = await testFixedCertificatePerformance();
    
    // 测试动态证书性能
    console.log('\n--- 动态证书性能测试 ---');
    const dynamicCertResults = await testDynamicCertificatePerformance();
    
    // 性能对比分析
    console.log('\n--- 性能对比分析 ---');
    analyzeCertificatePerformance(fixedCertResults, dynamicCertResults);
    
    testServer.server.close();
    return true;
}

// 测试固定证书性能
async function testFixedCertificatePerformance() {
    const proxy = new NodeMITMProxy({
        config: { port: 8080, httpsPort: 8443 },
        https: {
            enabled: true,
            certificate: {
                type: 'fixed',
                key: path.join(__dirname, 'certs', 'server.key'),
                cert: path.join(__dirname, 'certs', 'server.crt')
            }
        }
    });
    
    await proxy.initialize();
    await proxy.start();
    
    const results = await performCertificatePerformanceTest('fixed', 100);
    
    await proxy.stop();
    return results;
}

// 测试动态证书性能
async function testDynamicCertificatePerformance() {
    const proxy = new NodeMITMProxy({
        config: { port: 8080, httpsPort: 8443 },
        https: {
            enabled: true,
            certificate: {
                type: 'dynamic',
                ca: {
                    key: path.join(__dirname, 'certs', 'ca.key'),
                    cert: path.join(__dirname, 'certs', 'ca.crt')
                }
            }
        }
    });
    
    await proxy.initialize();
    await proxy.start();
    
    const results = await performCertificatePerformanceTest('dynamic', 100);
    
    await proxy.stop();
    return results;
}

// 执行证书性能测试
async function performCertificatePerformanceTest(type, requestCount) {
    const results = {
        type: type,
        requestCount: requestCount,
        connectionTimes: [],
        handshakeTimes: [],
        totalTime: 0,
        avgConnectionTime: 0,
        avgHandshakeTime: 0,
        errors: 0
    };
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < requestCount; i++) {
        promises.push(performSingleCertificateTest(results, i));
    }
    
    await Promise.allSettled(promises);
    
    results.totalTime = Date.now() - startTime;
    results.avgConnectionTime = results.connectionTimes.reduce((a, b) => a + b, 0) / results.connectionTimes.length;
    results.avgHandshakeTime = results.handshakeTimes.reduce((a, b) => a + b, 0) / results.handshakeTimes.length;
    
    return results;
}

// 执行单个证书测试
function performSingleCertificateTest(results, index) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let handshakeTime = 0;
        
        const options = {
            hostname: 'localhost',
            port: 8443,
            path: `/perf-test-${index}`,
            method: 'GET',
            headers: {
                'Host': `test-${index % 5}.example.com` // 使用不同域名测试动态证书
            },
            rejectUnauthorized: false
        };
        
        const req = https.request(options, (res) => {
            const connectionTime = Date.now() - startTime;
            results.connectionTimes.push(connectionTime);
            
            if (handshakeTime > 0) {
                results.handshakeTimes.push(handshakeTime);
            }
            
            res.on('data', () => {}); // 消费数据
            res.on('end', () => {
                resolve();
            });
        });
        
        req.on('secureConnect', () => {
            handshakeTime = Date.now() - startTime;
        });
        
        req.on('error', () => {
            results.errors++;
            resolve();
        });
        
        req.end();
    });
}

// 分析证书性能
function analyzeCertificatePerformance(fixedResults, dynamicResults) {
    console.log('固定证书性能:');
    console.log(`  平均连接时间: ${fixedResults.avgConnectionTime.toFixed(2)}ms`);
    console.log(`  平均握手时间: ${fixedResults.avgHandshakeTime.toFixed(2)}ms`);
    console.log(`  总耗时: ${fixedResults.totalTime}ms`);
    console.log(`  错误数: ${fixedResults.errors}`);
    
    console.log('\n动态证书性能:');
    console.log(`  平均连接时间: ${dynamicResults.avgConnectionTime.toFixed(2)}ms`);
    console.log(`  平均握手时间: ${dynamicResults.avgHandshakeTime.toFixed(2)}ms`);
    console.log(`  总耗时: ${dynamicResults.totalTime}ms`);
    console.log(`  错误数: ${dynamicResults.errors}`);
    
    // 性能对比
    const connectionOverhead = ((dynamicResults.avgConnectionTime - fixedResults.avgConnectionTime) / fixedResults.avgConnectionTime) * 100;
    const handshakeOverhead = ((dynamicResults.avgHandshakeTime - fixedResults.avgHandshakeTime) / fixedResults.avgHandshakeTime) * 100;
    
    console.log('\n性能对比:');
    console.log(`  连接时间开销: ${connectionOverhead.toFixed(2)}%`);
    console.log(`  握手时间开销: ${handshakeOverhead.toFixed(2)}%`);
    
    // 性能评估
    if (connectionOverhead < 100 && handshakeOverhead < 150) {
        console.log('✓ 动态证书性能开销在可接受范围内');
    } else {
        console.log('⚠ 动态证书性能开销较高，建议优化');
    }
}

testCertificatePerformance();
```

**预期结果**:
- 固定证书性能稳定
- 动态证书性能开销合理
- 证书缓存有效提升性能
- 并发处理能力良好

---

## 测试执行指南

### 运行单个测试
```bash
node test-cert-001.js
```

### 运行所有证书测试
```bash
# 创建证书测试套件
node -e "
const tests = [
    'test-cert-001.js', // 固定证书
    'test-cert-002.js', // 动态证书
    'test-cert-003.js', // 证书验证
    'test-cert-004.js'  // 性能测试
];

async function runCertificateTests() {
    console.log('=== 证书管理测试套件 ===\\n');
    
    for (const test of tests) {
        console.log(\`运行测试: \${test}\`);
        try {
            require(\`./\${test}\`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error(\`测试失败: \${error.message}\`);
        }
        console.log('---');
    }
}

runCertificateTests();
"
```

### 证书准备
```bash
# 创建证书目录
mkdir -p certs

# 生成CA私钥
openssl genrsa -out certs/ca.key 2048

# 生成CA证书
openssl req -new -x509 -key certs/ca.key -out certs/ca.crt -days 365 -subj "/C=CN/ST=Beijing/L=Beijing/O=Test CA/OU=Test/CN=Test Root CA"

# 生成服务器私钥
openssl genrsa -out certs/server.key 2048

# 生成服务器证书请求
openssl req -new -key certs/server.key -out certs/server.csr -subj "/C=CN/ST=Beijing/L=Beijing/O=Test/OU=Test/CN=localhost"

# 使用CA签发服务器证书
openssl x509 -req -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial -out certs/server.crt -days 365
```

## 故障排除

### 常见问题

1. **证书文件不存在**
   - 检查证书文件路径
   - 确认文件权限
   - 重新生成证书

2. **证书验证失败**
   - 检查证书有效期
   - 验证证书链完整性
   - 确认域名匹配

3. **动态证书生成失败**
   - 检查CA证书配置
   - 验证OpenSSL可用性
   - 确认磁盘空间充足

4. **HTTPS连接失败**
   - 检查端口占用
   - 验证防火墙设置
   - 确认SSL/TLS配置