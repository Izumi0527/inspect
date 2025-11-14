# Settings API 统一化改造技术方案

## 文档信息

- **创建日期**: 2025-11-07
- **版本**: v1.0
- **状态**: 待实施
- **作者**: Claude Code

---

## 1. 背景与问题陈述

### 1.1 问题描述

当前 Settings 模块存在 API 设计不一致的问题，导致前端调用模式不统一，影响代码可维护性和用户体验。

**现状**：

**Group A - 统一端点模式**（通用配置、安全策略、通知中心）
```http
GET /api/v1/settings/system/settings?category=system
GET /api/v1/settings/system/settings?category=security
GET /api/v1/settings/system/settings?category=notification
```

**Group B - 独立端点模式**（用户管理、审计日志、备份管理、系统监控）
```http
GET /api/v1/settings/users
GET /api/v1/settings/users/stats
GET /api/v1/settings/audit/logs
GET /api/v1/settings/audit/stats
GET /api/v1/settings/backup
GET /api/v1/settings/monitoring
```

### 1.2 日志分析发现的问题

#### 问题1: API 请求模式不一致

**Group A 日志特征**（无 CORS 预检）：
```log
2025-01-07 11:26:13 INFO GET /api/v1/settings/system/settings?category=system 200 OK 0.0012s
```

**Group B 日志特征**（有 CORS 预检）：
```log
2025-01-07 11:26:41 INFO OPTIONS /api/v1/settings/users 200 OK 0.0002s
2025-01-07 11:26:41 INFO GET /api/v1/settings/users 200 OK 0.1705s
```

**差异分析**：
- Group A 使用查询参数过滤分类，单一端点
- Group B 使用资源路径区分模块，独立端点
- Group B 触发 CORS 预检请求（OPTIONS），Group A 没有

#### 问题2: 缓存策略难以优化

由于 Group A 使用统一端点 + 查询参数，前端缓存策略难以实施：

```typescript
// 当前困境：所有分类共用同一个缓存键
useQuery(['settings', 'system', category]) // category 变化导致缓存失效
```

Group B 的独立端点更适合前端缓存：

```typescript
// 理想状态：独立缓存键，精细化控制
useQuery(['settings', 'users'])       // ✅ 独立缓存
useQuery(['settings', 'audit'])       // ✅ 独立缓存
```

#### 问题3: 性能日志发现的额外问题

```log
# 系统配置在 40 秒内被请求 3 次
11:26:13 GET /api/v1/settings/system/settings?category=system (0.0012s)
11:26:19 GET /api/v1/settings/system/settings (0.0015s)
11:26:53 GET /api/v1/settings/system/settings (0.0012s)
```

**原因**：统一端点导致前端无法实施有效的请求去重和缓存策略。

---

## 2. 目标与收益

### 2.1 核心目标

**统一 Settings 模块的 API 设计**，使所有子模块遵循相同的 RESTful 资源路径模式。

### 2.2 预期收益

#### 技术收益
1. **API 一致性**：统一的端点设计模式，降低学习成本
2. **缓存优化**：支持细粒度的前端缓存策略，减少重复请求
3. **性能提升**：独立端点支持更好的 HTTP 缓存、CDN 缓存
4. **代码可维护性**：每个模块职责清晰，路由逻辑简洁

#### 用户体验收益
1. **响应速度提升**：减少重复请求，利用缓存加速页面加载
2. **一致的加载行为**：所有 Settings 页面使用统一的数据获取模式

---

## 3. API 设计方案（已纠正）

### 3.1 核心设计原则

#### ✅ 正确的 API 模式

遵循现有 Group B 模块的成功模式：

```http
# 用户管理模块（参考标准）
GET /api/v1/settings/users          # 获取用户列表
GET /api/v1/settings/users/stats    # 获取用户统计信息

# 审计日志模块（参考标准）
GET /api/v1/settings/audit/logs     # 获取审计日志列表
GET /api/v1/settings/audit/stats    # 获取审计统计信息
```

#### ✅ 设计纠正说明

**初始错误设计**：
```http
GET /api/v1/settings/general/configs  ❌
GET /api/v1/settings/security/configs ❌
```

**用户反馈纠正**：
> "有地方需要调整，1、用stats替换成configs；2、研究下用户管理: GET /api/v1/settings/users/stats，是用来干嘛的。"

