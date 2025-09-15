const EventEmitter = require('events');
const ConnectEngine = require('./ConnectEngine');
const RequestEngine = require('./RequestEngine');
const UpgradeEngine = require('./UpgradeEngine');
const TlsManager = require('../tls/TlsManager');

/**
 * 引擎管理器
 * 负责管理和协调各种代理引擎
 */
class EngineManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = options.config;
        this.logger = options.logger;
        this.metrics = options.metrics;
        this.certificateManager = options.certificateManager;
        this.middlewareManager = options.middlewareManager;
        this.interceptorManager = options.interceptorManager;
        
        // 初始化TLS管理器
        this.tlsManager = new TlsManager({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            certificateManager: this.certificateManager,
            ...options.tls
        });
        
        // 初始化各个引擎
        this.connectEngine = new ConnectEngine({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            tlsManager: this.tlsManager,
            certificateManager: this.certificateManager,
            middlewareManager: this.middlewareManager,
            interceptorManager: this.interceptorManager,
            ...options.connect
        });
        
        this.requestEngine = new RequestEngine({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            tlsManager: this.tlsManager,
            certificateManager: this.certificateManager,
            middlewareManager: this.middlewareManager,
            interceptorManager: this.interceptorManager,
            ...options.request
        });
        
        this.upgradeEngine = new UpgradeEngine({
            config: this.config,
            logger: this.logger,
            metrics: this.metrics,
            tlsManager: this.tlsManager,
            certificateManager: this.certificateManager,
            middlewareManager: this.middlewareManager,
            interceptorManager: this.interceptorManager,
            ...options.upgrade
        });
        
        // 统计信息
        this.stats = {
            connectRequests: 0,
            httpRequests: 0,
            upgradeRequests: 0,
            errors: 0
        };
        
        if (this.logger) {
            this.logger.info('Engine manager initialized');
        }
    }
    
    /**
     * 处理CONNECT请求
     * @param {Object} context - 请求上下文
     */
    async handleConnect(context) {
        try {
            this.stats.connectRequests++;
            await this.connectEngine.handle(context);
            this.emit('connect', context);
        } catch (error) {
            this.stats.errors++;
            this.emit('error', error, context);
            throw error;
        }
    }
    
    /**
     * 处理HTTP请求
     * @param {Object} context - 请求上下文
     */
    async handleRequest(context) {
        try {
            this.stats.httpRequests++;
            await this.requestEngine.handle(context);
            this.emit('request', context);
        } catch (error) {
            this.stats.errors++;
            this.emit('error', error, context);
            throw error;
        }
    }
    
    /**
     * 处理WebSocket升级请求
     * @param {Object} context - 请求上下文
     */
    async handleUpgrade(context) {
        try {
            this.stats.upgradeRequests++;
            await this.upgradeEngine.handle(context);
            this.emit('upgrade', context);
        } catch (error) {
            this.stats.errors++;
            this.emit('error', error, context);
            throw error;
        }
    }
    
    /**
     * 获取TLS管理器
     * @returns {TlsManager} TLS管理器实例
     */
    getTlsManager() {
        return this.tlsManager;
    }
    
    /**
     * 获取连接引擎
     * @returns {ConnectEngine} 连接引擎实例
     */
    getConnectEngine() {
        return this.connectEngine;
    }
    
    /**
     * 获取请求引擎
     * @returns {RequestEngine} 请求引擎实例
     */
    getRequestEngine() {
        return this.requestEngine;
    }
    
    /**
     * 获取升级引擎
     * @returns {UpgradeEngine} 升级引擎实例
     */
    getUpgradeEngine() {
        return this.upgradeEngine;
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            ...this.stats,
            tls: this.tlsManager.getStats(),
            connect: this.connectEngine.getStats ? this.connectEngine.getStats() : {},
            request: this.requestEngine.getStats ? this.requestEngine.getStats() : {},
            upgrade: this.upgradeEngine.getStats ? this.upgradeEngine.getStats() : {}
        };
    }
    
    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            connectRequests: 0,
            httpRequests: 0,
            upgradeRequests: 0,
            errors: 0
        };
        
        this.tlsManager.resetStats();
        
        if (this.connectEngine.resetStats) {
            this.connectEngine.resetStats();
        }
        if (this.requestEngine.resetStats) {
            this.requestEngine.resetStats();
        }
        if (this.upgradeEngine.resetStats) {
            this.upgradeEngine.resetStats();
        }
    }
    
    /**
     * 销毁引擎管理器
     */
    destroy() {
        if (this.tlsManager) {
            this.tlsManager.destroy();
        }
        
        if (this.connectEngine && this.connectEngine.destroy) {
            this.connectEngine.destroy();
        }
        
        if (this.requestEngine && this.requestEngine.destroy) {
            this.requestEngine.destroy();
        }
        
        if (this.upgradeEngine && this.upgradeEngine.destroy) {
            this.upgradeEngine.destroy();
        }
        
        this.removeAllListeners();
        
        if (this.logger) {
            this.logger.info('Engine manager destroyed');
        }
    }
}

module.exports = EngineManager;