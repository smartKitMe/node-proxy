const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');
const { pipeline } = require('stream');
const { PassThrough } = require('stream');
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
        
        // 请求选项 - 优化：调整默认值以提高性能
        this.timeout = options.timeout || 30000;
        this.keepAlive = options.keepAlive !== false;
        this.maxRedirects = options.maxRedirects || 5;
        
        // 性能优化选项
        this.enableStreaming = options.enableStreaming !== false; // 默认启用流式处理
        this.maxBodySize = options.maxBodySize || 10 * 1024 * 1024; // 10MB最大体大小
        this.enableShortCircuit = options.enableShortCircuit !== false; // 默认启用短路机制
        this.errorCacheTTL = options.errorCacheTTL || 60000; // 错误缓存1分钟
        
        // 错误缓存 - 优化：增加错误缓存机制
        this.errorCache = new Map();
        this.errorCacheCleanupInterval = setInterval(() => {
            this._cleanupErrorCache();
        }, 30000); // 每30秒清理一次过期错误缓存
        
        // 连接池管理器 - 优化：增加连接池大小
        this.connectionPool = new ConnectionPoolManager({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            maxSockets: options.maxSockets || 1024, // 增加到1024
            maxFreeSockets: options.maxFreeSockets || 512, // 增加到512
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
     * 处理请求 - 优化：改进中间件和拦截器处理
     */
    async handle(context) {
        const startTime = Date.now();
        
        try {
            // 检查错误缓存 - 优化：快速响应已知错误
            const errorCacheKey = this._getErrorCacheKey(context.request);
            if (this.errorCache.has(errorCacheKey)) {
                const cachedError = this.errorCache.get(errorCacheKey);
                if (Date.now() - cachedError.timestamp < this.errorCacheTTL) {
                    // 使用缓存的错误响应
                    await this._handleError(context, cachedError.error);
                    return;
                } else {
                    // 缓存过期，删除
                    this.errorCache.delete(errorCacheKey);
                }
            }
            
            // 解析请求URL
            const parsedUrl = this._parseRequestUrl(context.request);
            if (!parsedUrl) {
                throw new Error('Invalid request URL');
            }
            
            context.parsedUrl = parsedUrl;
            context.ssl = parsedUrl.protocol === 'https:';
            
            // 执行中间件（请求前）- 优化：实现短路机制
            if (this.middlewareManager) {
                const middlewareResult = await this.middlewareManager.executeBeforeRequest(context);
                if (context.stopped) {
                    // 如果中间件停止了处理，确保响应被发送
                    if (context.response && context.response.statusCode && !context.response.headersSent) {
                        const headers = context.response.headers || { 'Content-Type': 'text/plain' };
                        context.response.writeHead(context.response.statusCode, headers);
                        if (context.response.body) {
                            context.response.end(context.response.body);
                        } else {
                            context.response.end();
                        }
                    }
                    return;
                }
            }
            
            // 检查拦截器 - 优化：优先级排序和短路机制
            let intercepted = false;
            if (this.interceptorManager) {
                const shouldIntercept = await this.interceptorManager.shouldInterceptRequest(context);
                if (shouldIntercept) {
                    const result = await this.interceptorManager.interceptRequest(context);
                    
                    // 处理拦截器响应
                    if (result && result instanceof InterceptorResult) {
                        if (result.shouldDirectResponse()) {
                            // 直接返回拦截器内容
                            await this._handleDirectResponse(context, result.data);
                            context.markIntercepted();
                            intercepted = true;
                            
                            // 短路机制：如果启用了短路且上下文已停止，则直接返回
                            if (this.enableShortCircuit && context.stopped) {
                                return;
                            }
                        } else if (result.shouldModifyAndForward()) {
                            // 修改请求后转发
                            this._applyRequestModifications(context, result);
                            context.markIntercepted();
                            intercepted = true;
                        }
                    }
                }
            }
            
            // 转发请求（如果没有直接响应）
            if (!intercepted || (context.interceptorResult && context.interceptorResult.shouldModifyAndForward())) {
                await this._forwardRequest(context);
            }
            
            // 执行中间件（响应后）- 优化：短路机制
            if (this.middlewareManager && !context.stopped) {
                await this.middlewareManager.executeAfterResponse(context);
            }
            
            // 执行拦截器（响应后）- 优化：短路机制
            if (this.interceptorManager && context.intercepted && !context.stopped) {
                await this.interceptorManager.interceptResponse(context);
            }
            
        } catch (error) {
            context.error = error;
            // 缓存错误 - 优化：增加错误缓存机制
            this._cacheError(context.request, error);
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
                this.metrics.recordRequest(context);
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
     * 转发请求 - 优化：更好地利用连接池和流式处理
     */
    async _forwardRequest(context) {
        const { request, response, parsedUrl } = context;
        
        // 获取连接池优化的代理
        const agent = this.connectionPool.getAgent(parsedUrl.protocol === 'https:', parsedUrl.hostname, parsedUrl.port);
        
        // 准备请求选项 - 优化：减少不必要的头部操作
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.path,
            method: request.method,
            headers: this._prepareHeaders(request.headers, parsedUrl), // 优化：改进头部处理
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
            
            // 优化：使用流式处理，避免将整个响应体缓存到内存中
            if (this.enableStreaming) {
                this._handleProxyResponseStreaming(context, proxyResponse);
            } else {
                this._handleProxyResponse(context, proxyResponse);
            }
        });
        
        // 设置请求超时
        proxyRequest.setTimeout(this.timeout, () => {
            proxyRequest.destroy();
            if (this.metrics) {
                this.metrics.incrementCounter('proxy_timeouts_total');
            }
            context.error = new Error('Request timeout');
        });
        
        // 处理请求错误
        proxyRequest.on('error', (error) => {
            if (this.metrics) {
                this.metrics.incrementCounter('proxy_errors_total', {
                    error_type: error.code || 'unknown'
                });
            }
            context.error = error;
        });
        
        // 优化：使用流式处理转发请求体，避免内存缓存
        if (this._hasRequestBody(request)) {
            if (context.modifiedRequestBody !== undefined) {
                // 如果有修改的请求体，使用修改后的内容
                const bodyData = typeof context.modifiedRequestBody === 'string' 
                    ? Buffer.from(context.modifiedRequestBody) 
                    : context.modifiedRequestBody;
                
                context.requestSize = bodyData.length;
                proxyRequest.end(bodyData);
            } else {
                // 流式转发请求体
                let requestSize = 0;
                
                request.on('data', (chunk) => {
                    requestSize += chunk.length;
                    // 检查请求体大小限制
                    if (requestSize > this.maxBodySize) {
                        proxyRequest.destroy();
                        context.error = new Error(`Request body too large: ${requestSize} bytes`);
                        return;
                    }
                    proxyRequest.write(chunk);
                });
                
                request.on('end', () => {
                    context.requestSize = requestSize;
                    proxyRequest.end();
                });
                
                request.on('error', (error) => {
                    proxyRequest.destroy();
                    context.error = error;
                });
            }
        } else {
            proxyRequest.end();
        }
        
        // 等待请求完成或出错
        return new Promise((resolve, reject) => {
            proxyRequest.on('close', resolve);
            proxyRequest.on('error', reject);
            
            // 如果上下文已经有错误，立即reject
            if (context.error) {
                reject(context.error);
            }
        });
    }
    
    /**
     * 流式处理代理响应 - 优化：使用流式处理，减少内存占用
     */
    _handleProxyResponseStreaming(context, proxyResponse) {
        const { response } = context;
        
        try {
            // 设置响应头
            const headers = this._prepareResponseHeaders(proxyResponse.headers);
            response.writeHead(proxyResponse.statusCode, proxyResponse.statusMessage, headers);
            
            // 直接管道转发响应体，避免内存缓存
            pipeline(
                proxyResponse,
                response,
                (error) => {
                    if (error) {
                        if (this.logger) {
                            this.logger.error('Response streaming error', { error: error.message });
                        }
                    }
                }
            );
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to handle streaming response', { error: error.message });
            }
            // 出错时回退到非流式处理
            this._handleProxyResponse(context, proxyResponse);
        }
    }
    
    /**
     * 处理代理响应（非流式）- 优化：对于需要拦截器处理的响应使用此方法
     */
    _handleProxyResponse(context, proxyResponse) {
        const { response } = context;
        
        try {
            // 创建响应对象，用于拦截器处理
            context.response = {
                statusCode: proxyResponse.statusCode,
                statusMessage: proxyResponse.statusMessage,
                headers: { ...proxyResponse.headers },
                body: null // 我们将在数据接收时填充这个字段
            };
            
            // 收集响应体数据
            const chunks = [];
            let totalLength = 0;
            
            proxyResponse.on('data', (chunk) => {
                // 检查响应体大小限制
                if (totalLength + chunk.length > this.maxBodySize) {
                    if (this.logger) {
                        this.logger.warn('Response body too large, truncating', {
                            size: totalLength + chunk.length,
                            limit: this.maxBodySize
                        });
                    }
                    return;
                }
                
                chunks.push(chunk);
                totalLength += chunk.length;
            });
            
            proxyResponse.on('end', async () => {
                try {
                    // 合并响应体
                    const body = Buffer.concat(chunks, totalLength);
                    context.response.body = body;
                    context.responseSize = totalLength;
                    
                    // 执行响应拦截器
                    if (this.interceptorManager) {
                        const shouldIntercept = await this.interceptorManager.shouldInterceptResponse(context);
                        if (shouldIntercept) {
                            await this.interceptorManager.interceptResponse(context);
                            
                            // 处理拦截器响应
                            if (context.interceptorResult) {
                                const result = context.interceptorResult;
                                
                                if (result.shouldDirectResponse()) {
                                    // 直接返回拦截器内容
                                    await this._handleDirectResponseForInterceptor(context, result.data, response);
                                    return;
                                } else if (result.shouldModifyAndForward()) {
                                    // 修改响应后转发
                                    this._applyResponseModifications(context, result);
                                }
                            }
                        }
                    }
                    
                    // 执行中间件（响应后）
                    if (this.middlewareManager) {
                        await this.middlewareManager.executeAfterResponse(context);
                    }
                    
                    // 设置响应头
                    const headers = this._prepareResponseHeaders(context.response.headers);
                    response.writeHead(context.response.statusCode || proxyResponse.statusCode, context.response.statusMessage || proxyResponse.statusMessage, headers);
                    
                    // 发送响应体
                    if (context.response.body) {
                        response.write(context.response.body);
                    }
                    
                    response.end();
                } catch (error) {
                    if (this.logger) {
                        this.logger.error('Error handling response', { error: error.message });
                    }
                }
            });
            
            proxyResponse.on('error', (error) => {
                if (this.logger) {
                    this.logger.error('Proxy response error', { error: error.message });
                }
            });
            
        } catch (error) {
            if (this.logger) {
                this.logger.error('Failed to handle response', { error: error.message });
            }
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
     * 准备请求头 - 优化：减少不必要的头部操作
     */
    _prepareHeaders(headers, parsedUrl) {
        // 优化：直接创建新对象，避免多次删除操作
        const newHeaders = {};
        
        // 复制必要的头部
        for (const [key, value] of Object.entries(headers)) {
            const lowerKey = key.toLowerCase();
            
            // 跳过hop-by-hop头部
            if (lowerKey === 'connection' || 
                lowerKey === 'upgrade' || 
                lowerKey === 'te' || 
                lowerKey === 'trailers' || 
                lowerKey === 'proxy-authenticate') {
                continue;
            }
            
            // 如果没有配置代理转发，跳过代理相关头部
            if (!this.proxyConfig && 
                (lowerKey === 'proxy-connection' || lowerKey === 'proxy-authorization')) {
                continue;
            }
            
            newHeaders[key] = value;
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
        
        // 如果响应头已经发送，则不能发送直接响应
        if (!response || response.headersSent) {
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
            if (!headers['Content-Type'] && !headers['content-type']) {
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
     * 为拦截器处理直接响应
     */
    async _handleDirectResponseForInterceptor(context, result, response) {
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
            if (!headers['Content-Type'] && !headers['content-type']) {
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
        
        // 使用累积的修改结果
        const modifiedRequest = context.modifiedRequest || {};
        
        // 修改请求头
        if (modifiedRequest.headers) {
            Object.assign(request.headers, modifiedRequest.headers);
            
            if (this.logger) {
                this.logger.debug('Request headers modified', {
                    modified: Object.keys(modifiedRequest.headers)
                });
            }
        }
        
        // 修改请求URL
        if (modifiedRequest.url) {
            // 更新request.url
            request.url = modifiedRequest.url;
            // 重新解析URL
            const parsedUrl = this._parseRequestUrl(request);
            if (parsedUrl) {
                context.parsedUrl = parsedUrl;
                context.ssl = parsedUrl.protocol === 'https:';
                
                if (this.logger) {
                    this.logger.debug('Request URL modified', {
                        original: context.getUrl(),
                        modified: modifiedRequest.url
                    });
                }
            }
        }
        
        // 修改请求方法
        if (modifiedRequest.method) {
            request.method = modifiedRequest.method;
            
            if (this.logger) {
                this.logger.debug('Request method modified', {
                    method: modifiedRequest.method
                });
            }
        }
        
        // 存储修改的请求体（如果有）
        if (modifiedRequest.body !== undefined) {
            context.modifiedRequestBody = modifiedRequest.body;
            
            if (this.logger) {
                this.logger.debug('Request body modified');
            }
        }
    }
    
    /**
     * 应用响应修改
     */
    _applyResponseModifications(context, result) {
        const response = context.response;
        const modifiedData = result.data;
        
        // 修改响应头
        if (modifiedData.headers) {
            Object.assign(response.headers, modifiedData.headers);
        }
        
        // 修改状态码
        if (modifiedData.statusCode) {
            response.statusCode = modifiedData.statusCode;
        }
        
        // 修改状态消息
        if (modifiedData.statusMessage) {
            response.statusMessage = modifiedData.statusMessage;
        }
        
        // 修改响应体
        if (modifiedData.body !== undefined) {
            if (typeof modifiedData.body === 'string') {
                response.body = Buffer.from(modifiedData.body);
            } else if (Buffer.isBuffer(modifiedData.body)) {
                response.body = modifiedData.body;
            } else {
                response.body = Buffer.from(JSON.stringify(modifiedData.body));
            }
        }
        
        if (this.logger) {
            this.logger.debug('Response modified', {
                statusCode: response.statusCode,
                headersModified: !!modifiedData.headers,
                bodyModified: modifiedData.body !== undefined
            });
        }
    }
    
    /**
     * 处理错误 - 优化：优化错误处理流程
     */
    async _handleError(context, error) {
        // 优化：避免重复处理相同的错误
        if (context.errorHandled) {
            return;
        }
        context.errorHandled = true;
        
        if (this.logger) {
            this.logger.error('Request engine error', {
                error: error.message,
                url: context.getUrl(),
                method: context.getMethod(),
                code: error.code
            });
        }
        
        // 执行中间件错误处理
        if (this.middlewareManager) {
            try {
                await this.middlewareManager.executeOnError(context, error);
                // 如果中间件处理了错误并设置了响应，则直接返回
                if (context.response && context.response.statusCode) {
                    if (context.response && !context.response.headersSent) {
                        try {
                            const headers = context.response.headers || { 'Content-Type': 'application/json' };
                            context.response.writeHead(context.response.statusCode, headers);
                            if (context.response.body) {
                                context.response.end(context.response.body);
                            } else {
                                context.response.end();
                            }
                            return;
                        } catch (responseError) {
                            // 忽略响应错误
                        }
                    }
                }
            } catch (middlewareError) {
                if (this.logger) {
                    this.logger.error('Middleware error handling failed', {
                        error: middlewareError.message
                    });
                }
            }
        }
        
        // 发送默认错误响应
        if (context.response && !context.response.headersSent) {
            try {
                let statusCode = 502;
                let message = 'Bad Gateway';
                
                // 根据错误类型设置适当的响应码
                if (error.code === 'ENOTFOUND') {
                    statusCode = 404;
                    message = 'Not Found';
                } else if (error.code === 'ECONNREFUSED') {
                    statusCode = 503;
                    message = 'Service Unavailable';
                } else if (error.code === 'ETIMEDOUT') {
                    statusCode = 504;
                    message = 'Gateway Timeout';
                } else if (error.code === 'ECONNRESET') {
                    statusCode = 502;
                    message = 'Bad Gateway';
                } else if (error.message.includes('Request body too large')) {
                    statusCode = 413;
                    message = 'Request Entity Too Large';
                }
                
                context.response.writeHead(statusCode, { 'Content-Type': 'text/plain' });
                context.response.end(message);
            } catch (responseError) {
                // 忽略响应错误
            }
        }
    }
    
    /**
     * 获取错误缓存键 - 优化：为错误缓存生成键
     */
    _getErrorCacheKey(request) {
        return `${request.method}:${request.headers.host}:${request.url}`;
    }
    
    /**
     * 缓存错误 - 优化：缓存错误以快速响应相同请求
     */
    _cacheError(context, error) {
        const cacheKey = this._getErrorCacheKey(context.request);
        this.errorCache.set(cacheKey, {
            error: error,
            timestamp: Date.now()
        });
    }
    
    /**
     * 清理错误缓存 - 优化：定期清理过期错误缓存
     */
    _cleanupErrorCache() {
        const now = Date.now();
        for (const [key, value] of this.errorCache.entries()) {
            if (now - value.timestamp > this.errorCacheTTL) {
                this.errorCache.delete(key);
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
            maxRedirects: this.maxRedirects,
            enableStreaming: this.enableStreaming,
            maxBodySize: this.maxBodySize,
            errorCacheSize: this.errorCache.size
        };
    }
    
    /**
     * 销毁引擎 - 优化：清理错误缓存定时器
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
        
        // 清理错误缓存定时器
        if (this.errorCacheCleanupInterval) {
            clearInterval(this.errorCacheCleanupInterval);
        }
        
        // 清理错误缓存
        this.errorCache.clear();
    }
}

module.exports = RequestEngine;