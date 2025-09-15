const mitmproxy = require('./src/mitmproxy');

// 测试性能监控控制功能
console.log('Testing performance metrics control...');

// 测试1: 启用性能监控
console.log('\n=== Test 1: Performance metrics enabled ===');
const proxyWithMetrics = mitmproxy.createProxy({
    port: 8080,
    enablePerformanceMetrics: true
});

proxyWithMetrics.listen(() => {
    console.log('Proxy with performance metrics started on port 8080');
    
    // 等待5秒后关闭
    setTimeout(() => {
        proxyWithMetrics.close(() => {
            console.log('Proxy with metrics closed');
            
            // 测试2: 禁用性能监控
            console.log('\n=== Test 2: Performance metrics disabled ===');
            const proxyWithoutMetrics = mitmproxy.createProxy({
                port: 8081,
                enablePerformanceMetrics: false
            });
            
            proxyWithoutMetrics.listen(() => {
                console.log('Proxy without performance metrics started on port 8081');
                
                // 等待5秒后关闭
                setTimeout(() => {
                    proxyWithoutMetrics.close(() => {
                        console.log('Proxy without metrics closed');
                        console.log('\n=== All tests completed ===');
                        process.exit(0);
                    });
                }, 5000);
            });
        });
    }, 5000);
});

// 错误处理
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});