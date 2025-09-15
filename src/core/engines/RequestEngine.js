const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');
const { pipeline } = require('stream');

/**
 * 请求处理引擎
 * 负责处理HTTP请求的核心逻辑
 */
class RequestEngine {
    constructor(options = {}) {
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        this.middlewareManager = options.middlewareManager;
        this.interceptorManager = options.interceptorManager;
        this.tlsManager = options.tlsManager;
        
        // 请求选项
        this.timeout = options.timeout || 30000;
        this.keepAlive = options.keepAlive !== false;
        this.maxRedirects = options.maxRedirects || 5;
        
        // HTTP代理
        this.httpAgent = new http.Agent({
            keepAlive: this.keepAlive,
            timeout: this.timeout,
            maxSockets: options.maxSockets || 256
        });
        
        // HTTPS代理
        this.httpsAgent = new https.Agent({
            keepAlive: this.keepAlive,
            timeout: this.timeout,
            maxSockets: options.maxSockets || 256,
            rejectUnauthorized: false // 允许自签名证书
        });
    }
    
    /**
     * 处理请求
     */
    async handle(context) {
        const startTime = Date.now();
        
        try {
            // 解析请求URL
            const parsedUrl = this._parseRequestUrl(context.request);
            if (!parsedUrl) {
                throw new Error('Invalid request URL');
            }
            
            context.parsedUrl = parsedUrl;
            context.ssl = parsedUrl.protocol === 'https:';
            
            // 执行中间件（请求前）
            if (this.middlewareManager) {
                await this.middlewareManager.executeBeforeRequest(context);
                if (context.stopped) return;
            }
            
            // 检查拦截器
            if (this.interceptorManager) {
                const shouldIntercept = await this.interceptorManager.shouldIntercept(context);
                if (shouldIntercept) {
                    await this.interceptorManager.interceptRequest(context);
                    context.markIntercepted();
                    if (context.stopped) return;
                }
            }
            
            // 如果没有被拦截，则转发请求
            if (!context.intercepted) {
                await this._forwardRequest(context);
            }
            
            // 执行中间件（响应后）
            if (this.middlewareManager) {
                await this.middlewareManager.executeAfterResponse(context);
            }
            
            // 执行拦截器（响应后）
            if (this.interceptorManager && context.intercepted) {
                await this.interceptorManager.interceptResponse(context);
            }
            
        } catch (error) {
            context.error = error;
            await this._handleError(context, error);
        } finally {
            // 记录处理时间
            const duration = Date.now() - startTime;
            if (this.logger) {
                this.logger.debug('Request processed', {
                    method: context.getMethod(),
                    url: context.getUrl(),
                    statusCode: context.getStatusCode(),
                    duration,
                    intercepted: context.intercepted
                });
            }
        }
    }
    
