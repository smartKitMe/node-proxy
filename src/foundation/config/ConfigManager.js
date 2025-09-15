const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const IConfigProvider = require('../../interfaces/IConfigProvider');

/**
 * 配置管理器
 * 提供统一的配置管理功能
 */
class ConfigManager extends IConfigProvider {
    constructor(options = {}) {
        super();
        this.config = {};
        this.watchers = new Map();
        this.eventEmitter = new EventEmitter();
        this.configPath = options.configPath || null;
        this.schema = options.schema || null;
        this.defaults = options.defaults || {};
        
        // 初始化默认配置
        this._initializeDefaults();
        
        // 如果提供了配置文件路径，则加载配置
        if (this.configPath) {
            this._loadConfigFile();
        }
    }
    
    /**
     * 初始化默认配置
     */
    _initializeDefaults() {
        this.config = {
            proxy: {
                port: 6789,
                host: '0.0.0.0',
                timeout: 30000,
                keepAlive: true,
                maxConnections: 1000
            },
            ssl: {
                caName: 'node-mitmproxy CA',
                caKeyPath: path.join(__dirname, '../../../ssl/ca-key.pem'),
                caCertPath: path.join(__dirname, '../../../ssl/ca-cert.pem'),
                certDir: path.join(__dirname, '../../../ssl/certs'),
                keySize: 2048,
                validity: 365
            },
            logging: {
                level: 'info',
                format: 'json',
                file: null,
                console: true,
                maxFiles: 5,
                maxSize: '10m'
            },
            performance: {
                enableMetrics: true,
                metricsInterval: 5000,
                enableProfiling: false,
                poolSize: 100
            },
            middleware: {
                enabled: true,
                timeout: 10000,
                maxConcurrent: 50
            },
            interceptor: {
                enabled: true,
                timeout: 15000,
                maxConcurrent: 20
            },
            ...this.defaults
        };
    }
    
    /**
     * 加载配置文件
     */
    _loadConfigFile() {
        try {
            if (fs.existsSync(this.configPath)) {
                const fileContent = fs.readFileSync(this.configPath, 'utf8');
                const fileConfig = JSON.parse(fileContent);
                this.config = this._mergeConfig(this.config, fileConfig);
            }
        } catch (error) {
            console.error('Failed to load config file:', error.message);
        }
    }
    
    /**
     * 深度合并配置对象
     */
    _mergeConfig(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    result[key] = this._mergeConfig(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }
    
    /**
     * 获取配置值
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }
    
    /**
     * 设置配置值
     */
    set(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        const lastKey = keys[keys.length - 1];
        const oldValue = current[lastKey];
        current[lastKey] = value;
        
        // 触发变化事件
        this._emitChange(path, value, oldValue);
    }
    
    /**
     * 检查配置是否存在
     */
    has(path) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 获取所有配置
     */
    getAll() {
        return JSON.parse(JSON.stringify(this.config));
    }
    
    /**
     * 验证配置
     */
    validate(config) {
        if (this.schema) {
            // 这里可以集成JSON Schema验证
            // 暂时返回原配置
            return config;
        }
        return config;
    }
    
    /**
     * 监听配置变化
     */
    watch(path, callback) {
        if (!this.watchers.has(path)) {
            this.watchers.set(path, new Set());
        }
        this.watchers.get(path).add(callback);
    }
    
    /**
     * 取消监听配置变化
     */
    unwatch(path, callback) {
        if (this.watchers.has(path)) {
            this.watchers.get(path).delete(callback);
            if (this.watchers.get(path).size === 0) {
                this.watchers.delete(path);
            }
        }
    }
    
    /**
     * 触发配置变化事件
     */
    _emitChange(path, newValue, oldValue) {
        if (this.watchers.has(path)) {
            for (const callback of this.watchers.get(path)) {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('Config watcher error:', error);
                }
            }
        }
        
        this.eventEmitter.emit('change', { path, newValue, oldValue });
    }
    
    /**
     * 保存配置到文件
     */
    async save() {
        if (this.configPath) {
            try {
                const configJson = JSON.stringify(this.config, null, 2);
                fs.writeFileSync(this.configPath, configJson, 'utf8');
            } catch (error) {
                throw new Error(`Failed to save config: ${error.message}`);
            }
        }
    }
    
    /**
     * 重新加载配置
     */
    reload() {
        if (this.configPath) {
            this._initializeDefaults();
            this._loadConfigFile();
            this.eventEmitter.emit('reload', this.config);
        }
    }
    
    /**
     * 获取事件发射器
     */
    getEventEmitter() {
        return this.eventEmitter;
    }
}

module.exports = ConfigManager;