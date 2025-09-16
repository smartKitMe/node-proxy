const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

/**
 * 迁移工具
 * 帮助用户从旧版本迁移到新版本
 */
class MigrationTool {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.dryRun = options.dryRun || false;
        this.backupDir = options.backupDir || path.join(process.cwd(), 'migration-backup');
        
        // 迁移规则
        this.migrationRules = [
            {
                name: 'Update require statements',
                pattern: /require\(['"](node-mitmproxy|\.\/)([^'"]*)['"]\)/g,
                replacement: this._updateRequireStatements.bind(this)
            },
            {
                name: 'Update constructor calls',
                pattern: /new\s+MITMProxy\s*\(/g,
                replacement: 'new NodeMITMProxy('
            },
            {
                name: 'Update listen method calls',
                pattern: /\.listen\s*\(/g,
                replacement: '.start('
            },
            {
                name: 'Update close method calls',
                pattern: /\.close\s*\(/g,
                replacement: '.stop('
            },
            {
                name: 'Update middleware registration',
                pattern: /\.use\s*\(\s*function\s*\(/g,
                replacement: '.use({ name: "legacy_middleware", execute: async function('
            }
        ];
        
        // 迁移统计
        this.stats = {
            filesProcessed: 0,
            filesModified: 0,
            rulesApplied: 0,
            errors: 0
        };
    }
    
    /**
     * 执行迁移
     */
    async migrate(targetPath) {
        try {
            this.logger.info('Starting migration process', {
                target: targetPath,
                dryRun: this.dryRun
            });
            
            // 创建备份目录
            if (!this.dryRun) {
                await this._ensureBackupDir();
            }
            
            // 处理目标路径
            const stats = await fs.promises.stat(targetPath);
            
            if (stats.isDirectory()) {
                await this._migrateDirectory(targetPath);
            } else if (stats.isFile()) {
                await this._migrateFile(targetPath);
            } else {
                throw new Error('Target path is neither a file nor a directory');
            }
            
            // 输出迁移报告
            this._generateReport();
            
        } catch (error) {
            this.logger.error('Migration failed', { error: error.message });
            throw error;
        }
    }
    
    /**
     * 迁移目录
     */
    async _migrateDirectory(dirPath) {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // 跳过node_modules和.git目录
                if (entry.name === 'node_modules' || entry.name === '.git') {
                    continue;
                }
                await this._migrateDirectory(fullPath);
            } else if (entry.isFile() && this._shouldProcessFile(entry.name)) {
                await this._migrateFile(fullPath);
            }
        }
    }
    
    /**
     * 迁移文件
     */
    async _migrateFile(filePath) {
        try {
            this.stats.filesProcessed++;
            
            // 读取文件内容
            const content = await readFile(filePath, 'utf8');
            let modifiedContent = content;
            let hasChanges = false;
            
            // 应用迁移规则
            for (const rule of this.migrationRules) {
                const originalContent = modifiedContent;
                
                if (typeof rule.replacement === 'function') {
                    modifiedContent = modifiedContent.replace(rule.pattern, rule.replacement);
                } else {
                    modifiedContent = modifiedContent.replace(rule.pattern, rule.replacement);
                }
                
                if (modifiedContent !== originalContent) {
                    hasChanges = true;
                    this.stats.rulesApplied++;
                    
                    this.logger.debug('Applied migration rule', {
                        file: filePath,
                        rule: rule.name
                    });
                }
            }
            
            // 如果有变更，保存文件
            if (hasChanges) {
                this.stats.filesModified++;
                
                if (!this.dryRun) {
                    // 创建备份
                    await this._backupFile(filePath, content);
                    
                    // 写入修改后的内容
                    await writeFile(filePath, modifiedContent, 'utf8');
                }
                
                this.logger.info('File migrated', {
                    file: filePath,
                    dryRun: this.dryRun
                });
            }
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Failed to migrate file', {
                file: filePath,
                error: error.message
            });
        }
    }
    
    /**
     * 检查是否应该处理文件
     */
    _shouldProcessFile(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        return ['.js', '.ts', '.jsx', '.tsx'].includes(ext);
    }
    
