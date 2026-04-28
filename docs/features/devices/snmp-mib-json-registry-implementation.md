# SNMP MIB JSON Registry 落地实施说明

本文档对应设备管理页 SNMP 能力的正式落地方案。当前实现已经从“后端硬编码 OID”切换为“独立 JSON 注册表 + 后端统一加载调用”，运行时唯一数据源为：

```text
backend-go/internal/snmpmib/vendor-oids.json
```

这份文档重点说明现在的真实架构、调用链、边界和变更入口，便于后续继续扩展。

---

## 1. 最终结论

- 方案 A 已落地，运行时 OID/MIB 信息统一放在 `.json` 文件中。
- 后端不再把厂商 OID 常量散落在 `collector`、`probe`、`trap listener` 里维护。
- 设备探测、设备指标采集、巡检链路、定时采集链路、Trap 解析链路都已经切到同一份 registry。
- 前端设备表单已补充显式厂商字段，运行时会优先命中厂商专属 OID，再回退通用 OID。

---

## 2. 运行时单一事实源

当前和 SNMP MIB/OID 相关的“运行时事实源”只有一份：

```text
backend-go/internal/snmpmib/vendor-oids.json
```

配套加载与校验代码位于：

```text
backend-go/internal/snmpmib/registry.go
backend-go/internal/snmpmib/types.go
```

其中职责划分如下：

- `vendor-oids.json`
  - 存放厂商元数据、标准 OID、指标候选项、Trap 核心 OID、Trap override。
- `registry.go`
  - 使用 `go:embed` 在编译期嵌入 JSON。
  - 提供 `DefaultRegistry()` 单例加载入口。
- `types.go`
  - 定义 registry schema。
  - 负责结构校验、厂商归一化、候选项筛选和回退逻辑。

启动阶段会在 [app.go](/C:/Coder/Inspect/backend-go/internal/app/app.go:92) 前置加载 registry；如果 JSON 结构损坏或关键字段缺失，服务启动直接失败，而不是带着半残数据运行。

---

## 3. 当前覆盖范围

本次改造已经覆盖以下能力：

- SNMP 探测基础 OID
  - `common.probe.sys_descr`
- 系统基础 OID
  - `common.system.sys_object_id`
  - `common.system.sys_uptime`
  - `common.system.sys_name`
  - `common.system.sys_location`
- 接口相关标准 OID
  - `common.interfaces.*`
- 设备性能指标
  - `metrics.cpu_usage`
  - `metrics.memory_usage`
  - `metrics.temperature`
- 厂商扩展目录
  - `catalog.*`
- 基于厂商扩展目录的运行时摘要采集
  - `catalog.<vendor>.bgp` 已接入 `SNMPCollector` 返回结构
  - `catalog.<vendor>.optical` 已接入 `SNMPCollector` 返回结构
- Trap 解析
  - `trap.core`
  - `trap.overrides`

当前支持的厂商 key 包括：

```text
cisco
huawei
h3c
juniper
arista
fortinet
linux
```

---

## 4. 核心调用链

### 4.1 启动加载

启动时先执行：

```go
if _, err := snmpmib.DefaultRegistry(); err != nil {
    return nil, fmt.Errorf("load SNMP MIB registry failed: %w", err)
}
```

对应位置：

- [app.go](/C:/Coder/Inspect/backend-go/internal/app/app.go:92)

作用：

- 提前发现 JSON 语法错误
- 提前发现 schema 缺字段
- 避免运行到采集阶段才暴露配置问题

### 4.2 设备探测链路

SNMP 探测的 `sysDescr` 不再使用硬编码常量，而是从 registry 读取：

- [probe.go](/C:/Coder/Inspect/backend-go/internal/devices/probe.go:380)

关键逻辑：

```go
registry, err := snmpmib.DefaultRegistry()
oid := strings.TrimSpace(registry.Common.Probe.SysDescr.OID)
```

### 4.3 设备采集链路

`SNMPCollector` 的入口签名已经升级为：

```go
CollectMetrics(ctx, ipAddress, vendor, snmpCommunity, snmpVersion, snmpPort, tags)
```

对应位置：

- [snmp_collector.go](/C:/Coder/Inspect/backend-go/internal/devices/snmp_collector.go:126)

采集时会：

1. 解析设备 SNMP 配置和 `tags.snmp_config`
2. 加载 registry
3. 按指标类型和 `vendor` 获取候选项
4. 先尝试厂商专属 candidate
5. 再尝试 `*` 通用 candidate

候选筛选入口：

- [snmp_collector.go](/C:/Coder/Inspect/backend-go/internal/devices/snmp_collector.go:266)