**分析 `/stats` 端点的真实用途**：
```python
# /users/stats 返回的是聚合统计数据，不是配置列表
{
  "total": 100,
  "active_count": 85,
  "inactive_count": 15,
  "role_distribution": {...}
}

# /users 返回的才是用户列表
{
  "items": [...],  # 用户列表
  "total": 100,
  "page": 1,
  "page_size": 20
}
```

**正确的设计**：
```http
# 主资源路径返回列表
GET /api/v1/settings/general       ✅ 获取通用配置列表

# /stats 端点返回统计信息（可选，用于仪表板展示）
GET /api/v1/settings/general/stats ✅ 获取通用配置统计信息
```

### 3.2 完整的目标 API 设计

#### 通用配置模块 (General Settings)

```http
# 基础端点
GET    /api/v1/settings/general              # 获取通用配置列表
GET    /api/v1/settings/general/stats        # 获取通用配置统计信息（可选）
GET    /api/v1/settings/general/{key}        # 获取单个配置项
PUT    /api/v1/settings/general/{key}        # 更新单个配置项
POST   /api/v1/settings/general/bulk         # 批量更新配置
POST   /api/v1/settings/general/{key}/reset  # 重置配置为默认值

# 高级功能
GET    /api/v1/settings/general/categories   # 获取配置分类
GET    /api/v1/settings/general/export       # 导出配置
POST   /api/v1/settings/general/import       # 导入配置
GET    /api/v1/settings/general/info         # 获取系统信息
```

#### 安全策略模块 (Security Settings)

```http
# 基础端点
GET    /api/v1/settings/security             # 获取安全策略配置列表
GET    /api/v1/settings/security/stats       # 获取安全策略统计信息（可选）
GET    /api/v1/settings/security/{key}       # 获取单个安全配置
PUT    /api/v1/settings/security/{key}       # 更新单个安全配置

# 具体策略端点
GET    /api/v1/settings/security/password-policy    # 获取密码策略
PUT    /api/v1/settings/security/password-policy    # 更新密码策略
GET    /api/v1/settings/security/login-policy       # 获取登录策略
PUT    /api/v1/settings/security/login-policy       # 更新登录策略
GET    /api/v1/settings/security/session-policy     # 获取会话策略
PUT    /api/v1/settings/security/session-policy     # 更新会话策略
```

#### 通知中心模块 (Notification Settings)

```http
# 基础端点
GET    /api/v1/settings/notifications         # 获取通知配置列表
GET    /api/v1/settings/notifications/stats   # 获取通知配置统计信息（可选）
GET    /api/v1/settings/notifications/{key}   # 获取单个通知配置
PUT    /api/v1/settings/notifications/{key}   # 更新单个通知配置

# 邮件配置
POST   /api/v1/settings/notifications/email/config  # 配置邮件设置
POST   /api/v1/settings/notifications/email/test    # 测试邮件配置

# 通知配置
POST   /api/v1/settings/notifications/config        # 配置通知设置

# 测试端点（保留现有功能）
POST   /api/v1/settings/notifications/test-email    # 测试邮件
POST   /api/v1/settings/notifications/test-sms      # 测试短信
POST   /api/v1/settings/notifications/test-webhook  # 测试 Webhook
```

### 3.3 向后兼容策略

**保留旧端点并添加弃用警告**，设置 **6 个月过渡期**：

```python
# 旧端点保留，但添加弃用警告
@router.get("/system/settings", deprecated=True)
async def get_system_settings_old(
    category: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    【已弃用】获取系统配置（旧接口）

    ⚠️ 此接口将在 2025-07-07 后移除，请使用新接口：
    - 通用配置: GET /api/v1/settings/general
    - 安全策略: GET /api/v1/settings/security
    - 通知中心: GET /api/v1/settings/notifications
    """
    logger.warning(
        "Deprecated API called",
        endpoint="/system/settings",
        category=category,
        user_id=current_user["id"],
        deprecation_date="2025-07-07"
    )
    # ... 原有逻辑
```

---

## 4. 技术实施方案

### 4.1 后端改造（Phase 1）

#### 步骤 1: 修改 `general.py` 路由前缀

**文件**: `backend/src/api/settings/general.py`

**变更**：
```python
# 修改前
router = APIRouter(prefix="/system", tags=["General Settings"])

# 修改后
router = APIRouter(prefix="/general", tags=["General Settings"])
```

#### 步骤 2: 添加 `GET /` 主端点到 `general.py`

