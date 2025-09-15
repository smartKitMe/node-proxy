/**
 * 对象池工具类
 * 用于复用对象，减少GC压力，提升性能
 */
class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10, maxSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.maxSize = maxSize;
        this.pool = [];
        this.created = 0;
        this.acquired = 0;
        this.released = 0;
        
        // 预创建对象
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
            this.created++;
        }
    }
    
    /**
     * 获取对象
     */
    acquire() {
        let obj;
        
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
            this.created++;
        }
        
        this.acquired++;
        return obj;
    }
    
    /**
     * 释放对象
     */
    release(obj) {
        if (!obj) return;
        
        // 重置对象状态
        if (this.resetFn) {
            this.resetFn(obj);
        }
        
        // 如果池未满，则放回池中
        if (this.pool.length < this.maxSize) {
            this.pool.push(obj);
        }
        
        this.released++;
    }
    
    /**
     * 获取池统计信息
     */
    getStats() {
        return {
            poolSize: this.pool.length,
            maxSize: this.maxSize,
            created: this.created,
            acquired: this.acquired,
            released: this.released,
            inUse: this.acquired - this.released
        };
    }
    
    /**
     * 清空池
     */
    clear() {
        this.pool = [];
        this.created = 0;
        this.acquired = 0;
        this.released = 0;
    }
    
    /**
     * 调整池大小
     */
    resize(newMaxSize) {
        this.maxSize = newMaxSize;
        
        // 如果当前池大小超过新的最大值，则移除多余对象
        while (this.pool.length > newMaxSize) {
            this.pool.pop();
        }
    }
}

module.exports = ObjectPool;