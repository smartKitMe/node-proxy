const EventEmitter = require('events');
const os = require('os');

/**
 * 性能指标收集器
 * 收集和统计代理服务器的性能指标
 */
class MetricsCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        this.enabled = options.enabled !== false;
        this.interval = options.interval || 5000;
        this.maxHistorySize = options.maxHistorySize || 1000;
        
        // 指标数据
        this.metrics = {
            // 请求统计
            requests: {
                total: 0,
                success: 0,
                error: 0,
                intercepted: 0,
                byMethod: {},
                byStatus: {},
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0
            },
            
            // 连接统计
            connections: {
                total: 0,
                active: 0,
                ssl: 0,
                websocket: 0,
                avgDuration: 0
            },
            
            // 流量统计
            traffic: {
                bytesIn: 0,
                bytesOut: 0,
                totalBytes: 0
            },
            
            // 系统资源
            system: {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryTotal: 0,
                uptime: 0
            },
            
            // 错误统计
            errors: {
                total: 0,
                byType: {},
                recent: []
            },
            
            // 中间件统计
            middleware: {
                executions: 0,
                avgExecutionTime: 0,
                errors: 0,
                byName: {}
            },
            
            // 拦截器统计
            interceptors: {
                executions: 0,
                avgExecutionTime: 0,
                errors: 0,
                byName: {}
            }
        };
        
        // 历史数据
        this.history = [];
        
        // 临时数据（用于计算平均值）
        this.tempData = {
            responseTimes: [],
            connectionDurations: [],
            middlewareExecutionTimes: [],
            interceptorExecutionTimes: []
        };
        
        // 定时器
        this.timer = null;
        
        // 启动时间
        this.startTime = Date.now();
        
        if (this.enabled) {
            this.start();
        }
    }
    
    /**
     * 启动指标收集
     */
    start() {
        if (this.timer) return;
        
        this.timer = setInterval(() => {
            this._collectSystemMetrics();
            this._calculateAverages();
            this._saveSnapshot();
            this.emit('metrics', this.getSnapshot());
        }, this.interval);
    }
    
    /**
     * 停止指标收集
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    /**
     * 收集系统指标
     */
    _collectSystemMetrics() {
        // CPU使用率（简化计算）
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        
        this.metrics.system.cpuUsage = Math.round((1 - totalIdle / totalTick) * 100);
        
        // 内存使用情况
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        this.metrics.system.memoryUsage = Math.round((usedMem / totalMem) * 100);
        this.metrics.system.memoryTotal = Math.round(totalMem / 1024 / 1024); // MB
        
        // 运行时间
        this.metrics.system.uptime = Date.now() - this.startTime;
    }
    
    /**
     * 计算平均值
     */
    _calculateAverages() {
        // 响应时间平均值
        if (this.tempData.responseTimes.length > 0) {
            const sum = this.tempData.responseTimes.reduce((a, b) => a + b, 0);
            this.metrics.requests.avgResponseTime = Math.round(sum / this.tempData.responseTimes.length);
            this.tempData.responseTimes = [];
        }
        
        // 连接持续时间平均值
        if (this.tempData.connectionDurations.length > 0) {
            const sum = this.tempData.connectionDurations.reduce((a, b) => a + b, 0);
            this.metrics.connections.avgDuration = Math.round(sum / this.tempData.connectionDurations.length);
            this.tempData.connectionDurations = [];
        }
        
        // 中间件执行时间平均值
        if (this.tempData.middlewareExecutionTimes.length > 0) {
            const sum = this.tempData.middlewareExecutionTimes.reduce((a, b) => a + b, 0);
            this.metrics.middleware.avgExecutionTime = Math.round(sum / this.tempData.middlewareExecutionTimes.length);
            this.tempData.middlewareExecutionTimes = [];
        }
        
        // 拦截器执行时间平均值
        if (this.tempData.interceptorExecutionTimes.length > 0) {
            const sum = this.tempData.interceptorExecutionTimes.reduce((a, b) => a + b, 0);
            this.metrics.interceptors.avgExecutionTime = Math.round(sum / this.tempData.interceptorExecutionTimes.length);
            this.tempData.interceptorExecutionTimes = [];
        }
    }
    
    /**
     * 保存快照到历史记录
     */
    _saveSnapshot() {
        const snapshot = {
            timestamp: Date.now(),
            ...JSON.parse(JSON.stringify(this.metrics))
        };
        
        this.history.push(snapshot);
        
        // 限制历史记录大小
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }
    
    /**
     * 记录请求指标
     */
    recordRequest(context) {
        if (!this.enabled) return;
        
        this.metrics.requests.total++;
        
        // 记录方法统计
        const method = context.getMethod();
        this.metrics.requests.byMethod[method] = (this.metrics.requests.byMethod[method] || 0) + 1;
        
        // 记录状态码统计
        const statusCode = context.getStatusCode();
        if (statusCode) {
            this.metrics.requests.byStatus[statusCode] = (this.metrics.requests.byStatus[statusCode] || 0) + 1;
            
            if (statusCode >= 200 && statusCode < 400) {
                this.metrics.requests.success++;
            } else {
                this.metrics.requests.error++;
            }
        }
        
        // 记录响应时间
        const responseTime = context.getDuration();
        this.tempData.responseTimes.push(responseTime);
        
        if (responseTime < this.metrics.requests.minResponseTime) {
            this.metrics.requests.minResponseTime = responseTime;
        }
        if (responseTime > this.metrics.requests.maxResponseTime) {
            this.metrics.requests.maxResponseTime = responseTime;
        }
        
        // 记录拦截状态
        if (context.intercepted) {
            this.metrics.requests.intercepted++;
        }
        
        // 记录流量
        this.metrics.traffic.bytesIn += context.requestSize || 0;
        this.metrics.traffic.bytesOut += context.responseSize || 0;
        this.metrics.traffic.totalBytes = this.metrics.traffic.bytesIn + this.metrics.traffic.bytesOut;
    }
    
    /**
     * 记录连接指标
     */
    recordConnection(type = 'http', duration = 0) {
        if (!this.enabled) return;
        
        this.metrics.connections.total++;
        
        if (type === 'ssl' || type === 'https') {
            this.metrics.connections.ssl++;
        } else if (type === 'websocket') {
            this.metrics.connections.websocket++;
        }
        
        if (duration > 0) {
            this.tempData.connectionDurations.push(duration);
        }
    }
    
    /**
     * 记录活跃连接数变化
     */
    updateActiveConnections(count) {
        if (!this.enabled) return;
        this.metrics.connections.active = count;
    }
    
    /**
     * 记录错误
     */
    recordError(error, type = 'unknown') {
        if (!this.enabled) return;
        
        this.metrics.errors.total++;
        this.metrics.errors.byType[type] = (this.metrics.errors.byType[type] || 0) + 1;
        
        // 记录最近错误
        const errorInfo = {
            timestamp: Date.now(),
            type,
            message: error.message || error.toString(),
            stack: error.stack
        };
        
        this.metrics.errors.recent.push(errorInfo);
        
        // 限制最近错误记录数量
        if (this.metrics.errors.recent.length > 100) {
            this.metrics.errors.recent.shift();
        }
    }
    
    /**
     * 记录中间件执行
     */
    recordMiddleware(name, executionTime, error = null) {
        if (!this.enabled) return;
        
        this.metrics.middleware.executions++;
        this.tempData.middlewareExecutionTimes.push(executionTime);
        
        if (!this.metrics.middleware.byName[name]) {
            this.metrics.middleware.byName[name] = {
                executions: 0,
                avgExecutionTime: 0,
                errors: 0,
                totalTime: 0
            };
        }
        
        const middlewareStats = this.metrics.middleware.byName[name];
        middlewareStats.executions++;
        middlewareStats.totalTime += executionTime;
        middlewareStats.avgExecutionTime = Math.round(middlewareStats.totalTime / middlewareStats.executions);
        
        if (error) {
            this.metrics.middleware.errors++;
            middlewareStats.errors++;
        }
    }
    
    /**
     * 记录拦截器执行
     */
    recordInterceptor(name, executionTime, error = null) {
        if (!this.enabled) return;
        
        this.metrics.interceptors.executions++;
        this.tempData.interceptorExecutionTimes.push(executionTime);
        
        if (!this.metrics.interceptors.byName[name]) {
            this.metrics.interceptors.byName[name] = {
                executions: 0,
                avgExecutionTime: 0,
                errors: 0,
                totalTime: 0
            };
        }
        
        const interceptorStats = this.metrics.interceptors.byName[name];
        interceptorStats.executions++;
        interceptorStats.totalTime += executionTime;
        interceptorStats.avgExecutionTime = Math.round(interceptorStats.totalTime / interceptorStats.executions);
        
        if (error) {
            this.metrics.interceptors.errors++;
            interceptorStats.errors++;
        }
    }
    
    /**
     * 获取当前指标快照
     */
    getSnapshot() {
        return JSON.parse(JSON.stringify(this.metrics));
    }
    
    /**
     * 获取历史数据
     */
    getHistory(limit = 100) {
        return this.history.slice(-limit);
    }
    
    /**
     * 重置指标
     */
    reset() {
        this.metrics = {
            requests: {
                total: 0,
                success: 0,
                error: 0,
                intercepted: 0,
                byMethod: {},
                byStatus: {},
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0
            },
            connections: {
                total: 0,
                active: 0,
                ssl: 0,
                websocket: 0,
                avgDuration: 0
            },
            traffic: {
                bytesIn: 0,
                bytesOut: 0,
                totalBytes: 0
            },
            system: {
                cpuUsage: 0,
                memoryUsage: 0,
                memoryTotal: 0,
                uptime: 0
            },
            errors: {
                total: 0,
                byType: {},
                recent: []
            },
            middleware: {
                executions: 0,
                avgExecutionTime: 0,
                errors: 0,
                byName: {}
            },
            interceptors: {
                executions: 0,
                avgExecutionTime: 0,
                errors: 0,
                byName: {}
            }
        };
        
        this.history = [];
        this.tempData = {
            responseTimes: [],
            connectionDurations: [],
            middlewareExecutionTimes: [],
            interceptorExecutionTimes: []
        };
        
        this.startTime = Date.now();
    }
}

module.exports = MetricsCollector;