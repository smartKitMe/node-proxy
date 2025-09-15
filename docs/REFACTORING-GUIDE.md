# node-mitmproxy 重构实施指南

## 📋 目录

- [重构准备](#重构准备)
- [阶段一：基础设施重构](#阶段一基础设施重构)
- [阶段二：核心模块重构](#阶段二核心模块重构)
- [阶段三：中间件系统](#阶段三中间件系统)
- [阶段四：测试和验证](#阶段四测试和验证)
- [代码迁移指南](#代码迁移指南)
- [最佳实践](#最佳实践)

## 🚀 重构准备

### 1. 环境准备

```bash
# 创建新的分支进行重构
git checkout -b refactor/architecture-optimization

# 创建新的目录结构
mkdir -p src/{core/{proxy,tls,middleware,interceptor},services,foundation/{config,logging,monitoring,utils},interfaces,types}
mkdir -p docs examples test/{unit,integration,performance}

# 安装开发依赖
npm install --save-dev jest eslint prettier husky lint-staged
```

### 2. 配置开发工具

#### ESLint 配置 (.eslintrc.js)
```javascript
module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true
    },
    extends: [
        'eslint:recommended'
    ],
    parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module'
    },
    rules: {
        'no-console': 'warn',
        'no-unused-vars': 'error',
        'prefer-const': 'error',
        'no-var': 'error'
    }
};
```

#### Prettier 配置 (.prettierrc)
```json
{
    "semi": true,
    "trailingComma": "es5",
    "singleQuote": true,
    "printWidth": 100,
    "tabWidth": 4,
    "useTabs": false
}
```

## 🏗️ 阶段一：基础设施重构

### 1. 配置管理系统

#### 创建 ConfigManager 类

```javascript
// src/foundation/config/ConfigManager.js

const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const ConfigValidator = require('./ConfigValidator');
const DefaultConfig = require('./DefaultConfig');

/**
 * 配置管理器
 * 负责配置的加载、验证、合并和热更新
 */
class ConfigManager extends EventEmitter {
    constructor(userConfig = {}) {
        super();
        this.config = {};
        this.watchers = new Map();
        this.initialized = false;
        
        this.initialize(userConfig);
    }
    
    /**
     * 初始化配置管理器
     * @param {Object} userConfig - 用户配置
     */
    initialize(userConfig) {
        try {
            // 合并默认配置和用户配置
            const mergedConfig = this.mergeConfigs(
                DefaultConfig.getDefault(),
                userConfig
            );
            
            // 验证配置
            this.config = ConfigValidator.validate(mergedConfig);
            
            // 标记为已初始化
            this.initialized = true;
            
            this.emit('initialized', this.config);
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * 获取配置值
     * @param {string} path - 配置路径，支持点号分隔
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(path, defaultValue = undefined) {
        if (!this.initialized) {
            throw new Error('ConfigManager not initialized');
        }
        
        return this.getNestedValue(this.config, path, defaultValue);
    }
    
    /**
     * 设置配置值
     * @param {string} path - 配置路径
     * @param {*} value - 配置值
     */
    set(path, value) {
        if (!this.initialized) {
            throw new Error('ConfigManager not initialized');
        }
        
        const oldValue = this.get(path);
        this.setNestedValue(this.config, path, value);
        
        // 验证更新后的配置
        ConfigValidator.validate(this.config);
        
        this.emit('changed', { path, oldValue, newValue: value });
    }
    
    /**
     * 监听配置文件变化
     * @param {string} filePath - 配置文件路径
     */
    watchFile(filePath) {
        if (this.watchers.has(filePath)) {
            return;
        }
        
        const watcher = fs.watch(filePath, (eventType) => {
            if (eventType === 'change') {
                this.reloadFromFile(filePath);
            }
        });
        
        this.watchers.set(filePath, watcher);
    }
    
    /**
     * 从文件重新加载配置
     * @param {string} filePath - 配置文件路径
     */
    async reloadFromFile(filePath) {
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            const fileConfig = JSON.parse(fileContent);
            
            // 合并新配置
            const newConfig = this.mergeConfigs(this.config, fileConfig);
            const validatedConfig = ConfigValidator.validate(newConfig);
            
            const oldConfig = { ...this.config };
            this.config = validatedConfig;
            
            this.emit('reloaded', { oldConfig, newConfig: this.config });
        } catch (error) {
            this.emit('error', error);
        }
    }
    
    /**
     * 合并配置对象
     * @param {Object} target - 目标配置
     * @param {Object} source - 源配置
     * @returns {Object} 合并后的配置
     */
    mergeConfigs(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (this.isObject(source[key]) && this.isObject(result[key])) {
                    result[key] = this.mergeConfigs(result[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }
        
        return result;
    }
    
    /**
     * 获取嵌套对象的值
     * @param {Object} obj - 对象
     * @param {string} path - 路径
     * @param {*} defaultValue - 默认值
     * @returns {*} 值
     */
    getNestedValue(obj, path, defaultValue) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined || !current.hasOwnProperty(key)) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }
    
    /**
     * 设置嵌套对象的值
     * @param {Object} obj - 对象
     * @param {string} path - 路径
     * @param {*} value - 值
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = obj;
        
        for (const key of keys) {
            if (!current[key] || !this.isObject(current[key])) {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }
    
    /**
     * 判断是否为对象
     * @param {*} value - 值
     * @returns {boolean} 是否为对象
     */
    isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    
    /**
     * 销毁配置管理器
     */
    destroy() {
        // 关闭所有文件监听器
        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();
        
        // 移除所有监听器
        this.removeAllListeners();
        
        this.initialized = false;
    }
}

module.exports = ConfigManager;
```

#### 创建配置验证器

```javascript
// src/foundation/config/ConfigValidator.js

const ProxyError = require('../utils/ProxyError');

/**
 * 配置验证器
 * 负责验证配置的有效性和完整性
 */
class ConfigValidator {
    /**
     * 配置模式定义
     */
    static get schema() {
        return {
            port: {
                type: 'number',
                min: 1,
                max: 65535,
                required: true
            },
            host: {
                type: 'string',
                default: '0.0.0.0'
            },
            tls: {
                type: 'object',
                properties: {
                    caCertPath: { type: 'string' },
                    caKeyPath: { type: 'string' },
                    useFixedCert: { type: 'boolean', default: false },
                    certDir: { type: 'string' }
                }
            },
            proxy: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean', default: false },
                    host: { type: 'string' },
                    port: { type: 'number', min: 1, max: 65535 },
                    auth: {
                        type: 'object',
                        properties: {
                            username: { type: 'string' },
                            password: { type: 'string' }
                        }
                    }
                }
            },
            performance: {
                type: 'object',
                properties: {
                    enableMetrics: { type: 'boolean', default: false },
                    maxConnections: { type: 'number', min: 1, default: 100 },
                    connectionTimeout: { type: 'number', min: 1000, default: 30000 },
                    keepAliveTimeout: { type: 'number', min: 1000, default: 30000 }
                }
            },
            logging: {
                type: 'object',
                properties: {
                    level: { 
                        type: 'string', 
                        enum: ['error', 'warn', 'info', 'debug'], 
                        default: 'info' 
                    },
                    format: { 
                        type: 'string', 
                        enum: ['json', 'text'], 
                        default: 'text' 
                    },
                    output: { type: 'string', default: 'console' }
                }
            }
        };
    }
    
    /**
     * 验证配置
     * @param {Object} config - 配置对象
     * @returns {Object} 验证并应用默认值后的配置
     */
    static validate(config) {
        const errors = [];
        const validatedConfig = this.validateObject(config, this.schema, '', errors);
        
        if (errors.length > 0) {
            throw new ProxyError(
                'Configuration validation failed',
                'CONFIG_INVALID',
                400,
                { errors }
            );
        }
        
        return validatedConfig;
    }
    
    /**
     * 验证对象
     * @param {Object} obj - 要验证的对象
     * @param {Object} schema - 模式定义
     * @param {string} path - 当前路径
     * @param {Array} errors - 错误数组
     * @returns {Object} 验证后的对象
     */
    static validateObject(obj, schema, path, errors) {
        const result = {};
        
        // 验证必需字段
        for (const [key, fieldSchema] of Object.entries(schema)) {
            const fieldPath = path ? `${path}.${key}` : key;
            const value = obj ? obj[key] : undefined;
            
            if (fieldSchema.required && (value === undefined || value === null)) {
                errors.push(`Required field '${fieldPath}' is missing`);
                continue;
            }
            
            if (value !== undefined && value !== null) {
                const validatedValue = this.validateField(value, fieldSchema, fieldPath, errors);
                if (validatedValue !== undefined) {
                    result[key] = validatedValue;
                }
            } else if (fieldSchema.default !== undefined) {
                result[key] = fieldSchema.default;
            }
        }
        
        // 检查未知字段
        if (obj) {
            for (const key of Object.keys(obj)) {
                if (!schema.hasOwnProperty(key)) {
                    const fieldPath = path ? `${path}.${key}` : key;
                    errors.push(`Unknown field '${fieldPath}'`);
                }
            }
        }
        
        return result;
    }
    
    /**
     * 验证字段
     * @param {*} value - 字段值
     * @param {Object} fieldSchema - 字段模式
     * @param {string} path - 字段路径
     * @param {Array} errors - 错误数组
     * @returns {*} 验证后的值
     */
    static validateField(value, fieldSchema, path, errors) {
        // 类型验证
        if (!this.validateType(value, fieldSchema.type)) {
            errors.push(`Field '${path}' must be of type ${fieldSchema.type}`);
            return undefined;
        }
        
        // 枚举验证
        if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
            errors.push(`Field '${path}' must be one of: ${fieldSchema.enum.join(', ')}`);
            return undefined;
        }
        
        // 数值范围验证
        if (fieldSchema.type === 'number') {
            if (fieldSchema.min !== undefined && value < fieldSchema.min) {
                errors.push(`Field '${path}' must be >= ${fieldSchema.min}`);
                return undefined;
            }
            if (fieldSchema.max !== undefined && value > fieldSchema.max) {
                errors.push(`Field '${path}' must be <= ${fieldSchema.max}`);
                return undefined;
            }
        }
        
        // 对象验证
        if (fieldSchema.type === 'object' && fieldSchema.properties) {
            return this.validateObject(value, fieldSchema.properties, path, errors);
        }
        
        return value;
    }
    
    /**
     * 验证类型
     * @param {*} value - 值
     * @param {string} expectedType - 期望类型
     * @returns {boolean} 是否匹配类型
     */
    static validateType(value, expectedType) {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'object':
                return value !== null && typeof value === 'object' && !Array.isArray(value);
            case 'array':
                return Array.isArray(value);
            default:
                return true;
        }
    }
}

module.exports = ConfigValidator;
```

### 2. 日志系统

#### 创建 Logger 类

```javascript
// src/foundation/logging/Logger.js

const EventEmitter = require('events');
const LogLevel = require('./LogLevel');
const LogFormatter = require('./LogFormatter');

/**
 * 日志记录器
 * 支持多种日志级别、格式化和输出目标
 */
class Logger extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            level: config.level || 'info',
            format: config.format || 'text',
            output: config.output || 'console',
            enableColors: config.enableColors !== false,
            enableTimestamp: config.enableTimestamp !== false,
            ...config
        };
        
        this.formatter = new LogFormatter(this.config);
        this.outputs = new Map();
        
        this.initializeOutputs();
    }
    
    /**
     * 初始化输出目标
     */
    initializeOutputs() {
        // 控制台输出
        this.outputs.set('console', {
            write: (message) => {
                if (this.config.enableColors) {
                    console.log(message);
                } else {
                    console.log(this.stripColors(message));
                }
            }
        });
        
        // 文件输出（如果配置了文件路径）
        if (this.config.file) {
            const fs = require('fs');
            const path = require('path');
            
            // 确保目录存在
            const dir = path.dirname(this.config.file);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            this.outputs.set('file', {
                write: (message) => {
                    const cleanMessage = this.stripColors(message);
                    fs.appendFileSync(this.config.file, cleanMessage + '\n');
                }
            });
        }
    }
    
    /**
     * 记录错误日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    error(message, meta = {}) {
        this.log('error', message, meta);
    }
    
    /**
     * 记录警告日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }
    
    /**
     * 记录信息日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    info(message, meta = {}) {
        this.log('info', message, meta);
    }
    
    /**
     * 记录调试日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }
    
    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    log(level, message, meta = {}) {
        // 检查日志级别
        if (!this.shouldLog(level)) {
            return;
        }
        
        // 创建日志条目
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            meta,
            pid: process.pid
        };
        
        // 格式化日志
        const formattedMessage = this.formatter.format(entry);
        
        // 输出日志
        this.writeToOutputs(formattedMessage);
        
        // 发出事件
        this.emit('log', entry);
        this.emit(level, entry);
    }
    
    /**
     * 判断是否应该记录日志
     * @param {string} level - 日志级别
     * @returns {boolean} 是否应该记录
     */
    shouldLog(level) {
        const currentLevelValue = LogLevel.getValue(this.config.level);
        const messageLevelValue = LogLevel.getValue(level);
        return messageLevelValue <= currentLevelValue;
    }
    
    /**
     * 写入到所有输出目标
     * @param {string} message - 格式化后的消息
     */
    writeToOutputs(message) {
        for (const output of this.outputs.values()) {
            try {
                output.write(message);
            } catch (error) {
                // 避免日志输出错误导致程序崩溃
                console.error('Logger output error:', error.message);
            }
        }
    }
    
    /**
     * 移除颜色代码
     * @param {string} message - 包含颜色代码的消息
     * @returns {string} 清理后的消息
     */
    stripColors(message) {
        return message.replace(/\x1b\[[0-9;]*m/g, '');
    }
    
    /**
     * 创建子日志器
     * @param {Object} meta - 默认元数据
     * @returns {Logger} 子日志器
     */
    child(meta = {}) {
        const childLogger = new Logger(this.config);
        childLogger.defaultMeta = { ...this.defaultMeta, ...meta };
        return childLogger;
    }
    
    /**
     * 设置日志级别
     * @param {string} level - 新的日志级别
     */
    setLevel(level) {
        this.config.level = level;
        this.emit('levelChanged', level);
    }
    
    /**
     * 获取当前日志级别
     * @returns {string} 当前日志级别
     */
    getLevel() {
        return this.config.level;
    }
}

module.exports = Logger;
```

### 3. 性能监控系统

#### 创建 MetricsCollector 类

```javascript
// src/foundation/monitoring/MetricsCollector.js

const EventEmitter = require('events');

/**
 * 性能指标收集器
 * 收集和统计各种性能指标
 */
class MetricsCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            enabled: config.enabled !== false,
            flushInterval: config.flushInterval || 60000, // 1分钟
            maxHistorySize: config.maxHistorySize || 1000,
            ...config
        };
        
        this.metrics = {
            counters: new Map(),
            gauges: new Map(),
            histograms: new Map(),
            timers: new Map()
        };
        
        this.history = [];
        this.startTime = Date.now();
        
        if (this.config.enabled) {
            this.startFlushTimer();
        }
    }
    
    /**
     * 增加计数器
     * @param {string} name - 指标名称
     * @param {number} value - 增加值，默认为1
     * @param {Object} tags - 标签
     */
    increment(name, value = 1, tags = {}) {
        if (!this.config.enabled) return;
        
        const key = this.getMetricKey(name, tags);
        const current = this.metrics.counters.get(key) || 0;
        this.metrics.counters.set(key, current + value);
        
        this.emit('metric', {
            type: 'counter',
            name,
            value: current + value,
            tags,
            timestamp: Date.now()
        });
    }
    
    /**
     * 设置仪表盘值
     * @param {string} name - 指标名称
     * @param {number} value - 值
     * @param {Object} tags - 标签
     */
    gauge(name, value, tags = {}) {
        if (!this.config.enabled) return;
        
        const key = this.getMetricKey(name, tags);
        this.metrics.gauges.set(key, value);
        
        this.emit('metric', {
            type: 'gauge',
            name,
            value,
            tags,
            timestamp: Date.now()
        });
    }
    
    /**
     * 记录直方图值
     * @param {string} name - 指标名称
     * @param {number} value - 值
     * @param {Object} tags - 标签
     */
    histogram(name, value, tags = {}) {
        if (!this.config.enabled) return;
        
        const key = this.getMetricKey(name, tags);
        let histogram = this.metrics.histograms.get(key);
        
        if (!histogram) {
            histogram = {
                values: [],
                count: 0,
                sum: 0,
                min: Infinity,
                max: -Infinity
            };
            this.metrics.histograms.set(key, histogram);
        }
        
        histogram.values.push(value);
        histogram.count++;
        histogram.sum += value;
        histogram.min = Math.min(histogram.min, value);
        histogram.max = Math.max(histogram.max, value);
        
        // 保持值数组大小在合理范围内
        if (histogram.values.length > 1000) {
            histogram.values = histogram.values.slice(-500);
        }
        
        this.emit('metric', {
            type: 'histogram',
            name,
            value,
            tags,
            timestamp: Date.now()
        });
    }
    
    /**
     * 开始计时
     * @param {string} name - 计时器名称
     * @param {Object} tags - 标签
     * @returns {Function} 结束计时的函数
     */
    timer(name, tags = {}) {
        if (!this.config.enabled) {
            return () => {}; // 返回空函数
        }
        
        const startTime = process.hrtime.bigint();
        
        return () => {
            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
            
            this.histogram(`${name}.duration`, duration, tags);
            
            return duration;
        };
    }
    
    /**
     * 记录请求指标
     * @param {Object} context - 请求上下文
     */
    recordRequest(context) {
        if (!this.config.enabled) return;
        
        const tags = {
            method: context.method,
            status: context.statusCode,
            ssl: context.ssl ? 'true' : 'false'
        };
        
        // 请求计数
        this.increment('requests.total', 1, tags);
        
        // 响应时间
        if (context.responseTime) {
            this.histogram('requests.response_time', context.responseTime, tags);
        }
        
        // 请求大小
        if (context.requestSize) {
            this.histogram('requests.size', context.requestSize, tags);
        }
        
        // 响应大小
        if (context.responseSize) {
            this.histogram('responses.size', context.responseSize, tags);
        }
        
        // 错误计数
        if (context.error) {
            this.increment('requests.errors', 1, {
                ...tags,
                error_type: context.error.constructor.name
            });
        }
    }
    
    /**
     * 记录连接指标
     * @param {Object} connectionInfo - 连接信息
     */
    recordConnection(connectionInfo) {
        if (!this.config.enabled) return;
        
        const tags = {
            type: connectionInfo.type || 'unknown',
            reused: connectionInfo.reused ? 'true' : 'false'
        };
        
        this.increment('connections.total', 1, tags);
        
        if (connectionInfo.duration) {
            this.histogram('connections.duration', connectionInfo.duration, tags);
        }
    }
    
    /**
     * 获取所有指标
     * @returns {Object} 指标数据
     */
    getMetrics() {
        const result = {
            timestamp: Date.now(),
            uptime: Date.now() - this.startTime,
            counters: {},
            gauges: {},
            histograms: {}
        };
        
        // 计数器
        for (const [key, value] of this.metrics.counters) {
            result.counters[key] = value;
        }
        
        // 仪表盘
        for (const [key, value] of this.metrics.gauges) {
            result.gauges[key] = value;
        }
        
        // 直方图
        for (const [key, histogram] of this.metrics.histograms) {
            result.histograms[key] = {
                count: histogram.count,
                sum: histogram.sum,
                min: histogram.min,
                max: histogram.max,
                avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
                p50: this.calculatePercentile(histogram.values, 0.5),
                p95: this.calculatePercentile(histogram.values, 0.95),
                p99: this.calculatePercentile(histogram.values, 0.99)
            };
        }
        
        return result;
    }
    
    /**
     * 重置所有指标
     */
    reset() {
        this.metrics.counters.clear();
        this.metrics.gauges.clear();
        this.metrics.histograms.clear();
        this.metrics.timers.clear();
        this.history = [];
        this.startTime = Date.now();
        
        this.emit('reset');
    }
    
    /**
     * 获取指标键
     * @param {string} name - 指标名称
     * @param {Object} tags - 标签
     * @returns {string} 指标键
     */
    getMetricKey(name, tags) {
        if (Object.keys(tags).length === 0) {
            return name;
        }
        
        const tagString = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
            
        return `${name}{${tagString}}`;
    }
    
    /**
     * 计算百分位数
     * @param {Array} values - 值数组
     * @param {number} percentile - 百分位数（0-1）
     * @returns {number} 百分位数值
     */
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[Math.max(0, index)];
    }
    
    /**
     * 开始定时刷新
     */
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            const metrics = this.getMetrics();
            this.history.push(metrics);
            
            // 保持历史记录大小
            if (this.history.length > this.config.maxHistorySize) {
                this.history = this.history.slice(-this.config.maxHistorySize / 2);
            }
            
            this.emit('flush', metrics);
        }, this.config.flushInterval);
    }
    
    /**
     * 停止定时刷新
     */
    stopFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
    
    /**
     * 销毁指标收集器
     */
    destroy() {
        this.stopFlushTimer();
        this.reset();
        this.removeAllListeners();
    }
}

module.exports = MetricsCollector;
```

## 🔧 阶段二：核心模块重构

### 1. ProxyServer 主类

```javascript
// src/core/proxy/ProxyServer.js

const http = require('http');
const https = require('https');
const EventEmitter = require('events');
const ConfigManager = require('../../foundation/config/ConfigManager');
const Logger = require('../../foundation/logging/Logger');
const MetricsCollector = require('../../foundation/monitoring/MetricsCollector');
const MiddlewareManager = require('../middleware/MiddlewareManager');
const InterceptorManager = require('../interceptor/InterceptorManager');
const CertificateManager = require('../tls/CertificateManager');
const RequestEngine = require('./RequestEngine');
const ConnectEngine = require('./ConnectEngine');
const UpgradeEngine = require('./UpgradeEngine');
const ProxyError = require('../../foundation/utils/ProxyError');

/**
 * 代理服务器主类
 * 负责服务器生命周期管理和核心组件协调
 */
class ProxyServer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // 初始化配置管理器
        this.configManager = new ConfigManager(config);
        
        // 初始化日志系统
        this.logger = new Logger(this.configManager.get('logging', {}));
        
        // 初始化性能监控
        this.metrics = new MetricsCollector(this.configManager.get('monitoring', {}));
        
        // 初始化中间件管理器
        this.middlewareManager = new MiddlewareManager(this.logger);
        
        // 初始化拦截器管理器
        this.interceptorManager = new InterceptorManager(this.logger);
        
        // 初始化TLS管理器
        this.tlsManager = new CertificateManager(
            this.configManager.get('tls', {}),
            this.logger
        );
        
        // 处理引擎
        this.requestEngine = null;
        this.connectEngine = null;
        this.upgradeEngine = null;
        
        // HTTP服务器
        this.server = null;
        
        // 服务器状态
        this.state = 'stopped';
        this.startTime = null;
        
        // 绑定事件处理器
        this.bindEventHandlers();
        
        this.logger.info('ProxyServer initialized', {
            port: this.configManager.get('port'),
            host: this.configManager.get('host')
        });
    }
    
    /**
     * 启动代理服务器
     * @returns {Promise<void>}
     */
    async start() {
        if (this.state === 'starting' || this.state === 'running') {
            throw new ProxyError('Server is already running or starting', 'SERVER_ALREADY_RUNNING');
        }
        
        this.state = 'starting';
        this.emit('starting');
        
        try {
            // 初始化TLS管理器
            await this.tlsManager.initialize();
            
            // 创建处理引擎
            this.createEngines();
            
            // 创建HTTP服务器
            this.createServer();
            
            // 启动服务器
            await this.startServer();
            
            this.state = 'running';
            this.startTime = Date.now();
            
            this.logger.info('ProxyServer started successfully', {
                port: this.configManager.get('port'),
                host: this.configManager.get('host'),
                pid: process.pid
            });
            
            this.emit('started');
            
        } catch (error) {
            this.state = 'error';
            this.logger.error('Failed to start ProxyServer', {
                error: error.message,
                stack: error.stack
            });
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * 停止代理服务器
     * @returns {Promise<void>}
     */
    async stop() {
        if (this.state === 'stopping' || this.state === 'stopped') {
            return;
        }
        
        this.state = 'stopping';
        this.emit('stopping');
        
        try {
            // 停止接受新连接
            if (this.server) {
                await new Promise((resolve, reject) => {
                    this.server.close((error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
            }
            
            // 清理资源
            await this.cleanup();
            
            this.state = 'stopped';
            
            const uptime = this.startTime ? Date.now() - this.startTime : 0;
            this.logger.info('ProxyServer stopped', { uptime });
            
            this.emit('stopped');
            
        } catch (error) {
            this.logger.error('Error stopping ProxyServer', {
                error: error.message,
                stack: error.stack
            });
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * 重启代理服务器
     * @returns {Promise<void>}
     */
    async restart() {
        this.logger.info('Restarting ProxyServer');
        await this.stop();
        await this.start();
    }
    
    /**
     * 添加中间件
     * @param {string} type - 中间件类型
     * @param {IMiddleware} middleware - 中间件实例
     */
    use(type, middleware) {
        this.middlewareManager.use(type, middleware);
        this.logger.debug('Middleware added', {
            type,
            name: middleware.name
        });
    }
    
    /**
     * 添加拦截器
     * @param {IInterceptor} interceptor - 拦截器实例
     */
    intercept(interceptor) {
        this.interceptorManager.add(interceptor);
        this.logger.debug('Interceptor added', {
            name: interceptor.name
        });
    }
    
    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        const oldConfig = this.configManager.config;
        this.configManager.initialize(newConfig);
        
        this.logger.info('Configuration updated', {
            changes: this.getConfigChanges(oldConfig, this.configManager.config)
        });
        
        this.emit('configUpdated', {
            oldConfig,
            newConfig: this.configManager.config
        });
    }
    
    /**
     * 获取性能指标
     * @returns {Object} 性能指标
     */
    getMetrics() {
        const baseMetrics = this.metrics.getMetrics();
        
        return {
            ...baseMetrics,
            server: {
                state: this.state,
                uptime: this.startTime ? Date.now() - this.startTime : 0,
                port: this.configManager.get('port'),
                host: this.configManager.get('host')
            },
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        };
    }
    
    /**
     * 获取健康状态
     * @returns {Object} 健康状态
     */
    getHealth() {
        const metrics = this.getMetrics();
        const memoryUsage = process.memoryUsage();
        
        return {
            status: this.state === 'running' ? 'healthy' : 'unhealthy',
            timestamp: Date.now(),
            uptime: metrics.server.uptime,
            memory: {
                used: memoryUsage.heapUsed,
                total: memoryUsage.heapTotal,
                usage: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2) + '%'
            },
            connections: {
                active: metrics.gauges['connections.active'] || 0,
                total: metrics.counters['connections.total'] || 0
            },
            requests: {
                total: metrics.counters['requests.total'] || 0,
                errors: metrics.counters['requests.errors'] || 0,
                errorRate: this.calculateErrorRate(metrics)
            }
        };
    }
    
    /**
     * 创建处理引擎
     */
    createEngines() {
        const engineConfig = {
            config: this.configManager,
            logger: this.logger,
            metrics: this.metrics,
            middlewareManager: this.middlewareManager,
            interceptorManager: this.interceptorManager,
            tlsManager: this.tlsManager
        };
        
        this.requestEngine = new RequestEngine(engineConfig);
        this.connectEngine = new ConnectEngine(engineConfig);
        this.upgradeEngine = new UpgradeEngine(engineConfig);
    }
    
    /**
     * 创建HTTP服务器
     */
    createServer() {
        this.server = http.createServer();
        
        // 绑定事件处理器
        this.server.on('request', this.handleRequest.bind(this));
        this.server.on('connect', this.handleConnect.bind(this));
        this.server.on('upgrade', this.handleUpgrade.bind(this));
        this.server.on('error', this.handleServerError.bind(this));
        this.server.on('clientError', this.handleClientError.bind(this));
        
        // 配置服务器选项
        this.server.timeout = this.configManager.get('performance.connectionTimeout', 30000);
        this.server.keepAliveTimeout = this.configManager.get('performance.keepAliveTimeout', 30000);
        this.server.maxConnections = this.configManager.get('performance.maxConnections', 100);
    }
    
    /**
     * 启动服务器
     * @returns {Promise<void>}
     */
    startServer() {
        return new Promise((resolve, reject) => {
            const port = this.configManager.get('port');
            const host = this.configManager.get('host', '0.0.0.0');
            
            this.server.listen(port, host, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
    
    /**
     * 处理HTTP请求
     * @param {http.IncomingMessage} req - 请求对象
     * @param {http.ServerResponse} res - 响应对象
     */
    async handleRequest(req, res) {
        try {
            await this.requestEngine.handleRequest(req, res);
        } catch (error) {
            this.logger.error('Request handling error', {
                url: req.url,
                method: req.method,
                error: error.message
            });
            
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        }
    }
    
    /**
     * 处理CONNECT请求
     * @param {http.IncomingMessage} req - 请求对象
     * @param {net.Socket} socket - 套接字
     * @param {Buffer} head - 头部数据
     */
    async handleConnect(req, socket, head) {
        try {
            await this.connectEngine.handleConnect(req, socket, head);
        } catch (error) {
            this.logger.error('Connect handling error', {
                url: req.url,
                error: error.message
            });
            
            socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        }
    }
    
    /**
     * 处理WebSocket升级
     * @param {http.IncomingMessage} req - 请求对象
     * @param {net.Socket} socket - 套接字
     * @param {Buffer} head - 头部数据
     */
    async handleUpgrade(req, socket, head) {
        try {
            await this.upgradeEngine.handleUpgrade(req, socket, head);
        } catch (error) {
            this.logger.error('Upgrade handling error', {
                url: req.url,
                error: error.message
            });
            
            socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        }
    }
    
    /**
     * 处理服务器错误
     * @param {Error} error - 错误对象
     */
    handleServerError(error) {
        this.logger.error('Server error', {
            error: error.message,
            code: error.code,
            stack: error.stack
        });
        
        this.emit('error', error);
    }
    
    /**
     * 处理客户端错误
     * @param {Error} error - 错误对象
     * @param {net.Socket} socket - 套接字
     */
    handleClientError(error, socket) {
        this.logger.warn('Client error', {
            error: error.message,
            code: error.code
        });
        
        if (!socket.destroyed) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        }
    }
    
    /**
     * 绑定事件处理器
     */
    bindEventHandlers() {
        // 配置变更处理
        this.configManager.on('changed', (change) => {
            this.logger.info('Configuration changed', change);
            this.emit('configChanged', change);
        });
        
        // 指标刷新处理
        this.metrics.on('flush', (metrics) => {
            this.emit('metricsFlush', metrics);
        });
        
        // 进程信号处理
        process.on('SIGTERM', () => {
            this.logger.info('Received SIGTERM, shutting down gracefully');
            this.stop().catch(error => {
                this.logger.error('Error during graceful shutdown', { error: error.message });
                process.exit(1);
            });
        });
        
        process.on('SIGINT', () => {
            this.logger.info('Received SIGINT, shutting down gracefully');
            this.stop().catch(error => {
                this.logger.error('Error during graceful shutdown', { error: error.message });
                process.exit(1);
            });
        });
    }
    
    /**
     * 清理资源
     * @returns {Promise<void>}
     */
    async cleanup() {
        // 清理处理引擎
        if (this.requestEngine) {
            await this.requestEngine.destroy();
        }
        if (this.connectEngine) {
            await this.connectEngine.destroy();
        }
        if (this.upgradeEngine) {
            await this.upgradeEngine.destroy();
        }
        
        // 清理TLS管理器
        if (this.tlsManager) {
            await this.tlsManager.destroy();
        }
        
        // 清理中间件管理器
        if (this.middlewareManager) {
            await this.middlewareManager.destroy();
        }
        
        // 清理拦截器管理器
        if (this.interceptorManager) {
            await this.interceptorManager.destroy();
        }
        
        // 清理指标收集器
        if (this.metrics) {
            this.metrics.destroy();
        }
    }
    
    /**
     * 获取配置变更
     * @param {Object} oldConfig - 旧配置
     * @param {Object} newConfig - 新配置
     * @returns {Array} 变更列表
     */
    getConfigChanges(oldConfig, newConfig) {
        const changes = [];
        
        const compareObjects = (old, current, path = '') => {
            for (const key in current) {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (!(key in old)) {
                    changes.push({ type: 'added', path: currentPath, value: current[key] });
                } else if (old[key] !== current[key]) {
                    if (typeof current[key] === 'object' && typeof old[key] === 'object') {
                        compareObjects(old[key], current[key], currentPath);
                    } else {
                        changes.push({
                            type: 'changed',
                            path: currentPath,
                            oldValue: old[key],
                            newValue: current[key]
                        });
                    }
                }
            }
            
            for (const key in old) {
                if (!(key in current)) {
                    const currentPath = path ? `${path}.${key}` : key;
                    changes.push({ type: 'removed', path: currentPath, value: old[key] });
                }
            }
        };
        
        compareObjects(oldConfig, newConfig);
        return changes;
    }
    
    /**
     * 计算错误率
     * @param {Object} metrics - 指标数据
     * @returns {string} 错误率百分比
     */
    calculateErrorRate(metrics) {
        const totalRequests = metrics.counters['requests.total'] || 0;
        const errorRequests = metrics.counters['requests.errors'] || 0;
        
        if (totalRequests === 0) return '0.00%';
        
        const errorRate = (errorRequests / totalRequests * 100).toFixed(2);
        return `${errorRate}%`;
    }
}

module.exports = ProxyServer;
```

## 📝 代码迁移指南

### 1. 迁移现有代码

#### 步骤1：创建适配器

```javascript
// src/adapters/LegacyAdapter.js

const ProxyServer = require('../core/proxy/ProxyServer');

/**
 * 遗留代码适配器
 * 保持向后兼容性
 */
class LegacyAdapter {
    /**
     * 创建代理服务器（兼容旧API）
     * @param {Object} options - 选项
     * @returns {ProxyServer} 代理服务器实例
     */
    static createProxy(options = {}) {
        // 转换旧的配置格式到新格式
        const config = this.transformLegacyConfig(options);
        
        const server = new ProxyServer(config);
        
        // 添加旧的方法到新实例
        this.addLegacyMethods(server, options);
        
        return server;
    }
    
    /**
     * 转换遗留配置
     * @param {Object} legacyOptions - 遗留选项
     * @returns {Object} 新配置格式
     */
    static transformLegacyConfig(legacyOptions) {
        const config = {
            port: legacyOptions.port || 6789,
            host: legacyOptions.host || '0.0.0.0',
            tls: {
                caCertPath: legacyOptions.caCertPath,
                caKeyPath: legacyOptions.caKeyPath,
                useFixedCert: legacyOptions.useFixedCert || false
            },
            proxy: {
                enabled: !!legacyOptions.externalProxy,
                host: legacyOptions.externalProxy?.host,
                port: legacyOptions.externalProxy?.port,
                auth: legacyOptions.externalProxy?.auth
            },
            performance: {
                enableMetrics: legacyOptions.enableMetrics || false,
                maxConnections: legacyOptions.maxConnections || 100
            },
            logging: {
                level: legacyOptions.logLevel || 'info',
                format: 'text'
            }
        };
        
        return config;
    }
    
    /**
     * 添加遗留方法
     * @param {ProxyServer} server - 服务器实例
     * @param {Object} options - 原始选项
     */
    static addLegacyMethods(server, options) {
        // 兼容旧的listen方法
        server.listen = function(callback) {
            this.start().then(() => {
                if (callback) callback();
            }).catch(error => {
                if (callback) callback(error);
            });
        };
        
        // 兼容旧的close方法
        server.close = function(callback) {
            this.stop().then(() => {
                if (callback) callback();
            }).catch(error => {
                if (callback) callback(error);
            });
        };
        
        // 添加拦截器支持（兼容旧API）
        if (options.requestInterceptor) {
            const interceptor = this.createLegacyInterceptor(
                'request',
                options.requestInterceptor
            );
            server.intercept(interceptor);
        }
        
        if (options.responseInterceptor) {
            const interceptor = this.createLegacyInterceptor(
                'response',
                options.responseInterceptor
            );
            server.intercept(interceptor);
        }
    }
    
    /**
     * 创建遗留拦截器
     * @param {string} type - 拦截器类型
     * @param {Function} handler - 处理函数
     * @returns {Object} 拦截器对象
     */
    static createLegacyInterceptor(type, handler) {
        return {
            name: `legacy-${type}-interceptor`,
            shouldIntercept: () => true,
            interceptRequest: async (context) => {
                if (type === 'request') {
                    await handler(context.request, context.response);
                }
            },
            interceptResponse: async (context) => {
                if (type === 'response') {
                    await handler(context.request, context.response);
                }
            }
        };
    }
}

module.exports = LegacyAdapter;
```

#### 步骤2：更新主入口文件

```javascript
// src/index.js

require('babel-polyfill');

const ProxyServer = require('./core/proxy/ProxyServer');
const LegacyAdapter = require('./adapters/LegacyAdapter');

/**
 * 创建代理服务器
 * @param {Object} options - 配置选项
 * @returns {ProxyServer} 代理服务器实例
 */
function createProxy(options = {}) {
    // 如果使用新的配置格式，直接创建ProxyServer
    if (options.version === '2.0' || options.useNewAPI) {
        return new ProxyServer(options);
    }
    
    // 否则使用适配器保持向后兼容
    return LegacyAdapter.createProxy(options);
}

// 导出主要类和函数
module.exports = {
    createProxy,
    ProxyServer,
    
    // 导出核心组件供高级用户使用
    core: {
        ProxyServer: require('./core/proxy/ProxyServer'),
        RequestEngine: require('./core/proxy/RequestEngine'),
        ConnectEngine: require('./core/proxy/ConnectEngine'),
        UpgradeEngine: require('./core/proxy/UpgradeEngine')
    },
    
    // 导出基础设施组件
    foundation: {
        ConfigManager: require('./foundation/config/ConfigManager'),
        Logger: require('./foundation/logging/Logger'),
        MetricsCollector: require('./foundation/monitoring/MetricsCollector')
    },
    
    // 导出中间件和拦截器
    middleware: {
        MiddlewareManager: require('./core/middleware/MiddlewareManager')
    },
    
    interceptor: {
        InterceptorManager: require('./core/interceptor/InterceptorManager')
    },
    
    // 导出工具类
    utils: {
        ProxyError: require('./foundation/utils/ProxyError'),
        NetworkUtils: require('./foundation/utils/NetworkUtils')
    }
};

// 保持向后兼容的默认导出
module.exports.default = createProxy;
```

### 2. 渐进式迁移策略

#### 阶段1：并行运行（1-2周）

```javascript
// 在现有代码中添加新架构支持
const { createProxy } = require('node-mitmproxy');

// 旧方式（继续工作）
const oldProxy = createProxy({
    port: 6789,
    requestInterceptor: (req, res) => {
        // 现有拦截逻辑
    }
});

// 新方式（逐步迁移）
const newProxy = createProxy({
    version: '2.0',
    port: 6789,
    logging: {
        level: 'info',
        format: 'json'
    },
    performance: {
        enableMetrics: true
    }
});

// 添加中间件
newProxy.use('request', new LoggingMiddleware());
newProxy.use('response', new MetricsMiddleware());

// 添加拦截器
newProxy.intercept(new SelectiveInterceptor({
    rules: [
        { pattern: '*.example.com', action: 'intercept' }
    ]
}));
```

#### 阶段2：功能迁移（2-3周）

```javascript
// 创建迁移工具
class MigrationHelper {
    /**
     * 迁移拦截器配置
     * @param {Function} oldInterceptor - 旧拦截器函数
     * @returns {Object} 新拦截器对象
     */
    static migrateInterceptor(oldInterceptor) {
        return {
            name: 'migrated-interceptor',
            shouldIntercept: (context) => {
                // 基于上下文判断是否拦截
                return true;
            },
            interceptRequest: async (context) => {
                // 调用旧的拦截器函数
                await oldInterceptor(context.request, context.response);
            }
        };
    }
    
    /**
     * 迁移配置对象
     * @param {Object} oldConfig - 旧配置
     * @returns {Object} 新配置
     */
    static migrateConfig(oldConfig) {
        return {
            port: oldConfig.port,
            host: oldConfig.host,
            tls: {
                caCertPath: oldConfig.caCertPath,
                caKeyPath: oldConfig.caKeyPath,
                useFixedCert: oldConfig.useFixedCert
            },
            proxy: oldConfig.externalProxy ? {
                enabled: true,
                host: oldConfig.externalProxy.host,
                port: oldConfig.externalProxy.port,
                auth: oldConfig.externalProxy.auth
            } : { enabled: false },
            logging: {
                level: oldConfig.logLevel || 'info'
            },
            performance: {
                enableMetrics: oldConfig.enableMetrics || false
            }
        };
    }
}
```

#### 阶段3：完全迁移（1周）

```javascript
// 移除适配器，使用纯新架构
const { ProxyServer } = require('node-mitmproxy');

const server = new ProxyServer({
    port: 6789,
    tls: {
        caCertPath: './ca-cert.pem',
        caKeyPath: './ca-key.pem'
    },
    logging: {
        level: 'info',
        format: 'json',
        output: './logs/proxy.log'
    },
    performance: {
        enableMetrics: true,
        maxConnections: 200
    }
});

// 使用新的中间件系统
server.use('request', new RequestLoggingMiddleware());
server.use('response', new ResponseCompressionMiddleware());
server.use('error', new ErrorHandlingMiddleware());

// 使用新的拦截器系统
server.intercept(new RuleBasedInterceptor({
    rules: [
        {
            pattern: '*.api.example.com',
            action: 'modify',
            modifier: (context) => {
                // 修改API请求
                context.request.headers['X-Custom-Header'] = 'value';
            }
        },
        {
            pattern: '*.static.example.com',
            action: 'cache',
            ttl: 3600
        }
    ]
}));

// 启动服务器
server.start().then(() => {
    console.log('Proxy server started successfully');
}).catch(error => {
    console.error('Failed to start proxy server:', error);
});
```

## 🎯 最佳实践

### 1. 错误处理

```javascript
// 统一错误处理
class ErrorHandlingMiddleware {
    get name() { return 'error-handling'; }
    
    async execute(context, error) {
        const logger = context.logger;
        
        // 记录错误
        logger.error('Request processing error', {
            url: context.request.url,
            method: context.request.method,
            error: error.message,
            stack: error.stack
        });
        
        // 发送错误响应
        if (!context.response.headersSent) {
            context.response.writeHead(500, {
                'Content-Type': 'application/json'
            });
            context.response.end(JSON.stringify({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            }));
        }
    }
}
```

### 2. 性能监控

```javascript
// 性能监控中间件
class PerformanceMiddleware {
    constructor(metrics) {
        this.metrics = metrics;
    }
    
    get name() { return 'performance-monitoring'; }
    
    async execute(context) {
        const timer = this.metrics.timer('request.duration', {
            method: context.request.method,
            ssl: context.ssl ? 'true' : 'false'
        });
        
        context.startTime = Date.now();
        
        // 在响应结束时记录指标
        context.response.on('finish', () => {
            const duration = timer();
            
            this.metrics.increment('requests.total', 1, {
                method: context.request.method,
                status: context.response.statusCode,
                ssl: context.ssl ? 'true' : 'false'
            });
            
            this.metrics.histogram('request.size', context.requestSize || 0);
            this.metrics.histogram('response.size', context.responseSize || 0);
        });
    }
}
```

### 3. 配置管理

```javascript
// 环境特定配置
const configs = {
    development: {
        logging: {
            level: 'debug',
            format: 'text',
            enableColors: true
        },
        performance: {
            enableMetrics: true
        }
    },
    production: {
        logging: {
            level: 'info',
            format: 'json',
            output: '/var/log/proxy.log'
        },
        performance: {
            enableMetrics: true,
            maxConnections: 500
        }
    },
    test: {
        logging: {
            level: 'error'
        },
        performance: {
            enableMetrics: false
        }
    }
};

const config = configs[process.env.NODE_ENV || 'development'];
```

### 4. 测试策略

```javascript
// 单元测试示例
const { ProxyServer } = require('../src');
const request = require('supertest');

describe('ProxyServer', () => {
    let server;
    
    beforeEach(async () => {
        server = new ProxyServer({
            port: 0, // 使用随机端口
            logging: { level: 'error' }
        });
        await server.start();
    });
    
    afterEach(async () => {
        await server.stop();
    });
    
    test('should handle HTTP requests', async () => {
        const response = await request(server.server)
            .get('http://httpbin.org/get')
            .expect(200);
            
        expect(response.body).toBeDefined();
    });
    
    test('should collect metrics', async () => {
        await request(server.server)
            .get('http://httpbin.org/get');
            
        const metrics = server.getMetrics();
        expect(metrics.counters['requests.total']).toBeGreaterThan(0);
    });
});
```

---

*本指南提供了详细的重构步骤和最佳实践。建议按阶段逐步实施，确保每个阶段都有充分的测试和验证。*