/**
 * 配置提供者接口
 * 定义配置管理的标准接口
 */
class IConfigProvider {
    /**
     * 获取配置值
     * @param {string} path - 配置路径，支持点号分隔
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(path, defaultValue = undefined) {
        throw new Error('ConfigProvider must implement get method');
    }
    
    /**
     * 设置配置值
     * @param {string} path - 配置路径
     * @param {*} value - 配置值
     */
    set(path, value) {
        throw new Error('ConfigProvider must implement set method');
    }
    
    /**
     * 检查配置是否存在
     * @param {string} path - 配置路径
     * @returns {boolean} 是否存在
     */
    has(path) {
        throw new Error('ConfigProvider must implement has method');
    }
    
    /**
     * 获取所有配置
     * @returns {Object} 所有配置
     */
    getAll() {
        throw new Error('ConfigProvider must implement getAll method');
    }
    
    /**
     * 验证配置
     * @param {Object} config - 配置对象
     * @returns {Object} 验证后的配置
     */
    validate(config) {
        throw new Error('ConfigProvider must implement validate method');
    }
    
    /**
     * 监听配置变化
     * @param {string} path - 配置路径
     * @param {Function} callback - 回调函数
     */
    watch(path, callback) {
        throw new Error('ConfigProvider must implement watch method');
    }
    
    /**
     * 取消监听配置变化
     * @param {string} path - 配置路径
     * @param {Function} callback - 回调函数
     */
    unwatch(path, callback) {
        throw new Error('ConfigProvider must implement unwatch method');
    }
}

module.exports = IConfigProvider;