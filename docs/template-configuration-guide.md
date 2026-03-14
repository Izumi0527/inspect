# 模板配置指南（巡检模板）

本文档用于指导你在“巡检管理 → 模板管理”中创建/维护巡检模板，并解释模板字段与检查项配置的含义。

> 适用范围：当前版本后端执行引擎主要支持 **Ping/ICMP** 与 **SNMP** 两类检查；其它检查类型（SSH/HTTP/脚本）在模板中可配置，但执行时会被标记为“跳过”。如后续补齐引擎能力，本指南会同步更新。

---

## 1) 推荐配置流程（UI）

1. 进入 **巡检管理 → 模板管理**
2. 优先选择一个“内置模板”点击 **复制**（副本可修改）
3. 在副本上按需调整：
   - 模板名称/描述/分类
   - 适用设备类型（deviceTypes）
   - 检查项（checkItems）的阈值与启用状态
4. 保存后，去 **巡检管理 → 策略管理** 里把模板绑定到设备/设备组（如有）

---

## 2) 模板字段说明（核心）

模板对象（Template）建议关注以下字段：

- `name`：模板名称（必填，建议含“厂商/设备类型/用途”）
- `description`：模板描述（可选）
- `category`：模板分类（如 `network/system/security/custom`）
- `deviceTypes`：适用设备类型数组（如 `["router","switch"]`）
- `checkItems`：检查项数组（至少 1 个）
- `isActive`：是否启用
- `isBuiltIn / is_default`：是否内置模板（内置模板通常不允许直接修改/删除，建议复制后再改）

> 兼容提示：接口层可能同时返回 `deviceTypes` 与 `device_types`（历史兼容字段），两者内容应一致；以 `deviceTypes` 作为前端主字段更稳妥。

---

## 3) 检查项（checkItems）字段说明

单个检查项（CheckItem）通常包含：

- `id`：检查项唯一标识（必填，建议稳定且可读，例如 `cpu-usage`）
- `name`：检查项名称（必填，强烈建议包含关键字，见“命名最佳实践”）
- `type`：检查类型（当前执行引擎支持 `ping/snmp`）
- `category`：类别（用于归类，也影响后端 SNMP 指标匹配策略，建议填写）
- `enabled`：是否启用（关闭后通常不参与执行）
- `config`：配置对象（不同类型不同）
  - `threshold.warning / threshold.critical`：阈值（数值型，要求 warning < critical）
  - `oid / oid_used / oid_free`：SNMP OID（用于兼容/未来扩展；当前执行引擎主要基于内置采集指标判定）
  - `timeout / unit / expectedValue ...`：扩展字段（按需）

---

## 4) 当前版本支持的检查类型与配置建议

### 4.1 Ping/ICMP（`type=ping` 或 `type=icmp`）

- 目的：判断设备是否 ICMP 可达、记录响应时间
- 建议配置：
  - `name`：包含“连通性/Ping/ICMP”等关键字
  - `category`：建议 `connectivity`
  - `config`：当前不强制要求配置字段

### 4.2 SNMP（`type=snmp`）

- 目的：判断 SNMP 是否可达，并在可达时对已采集指标做阈值判断（CPU/内存/温度等）
- 关键点（非常重要）：
  - 当前执行引擎 **不会按 `config.oid` 临时查询单个 OID**；而是先采集一组内置 SNMP 指标，再根据检查项 `name/category` 进行匹配与阈值判断。
  - 因此，**检查项命名/分类会直接影响是否能命中对应指标**（见第 5 节）。
  - `config.oid / oid_used / oid_free` 为可选字段：填写时仅做格式校验与字段透传，不填写也可执行。
- 阈值建议（可按设备级别微调）：
  - CPU：warning 70，critical 90（单位：%）
  - 内存：warning 80，critical 95（单位：%）
  - 温度：warning 70，critical 85（单位：℃，按硬件能力调整）

### 4.3 SSH/HTTP/脚本（`type=ssh/http/script`）

- 说明：模板层允许配置这些类型（为未来扩展与历史兼容保留），但**当前执行引擎不会执行**，结果会被标记为 `skip`。
- 前端行为：新建/编辑模板时，这些类型会显示为“暂不支持执行”，默认不可选；历史模板若已包含，页面仍会展示并提示“执行时会跳过”。
- 迁移建议（让模板在当前版本真正产出结果）：
  - “仅需可用性/在线离线” → 使用 `ping`
  - “CPU/内存/接口/运行时间/温度/带宽”等资源与性能类 → 使用 `snmp`（并按第 5 节做好命名/分类与阈值）
  - 原本依赖复杂命令/脚本的深度逻辑 → 建议先拆分为 `ping/snmp` 的基础项，复杂部分等待后续版本补齐执行能力

---

## 5) 命名与分类最佳实践（决定 SNMP 是否“对上号”）

后端会根据检查项 `name/category` 的关键词匹配来决定检查 CPU/内存/运行时间/接口/温度/带宽等指标。

为避免“配置了 SNMP 检查但被当成默认连通性检查”，建议：

- CPU 检查项：
  - `name` 建议包含：`CPU` / `cpu` / `处理器`
  - `category` 建议：`cpu` 或 `health`
- 内存检查项：
  - `name` 建议包含：`内存` / `memory`
  - `category` 建议：`memory`
- 运行时间检查项：
  - `name` 建议包含：`运行时间` / `uptime`
  - `category` 建议：`uptime`
- 接口检查项：
  - `name` 建议包含：`接口` / `interface` / `端口`
  - `category` 建议：`interface` 或 `performance`
- 温度检查项：
  - `name` 建议包含：`温度` / `temperature`
  - `category` 建议：`temperature`
- 带宽检查项：
  - `name` 建议包含：`带宽` / `bandwidth`
  - `category` 建议：`bandwidth`

---

## 6) 常见问题（FAQ）

### Q1：我填写了 `config.oid`，为什么看起来没生效？

当前版本执行引擎主要基于“内置 SNMP 采集指标”做判断，`config.oid` 更多用于兼容/未来扩展。
建议优先确保检查项的 `name/category` 能命中对应指标，并配置合理阈值。

### Q2：为什么 SSH/HTTP/脚本检查项被标记为“跳过”？

当前执行引擎暂未实现这些类型的执行逻辑，模板层面已预留字段。
如果你希望推进补齐执行引擎能力，建议先明确：

- 需要支持的最小字段集合（如 SSH 的 `command`、HTTP 的 `url`）
- 安全边界（命令白名单、超时、输出截断、审计日志）
- 与设备凭据/密钥管理的对接方式

---

## 7) 相关文档

- 巡检模板 API：`docs/api/template-api.md`
- 厂商 OID 映射表：`docs/integration/vendor-oid-mapping.md`
- 巡检策略与数据流：`docs/flows/inspection-strategy-flow.md`
