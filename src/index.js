const EventEmitter = require('events');
const ProxyServer = require('./core/ProxyServer');
const ConfigManager = require('./foundation/config/ConfigManager');
const Logger = require('./foundation/logging/Logger');
const MetricsCollector = require('./foundation/monitoring/MetricsCollector');
const CertificateManager = require('./services/tls/CertificateManager');
const MiddlewareManager = require('./core/middleware/MiddlewareManager');
const InterceptorManager = require('./core/interceptors/InterceptorManager');
const EngineManager = require('./core/engines/EngineManager');
// 导出类型定义
const { RequestContext, ConnectContext, UpgradeContext } = require('./types/ProxyTypes');

// 导出接口定义
const IMiddleware = require('./interfaces/IMiddleware');
const IInterceptor = require('./interfaces/IInterceptor');
const ILogger = require('./interfaces/ILogger');
const IConfigProvider = require('./interfaces/IConfigProvider');

/**
 * Node MITMProxy - 重构版本
 * 高性能、模块化的HTTP/HTTPS代理服务器
 */
class NodeMITMProxy extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // 初始化配置管理器
        this.config = new ConfigManager(options.config);
        
        // 初始化日志系统
        this.logger = new Logger({
            ...options.logger,
            config: this.config
        });
        
        // 初始化性能监控
        this.metrics = new MetricsCollector({
            ...options.metrics,
            config: this.config,
            logger: this.logger
        });
        
        // 初始化证书管理器
        this.certificateManager = new CertificateManager({
            ...options.certificate,
            config: this.config,
            logger: this.logger,
            metrics: this.metrics
        });
        
        // 初始化中间件管理器
        this.middlewareManager = new MiddlewareManager({
            ...options.middleware,
            config: this.config,
            logger: this.logger,
            metrics: this.metrics
        });
        
        // 初始化拦截器管理器
        this.interceptorManager = new InterceptorManager({
            ...options.interceptor,
            config: this.config,
            logger: this.logger,
            metrics: this.metrics
        });

        // 初始化引擎管理器
        this.engineManager = new EngineManager({
            ...options.engines,
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            certificateManager: this.certificateManager,
            middlewareManager: this.middlewareManager,
            interceptorManager: this.interceptorManager
        });
        
        
        
        // 初始化代理服务器
        this.proxyServer = new ProxyServer({
            ...options.proxy,
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            certificateManager: this.certificateManager,
            middlewareManager: this.middlewareManager,
            interceptorManager: this.interceptorManager,
            engineManager: this.engineManager
        });
        
        // 状态标记
        this.initialized = false;
        this.running = false;
    }
    
    /**
     * 初始化代理服务器
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        
        try {
            // 配置已在构造函数中初始化
            // 日志系统已在构造函数中初始化
            // 性能监控已在构造函数中初始化
            // 证书管理器已在构造函数中初始化
            
            this.initialized = true;
            
            this.logger.info('Node MITMProxy initialized successfully', {
                version: this.getVersion()
            });
            
        } catch (error) {
            this.logger.error('Node MITMProxy initialization failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    
    /**
     * 启动代理服务器
     */
    async start(port, host) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (this.running) {
            throw new Error('Proxy server is already running');
        }
        
        try {
            await this.proxyServer.start(port, host);
            this.running = true;
            
            const address = this.proxyServer.getAddress();
            this.logger.info('Node MITMProxy started', {
                port: address ? address.port : port,
                host: address ? address.address : host
            });
            
        } catch (error) {
            this.logger.error('Node MITMProxy start failed', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 停止代理服务器
     */
    async stop() {
        if (!this.running) {
            return;
        }
        
        try {
            await this.proxyServer.stop();
            this.running = false;
            
            this.logger.info('Node MITMProxy stopped');
            
        } catch (error) {
            this.logger.error('Node MITMProxy stop failed', {
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * 重启代理服务器
     */
    async restart() {
        await this.stop();
        await this.start();
    }
    
    /**
     * 注册中间件
     */
    use(middleware) {
        return this.middlewareManager.register(middleware);
    }
    
    /**
     * 注册拦截器
     */
    intercept(interceptor) {
        return this.interceptorManager.register(interceptor);
    }
    
    /**
     * 获取配置
     */
    getConfig(key) {
        return this.config.get(key);
    }
    
    /**
     * 设置配置
     */
    setConfig(key, value) {
        return this.config.set(key, value);
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            proxy: this.proxyServer.getStatus(),
            middleware: this.middlewareManager ? this.middlewareManager.getStats() : {},
            interceptor: this.interceptorManager ? this.interceptorManager.getStats() : {},
            engines: this.engineManager ? this.engineManager.getStats() : {},
            certificate: this.certificateManager ? this.certificateManager.getStats() : {},
            metrics: this.metrics ? this.metrics.getSnapshot() : {}
        };
    }
    
    /**
     * 获取CA证书
     */
    getCACertificate() {
        return this.certificateManager.getCACertificate();
    }
    
    /**
     * 获取版本信息
     */
    getVersion() {
        try {
            const packageJson = require('../package.json');
            return packageJson.version;
        } catch (error) {
            return '2.0.0';
        }
    }
    
    /**
     * 获取服务器信息
     */
    getServerInfo() {
        const address = this.running ? this.proxyServer.getAddress() : null;
        const status = this.running ? this.proxyServer.getStatus() : null;
        
        return {
            version: this.getVersion(),
            initialized: this.initialized,
            running: this.running,
            port: address ? address.port : null,
            host: address ? address.address : null,
            uptime: status ? status.uptime : 0,
            stats: this.getStats()
        };
    }
    
    /**
     * 销毁代理服务器
     */
    async destroy() {
        try {
            if (this.running) {
                await this.stop();
            }
            
            // 销毁各个组件
            if (this.proxyServer) {
                this.proxyServer.destroy();
            }
            
            if (this.interceptorManager) {
                this.interceptorManager.destroy();
            }
            
            if (this.engineManager) {
                this.engineManager.destroy();
            }
            
            if (this.middlewareManager) {
                this.middlewareManager.destroy();
            }
            
            if (this.certificateManager) {
                this.certificateManager.destroy();
            }
            
            if (this.metrics) {
                this.metrics.destroy();
            }
            
            if (this.logger) {
                this.logger.destroy();
            }
            
            this.initialized = false;
            
        } catch (error) {
            console.error('Error during proxy destruction:', error);
        }
    }
}

// 创建便捷的工厂函数
function createProxy(options = {}) {
    return new NodeMITMProxy(options);
}

// 导出主类和工厂函数
module.exports = NodeMITMProxy;
module.exports.NodeMITMProxy = NodeMITMProxy;
module.exports.createProxy = createProxy;

// 导出核心组件
module.exports.ProxyServer = ProxyServer;
module.exports.ConfigManager = ConfigManager;
module.exports.Logger = Logger;
module.exports.MetricsCollector = MetricsCollector;
module.exports.CertificateManager = CertificateManager;
module.exports.MiddlewareManager = MiddlewareManager;
module.exports.InterceptorManager = InterceptorManager;
module.exports.EngineManager = EngineManager;
module.exports.TlsManager = require('./core/tls/TlsManager');

// 导出类型定义
module.exports.RequestContext = RequestContext;
module.exports.ConnectContext = ConnectContext;
module.exports.UpgradeContext = UpgradeContext;

// 导出接口定义
module.exports.IMiddleware = IMiddleware;
module.exports.IInterceptor = IInterceptor;
module.exports.ILogger = ILogger;
module.exports.IConfigProvider = IConfigProvider;

// 导出版本信息
module.exports.version = '2.0.0';

// 默认导出
module.exports.default = NodeMITMProxy;
