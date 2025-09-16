const fs = require('fs');
const path = require('path');
const util = require('util');
const ILogger = require('../../interfaces/ILogger');

/**
 * 日志级别枚举
 */
const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

/**
 * 日志级别名称映射
 */
const LogLevelNames = {
    0: 'ERROR',
    1: 'WARN',
    2: 'INFO',
    3: 'DEBUG'
};

/**
 * 日志记录器
 * 提供结构化日志记录功能
 */
class Logger extends ILogger {
    constructor(options = {}) {
        super();
        this.level = this._parseLevel(options.level || 'info');
        this.format = options.format || 'json';
        this.enableConsole = options.console !== false;
        this.enableFile = !!options.file;
        this.filePath = options.file;
        this.maxFileSize = this._parseSize(options.maxSize || '10m');
        this.maxFiles = options.maxFiles || 5;
        this.defaultMeta = options.meta || {};
        this.name = options.name || 'mitmproxy';
        
        // 文件写入流
        this.fileStream = null;
        this.currentFileSize = 0;
        
        // 初始化文件日志
        if (this.enableFile) {
            this._initFileLogging();
        }
    }
    
    /**
     * 解析日志级别
     */
    _parseLevel(level) {
        if (typeof level === 'number') {
            return level;
        }
        
        const levelUpper = level.toUpperCase();
        return LogLevel[levelUpper] !== undefined ? LogLevel[levelUpper] : LogLevel.INFO;
    }
    
    /**
     * 解析文件大小
     */
    _parseSize(sizeStr) {
        const match = sizeStr.match(/^(\d+)([kmg]?)$/i);
        if (!match) return 10 * 1024 * 1024; // 默认10MB
        
        const size = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        switch (unit) {
            case 'k': return size * 1024;
            case 'm': return size * 1024 * 1024;
            case 'g': return size * 1024 * 1024 * 1024;
            default: return size;
        }
    }
    
    /**
     * 初始化文件日志
     */
    _initFileLogging() {
        try {
            // 确保目录存在
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // 获取当前文件大小
            if (fs.existsSync(this.filePath)) {
                this.currentFileSize = fs.statSync(this.filePath).size;
            }
            
            // 创建写入流
            this.fileStream = fs.createWriteStream(this.filePath, { flags: 'a' });
            
            // 处理流错误
            this.fileStream.on('error', (error) => {
                console.error('Log file stream error:', error);
            });
        } catch (error) {
            console.error('Failed to initialize file logging:', error);
            this.enableFile = false;
        }
    }
    
    /**
     * 轮转日志文件
     */
    _rotateLogFile() {
        if (!this.enableFile || !this.fileStream) return;
        
        try {
            // 关闭当前流
            this.fileStream.end();
            
            // 重命名现有文件
            for (let i = this.maxFiles - 1; i > 0; i--) {
                const oldFile = `${this.filePath}.${i}`;
                const newFile = `${this.filePath}.${i + 1}`;
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // 删除最老的文件
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }
            
            // 重命名当前文件
            if (fs.existsSync(this.filePath)) {
                fs.renameSync(this.filePath, `${this.filePath}.1`);
            }
            
            // 重新初始化
            this.currentFileSize = 0;
            this._initFileLogging();
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }
    
    /**
     * 格式化日志消息
     */
    _formatMessage(level, message, meta) {
        const timestamp = new Date().toISOString();
        const levelName = LogLevelNames[level];
        
        const logEntry = {
            timestamp,
            level: levelName,
            name: this.name,
            message,
            ...this.defaultMeta,
            ...meta
        };
        
        if (this.format === 'json') {
            return JSON.stringify(logEntry);
        } else {
            // 简单文本格式
            const metaStr = Object.keys({ ...this.defaultMeta, ...meta }).length > 0 
                ? ` ${JSON.stringify({ ...this.defaultMeta, ...meta })}`
                : '';
            return `${timestamp} [${levelName}] ${this.name}: ${message}${metaStr}`;
        }
    }
    
    /**
     * 写入日志
     */
    _writeLog(level, message, meta) {
        if (level > this.level) return;
        
        const formattedMessage = this._formatMessage(level, message, meta);
        
        // 控制台输出
        if (this.enableConsole) {
            const consoleMethod = level === LogLevel.ERROR ? 'error' : 
                                level === LogLevel.WARN ? 'warn' : 'log';
            console[consoleMethod](formattedMessage);
        }
        
        // 文件输出
        if (this.enableFile && this.fileStream) {
            const logLine = formattedMessage + '\n';
            const logSize = Buffer.byteLength(logLine, 'utf8');
            
            // 检查是否需要轮转
            if (this.currentFileSize + logSize > this.maxFileSize) {
                this._rotateLogFile();
            }
            
            this.fileStream.write(logLine);
            this.currentFileSize += logSize;
        }
    }
    
    /**
     * 记录错误日志
     */
    error(message, meta = {}) {
        this._writeLog(LogLevel.ERROR, message, meta);
    }
    
    /**
     * 记录警告日志
     */
    warn(message, meta = {}) {
        this._writeLog(LogLevel.WARN, message, meta);
    }
    
    /**
     * 记录信息日志
     */
    info(message, meta = {}) {
        this._writeLog(LogLevel.INFO, message, meta);
    }
    
    /**
     * 记录调试日志
     */
    debug(message, meta = {}) {
        this._writeLog(LogLevel.DEBUG, message, meta);
    }
    
    /**
     * 记录日志
     */
    log(level, message, meta = {}) {
        const numericLevel = this._parseLevel(level);
        this._writeLog(numericLevel, message, meta);
    }
    
    /**
     * 设置日志级别
     */
    setLevel(level) {
        this.level = this._parseLevel(level);
    }
    
    /**
     * 获取当前日志级别
     */
    getLevel() {
        return LogLevelNames[this.level];
    }
    
    /**
     * 检查是否启用了调试级别日志
     */
    isDebugEnabled() {
        return this.level >= LogLevel.DEBUG;
    }
    
    /**
     * 创建子日志器
     */
    child(meta = {}) {
        return new Logger({
            level: this.getLevel(),
            format: this.format,
            console: this.enableConsole,
            file: this.filePath,
            maxSize: this.maxFileSize,
            maxFiles: this.maxFiles,
            meta: { ...this.defaultMeta, ...meta },
            name: this.name
        });
    }
    
    /**
     * 关闭日志器
     */
    close() {
        if (this.fileStream) {
            this.fileStream.end();
            this.fileStream = null;
        }
    }
}

module.exports = Logger;
module.exports.Logger = Logger;
module.exports.LogLevel = LogLevel;