    /**
     * 更新require语句
     */
    _updateRequireStatements(match, moduleName, subPath) {
        if (moduleName === 'node-mitmproxy') {
            if (subPath) {
                // 处理子模块引用
                return `require('node-mitmproxy/src/${subPath}')`;
            } else {
                // 主模块引用
                return `require('node-mitmproxy')`;
            }
        } else if (moduleName === './') {
            // 相对路径引用，可能需要更新
            if (subPath.includes('mitmproxy')) {
                return `require('./index')`;
            }
        }
        
        return match; // 不修改
    }
    
    /**
     * 确保备份目录存在
     */
    async _ensureBackupDir() {
        try {
            await access(this.backupDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.promises.mkdir(this.backupDir, { recursive: true });
            } else {
                throw error;
            }
        }
    }
    
    /**
     * 备份文件
     */
    async _backupFile(filePath, content) {
        const relativePath = path.relative(process.cwd(), filePath);
        const backupPath = path.join(this.backupDir, relativePath);
        const backupDir = path.dirname(backupPath);
        
        // 确保备份目录存在
        await fs.promises.mkdir(backupDir, { recursive: true });
        
        // 写入备份文件
        await writeFile(backupPath, content, 'utf8');
    }
    
    /**
     * 生成迁移报告
     */
    _generateReport() {
        const report = {
            summary: {
                filesProcessed: this.stats.filesProcessed,
                filesModified: this.stats.filesModified,
                rulesApplied: this.stats.rulesApplied,
                errors: this.stats.errors,
                dryRun: this.dryRun
            },
            recommendations: this._generateRecommendations()
        };
        
        this.logger.info('Migration completed', report.summary);
        
        if (report.recommendations.length > 0) {
            this.logger.info('Migration recommendations:');
            report.recommendations.forEach((rec, index) => {
                this.logger.info(`${index + 1}. ${rec}`);
            });
        }
        
        return report;
    }
    
    /**
     * 生成迁移建议
     */
    _generateRecommendations() {
        const recommendations = [];
        
        if (this.stats.filesModified > 0) {
            recommendations.push(
                'Test your application thoroughly after migration to ensure all functionality works correctly.'
            );
            
            recommendations.push(
                'Review the migrated code manually to ensure the automatic changes are correct.'
            );
            
            if (!this.dryRun) {
                recommendations.push(
                    `Backup files have been created in ${this.backupDir}. Keep them until you\'re confident the migration is successful.`
                );
            }
        }
        
        if (this.stats.errors > 0) {
            recommendations.push(
                'Some files could not be migrated automatically. Please review the error logs and migrate them manually.'
            );
        }
        
        recommendations.push(
            'Update your package.json dependencies to use the new version of node-mitmproxy.'
        );
        
        recommendations.push(
            'Consider using the new middleware and interceptor APIs for better performance and maintainability.'
        );
        
        return recommendations;
    }
    
    /**
     * 添加自定义迁移规则
     */
    addRule(rule) {
        if (!rule.name || !rule.pattern || !rule.replacement) {
            throw new Error('Migration rule must have name, pattern, and replacement properties');
        }
        
        this.migrationRules.push(rule);
    }
    
    /**
     * 获取迁移统计
     */
    getStats() {
        return Object.assign({}, this.stats);
    }
    
    /**
     * 重置统计
     */
    resetStats() {
        this.stats = {
            filesProcessed: 0,
            filesModified: 0,
            rulesApplied: 0,
            errors: 0
        };
    }
}

/**
 * 创建迁移工具实例
 */
function createMigrationTool(options = {}) {
    return new MigrationTool(options);
}

/**
 * 快速迁移函数
 */
async function migrate(targetPath, options = {}) {
    const tool = new MigrationTool(options);
    return await tool.migrate(targetPath);
}

// 导出迁移工具
module.exports = MigrationTool;
module.exports.createMigrationTool = createMigrationTool;
module.exports.migrate = migrate;
module.exports.default = MigrationTool;