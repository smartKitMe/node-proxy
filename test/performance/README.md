# 性能测试说明

## 概述

本目录包含用于测试NodeMITMProxy性能的脚本，主要对比以下三种访问方式的性能差异：

1. 直接访问百度
2. 通过HTTP代理访问百度
3. 通过修改请求的HTTP代理访问百度

## 测试文件说明

- `http-baidu-performance-test.js` - 核心性能测试逻辑
- `run-http-baidu-test.js` - 运行完整HTTP百度性能测试的脚本
- `simple-performance-test.js` - 简化版性能测试（快速验证）
- `baidu-access-performance-comparison.js` - 完整的性能对比测试（包含HTTPS代理）
- `run-baidu-performance-test.js` - 运行完整性能测试的脚本

## 运行测试

### 运行完整HTTP百度性能测试（推荐）

```bash
cd /home/liuzm/projects/node-proxy
node test/performance/run-http-baidu-test.js
```

这个测试会：
1. 启动一个HTTP代理服务器（端口8080）
2. 启动一个修改请求的HTTP代理服务器（端口8081）
3. 执行500次直接访问百度的测试（10并发）
4. 执行500次通过HTTP代理访问百度的测试（10并发）
5. 执行500次通过修改请求的HTTP代理访问百度的测试（10并发）
6. 生成详细的性能对比报告

### 运行简化版测试（快速验证）

```bash
cd /home/liuzm/projects/node-proxy
node test/performance/simple-performance-test.js
```

这个测试会：
1. 执行50次直接访问百度的测试（5并发）
2. 执行50次通过HTTP代理访问百度的测试（5并发）
3. 执行50次通过修改请求的HTTP代理访问百度的测试（5并发）
4. 生成简化的性能对比报告

### 运行纯测试逻辑（需要手动启动代理服务器）

```bash
cd /home/liuzm/projects/node-proxy
node test/performance/http-baidu-performance-test.js
```

注意：这个测试需要手动启动两个代理服务器（端口8080和8081），或者在没有代理服务器时会失败。

## 测试指标

测试将收集以下性能指标：

- 请求成功率
- 平均响应时间
- 中位数响应时间
- 最小响应时间
- 最大响应时间
- 吞吐量（每秒处理请求数）
- 性能损耗百分比

## 性能分析

测试报告将包含以下分析：

1. 直接访问与HTTP代理访问的性能差异
2. 直接访问与修改请求代理访问的性能差异
3. HTTP代理访问与修改请求代理访问的性能差异
4. 吞吐量对比
5. 性能优化建议

## 注意事项

1. 测试需要网络连接
2. 测试期间会向百度发送大量请求，请确保符合其使用条款
3. 测试之间有5秒间隔，以避免对服务器造成过大压力
4. 测试完成后会自动生成性能报告
5. 如果需要测试HTTPS性能，请使用 `run-baidu-performance-test.js` 脚本