```python
@router.get("/", response_model=dict, summary="获取通用配置列表")
async def get_general_configs(
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取通用配置列表

    返回所有 system、notification、email、inspection、report 等分类的配置项
    """
    try:
        # 获取所有通用相关的配置
        categories = ["system", "notification", "email", "inspection", "report"]
        all_settings = []

        for category in categories:
            settings = await general_settings_service.get_all_settings(category)
            all_settings.extend(settings)

        logger.info(
            "Retrieved general configs",
            total_count=len(all_settings),
            user_id=current_user["id"]
        )

        return {
            "items": all_settings,
            "total": len(all_settings)
        }

    except Exception as e:
        logger.error("Failed to get general configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取通用配置失败: {str(e)}")
```

#### 步骤 3: 添加 `GET /stats` 端点（可选）

```python
@router.get("/stats", response_model=dict, summary="获取通用配置统计信息")
async def get_general_stats(
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取通用配置统计信息

    用于仪表板展示聚合数据
    """
    try:
        categories = ["system", "notification", "email", "inspection", "report"]
        stats = {
            "total_count": 0,
            "by_category": {}
        }

        for category in categories:
            settings = await general_settings_service.get_all_settings(category)
            count = len(settings)
            stats["total_count"] += count
            stats["by_category"][category] = count

        return stats

    except Exception as e:
        logger.error("Failed to get general stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")
```

#### 步骤 4: 创建独立的 `security.py` 模块

**文件**: `backend/src/api/settings/security.py`（新建）

```python
"""
Security Settings API Router
安全策略API路由
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
import structlog

from src.schemas.settings.general import SettingItem
from src.services.settings.general_service import general_settings_service
from src.core.permissions import require_permission

logger = structlog.get_logger()

router = APIRouter(prefix="/security", tags=["Security Settings"])


@router.get("/", response_model=dict, summary="获取安全策略配置列表")
async def get_security_configs(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取安全策略配置列表

    包括密码策略、登录限制、会话管理等安全相关配置
    """
    try:
        settings = await general_settings_service.get_all_settings(category="security")

        logger.info(
            "Retrieved security configs",
            total_count=len(settings),
            user_id=current_user["id"]
        )

        return {
            "items": settings,
            "total": len(settings)
        }

    except Exception as e:
        logger.error("Failed to get security configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取安全配置失败: {str(e)}")


@router.get("/stats", response_model=dict, summary="获取安全策略统计信息")
async def get_security_stats(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取安全策略统计信息
    """
    try:
        settings = await general_settings_service.get_all_settings(category="security")

        return {
            "total_count": len(settings),
            "enabled_count": sum(1 for s in settings if s.get("value") is True),
            "last_updated": max((s.get("updated_at") for s in settings if s.get("updated_at")), default=None)
        }

    except Exception as e:
        logger.error("Failed to get security stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.get("/{key}", response_model=SettingItem, summary="获取单个安全配置")
async def get_security_setting(
    key: str,
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取单个安全配置项
    """
    try:
        # 确保 key 以 security. 开头
        if not key.startswith("security."):
            key = f"security.{key}"

        setting = await general_settings_service.get_setting(key)
        if setting is None:
            raise HTTPException(status_code=404, detail=f"配置项不存在: {key}")

        return setting

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get security setting", error=str(e), key=key)
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")


@router.put("/{key}", response_model=SettingItem, summary="更新单个安全配置")
async def update_security_setting(
    key: str,
    value: dict,
    current_user: dict = Depends(require_permission("settings:security:write"))
):
    """
    更新单个安全配置项
    """
    try:
        # 确保 key 以 security. 开头
        if not key.startswith("security."):
            key = f"security.{key}"

        actual_value = value.get("value")
        if actual_value is None:
            raise HTTPException(status_code=400, detail="请求体必须包含 'value' 字段")

        setting = await general_settings_service.update_setting(
            key,
            actual_value,
            current_user["id"]
        )

        logger.info(
            "Security setting updated",
            key=key,
            updated_by=current_user["id"]
        )

        return setting

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update security setting", error=str(e), key=key)
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")


# 具体策略端点

@router.get("/password-policy", summary="获取密码策略")
async def get_password_policy(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取密码策略配置

    包括最小长度、复杂度要求、过期时间等
    """
    try:
        password_keys = [
            "security.password.min_length",
            "security.password.require_uppercase",
            "security.password.require_lowercase",
            "security.password.require_numbers",
            "security.password.require_special_chars",
            "security.password.expiry_days",
            "security.password.history_count"
        ]

        policy = {}
        for key in password_keys:
            setting = await general_settings_service.get_setting(key)
            if setting:
                # 移除 security.password. 前缀
                short_key = key.replace("security.password.", "")
                policy[short_key] = setting.get("value")

        return policy

    except Exception as e:
        logger.error("Failed to get password policy", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取密码策略失败: {str(e)}")


@router.put("/password-policy", summary="更新密码策略")
async def update_password_policy(
    policy: dict,
    current_user: dict = Depends(require_permission("settings:security:write"))
):
    """
    批量更新密码策略
    """
    try:
        # 将简短的 key 转换为完整的 key
        full_settings = {}
        for short_key, value in policy.items():
            full_key = f"security.password.{short_key}"
            full_settings[full_key] = value

        results = await general_settings_service.bulk_update_settings(
            full_settings,
            current_user["id"]
        )

        successful_count = sum(1 for success in results.values() if success)

        if successful_count != len(full_settings):
            raise HTTPException(status_code=400, detail="部分密码策略更新失败")

        logger.info(
            "Password policy updated",
            updated_by=current_user["id"]
        )

        return {"message": "密码策略更新成功", "updated_count": successful_count}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update password policy", error=str(e))
        raise HTTPException(status_code=500, detail=f"更新密码策略失败: {str(e)}")
```

