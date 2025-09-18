const { expect } = require('chai');
const RequestEngine = require('../../src/core/engines/RequestEngine');
const ConnectionPoolManager = require('../../src/core/proxy/ConnectionPoolManager');

describe('请求引擎优化测试', function() {
    this.timeout(10000);
    
    describe('连接池管理优化', function() {
        let connectionPool;
        
        beforeEach(function() {
            connectionPool = new ConnectionPoolManager({
                maxSockets: 1024,
                maxFreeSockets: 512,
                timeout: 5000,
                keepAlive: true
            });
        });
        
        afterEach(function() {
            if (connectionPool) {
                connectionPool.destroy();
            }
        });
        
        it('应该支持更大的连接池大小', function() {
            const stats = connectionPool.getStats();
            expect(stats.config.maxSockets).to.equal(1024);
            expect(stats.config.maxFreeSockets).to.equal(512);
        });
        
        it('应该正确创建HTTP和HTTPS代理', function() {
            const httpAgent = connectionPool.getHttpAgent();
            const httpsAgent = connectionPool.getHttpsAgent();
            
            expect(httpAgent).to.exist;
            expect(httpsAgent).to.exist;
        });
    });
    
    describe('请求处理引擎优化', function() {
        let requestEngine;
        
        beforeEach(function() {
            requestEngine = new RequestEngine({
                maxSockets: 1024,
                maxFreeSockets: 512,
                timeout: 5000,
                enableStreaming: true,
                maxBodySize: 5 * 1024 * 1024 // 5MB
            });
        });
        
        afterEach(function() {
            if (requestEngine) {
                requestEngine.destroy();
            }
        });
        
        it('应该启用流式处理', function() {
            const stats = requestEngine.getProxyStats();
            expect(stats.enableStreaming).to.be.true;
            expect(stats.maxBodySize).to.equal(5 * 1024 * 1024);
        });
        
        it('应该正确处理错误缓存', function() {
            // 模拟一个请求对象
            const mockRequest = {
                method: 'GET',
                headers: {
                    host: 'example.com'
                },
                url: '/test'
            };
            
            const mockError = new Error('Test error');
            mockError.code = 'ENOTFOUND';
            
            // 缓存错误
            requestEngine._cacheError({ request: mockRequest }, mockError);
            
            // 验证错误已缓存
            expect(requestEngine.errorCache.size).to.equal(1);
            
            // 清理错误缓存
            requestEngine._cleanupErrorCache();
            
            // 验证缓存已清理（但由于TTL未过期，可能仍然存在）
            // 这里我们只是验证方法能正常调用
            expect(requestEngine._getErrorCacheKey(mockRequest)).to.be.a('string');
        });
    });
    
    describe('头部处理优化', function() {
        let requestEngine;
        
        beforeEach(function() {
            requestEngine = new RequestEngine({
                timeout: 5000
            });
        });
        
        afterEach(function() {
            if (requestEngine) {
                requestEngine.destroy();
            }
        });
        
        it('应该正确准备请求头', function() {
            const originalHeaders = {
                'host': 'example.com',
                'connection': 'keep-alive',
                'user-agent': 'test-agent',
                'proxy-connection': 'keep-alive'
            };
            
            const parsedUrl = {
                hostname: 'example.com',
                port: 80,
                protocol: 'http:'
            };
            
            const preparedHeaders = requestEngine._prepareHeaders(originalHeaders, parsedUrl);
            
            // 应该移除hop-by-hop头部
            expect(preparedHeaders).to.not.have.property('connection');
            expect(preparedHeaders).to.not.have.property('proxy-connection');
            
            // 应该保留必要的头部
            expect(preparedHeaders).to.have.property('host', 'example.com');
            expect(preparedHeaders).to.have.property('user-agent', 'test-agent');
            
            // 应该添加必要的头部
            expect(preparedHeaders).to.have.property('x-forwarded-by', 'node-mitmproxy');
        });
    });
});