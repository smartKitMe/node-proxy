# 固定证书功能使用说明

## 概述

为了提升代理服务器的性能，我们添加了固定证书功能。启用此功能后，代理服务器将使用预设的固定证书和密钥，而不是为每个域名动态生成证书。这可以显著减少证书生成时间和网络请求，从而提升整体请求速度。

## 主要优势

1. **性能提升**：避免了动态证书生成的计算开销
2. **减少网络请求**：不需要向目标服务器发起HEAD请求获取原始证书
3. **更快的响应时间**：直接返回预设证书，无需等待
4. **资源节省**：减少CPU和内存使用

## 使用方法

### 方法1：在构造函数中启用

#### 方式1: 使用forge对象

```javascript
const CertAndKeyContainer = require('./src/tls/CertAndKeyContainer');
const tlsUtils = require('./src/tls/tlsUtils');
const forge = require('node-forge');

// 创建或加载证书
const ca = tlsUtils.createCA('MyProxy CA');
const fixedCert = tlsUtils.createFakeCertificateByDomain(ca.key, ca.cert, '*.example.com');

// 在构造函数中启用固定证书
const certContainer = new CertAndKeyContainer({
    caCert: ca.cert,
    caKey: ca.key,
    fixedCert: fixedCert.cert,
    fixedKey: fixedCert.key,
    useFixedCert: true
});
```

#### 方式2: 使用文件路径

```javascript
const CertAndKeyContainer = require('./src/tls/CertAndKeyContainer');

// 使用文件路径模式
const certContainer = new CertAndKeyContainer({
    caCert: ca.cert,
    caKey: ca.key,
    fixedCertPath: '/path/to/your/fixed-cert.pem',
    fixedKeyPath: '/path/to/your/fixed-key.pem',
    useFixedCert: true
});
```

#### 方式3: 使用证书字符串内容

```javascript
const CertAndKeyContainer = require('./src/tls/CertAndKeyContainer');

// 证书和密钥的PEM格式字符串
const certPem = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/heBjcOuMA0GCSqGSIb3DQEBBQUAMEUxCzAJBgNV
...
-----END CERTIFICATE-----`;

const keyPem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAuGbXWiK3dQTyCbX5xdE4yCuYp0yyTn1WBQOzWBiHfVmXSu0k
...
-----END RSA PRIVATE KEY-----`;

// 使用字符串模式
const certContainer = new CertAndKeyContainer({
    caCert: ca.cert,
    caKey: ca.key,
    fixedCertString: certPem,  // 直接传入证书字符串
    fixedKeyString: keyPem,    // 直接传入密钥字符串
    useFixedCert: true
});
```

**注意**: 字符串模式优先级高于文件路径模式，forge对象模式优先级最高。如果同时提供多种模式，将按照优先级使用。

### 方法2：动态设置固定证书

```javascript
// 先创建容器
const certContainer = new CertAndKeyContainer({
    caCert: ca.cert,
    caKey: ca.key
});

// 然后设置固定证书
certContainer.setFixedCert(fixedCert.cert, fixedCert.key, true);
```

### 方法3：在FakeServersCenter中使用

```javascript
const FakeServersCenter = require('./src/tls/FakeServersCenter');

const fakeServersCenter = new FakeServersCenter({
    caCert: ca.cert,
    caKey: ca.key,
    fixedCert: fixedCert.cert,
    fixedKey: fixedCert.key,
    useFixedCert: true,
    requestHandler: (req, res) => {
        // 你的请求处理逻辑
        res.end('Hello World!');
    }
});
```

## API 参考

### CertAndKeyContainer 构造函数参数

- `fixedCert` (forge.pki.Certificate, 可选): 固定证书对象（最高优先级）
- `fixedKey` (forge.pki.PrivateKey, 可选): 固定密钥对象（最高优先级）
- `fixedCertPath` (String, 可选): 固定证书文件路径
- `fixedKeyPath` (String, 可选): 固定密钥文件路径
- `fixedCertString` (String, 可选): 固定证书PEM格式字符串
- `fixedKeyString` (String, 可选): 固定密钥PEM格式字符串
- `useFixedCert` (Boolean, 默认false): 是否启用固定证书模式

### mitmproxy.createProxy 参数

- `fixedCertPath` (String, 可选): 固定证书文件路径
- `fixedKeyPath` (String, 可选): 固定密钥文件路径
- `fixedCert` (String, 可选): 固定证书PEM格式字符串
- `fixedKey` (String, 可选): 固定密钥PEM格式字符串
- `useFixedCert` (Boolean, 默认false): 是否启用固定证书模式

### 优先级说明

当同时提供多种证书来源时，优先级如下：
1. **forge对象模式** (`fixedCert` + `fixedKey` 对象)
2. **字符串模式** (`fixedCert` + `fixedKey` 字符串)
3. **文件路径模式** (`fixedCertPath` + `fixedKeyPath`)

系统会按照优先级选择第一个可用的模式。

### 新增方法

#### `setFixedCert(cert, key, enable = true)`
设置固定证书和密钥
- `cert`: 证书对象
- `key`: 私钥对象
- `enable`: 是否启用固定证书模式

#### `enableFixedCert(enable)`
启用或禁用固定证书模式
- `enable`: 布尔值，true启用，false禁用

#### `isFixedCertEnabled()`
检查是否启用了固定证书模式
- 返回值: 布尔值

## 证书准备

### 使用现有证书文件

```javascript
const fs = require('fs');
const forge = require('node-forge');

// 从PEM文件加载
const certPem = fs.readFileSync('path/to/cert.pem', 'utf8');
const keyPem = fs.readFileSync('path/to/key.pem', 'utf8');

const cert = forge.pki.certificateFromPem(certPem);
const key = forge.pki.privateKeyFromPem(keyPem);
```

### 生成新的通用证书

```javascript
const tlsUtils = require('./src/tls/tlsUtils');

// 创建CA
const ca = tlsUtils.createCA('MyProxy CA');

// 生成通用证书（可用于多个域名）
const cert = tlsUtils.createFakeCertificateByDomain(ca.key, ca.cert, '*.proxy.local');
```

## 注意事项

1. **证书兼容性**：固定证书可能不会完全匹配所有目标域名，某些严格的SSL验证可能会失败
2. **安全考虑**：固定证书会被所有连接重复使用，在安全敏感的环境中需要谨慎考虑
3. **证书有效期**：确保固定证书有足够长的有效期
4. **域名匹配**：建议使用通配符证书（如*.example.com）以覆盖更多域名

## 性能对比

| 模式 | 证书生成时间 | 网络请求 | 内存使用 | 适用场景 |
|------|-------------|----------|----------|----------|
| 动态证书 | 较高 | 需要 | 较高 | 需要精确匹配目标证书 |
| 固定证书 | 极低 | 不需要 | 较低 | 追求性能，可接受通用证书 |

## 示例代码

完整的使用示例请参考 `example-fixed-cert.js` 文件。

## 故障排除

1. **证书格式错误**：确保证书和密钥是有效的forge对象
2. **固定证书未生效**：检查`useFixedCert`是否为true，以及证书对象是否正确设置
3. **SSL握手失败**：可能需要调整证书的扩展属性或使用更通用的证书

运行示例：
```bash
node example-fixed-cert.js
```