var AgentOrigin = require('agentkeepalive');
const colors = require('colors');

/**
 * 优化的 HTTP 代理 Agent 类
 * 基于 agentkeepalive 实现高性能的连接池管理
 * 支持详细的性能监控和调试日志
 */
module.exports = class Agent extends AgentOrigin {
    constructor(options = {}) {
        // 优化的默认配置参数
        const defaultOptions = {
            keepAlive: true,
            keepAliveMsecs: 30000,          // 空闲连接保持时间 30秒
            timeout: 60000,                 // 请求超时时间 60秒
            freeSocketTimeout: 30000,       // 空闲 socket 超时时间
            maxSockets: 256,                // 每个主机的最大连接数
            maxFreeSockets: 256,            // 每个主机的最大空闲连接数
            scheduling: 'fifo',             // 连接调度策略：先进先出
            socketActiveTTL: 0,             // socket 活跃时间限制（0表示无限制）
            ...options
        };
        
        super(defaultOptions);
        
        // 性能监控配置
        this.enableDebugLogs = options.enableDebugLogs || false;
        this.enablePerformanceMetrics = options.enablePerformanceMetrics || false;
        
        // 性能统计数据
        this.stats = {
            totalRequests: 0,
            activeConnections: 0,
            reuseConnections: 0,
            newConnections: 0,
            timeouts: 0,
            errors: 0,
            lastResetTime: Date.now()
        };
        
        // 绑定事件监听器进行性能监控
        this._setupEventListeners();
        
        // 定期输出性能统计（如果启用）
        if (this.enablePerformanceMetrics) {
            this._startPerformanceReporting();
        }
        
        if (this.enableDebugLogs) {
            console.log(colors.cyan('[ProxyHttpAgent] 初始化完成，配置:'), {
                maxSockets: defaultOptions.maxSockets,
                maxFreeSockets: defaultOptions.maxFreeSockets,
                keepAliveMsecs: defaultOptions.keepAliveMsecs,
                timeout: defaultOptions.timeout
            });
        }
    }
    
    /**
     * 设置事件监听器进行性能监控
     * @private
     */
    _setupEventListeners() {
        // 监听 socket 创建事件
        this.on('socket', (socket, options) => {
            this.stats.totalRequests++;
            
            if (socket._reused) {
                this.stats.reuseConnections++;
                if (this.enableDebugLogs) {
                    console.log(colors.green(`[ProxyHttpAgent] 复用连接: ${options.host}:${options.port}`));
                }
            } else {
                this.stats.newConnections++;
                this.stats.activeConnections++;
                if (this.enableDebugLogs) {
                    console.log(colors.yellow(`[ProxyHttpAgent] 新建连接: ${options.host}:${options.port}`));
                }
            }
            
            // 监听 socket 关闭事件
            socket.on('close', () => {
                this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
                if (this.enableDebugLogs) {
                    console.log(colors.gray(`[ProxyHttpAgent] 连接关闭: ${options.host}:${options.port}`));
                }
            });
            
            // 监听 socket 超时事件
            socket.on('timeout', () => {
                this.stats.timeouts++;
                if (this.enableDebugLogs) {
                    console.log(colors.red(`[ProxyHttpAgent] 连接超时: ${options.host}:${options.port}`));
                }
            });
            
            // 监听 socket 错误事件
            socket.on('error', (err) => {
                this.stats.errors++;
                if (this.enableDebugLogs) {
                    console.log(colors.red(`[ProxyHttpAgent] 连接错误: ${options.host}:${options.port}, ${err.message}`));
                }
            });
        });
    }
    
    /**
     * 开始性能统计报告
     * @private
     */
    _startPerformanceReporting() {
        this.performanceInterval = setInterval(() => {
            const stats = this.getPerformanceStats();
            console.log(colors.cyan('[ProxyHttpAgent] 性能统计:'), {
                总请求数: stats.totalRequests,
                活跃连接: stats.activeConnections,
                连接复用率: `${stats.reuseRate}%`,
                连接池状态: stats.poolStatus,
                错误率: `${stats.errorRate}%`
            });
        }, 60000); // 每分钟输出一次
    }
    
    /**
     * 获取连接名称（支持 NTLM 认证的 socket 复用）
     * @param {Object} option - 连接选项
     * @returns {string} 连接名称
     */
    getName(option) {
        var name = AgentOrigin.prototype.getName.call(this, option);
        name += ':';
        if (option.customSocketId) {
            name += option.customSocketId;
            if (this.enableDebugLogs) {
                console.log(colors.blue(`[ProxyHttpAgent] NTLM Socket ID: ${option.customSocketId}`));
            }
        }
        return name;
    }
    
    /**
     * 获取性能统计数据
     * @returns {Object} 性能统计信息
     */
    getPerformanceStats() {
        const totalConnections = this.stats.newConnections + this.stats.reuseConnections;
        const reuseRate = totalConnections > 0 ? ((this.stats.reuseConnections / totalConnections) * 100).toFixed(2) : 0;
        const errorRate = this.stats.totalRequests > 0 ? ((this.stats.errors / this.stats.totalRequests) * 100).toFixed(2) : 0;
        
        // 获取连接池状态
        const poolStatus = {};
        Object.keys(this.sockets).forEach(key => {
            poolStatus[key] = {
                active: this.sockets[key] ? this.sockets[key].length : 0,
                free: this.freeSockets[key] ? this.freeSockets[key].length : 0
            };
        });
        
        return {
            totalRequests: this.stats.totalRequests,
            activeConnections: this.stats.activeConnections,
            newConnections: this.stats.newConnections,
            reuseConnections: this.stats.reuseConnections,
            reuseRate: parseFloat(reuseRate),
            timeouts: this.stats.timeouts,
            errors: this.stats.errors,
            errorRate: parseFloat(errorRate),
            poolStatus: poolStatus,
            uptime: Date.now() - this.stats.lastResetTime
        };
    }
    
    /**
     * 重置性能统计数据
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            activeConnections: 0,
            reuseConnections: 0,
            newConnections: 0,
            timeouts: 0,
            errors: 0,
            lastResetTime: Date.now()
        };
        
        if (this.enableDebugLogs) {
            console.log(colors.cyan('[ProxyHttpAgent] 性能统计已重置'));
        }
    }
    
    /**
     * 销毁 Agent 实例
     */
    destroy() {
        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
            this.performanceInterval = null;
        }
        
        if (this.enableDebugLogs) {
            console.log(colors.cyan('[ProxyHttpAgent] Agent 实例已销毁'));
        }
        
        super.destroy();
    }
}