#### 步骤 5: 扩展 `notifications.py`

**文件**: `backend/src/api/settings/notifications.py`

**添加主端点**：

```python
@router.get("/", response_model=dict, summary="获取通知配置列表")
async def get_notification_configs(
    current_user: dict = Depends(require_permission("settings:notifications:read"))
):
    """
    获取通知配置列表

    包括邮件通知、短信通知、Webhook 通知等相关配置
    """
    try:
        # 获取 notification 和 email 分类的配置
        notification_settings = await general_settings_service.get_all_settings(category="notification")
        email_settings = await general_settings_service.get_all_settings(category="email")

        all_settings = notification_settings + email_settings

        logger.info(
            "Retrieved notification configs",
            total_count=len(all_settings),
            user_id=current_user["id"]
        )

        return {
            "items": all_settings,
            "total": len(all_settings)
        }

    except Exception as e:
        logger.error("Failed to get notification configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取通知配置失败: {str(e)}")


@router.get("/stats", response_model=dict, summary="获取通知配置统计信息")
async def get_notification_stats(
    current_user: dict = Depends(require_permission("settings:notifications:read"))
):
    """
    获取通知配置统计信息
    """
    try:
        notification_settings = await general_settings_service.get_all_settings(category="notification")
        email_settings = await general_settings_service.get_all_settings(category="email")

        return {
            "total_count": len(notification_settings) + len(email_settings),
            "notification_count": len(notification_settings),
            "email_count": len(email_settings)
        }

    except Exception as e:
        logger.error("Failed to get notification stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")
```

#### 步骤 6: 更新路由注册

**文件**: `backend/src/api/settings/__init__.py`

```python
"""
Settings Module Router
统一的 Settings 路由模块
"""
from fastapi import APIRouter

from src.api.settings.general import router as general_router
from src.api.settings.security import router as security_router  # 新增
from src.api.settings.notifications import router as notifications_router
from src.api.settings.users import router as users_router
from src.api.settings.audit import router as audit_router
from src.api.settings.backup import router as backup_router
from src.api.settings.monitoring import router as monitoring_router

# 创建 Settings 主路由
settings_router = APIRouter(prefix="/settings", tags=["Settings"])

# 注册子模块路由
settings_router.include_router(general_router)        # /settings/general
settings_router.include_router(security_router)       # /settings/security (新增)
settings_router.include_router(notifications_router)  # /settings/notifications
settings_router.include_router(users_router)          # /settings/users
settings_router.include_router(audit_router)          # /settings/audit
settings_router.include_router(backup_router)         # /settings/backup
settings_router.include_router(monitoring_router)     # /settings/monitoring

__all__ = ["settings_router"]
```

#### 步骤 7: 添加弃用警告到旧端点

**文件**: `backend/src/api/settings/general.py`

