const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');
const { pipeline } = require('stream');
const { InterceptorResult } = require('../../types/InterceptorTypes');
const ConnectionPoolManager = require('../proxy/ConnectionPoolManager');

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
        
        // 连接池管理器
        this.connectionPool = new ConnectionPoolManager({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            maxSockets: options.maxSockets || 256,
            maxFreeSockets: options.maxFreeSockets || 256,
            timeout: this.timeout,
            keepAlive: this.keepAlive,
            keepAliveMsecs: options.keepAliveMsecs || 1000,
            proxy: options.proxy,
            proxyAuth: options.proxyAuth
        });
        
        // 获取优化的HTTP/HTTPS代理
        this.httpAgent = this.connectionPool.getHttpAgent();
        this.httpsAgent = this.connectionPool.getHttpsAgent();
        
        // 代理转发配置
        this.proxyConfig = null;
        if (options.proxy) {
            try {
                const proxyUrl = new URL(options.proxy);
                this.proxyConfig = {
                    url: options.proxy,
                    hostname: proxyUrl.hostname,
                    port: proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80),
                    protocol: proxyUrl.protocol,
                    auth: options.proxyAuth || proxyUrl.username ? 
                        `${proxyUrl.username}:${proxyUrl.password}` : null,
                    enabled: true
                };
            } catch (error) {
                this.logger.warn('Invalid proxy URL, proxy disabled', { proxy: options.proxy, error: error.message });
                this.proxyConfig = null;
            }
        }
        this.proxyAuth = options.proxyAuth;
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
                    
                    // 处理拦截器响应
                    if (context.interceptorResult) {
                        const result = context.interceptorResult;
                        
                        if (result.shouldDirectResponse()) {
                            // 直接返回拦截器内容
                            await this._handleDirectResponse(context, result);
                            context.markIntercepted();
                            if (context.stopped) return;
                        } else if (result.shouldModifyAndForward()) {
                            // 修改请求后转发
                            this._applyRequestModifications(context, result);
                            context.markIntercepted();
                        }
                    }
                    
                    if (context.stopped) return;
                }
            }
            
            // 转发请求（如果没有直接响应）
            if (!context.intercepted || (context.interceptorResult && context.interceptorResult.shouldModifyAndForward())) {
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
                    intercepted: context.intercepted,
                    proxyUsed: this.proxyConfig ? true : false,
                    requestSize: context.requestSize || 0,
                    responseSize: context.responseSize || 0
                });
            }
            
            // 记录性能指标
            if (this.metrics) {
                this.metrics.recordHistogram('request_duration_ms', duration, {
                    method: context.getMethod(),
                    intercepted: context.intercepted ? 'true' : 'false',
                    proxy_used: this.proxyConfig ? 'true' : 'false'
                });
                
                if (context.requestSize) {
                    this.metrics.recordHistogram('request_size_bytes', context.requestSize);
                }
                
                if (context.responseSize) {
                    this.metrics.recordHistogram('response_size_bytes', context.responseSize);
                }
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
            
            // 获取连接池优化的代理
            const agent = this.connectionPool.getAgent(parsedUrl.protocol === 'https:', parsedUrl.hostname, parsedUrl.port);
            
            // 准备请求选项
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.path,
                method: request.method,
                headers: this._prepareHeaders(request.headers, parsedUrl),
                agent: agent,
                timeout: this.timeout
            };
            
            // 如果配置了代理转发，修改请求选项
            if (this.proxyConfig && this.proxyConfig.enabled) {
                const targetUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.path}`;
                
                options.hostname = this.proxyConfig.hostname;
                options.port = this.proxyConfig.port;
                options.path = targetUrl; // 使用完整URL作为路径
                
                // 添加代理认证
                if (this.proxyConfig.auth) {
                    options.headers['Proxy-Authorization'] = `Basic ${Buffer.from(this.proxyConfig.auth).toString('base64')}`;
                }
                
                // 添加代理相关头部
                options.headers['Host'] = parsedUrl.host;
                options.headers['Proxy-Connection'] = 'keep-alive';
                
                // 记录代理转发信息
                if (this.logger) {
                    this.logger.debug(`代理转发请求: ${request.method} ${targetUrl} -> ${this.proxyConfig.url}`);
                }
            }
            
            // 选择HTTP模块
            const httpModule = (this.proxyConfig && this.proxyConfig.protocol === 'https:') || (!this.proxyConfig && parsedUrl.protocol === 'https:') ? https : http;
            
            // 创建代理请求
            const proxyRequest = httpModule.request(options, (proxyResponse) => {
                // 记录性能指标
                if (this.metrics) {
                    this.metrics.incrementCounter('proxy_requests_total', {
                        method: request.method,
                        status: proxyResponse.statusCode,
                        proxy_used: this.proxyConfig ? 'true' : 'false'
                    });
                }
                
                this._handleProxyResponse(context, proxyResponse, resolve, reject);
            });
            
            // 设置请求超时
            proxyRequest.setTimeout(this.timeout, () => {
                proxyRequest.destroy();
                if (this.metrics) {
                    this.metrics.incrementCounter('proxy_timeouts_total');
                }
                reject(new Error('Request timeout'));
            });
            
            // 处理请求错误
            proxyRequest.on('error', (error) => {
                if (this.metrics) {
                    this.metrics.incrementCounter('proxy_errors_total', {
                        error_type: error.code || 'unknown'
                    });
                }
                reject(error);
            });
            
            // 转发请求体
            if (this._hasRequestBody(request)) {
                let requestSize = 0;
                
                // 如果有修改的请求体，使用修改后的内容
                if (context.modifiedRequestBody !== undefined) {
                    const bodyData = typeof context.modifiedRequestBody === 'string' 
                        ? Buffer.from(context.modifiedRequestBody) 
                        : context.modifiedRequestBody;
                    
                    context.requestSize = bodyData.length;
                    proxyRequest.end(bodyData);
                } else {
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
                }
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
        
        // 移除hop-by-hop头部
        delete newHeaders['connection'];
        delete newHeaders['upgrade'];
        delete newHeaders['te'];
        delete newHeaders['trailers'];
        delete newHeaders['proxy-authenticate'];
        
        // 如果没有配置代理转发，移除代理相关头部
        if (!this.proxyConfig) {
            delete newHeaders['proxy-connection'];
            delete newHeaders['proxy-authorization'];
        }
        
        // 更新Host头
        if (parsedUrl.hostname) {
            newHeaders.host = parsedUrl.port && parsedUrl.port !== (parsedUrl.protocol === 'https:' ? 443 : 80)
                ? `${parsedUrl.hostname}:${parsedUrl.port}`
                : parsedUrl.hostname;
        }
        
        // 添加代理标识
        newHeaders['x-forwarded-by'] = 'node-mitmproxy';
        
        // 添加X-Forwarded-For头
        if (!newHeaders['x-forwarded-for']) {
            newHeaders['x-forwarded-for'] = '127.0.0.1';
        }
        
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
     * 处理直接响应
     */
    async _handleDirectResponse(context, result) {
        const response = context.response;
        
        if (response.headersSent) {
            if (this.logger) {
                this.logger.warn('Cannot send direct response, headers already sent');
            }
            return;
        }
        
        try {
            // 设置响应头
            const headers = result.headers || {};
            const statusCode = result.statusCode || 200;
            
            // 添加默认头部
            if (!headers['Content-Type']) {
                headers['Content-Type'] = 'text/plain';
            }
            
            response.writeHead(statusCode, headers);
            
            // 发送响应体
            if (result.body) {
                if (typeof result.body === 'string') {
                    response.end(result.body);
                } else if (Buffer.isBuffer(result.body)) {
                    response.end(result.body);
                } else {
                    response.end(JSON.stringify(result.body));
                }
            } else {
                response.end();
            }
            
            if (this.logger) {
                this.logger.debug('Direct response sent', {
                    statusCode,
                    headers: Object.keys(headers)
                });
            }
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to send direct response', {
                    error: error.message
                });
            }
            throw error;
        }
    }
    
    /**
     * 应用请求修改
     */
    _applyRequestModifications(context, result) {
        const request = context.request;
        
        // 修改请求头
        if (result.modifiedHeaders) {
            Object.assign(request.headers, result.modifiedHeaders);
            
            if (this.logger) {
                this.logger.debug('Request headers modified', {
                    modified: Object.keys(result.modifiedHeaders)
                });
            }
        }
        
        // 修改请求URL
        if (result.modifiedUrl) {
            const parsedUrl = this._parseRequestUrl({ url: result.modifiedUrl });
            if (parsedUrl) {
                context.parsedUrl = parsedUrl;
                context.ssl = parsedUrl.protocol === 'https:';
                
                if (this.logger) {
                    this.logger.debug('Request URL modified', {
                        original: context.getUrl(),
                        modified: result.modifiedUrl
                    });
                }
            }
        }
        
        // 修改请求方法
        if (result.modifiedMethod) {
            request.method = result.modifiedMethod;
            
            if (this.logger) {
                this.logger.debug('Request method modified', {
                    method: result.modifiedMethod
                });
            }
        }
        
        // 存储修改的请求体（如果有）
        if (result.modifiedBody !== undefined) {
            context.modifiedRequestBody = result.modifiedBody;
            
            if (this.logger) {
                this.logger.debug('Request body modified');
            }
        }
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
     * 获取代理统计信息
     */
    getProxyStats() {
        return {
            proxyConfig: this.proxyConfig,
            proxyAuth: this.proxyAuth ? '***' : null,
            connectionPool: this.connectionPool ? this.connectionPool.getStats() : null,
            timeout: this.timeout,
            keepAlive: this.keepAlive,
            maxRedirects: this.maxRedirects
        };
    }
    
    /**
     * 销毁引擎
     */
    destroy() {
        if (this.connectionPool) {
            this.connectionPool.destroy();
        }
        if (this.httpAgent) {
            this.httpAgent.destroy();
        }
        if (this.httpsAgent) {
            this.httpsAgent.destroy();
        }
    }
}

module.exports = RequestEngine;