### 4.4 巡检链路

巡检执行时，SNMP 指标采集已经复用共享 collector，并且透传设备 `vendor` 与 `tags`：

- [inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go:1242)

这一步修复了旧问题：过去巡检链路传的是 `nil`，导致 `tags.snmp_config` 中的 SNMPv3、端口等配置不能稳定复用。

### 4.5 设备管理页“立即采集”链路

设备详情采集与批量采集同样已经改为传 `vendor` 和 `tags`：

- [device_probe.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/device_probe.go:413)
- [device_probe.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/device_probe.go:565)

### 4.6 定时采集链路

调度器采集也已统一走同一套 collector：

- [service.go](/C:/Coder/Inspect/backend-go/internal/scheduler/service.go:712)

### 4.7 Trap 链路

Trap 核心 OID 与 override 映射改为从 registry 读取：

- [snmp_trap_listener.go](/C:/Coder/Inspect/backend-go/internal/logs/snmp_trap_listener.go:422)
- [snmp_trap_listener.go](/C:/Coder/Inspect/backend-go/internal/logs/snmp_trap_listener.go:430)
- [snmp_trap_listener.go](/C:/Coder/Inspect/backend-go/internal/logs/snmp_trap_listener.go:438)

---

## 5. 当前 JSON 结构摘要

当前 `vendor-oids.json` 结构可以概括为：

```json
{
  "schema_version": 1,
  "vendors": {},
  "common": {
    "probe": {},
    "system": {},
    "interfaces": {}
  },
  "metrics": {
    "cpu_usage": [],
    "memory_usage": [],
    "temperature": []
  },
  "catalog": {},
  "trap": {
    "core": {},
    "overrides": {}
  }
}
```

其中：

- `vendors`
  - 厂商标准 key、显示名、别名、企业 OID 前缀
- `common`
  - 标准 MIB 通用 OID
- `metrics`
  - 各指标的候选 OID 列表
- `catalog`
  - 厂商扩展功能 OID 目录
  - 当前已用于沉淀 Huawei/H3C 的 BGP、PoE、光模块诊断、环境扩展 OID
- `trap`
  - Trap 通用解析 OID 与告警覆盖映射

补充说明：

- `metrics` / `common` / `trap` 仍然是当前最核心的运行时消费区块
- `catalog` 最初用于目录化沉淀，但现在已经不是“纯静态文档层”
- 目前 `catalog.<vendor>.bgp` 和 `catalog.<vendor>.optical` 已经能被 `SNMPCollector` 读取，并通过接口返回：
  - `bgp_peers`
  - `optical_transceivers`
- 设备采集写入监控时，会额外生成以下数值指标：
  - `bgp_peer_count`
  - `bgp_established_count`
  - `optical_transceiver_count`
- 同时会把 BGP/optical 明细摘要写入 `device_metrics.tags -> snmp_extensions`
- 这些扩展摘要**已经持久化**
- 当前已提供只读接口：
  - `GET /monitoring/devices/:device_id/snmp-extensions`
- 返回体会收口为：
  - `device_id`
  - `timestamp`
  - `bgp_peers`
  - `optical_transceivers`
- 设备管理页详情弹窗已经接入该接口，可直接查看：
  - BGP 邻居数量 / 已建立邻居数量
  - 光模块数量
  - 最近采集时间
  - BGP 邻居明细
  - 光模块诊断明细
- 这些扩展摘要**暂未进入独立报表页面或告警规则默认聚合**

---

## 6. 当前回退策略

现在的采集选择规则是固定的：

1. 先根据设备 `vendor` 做归一化
2. 命中该厂商专属 candidate 就优先尝试
3. 厂商 candidate 不通时，继续回退到 `vendors=["*"]` 的通用 candidate

对应位置：

- [types.go](/C:/Coder/Inspect/backend-go/internal/snmpmib/types.go:161)

这样做的好处是：

- 厂商识别准确时，优先命中更稳定的私有 MIB
- 厂商为空或不准确时，仍然能回退到标准 MIB / UCD / Host-Resources 兜底

---

## 7. 前端为什么必须保留显式厂商字段

本次不是单纯后端重构，前端也必须配合。

设备表单现在显式维护 `vendor`：

- [DeviceForm.tsx](/C:/Coder/Inspect/frontend/src/features/devices/components/forms/DeviceForm.tsx:79)
- [DeviceForm.tsx](/C:/Coder/Inspect/frontend/src/features/devices/components/forms/DeviceForm.tsx:193)
- [deviceFormMapper.ts](/C:/Coder/Inspect/frontend/src/features/devices/utils/deviceFormMapper.ts:41)
- [deviceFormMapper.ts](/C:/Coder/Inspect/frontend/src/features/devices/utils/deviceFormMapper.ts:181)