```python
# 在文件末尾添加向后兼容的旧端点

# ============================================================================
# 向后兼容端点（已弃用，将在 2025-07-07 移除）
# ============================================================================

@router.get("/system/settings", deprecated=True, include_in_schema=True)
async def get_system_settings_deprecated(
    category: Optional[str] = Query(None, description="配置分类筛选"),
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    【已弃用】获取系统配置（旧接口）

    ⚠️ **此接口将在 2025-07-07 后移除，请使用新接口：**
    - 通用配置: `GET /api/v1/settings/general`
    - 安全策略: `GET /api/v1/settings/security`
    - 通知中心: `GET /api/v1/settings/notifications`

    **迁移指南**: 参见 docs/api-unification-refactoring.md
    """
    logger.warning(
        "⚠️ Deprecated API called - /system/settings will be removed on 2025-07-07",
        endpoint="/system/settings",
        category=category,
        user_id=current_user["id"],
        deprecation_date="2025-07-07",
        migration_guide="docs/api-unification-refactoring.md"
    )

    try:
        settings = await general_settings_service.get_all_settings(category)
        return settings
    except Exception as e:
        logger.error("Failed to get all settings", error=str(e), category=category)
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")
```

### 4.2 响应模型定义

**文件**: `backend/src/schemas/settings/general.py`（添加新的响应模型）

```python
class GeneralConfigsResponse(BaseModel):
    """通用配置列表响应"""
    items: List[SettingItem]
    total: int

class SecurityConfigsResponse(BaseModel):
    """安全策略配置列表响应"""
    items: List[SettingItem]
    total: int

class NotificationConfigsResponse(BaseModel):
    """通知配置列表响应"""
    items: List[SettingItem]
    total: int

class ConfigStatsResponse(BaseModel):
    """配置统计信息响应"""
    total_count: int
    by_category: Optional[Dict[str, int]] = None
    enabled_count: Optional[int] = None
    last_updated: Optional[datetime] = None
```

---

## 5. 前端改造（Phase 2）

### 5.1 API 调用层更新

**文件**: `frontend/src/features/settings/api/general.api.ts`

```typescript
// 修改前
export const getGeneralSettings = async (category?: string) => {
  const params = category ? { category } : {};
  const response = await apiClient.get('/settings/system/settings', { params });
  return response.data;
};

// 修改后
export const getGeneralConfigs = async () => {
  const response = await apiClient.get('/settings/general');
  return response.data;
};

export const getGeneralStats = async () => {
  const response = await apiClient.get('/settings/general/stats');
  return response.data;
};
```

**新建**: `frontend/src/features/settings/api/security.api.ts`

```typescript
import { apiClient } from '@/lib/api-client';

export const getSecurityConfigs = async () => {
  const response = await apiClient.get('/settings/security');
  return response.data;
};

export const getSecurityStats = async () => {
  const response = await apiClient.get('/settings/security/stats');
  return response.data;
};

export const updateSecuritySetting = async (key: string, value: any) => {
  const response = await apiClient.put(`/settings/security/${key}`, { value });
  return response.data;
};

export const getPasswordPolicy = async () => {
  const response = await apiClient.get('/settings/security/password-policy');
  return response.data;
};

export const updatePasswordPolicy = async (policy: Record<string, any>) => {
  const response = await apiClient.put('/settings/security/password-policy', policy);
  return response.data;
};
```

### 5.2 React Query Hooks 更新

**文件**: `frontend/src/features/settings/hooks/useGeneralSettings.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGeneralConfigs, getGeneralStats } from '../api/general.api';

// 独立的缓存键
export const generalConfigsKeys = {
  all: ['settings', 'general'] as const,
  list: () => [...generalConfigsKeys.all, 'list'] as const,
  stats: () => [...generalConfigsKeys.all, 'stats'] as const,
};

export const useGeneralConfigs = () => {
  return useQuery({
    queryKey: generalConfigsKeys.list(),
    queryFn: getGeneralConfigs,
    staleTime: 5 * 60 * 1000, // 5 分钟
    gcTime: 10 * 60 * 1000,   // 10 分钟
  });
};

export const useGeneralStats = () => {
  return useQuery({
    queryKey: generalConfigsKeys.stats(),
    queryFn: getGeneralStats,
    staleTime: 5 * 60 * 1000,
  });
};
```