    /**
     * 解析请求URL
     */
    _parseRequestUrl(request) {
        try {
            let targetUrl;
            
            if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
                // 绝对URL（正向代理）
                targetUrl = request.url;
            } else {
                // 相对URL，需要从Host头构建完整URL
                const host = request.headers.host;
                if (!host) {
                    return null;
                }
                
                const protocol = request.connection.encrypted ? 'https:' : 'http:';
                targetUrl = `${protocol}//${host}${request.url}`;
            }
            
            return url.parse(targetUrl);
        } catch (error) {
            return null;
        }
    }
    
    /**
     * 转发请求
     */
    async _forwardRequest(context) {
        return new Promise((resolve, reject) => {
            const { request, response, parsedUrl } = context;
            
            // 准备请求选项
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.path,
                method: request.method,
                headers: this._prepareHeaders(request.headers, parsedUrl),
                agent: parsedUrl.protocol === 'https:' ? this.httpsAgent : this.httpAgent,
                timeout: this.timeout
            };
            
            // 选择HTTP模块
            const httpModule = parsedUrl.protocol === 'https:' ? https : http;
            
            // 创建代理请求
            const proxyRequest = httpModule.request(options, (proxyResponse) => {
                this._handleProxyResponse(context, proxyResponse, resolve, reject);
            });
            
            // 设置请求超时
            proxyRequest.setTimeout(this.timeout, () => {
                proxyRequest.destroy();
                reject(new Error('Request timeout'));
            });
            
            // 处理请求错误
            proxyRequest.on('error', (error) => {
                reject(error);
            });
            
            // 转发请求体
            if (this._hasRequestBody(request)) {
                let requestSize = 0;
                
                request.on('data', (chunk) => {
                    requestSize += chunk.length;
                    proxyRequest.write(chunk);
                });
                
                request.on('end', () => {
                    context.requestSize = requestSize;
                    proxyRequest.end();
                });
                
                request.on('error', (error) => {
                    proxyRequest.destroy();
                    reject(error);
                });
            } else {
                proxyRequest.end();
            }
        });
    }
    
    /**
     * 处理代理响应
     */
    _handleProxyResponse(context, proxyResponse, resolve, reject) {
        const { response } = context;
        
        try {
            // 设置响应头
            const headers = this._prepareResponseHeaders(proxyResponse.headers);
            response.writeHead(proxyResponse.statusCode, proxyResponse.statusMessage, headers);
            
            // 记录响应大小
            let responseSize = 0;
            
            // 处理响应体
            if (this._shouldDecompressResponse(proxyResponse)) {
                // 需要解压缩的响应
                this._handleCompressedResponse(context, proxyResponse, (data) => {
                    responseSize += data.length;
                    response.write(data);
                }, () => {
                    context.responseSize = responseSize;
                    response.end();
                    resolve();
                }, reject);
            } else {
                // 直接转发响应
                proxyResponse.on('data', (chunk) => {
                    responseSize += chunk.length;
                    response.write(chunk);
                });
                
                proxyResponse.on('end', () => {
                    context.responseSize = responseSize;
                    response.end();
                    resolve();
                });
                
                proxyResponse.on('error', reject);
            }
            
        } catch (error) {
            reject(error);
        }
    }
    
    /**
     * 处理压缩响应
     */
    _handleCompressedResponse(context, proxyResponse, onData, onEnd, onError) {
        const encoding = proxyResponse.headers['content-encoding'];
        let decompressor;
        
        switch (encoding) {
            case 'gzip':
                decompressor = zlib.createGunzip();
                break;
            case 'deflate':
                decompressor = zlib.createInflate();
                break;
            case 'br':
                decompressor = zlib.createBrotliDecompress();
                break;
            default:
                // 不支持的压缩格式，直接转发
                proxyResponse.on('data', onData);
                proxyResponse.on('end', onEnd);
                proxyResponse.on('error', onError);
                return;
        }
        
        // 使用pipeline处理流
        pipeline(
            proxyResponse,
            decompressor,
            (error) => {
                if (error) {
                    onError(error);
                } else {
                    onEnd();
                }
            }
        );
        
        decompressor.on('data', onData);
    }
    
    /**
     * 准备请求头
     */
    _prepareHeaders(headers, parsedUrl) {
        const newHeaders = { ...headers };
        
        // 移除代理相关头部
        delete newHeaders['proxy-connection'];
        delete newHeaders['proxy-authorization'];
        
        // 更新Host头
        if (parsedUrl.hostname) {
            newHeaders.host = parsedUrl.port && parsedUrl.port !== (parsedUrl.protocol === 'https:' ? 443 : 80)
                ? `${parsedUrl.hostname}:${parsedUrl.port}`
                : parsedUrl.hostname;
        }
        
        // 添加代理标识
        newHeaders['x-forwarded-by'] = 'node-mitmproxy';
        
        return newHeaders;
    }
    
    /**
     * 准备响应头
     */
    _prepareResponseHeaders(headers) {
        const newHeaders = { ...headers };
        
        // 移除可能导致问题的头部
        delete newHeaders['transfer-encoding'];
        delete newHeaders['content-encoding']; // 如果解压缩了内容
        
        return newHeaders;
    }
    
    /**
     * 检查请求是否有请求体
     */
    _hasRequestBody(request) {
        const method = request.method.toUpperCase();
        return method === 'POST' || method === 'PUT' || method === 'PATCH' || 
               request.headers['content-length'] || request.headers['transfer-encoding'];
    }
    
    /**
     * 检查是否应该解压缩响应
     */
    _shouldDecompressResponse(proxyResponse) {
        const encoding = proxyResponse.headers['content-encoding'];
        return encoding && (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br');
    }
    
    /**
     * 处理错误
     */
    async _handleError(context, error) {
        if (this.logger) {
            this.logger.error('Request engine error', {
                error: error.message,
                url: context.getUrl(),
                method: context.getMethod()
            });
        }
        
        // 发送错误响应
        if (context.response && !context.response.headersSent) {
            try {
                let statusCode = 502;
                let message = 'Bad Gateway';
                
                if (error.code === 'ENOTFOUND') {
                    statusCode = 404;
                    message = 'Not Found';
                } else if (error.code === 'ECONNREFUSED') {
                    statusCode = 503;
                    message = 'Service Unavailable';
                } else if (error.code === 'ETIMEDOUT') {
                    statusCode = 504;
                    message = 'Gateway Timeout';
                }
                
                context.response.writeHead(statusCode, { 'Content-Type': 'text/plain' });
                context.response.end(message);
            } catch (responseError) {
                // 忽略响应错误
            }
        }
    }
    
    /**
     * 销毁引擎
     */
    destroy() {
        if (this.httpAgent) {
            this.httpAgent.destroy();
        }
        if (this.httpsAgent) {
            this.httpsAgent.destroy();
        }
    }
}

module.exports = RequestEngine;