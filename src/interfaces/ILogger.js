/**
 * 日志接口
 * 定义日志记录器的标准接口
 */
class ILogger {
    /**
     * 记录错误日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    error(message, meta = {}) {
        throw new Error('Logger must implement error method');
    }
    
    /**
     * 记录警告日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    warn(message, meta = {}) {
        throw new Error('Logger must implement warn method');
    }
    
    /**
     * 记录信息日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    info(message, meta = {}) {
        throw new Error('Logger must implement info method');
    }
    
    /**
     * 记录调试日志
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    debug(message, meta = {}) {
        throw new Error('Logger must implement debug method');
    }
    
    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {Object} meta - 元数据
     */
    log(level, message, meta = {}) {
        throw new Error('Logger must implement log method');
    }
    
    /**
     * 设置日志级别
     * @param {string} level - 新的日志级别
     */
    setLevel(level) {
        throw new Error('Logger must implement setLevel method');
    }
    
    /**
     * 获取当前日志级别
     * @returns {string} 当前日志级别
     */
    getLevel() {
        throw new Error('Logger must implement getLevel method');
    }
    
    /**
     * 创建子日志器
     * @param {Object} meta - 默认元数据
     * @returns {ILogger} 子日志器
     */
    child(meta = {}) {
        throw new Error('Logger must implement child method');
    }
}

module.exports = ILogger;