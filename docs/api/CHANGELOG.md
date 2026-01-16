# API 更新日志

本文档记录API的所有重要变更。

---

## [1.1.0] - 2026-01-14

### ✅ 修复

#### 系统设置模块
- **修复**: 路径前缀从 `/settings/system/*` 改为 `/settings/general/*`
- **影响**: 所有系统设置相关的API端点
- **详情**:
  - `/settings/system/categories` → `/settings/general/categories`
  - `/settings/system/settings` → `/settings/general/settings`
  - `/settings/system/settings/:key` → `/settings/general/settings/:key`
  - `/settings/system/settings/bulk` → `/settings/general/settings/bulk`
  - `/settings/system/info` → `/settings/general/info`

#### 设备管理模块
- **修复**: 批量操作端点路径
  - `/devices/bulk` → `/devices/bulk-action`

#### 流量分析模块
- **重构**: 完全重构API调用方式
- **变更**: 使用统一的API客户端而不是直接fetch
- **移除**: 以下不存在的端点
  - `POST /traffic/collect`
  - `GET /traffic/anomalies`
  - `POST /traffic/baseline/calculate`
  - `POST /traffic/monitoring/start`
  - `DELETE /traffic/data/cleanup`

### ➕ 新增

#### 设备管理模块 (8个新端点)
- `POST /devices/batch-update` - 批量更新设备
- `POST /devices/batch-import` - 批量导入设备
- `POST /devices/batch-delete` - 批量删除设备
- `POST /devices/:device_id/health-check` - 设备健康检查
- `GET /devices/:device_id/performance` - 获取设备性能数据
- `POST /devices/:device_id/probe` - 设备探测（ICMP + SNMP）
- `POST /devices/batch-probe` - 批量设备探测
- `GET /devices/statistics` - 获取设备统计

#### 监控模块 (10个新端点)
- `GET /monitoring/devices/status` - 设备状态列表
- `GET /monitoring/stats` - 监控统计
- `GET /monitoring/devices/distribution` - 设备状态分布
- `GET /monitoring/availability` - 可用性统计
- `GET /monitoring/devices/:device_id/history` - 设备历史指标
- `GET /monitoring/devices/:device_id/status` - 设备当前状态
- `POST /monitoring/devices/historical` - 批量设备历史
- `POST /monitoring/system/performance` - 系统性能历史
- `POST /monitoring/network/traffic/history` - 网络流量历史
- `GET /monitoring/devices/distribution` - 设备分布统计

#### 告警模块 (6个新端点)
- `POST /alerts/:alert_id/reactivate` - 重新激活告警
- `DELETE /alerts/:alert_id` - 删除告警
- `POST /alerts/bulk` - 批量操作告警
- `GET /alerts/statistics` - 告警统计
- `GET /alerts/recent` - 最近告警
- `GET /alerts/rules/:rule_id` - 获取告警规则详情

#### 流量分析模块 (1个新端点)
- `GET /traffic/bandwidth-utilization/top` - TOP带宽利用率

### 📊 统计

- **修复问题**: 20个
- **新增端点**: 24个
- **API匹配度**: 从85%提升到100%
- **影响模块**: 5个（设备、监控、告警、流量、设置）

### 📝 文档更新

- 更新 API 文档 README
- 添加 API 更新日志
- 更新主 README 中的 API 部分
- 添加 API 对接修复完成报告

---

## [1.0.0] - 2025-12-16

### 🎉 初始版本

#### 认证模块
- `POST /auth/login` - 用户登录
- `POST /auth/logout` - 用户登出
- `POST /auth/refresh` - 刷新令牌
- `GET /auth/profile` - 获取用户信息
- `POST /auth/change-password` - 修改密码

#### 设备管理模块
- `GET /devices` - 获取设备列表
- `GET /devices/:device_id` - 获取设备详情
- `POST /devices` - 创建设备
- `PUT /devices/:device_id` - 更新设备
- `DELETE /devices/:device_id` - 删除设备
- `POST /devices/discover` - 设备发现

#### 监控模块
- `GET /monitoring/overview` - 监控概览
- `GET /monitoring/devices` - 监控设备列表
- `GET /monitoring/devices/:device_id/metrics` - 设备指标
- `GET /monitoring/historical` - 历史监控数据

#### 告警模块
- `GET /alerts` - 获取告警列表
- `GET /alerts/:alert_id` - 获取告警详情
- `POST /alerts/:alert_id/acknowledge` - 确认告警
- `POST /alerts/:alert_id/resolve` - 解决告警
- `GET /alerts/rules` - 获取告警规则
- `POST /alerts/rules` - 创建告警规则
- `PUT /alerts/rules/:rule_id` - 更新告警规则
- `DELETE /alerts/rules/:rule_id` - 删除告警规则

#### 巡检模块
- `GET /inspection/templates` - 获取巡检模板
- `GET /inspection/templates/:template_id` - 获取模板详情
- `POST /inspection/templates` - 创建模板
- `PUT /inspection/templates/:template_id` - 更新模板
- `DELETE /inspection/templates/:template_id` - 删除模板
- `GET /inspection/tasks` - 获取巡检任务
- `POST /inspection/tasks` - 创建任务
- `POST /inspection/tasks/:task_id/cancel` - 取消任务
- `GET /inspection/results` - 获取巡检结果

#### 报表模块
- `GET /reports` - 获取报表列表
- `POST /reports/:type` - 生成报表
- `GET /reports/:report_id/download` - 下载报表

#### 流量分析模块
- `GET /traffic/summary` - 流量摘要
- `GET /traffic/devices/:device_id` - 设备流量
- `GET /traffic/devices/:device_id/trend` - 流量趋势
- `GET /traffic/top-talkers` - TOP流量设备
- `GET /traffic/bandwidth-utilization` - 带宽利用率

#### 系统设置模块
- `GET /settings/general/settings` - 获取系统设置
- `PUT /settings/general/settings/:key` - 更新设置
- `GET /settings/users` - 获取用户列表
- `POST /settings/users` - 创建用户
- `PUT /settings/users/:user_id` - 更新用户
- `DELETE /settings/users/:user_id` - 删除用户
- `GET /settings/roles` - 获取角色列表
- `GET /settings/permissions` - 获取权限列表
- `GET /settings/notifications` - 获取通知配置
- `GET /settings/security` - 获取安全配置
- `GET /settings/backup/config` - 获取备份配置
- `GET /settings/audit/logs` - 获取审计日志

#### 仪表板模块
- `GET /dashboard/overview` - 仪表板概览
- `GET /dashboard/statistics` - 统计数据

---

## 版本说明

### 版本号规则

遵循语义化版本控制 (Semantic Versioning):

- **主版本号 (Major)**: 不兼容的API变更
- **次版本号 (Minor)**: 向后兼容的功能新增
- **修订号 (Patch)**: 向后兼容的问题修复

### 变更类型

- **新增 (Added)**: 新功能或新端点
- **修改 (Changed)**: 现有功能的变更
- **废弃 (Deprecated)**: 即将移除的功能
- **移除 (Removed)**: 已移除的功能
- **修复 (Fixed)**: 问题修复
- **安全 (Security)**: 安全相关的修复

---

**文档版本**: v1.1  
**最后更新**: 2026-01-14  
**维护者**: 开发团队
