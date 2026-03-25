# 安全策略子分页 详细分析报告

> 分析日期：2026-03-25
> 涉及文件：`frontend/src/features/settings/components/security/`
> 状态：待修复

---

## 一、架构总览

```
SecuritySettings.tsx              ← 编排层（壳/协调器）
  │
  ├── useSecuritySettings.ts      ← 状态管理层（本地 + 服务端）
  │     ├── useQuery               (读：GET /settings/security/)
  │     └── useMutation            (写：POST /settings/general/bulk)
  │
  ├── PasswordPolicySection       ← 密码策略（配置最多，占左列）
  ├── SessionManagementSection    ← 会话管理（右列上）
  └── AuthenticationSection       ← 认证方式（右列下）
```

数据流：
```
后端 KV 平铺 → API 层结构化映射 → Hook 本地状态 → 各 Section 受控展示
用户操作  → onChange → 本地状态 → isDirty = true → 手动点「保存」
```

---

## 二、已发现问题清单

### P2 - 中优先级（影响体验/正确性）

#### 1. 保存按钮位置与职责不符
- **位置**：`SessionManagementSection` 的 section header 右侧
- **实际行为**：点击保存会触发 `saveAll()`，将**全部三个 Section**（密码策略、会话管理、认证方式）的数据一起提交
- **问题**：视觉上保存按钮在「会话管理」局部区域，但语义是全局操作，用户难以感知
- **修复建议**：将保存/重置操作上移到 `SecuritySettings.tsx` 的 shell capabilities（`primaryActions`），使用页面级顶部工具栏统一管理

#### 2. 密码策略区域无就近保存入口
- **现象**：用户修改密码策略后，需要滚动到右列才能看到保存按钮
- **修复建议**：同上，改用顶部 shell 工具栏

#### 3. `autoLogoutEnabled` 与 `sessionTimeout` 缺乏联动
- **现象**：当 `autoLogoutEnabled = false` 时，`sessionTimeout` 输入框仍然可编辑（虽然此时超时时间无实际意义）
- **修复建议**：当 `autoLogoutEnabled` 为 false 时，`sessionTimeout` 输入框禁用（`disabled` 状态）

#### 4. MFA 状态不一致风险
- **现象**：用户可以取消所有 MFA 方法（三个 Badge 全部设为未选中），同时保持 `mfaRequired = true`
- **这是无效配置**：没有任何校验或联动来阻止
- **修复建议**：当所有 `mfaMethods` 被清空时，自动将 `mfaRequired` 置为 false；或在保存前做校验

#### 5. IP 正则校验不完整
- **位置**：`AuthenticationSection.tsx:65`
- **代码**：`const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/`
- **问题 1**：不验证每段是否 ≤ 255，`999.999.999.999` 会通过校验
- **问题 2**：CIDR 掩码 `/\d{1,2}` 允许 `/99`，正确范围应为 0–32
- **修复建议**：
  ```typescript
  // 验证 IPv4 每段 0-255
  const ipv4Regex = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)(\/([0-9]|[1-2]\d|3[0-2]))?$/
  ```

---

### P3 - 低优先级（代码质量/架构）

#### 6. API 层有 3 个死方法
- **位置**：`security.api.ts:167–230`
- **涉及方法**：`updateSessionManagement`、`updatePasswordPolicy`、`updateAuthentication`
- **现状**：这三个方法在 `useSecuritySettings` hook 里**一个都没有调用**，只调用了 `saveAll`
- **修复建议**：删除这 3 个方法，或者考虑改 hook 使用按域独立保存（需配合 UI 分区保存设计）

#### 7. API 读写端点不对称
- **读**：`GET /settings/security/`（安全专属端点）
- **写**：`POST /settings/general/bulk`（通用批量端点）
- **风险**：如果后端的 `/settings/general/bulk` 对 `security.*` 前缀的 key 有权限控制，写操作可能静默失败
- **修复建议**：与后端对齐，明确 bulk 端点是否支持所有 category 的 key，或改用 `/settings/security/bulk`

#### 8. 类型语义错位：`maxLoginAttempts` / `lockoutDuration` 挂在 `PasswordPolicyConfig`
- **现状**：这两个字段描述的是**暴力破解防护**（登录安全），但类型定义在 `PasswordPolicyConfig` 中
- **修复建议**：提取为独立的 `LoginSecurityConfig`，或合并到 `SessionManagementConfig`

#### 9. `ConfigSwitch` 存在冗余 prop
- **位置**：`ConfigSwitch.tsx:9`
- **现象**：同时定义了 `onChange` 和 `onCheckedChange`，两者含义相同
- **修复建议**：统一使用 `onCheckedChange`，删除 `onChange`

#### 10. `onChange: (field, value: any)` 缺乏类型安全
- **涉及文件**：所有三个 Section 的 `Props` 定义
- **现状**：`value: any` 完全放弃了类型校验，理论上可以给 boolean 字段传 number
- **修复建议**：使用 TypeScript 映射类型实现精确约束：
  ```typescript
  type OnChange<T> = <K extends keyof T>(field: K, value: T[K]) => void
  ```

---

## 三、问题优先级矩阵

| # | 问题 | 严重度 | 修复成本 |
|---|------|--------|---------|
| 1 | 保存按钮位置与职责不符 | P2 | 中 |
| 2 | 密码策略区域无就近保存入口 | P2 | 中 |
| 3 | autoLogoutEnabled 与 sessionTimeout 缺乏联动 | P2 | 低 |
| 4 | MFA 状态不一致风险 | P2 | 低 |
| 5 | IP 正则校验不完整 | P2 | 低 |
| 6 | API 层 3 个死方法 | P3 | 低 |
| 7 | API 读写端点不对称 | P3 | 中（需后端配合） |
| 8 | 类型语义错位 | P3 | 低 |
| 9 | ConfigSwitch 冗余 prop | P3 | 低 |
| 10 | onChange value: any 类型不安全 | P3 | 中 |

---

## 四、修复顺序建议

1. **先修复 P2 独立项**（不依赖后端，风险低）：
   - Issue #3：`autoLogoutEnabled` 联动
   - Issue #4：MFA 状态校验
   - Issue #5：IP 正则

2. **再修复 P2 架构项**（需要调整 UI 和 shell 层）：
   - Issue #1 + #2：统一保存入口 → 移至 shell primaryActions

3. **最后清理 P3 代码质量项**（可批量处理）：
   - Issue #6：删死方法
   - Issue #8：类型重组
   - Issue #9：移除冗余 prop
   - Issue #10：类型安全改造
   - Issue #7：与后端对齐端点（需排期）