**新建**: `frontend/src/features/settings/hooks/useSecuritySettings.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSecurityConfigs,
  getSecurityStats,
  updateSecuritySetting,
  getPasswordPolicy,
  updatePasswordPolicy,
} from '../api/security.api';

export const securityConfigsKeys = {
  all: ['settings', 'security'] as const,
  list: () => [...securityConfigsKeys.all, 'list'] as const,
  stats: () => [...securityConfigsKeys.all, 'stats'] as const,
  passwordPolicy: () => [...securityConfigsKeys.all, 'password-policy'] as const,
};

export const useSecurityConfigs = () => {
  return useQuery({
    queryKey: securityConfigsKeys.list(),
    queryFn: getSecurityConfigs,
    staleTime: 5 * 60 * 1000,
  });
};

export const useSecurityStats = () => {
  return useQuery({
    queryKey: securityConfigsKeys.stats(),
    queryFn: getSecurityStats,
    staleTime: 5 * 60 * 1000,
  });
};

export const usePasswordPolicy = () => {
  return useQuery({
    queryKey: securityConfigsKeys.passwordPolicy(),
    queryFn: getPasswordPolicy,
    staleTime: 5 * 60 * 1000,
  });
};

export const useUpdatePasswordPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePasswordPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityConfigsKeys.all });
    },
  });
};
```

### 5.3 组件更新

**文件**: `frontend/src/features/settings/components/general/GeneralSettingsView.tsx`

```typescript
// 修改前
const { data: settings, isLoading } = useQuery({
  queryKey: ['settings', 'system', 'system'],
  queryFn: () => getGeneralSettings('system'),
});

// 修改后
import { useGeneralConfigs } from '../../hooks/useGeneralSettings';

const { data, isLoading } = useGeneralConfigs();
const settings = data?.items || [];
```

---

## 6. 测试计划

### 6.1 后端 API 测试

#### 单元测试

**文件**: `backend/tests/api/settings/test_general.py`（更新）

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_general_configs(client: AsyncClient, auth_headers):
    """测试获取通用配置列表"""
    response = await client.get(
        "/api/v1/settings/general",
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)