当前规则：

- 用户显式选择了 `vendor`，后端按用户选择执行
- 只有 `vendor` 为空时，才按 `device_type` 做默认回退

如果没有这个字段，很多 Huawei/H3C/Juniper 设备会被设备类型默认规则误判，导致长期只能命中通用 OID，厂商专属 MIB 采集成功率会下降。

---

## 8. 当前支持的策略名

`vendor-oids.json` 不是“只放 OID 字符串”，而是“OID + method + strategy”的组合。当前已经实现并可直接复用的策略包括：

### CPU

- `walk_percent_auto`
- `walk_percent`
- `get_percent`
- `get_percent_from_parts`

### 内存

- `walk_percent_with_size_kb`
- `walk_percent_with_size_bytes`
- `walk_percent_with_size_mb`
- `get_percent`
- `get_percent_with_size_kb`
- `get_used_free_bytes`
- `host_resources_ram_storage`
- `get_total_avail_kb`

### 温度

- `walk_max_tenths_celsius`
- `walk_max_celsius`

对应实现位置：

- [snmp_collector.go](/C:/Coder/Inspect/backend-go/internal/devices/snmp_collector.go:478)
- [snmp_collector.go](/C:/Coder/Inspect/backend-go/internal/devices/snmp_collector.go:508)
- [snmp_collector.go](/C:/Coder/Inspect/backend-go/internal/devices/snmp_collector.go:557)

这也是本方案真正实现“解耦”的关键：多数新增厂商只需要复用已有策略并补 JSON，不需要继续膨胀 `collector` 主体逻辑。

---

## 9. 这次改造解决了什么问题

### 9.1 解耦

原先问题：

- OID 常量散落在多个 Go 文件
- 新增厂商时必须改业务代码
- Trap、Probe、Collector 各维护一份 SNMP 事实源

现在：

- OID 数据集中到一个 JSON 文件
- Go 代码主要负责“加载、校验、执行策略”
- 新增同类厂商 OID 时优先只改数据文件

### 9.2 可维护

原先问题：

- 后端文件越来越臃肿
- 新增 OID 时容易遗漏某条链路

现在：

- 设备探测、设备采集、巡检、定时采集、Trap 解析共用一个 registry
- 后续排障时能快速判断“是数据问题，还是策略问题”

### 9.3 可验证

当前已经有配套测试覆盖：

- `tests/backend-go/internal/snmpmib/registry_test.go`
- `tests/backend-go/internal/devices/snmp_collector_registry_test.go`
- `tests/backend-go/internal/devices/probe_snmp_registry_test.go`
- `tests/backend-go/internal/http/handlers/inspection_snmp_collector_test.go`
- `tests/backend-go/internal/logs/snmp_trap_registry_test.go`
- `tests/frontend/devices/utils/deviceFormMapper.test.ts`

---

## 10. 建议的后续使用方式

后续遇到 SNMP/MIB 相关需求，建议按下面顺序判断：

1. 先看是不是“同一种取值模式，只是换了厂商 OID”
2. 如果是，优先只改 `vendor-oids.json`
3. 如果不是，再判断是否要新增 Go `strategy`
4. 如果是全新厂商，别忘了同步前端 `vendor` 枚举

详细维护步骤见：

- [SNMP MIB OID 新增厂商维护指南](./snmp-mib-oid-maintenance-guide.md)
- [vendor-oids.json 字段逐项参考](./snmp-mib-vendor-oids-json-reference.md)

---

## 11. 回归验证命令

本次方案推荐至少执行以下验证：

```bash
# backend-go/tests
go test ./internal/snmpmib -v
go test ./internal/devices -v
go test ./internal/logs -v
go test ./internal/http/handlers -v

# frontend
pnpm test -- --runTestsByPath ../tests/frontend/devices/utils/deviceFormMapper.test.ts
pnpm type-check
```

---

## 12. 边界说明

本方案目前明确不做以下事情：

- 不把 `.mib` / `.my` ASN.1 文件作为运行时直接输入
- 不在服务内引入 ASN.1 MIB 解析器
- 不自动根据 `sysObjectID` 动态推断完整指标映射
- 不把所有设备能力都泛化成“零代码策略引擎”

当前方案的定位很清楚：

- 运行时数据层解耦
- 指标执行逻辑适度策略化
- 为后续新增厂商 OID 降低改造成本