@pytest.mark.asyncio
async def test_get_general_stats(client: AsyncClient, auth_headers):
    """测试获取通用配置统计信息"""
    response = await client.get(
        "/api/v1/settings/general/stats",
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert "total_count" in data
    assert "by_category" in data

@pytest.mark.asyncio
async def test_backward_compatibility(client: AsyncClient, auth_headers):
    """测试向后兼容性"""
    # 旧接口应该仍然可用
    response = await client.get(
        "/api/v1/settings/system/settings?category=system",
        headers=auth_headers
    )

    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

**新建**: `backend/tests/api/settings/test_security.py`

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_security_configs(client: AsyncClient, auth_headers):
    """测试获取安全配置列表"""
    response = await client.get(
        "/api/v1/settings/security",
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data

@pytest.mark.asyncio
async def test_get_password_policy(client: AsyncClient, auth_headers):
    """测试获取密码策略"""
    response = await client.get(
        "/api/v1/settings/security/password-policy",
        headers=auth_headers
    )

    assert response.status_code == 200
    policy = response.json()
    assert "min_length" in policy

@pytest.mark.asyncio
async def test_update_password_policy(client: AsyncClient, auth_headers):
    """测试更新密码策略"""
    new_policy = {
        "min_length": 12,
        "require_uppercase": True,
        "require_numbers": True
    }

    response = await client.put(
        "/api/v1/settings/security/password-policy",
        json=new_policy,
        headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json()["message"] == "密码策略更新成功"
```

#### 集成测试

使用 Postman/Thunder Client 测试完整的 API 流程：

```json
// Collection: Settings API Unification Tests

// Test 1: Get General Configs
GET {{base_url}}/api/v1/settings/general
Authorization: Bearer {{token}}

// Expected Response:
{
  "items": [...],
  "total": 25
}

// Test 2: Get Security Configs
GET {{base_url}}/api/v1/settings/security
Authorization: Bearer {{token}}

// Expected Response:
{
  "items": [...],
  "total": 15
}

// Test 3: Backward Compatibility
GET {{base_url}}/api/v1/settings/system/settings?category=system
Authorization: Bearer {{token}}

// Expected: Still works, but logs deprecation warning
```

### 6.2 前端测试

#### React Query 缓存测试

```typescript
// tests/features/settings/hooks/useGeneralSettings.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGeneralConfigs } from '@/features/settings/hooks/useGeneralSettings';

test('should cache general configs for 5 minutes', async () => {
  const queryClient = new QueryClient();

  const { result } = renderHook(() => useGeneralConfigs(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    ),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  // 验证缓存键
  const cacheData = queryClient.getQueryData(['settings', 'general', 'list']);
  expect(cacheData).toBeDefined();
});
```

#### E2E 测试

使用 Playwright 测试完整流程：

```typescript
// e2e/settings/general.spec.ts

import { test, expect } from '@playwright/test';

test('should load general settings without redundant requests', async ({ page }) => {
  // 监听网络请求
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/settings/general')) {
      requests.push(request.url());
    }
  });

  // 访问通用配置页面
  await page.goto('/settings/general');

  // 等待加载完成
  await page.waitForSelector('[data-testid="settings-list"]');

  // 验证只发送了一次请求
  expect(requests.length).toBe(1);

  // 切换到其他标签页再返回
  await page.goto('/settings/security');
  await page.goto('/settings/general');

  // 验证使用了缓存，没有发送新请求
  expect(requests.length).toBe(1);
});
```

---

## 7. 监控与回滚策略

### 7.1 监控指标

#### 后端监控

**日志监控**（Structlog + Grafana Loki）：

```python
# 在每个端点添加详细日志
logger.info(
    "API endpoint called",
    endpoint="/settings/general",
    method="GET",
    user_id=current_user["id"],
    response_time_ms=elapsed_time * 1000,
    status_code=200
)

logger.warning(
    "Deprecated API called",
    endpoint="/system/settings",
    user_id=current_user["id"],
    deprecation_date="2025-07-07"
)
```

**性能监控**：

- API 响应时间（目标: < 200ms）
- 数据库查询次数（检测 N+1 问题）
- 缓存命中率（前端 React Query）

**错误监控**：

- 500 错误率（目标: < 0.1%）
- 404 错误（检测前端调用错误）
- 权限错误（403）

#### 前端监控

**缓存监控**（React Query Devtools）：

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// 在开发环境启用
{process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
```

**性能监控**（Web Vitals）：

```typescript
import { onCLS, onFID, onLCP } from 'web-vitals';

onCLS(console.log);
onFID(console.log);
onLCP(console.log);
```

### 7.2 回滚策略

#### 场景 1: 后端 API 出现严重错误

**回滚步骤**：

1. **立即恢复旧端点**（保留了向后兼容）：
   ```bash
   # 前端切换回旧 API
   git revert <commit-hash>  # 恢复前端 API 调用
   ```

2. **数据库无需回滚**（只是路由变更，数据结构未变）

3. **日志分析**：
   ```bash
   # 查找错误日志
   grep "ERROR" backend/logs/app-dev.log | grep "settings"
   ```

#### 场景 2: 前端缓存策略导致数据不一致

**缓解措施**：

1. **清除客户端缓存**：
   ```typescript
   queryClient.invalidateQueries({ queryKey: ['settings'] });
   ```

2. **调整 staleTime**（如果 5 分钟太长）：
   ```typescript
   staleTime: 2 * 60 * 1000, // 降低到 2 分钟
   ```

3. **添加强制刷新按钮**：
   ```typescript
   const handleRefresh = () => {
     queryClient.invalidateQueries({ queryKey: ['settings', 'general'] });
   };
   ```

#### 场景 3: 用户反馈新端点不可用

**诊断步骤**：

1. **检查权限配置**：
   ```sql
   SELECT * FROM permissions WHERE resource LIKE 'settings:%';
   ```

2. **检查路由注册**：
   ```python
   # 检查 settings_router 是否正确注册
   python -c "from src.api import api_router; print(api_router.routes)"
   ```

3. **检查 CORS 配置**：
   ```python
   # src/main.py
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["http://localhost:3000"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

---

## 8. 里程碑与时间表

### 阶段 1: 后端实施（预计 2 天）

- **Day 1 上午**:
  - ✅ 创建技术方案文档
  - ✅ 修改 `general.py` 路由前缀
  - ✅ 添加 `GET /general` 主端点

- **Day 1 下午**:
  - ✅ 创建 `security.py` 模块
  - ✅ 扩展 `notifications.py`
  - ✅ 更新路由注册

- **Day 2 上午**:
  - ✅ 添加弃用警告
  - ✅ 编写后端单元测试
  - ✅ 集成测试验证

- **Day 2 下午**:
  - ✅ Code Review
  - ✅ 部署到测试环境

### 阶段 2: 前端实施（预计 1 天）

- **Day 3 上午**:
  - ✅ 更新 API 调用层
  - ✅ 创建新的 React Query Hooks
  - ✅ 更新组件调用

- **Day 3 下午**:
  - ✅ 前端单元测试
  - ✅ E2E 测试
  - ✅ 部署到测试环境

### 阶段 3: 监控与优化（预计 1 周）

- **Week 1**:
  - ✅ 监控旧端点使用情况
  - ✅ 收集性能指标
  - ✅ 修复发现的问题

### 阶段 4: 清理（6 个月后）

- **2025-07-07**:
  - ✅ 移除旧端点代码
  - ✅ 清理弃用警告
  - ✅ 更新文档

---

## 9. 风险评估与应对

### 风险 1: 前端缓存策略不当导致数据陈旧

**概率**: 中
**影响**: 中

**应对措施**：
- 实施强制刷新机制
- 配置合理的 `staleTime`（5 分钟）
- 在关键操作后主动 `invalidateQueries`

### 风险 2: 旧端点依赖未完全识别

**概率**: 低
**影响**: 高

**应对措施**：
- 保留旧端点并添加弃用警告
- 监控旧端点访问日志
- 设置 6 个月过渡期

### 风险 3: 权限配置遗漏

**概率**: 低
**影响**: 高

**应对措施**：
- 复用现有权限规则（`settings:general:read` 等）
- 在部署前进行权限测试
- 准备权限回滚脚本

### 风险 4: 性能下降

**概率**: 低
**影响**: 中

**应对措施**：
- 前端 React Query 缓存减少重复请求
- 后端数据库查询优化（已有索引）
- 监控 API 响应时间

---

## 10. 成功标准

### 技术指标

- ✅ 所有新端点返回正确数据（单元测试覆盖率 > 80%）
- ✅ API 响应时间 < 200ms（P95）
- ✅ 前端缓存命中率 > 70%（5 分钟内重复访问）
- ✅ 无 5xx 错误（生产环境 30 天内）

### 用户体验指标

- ✅ 页面加载时间减少 30%（利用缓存）
- ✅ 重复请求数量减少 50%
- ✅ 无用户投诉（功能正常）

### 代码质量指标

- ✅ API 设计一致性（所有 Settings 模块遵循相同模式）
- ✅ 代码复用率提升（独立模块清晰分离）
- ✅ 文档完整性（API 文档、迁移指南、测试用例）

---

## 11. 附录

### 附录 A: API 对照表

| 旧端点                                          | 新端点                                | 状态       |
|-----------------------------------------------|-------------------------------------|----------|
| `GET /settings/system/settings?category=system`      | `GET /settings/general`             | 迁移完成     |
| `GET /settings/system/settings?category=security`    | `GET /settings/security`            | 迁移完成     |
| `GET /settings/system/settings?category=notification`| `GET /settings/notifications`       | 迁移完成     |
| `GET /settings/system/settings/{key}`                | `GET /settings/general/{key}`       | 迁移完成     |
| `PUT /settings/system/settings/{key}`                | `PUT /settings/general/{key}`       | 迁移完成     |
| `POST /settings/system/settings/bulk`                | `POST /settings/general/bulk`       | 迁移完成     |

### 附录 B: 前端缓存键设计

```typescript
// 通用配置
['settings', 'general', 'list']
['settings', 'general', 'stats']

// 安全策略
['settings', 'security', 'list']
['settings', 'security', 'stats']
['settings', 'security', 'password-policy']

// 通知中心
['settings', 'notifications', 'list']
['settings', 'notifications', 'stats']

// 用户管理
['settings', 'users', 'list']
['settings', 'users', 'stats']

// 审计日志
['settings', 'audit', 'logs']
['settings', 'audit', 'stats']
```

### 附录 C: 数据库影响分析

**无需数据库迁移**

本次改造仅涉及 API 路由变更，不涉及数据库 schema 变更：

- `system_settings` 表结构保持不变
- 数据库查询逻辑保持不变（仍按 `category` 过滤）
- 无需运行数据库迁移脚本

### 附录 D: 参考资源

- **RESTful API 设计指南**: https://restfulapi.net/
- **FastAPI 最佳实践**: https://fastapi.tiangolo.com/tutorial/bigger-applications/
- **React Query 缓存策略**: https://tanstack.com/query/latest/docs/react/guides/caching
- **API 版本管理**: https://www.troyhunt.com/your-api-versioning-is-wrong/

---

## 12. 变更日志

### v1.0 - 2025-01-07

- ✅ 完成初始技术方案设计
- ✅ 纠正 API 端点设计（移除 `/configs` 后缀）
- ✅ 明确 `/stats` 端点用途（聚合统计信息）
- ✅ 制定三阶段实施计划
- ✅ 编写完整测试用例和监控方案

---

**文档结束**
