# SNMP MIB OID 新增厂商维护指南

这份文档面向后续维护者，目标只有一个：新增厂商、补充 OID、调整取值映射时，优先只改数据文件，不把后端代码重新改回“硬编码大仓库”。

当前运行时方案已经固定为：

```text
方案 A：JSON 作为运行时唯一数据源
文件后缀：.json
运行时文件：backend-go/internal/snmpmib/vendor-oids.json
```

补充约定：

- `common`、`metrics`、`trap`：当前已经被后端运行时直接消费
- `catalog`：统一扩展 OID 目录，用来收口厂商额外功能 OID，便于后续按需接入运行时
- 当前特殊情况：
  - `catalog.<vendor>.bgp` 已经接入 `SNMPCollector` 返回结构
  - `catalog.<vendor>.optical` 已经接入 `SNMPCollector` 返回结构
  - 这两类扩展摘要会跟随监控写入一并持久化到 `device_metrics.tags`
- 判断一个 OID 目前是否“真正在代码里生效”，先看它是不是落在 `common` / `metrics` / `trap`

---

## 1. 先判断改动属于哪一类

新增或调整 OID 前，先按下面的判断走：

### 只改 JSON 即可

满足以下任一情况，通常只需要改 `vendor-oids.json`：

- 新增一个厂商，但指标取值模式和现有策略一致
- 同一厂商补一条新的 CPU、内存、温度 OID
- 调整候选优先级
- 补充厂商别名 `aliases`
- 补充 Trap `overrides`
- 补充厂商扩展功能 OID 目录（例如 BGP、PoE、风扇、电源、光模块诊断）

### 需要改 JSON + 前端

满足以下情况，除了 JSON 还要补前端：

- 新增一个需要在设备管理页可选的厂商

通常还要同步：

- `frontend/src/features/devices/types/index.ts`
- `frontend/src/features/devices/components/forms/DeviceForm.tsx`
- 必要时 `frontend/src/features/devices/utils/deviceFormMapper.ts`

### 需要改 JSON + Go 策略代码

出现以下情况，才说明需要新增 Go 逻辑：

- 新设备返回值格式与现有策略都不兼容
- 需要新的聚合方式
- 需要多个表组合计算且现有策略不支持
- 需要新的单位换算/特殊过滤规则

这类场景不能只加 OID，必须新增 `strategy`，否则 JSON 只是“写上去”，运行时也不会正确解释。

---

## 2. 当前 JSON schema 关键结构

新增厂商或新增 OID 时，主要会改下面几个区块：

```json
{
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

### 结构职责

- `vendors`
  - 厂商标准 key、别名、企业 OID 前缀
- `common`
  - 标准 MIB 通用 OID
- `metrics.cpu_usage`
  - CPU 候选项
- `metrics.memory_usage`
  - 内存候选项
- `metrics.temperature`
  - 温度候选项
- `trap.overrides`
  - Trap OID 到告警等级/设施的覆盖映射
- `catalog`
  - 统一收口暂未直接接入运行时的厂商扩展 OID 目录
  - 典型分类：`environment`、`bgp`、`poe`、`optical`、`interface_monitor`

---

## 3. 新增厂商的最小步骤

推荐按这个顺序做。

### 第 1 步：补厂商元数据

先在 `vendors` 中增加标准 key：

```json
{
  "vendors": {
    "ruijie": {
      "display_name": "Ruijie",
      "aliases": ["ruijie", "rgos"],
      "enterprise_prefixes": ["1.3.6.1.4.1.xxxx"]
    }
  }
}
```

要求：

- key 用小写英文
- 尽量与前端表单值一致
- `aliases` 放设备导入、历史数据、人工录入时可能出现的别名
- `enterprise_prefixes` 放企业 OID 前缀，便于后续识别和排障

### 第 2 步：补指标 candidate

如果这个厂商要支持 CPU/内存/温度，就分别往对应数组里追加 candidate。

CPU 示例：

```json
{
  "id": "ruijie_cpu_usage",
  "vendors": ["ruijie"],
  "method": "bulkwalk",
  "oids": ["1.3.6.1.4.1.xxxx.1.1.1"],
  "strategy": "walk_percent",
  "aggregate": "avg_non_zero"
}
```

内存示例：

```json
{
  "id": "ruijie_memory_usage",
  "vendors": ["ruijie"],
  "method": "get",
  "oids": [
    "1.3.6.1.4.1.xxxx.2.1.1",
    "1.3.6.1.4.1.xxxx.2.1.2"
  ],
  "strategy": "get_used_free_bytes"
}
```

温度示例：

```json
{
  "id": "ruijie_temperature",
  "vendors": ["ruijie"],
  "method": "bulkwalk",
  "oids": ["1.3.6.1.4.1.xxxx.3.1.1"],
  "strategy": "walk_max_celsius"
}
```

### 第 3 步：必要时补 Trap override

如果该厂商 Trap 需要单独映射等级或设施，再补：

```json
{
  "trap": {
    "overrides": {
      "1.3.6.1.4.1.xxxx.0.1001": {
        "level": "warning",
        "facility": "interface"
      }
    }
  }
}
```

### 第 4 步：必要时补前端厂商枚举

如果你希望这个厂商能在设备管理页表单中被显式选择，还要同步前端：

- `frontend/src/features/devices/types/index.ts`
- `frontend/src/features/devices/components/forms/DeviceForm.tsx`

否则后端虽然支持该厂商 key，前端界面上却无法稳定录入。

### 第 5 步：如果只是先沉淀扩展 OID，补 `catalog`

很多厂商 OID 暂时不会立刻接入当前采集逻辑，比如：

- BGP 邻居状态
- PoE 端口功率/电压/电流
- 风扇、电源、电压等环境扩展信息
- 光模块发光/收光/偏置电流/工作电压

这类场景推荐先补到 `catalog`，而不是急着塞进 `metrics`。

示例：

```json
{
  "catalog": {
    "huawei": {
      "bgp": [
        {
          "id": "hw_bgp_peer_state",
          "name": "hwBgpPeerState",
          "oid": "1.3.6.1.4.1.2011.5.25.177.1.1.2.1.5",
          "method": "bulkwalk",
          "value_type": "integer",
          "description": "BGP 对等体状态"
        }
      ]
    }
  }
}
```

什么时候该只放 `catalog`：

- 这个 OID 只是先做厂商资料沉淀
- 当前后端还没有消费它的业务入口
- 该 OID 的取值解释、聚合或展示方式还没确定

当前例外：

- `catalog.huawei.bgp`
- `catalog.h3c.bgp`

这两组虽然仍然放在 `catalog`，但已经会被后端 collector 读取，并在 SNMP 采集返回中生成 `bgp_peers` / `optical_transceivers` 摘要。

什么时候该从 `catalog` 升级到运行时：

- 业务已经明确要采集它
- 已经确定采集方式（`get` / `bulkwalk`）
- 已经确定返回值解释规则
- 如需新策略，先补 Go 代码，再把它挂到 `metrics` 或其他运行时区块

---

## 4. candidate 字段怎么选

每个 candidate 至少要看这几个字段：

### `id`

- 建议格式：`厂商_指标语义`
- 例子：`huawei_entity_cpu`、`fortinet_cpu_usage`

### `vendors`

- 放厂商 key 数组
- 通用兜底项使用 `["*"]`

### `method`

当前常见值：

- `get`
- `bulkwalk`
- `composite`

这个字段要和 `strategy` 匹配，不是随便写。

### `oids`

- 支持 1 个或多个 OID
- 多个 OID 时，顺序通常与 `strategy` 需要的入参顺序一致

### `strategy`

这是最关键的字段。它决定后端如何解释 OID 返回值。

---

## 5. 当前已支持的 strategy 清单

### CPU

- `walk_percent_auto`
  - Walk 百分比，自动过滤不合理值
- `walk_percent`
  - Walk 百分比，直接聚合
- `get_percent`
  - 单个 OID 直接返回百分比
- `get_percent_from_parts`
  - 多个 OID 组合算百分比

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

如果新厂商能套进这些策略之一，说明你只改 JSON 就够了。

---

## 6. 什么时候必须新增 Go strategy

下面这些情况不要硬往现有策略里塞：

- 设备返回的是枚举值，需要自定义换算表
- 一个指标需要跨多张表交叉匹配索引
- 设备返回值不是百分比、绝对值、used/free 这种现有模式
- 需要特殊筛选，比如只统计某类传感器、排除某些实例

这时建议做法：

1. 先在 `snmp_collector.go` 增加新的策略分支
2. 再在 JSON 中引用这个新策略
3. 补对应测试

不要反过来先把 JSON 写进去，否则运行时不会生效。

---

## 7. 推荐维护模板

### 模板 A：新增厂商但只复用现有策略

```json
{
  "vendors": {
    "new_vendor": {
      "display_name": "New Vendor",
      "aliases": ["new_vendor"],
      "enterprise_prefixes": ["1.3.6.1.4.1.xxxx"]
    }
  },
  "metrics": {
    "cpu_usage": [
      {
        "id": "new_vendor_cpu",
        "vendors": ["new_vendor"],
        "method": "bulkwalk",
        "oids": ["1.3.6.1.4.1.xxxx.1.1"],
        "strategy": "walk_percent",
        "aggregate": "avg_non_zero"
      }
    ]
  }
}
```

### 模板 B：新增一个通用兜底 OID

```json
{
  "id": "generic_fallback_cpu",
  "vendors": ["*"],
  "method": "bulkwalk",
  "oids": ["1.3.6.1.2.1.xx.xx"],
  "strategy": "walk_percent",
  "aggregate": "avg_all"
}
```

### 模板 C：新增 Trap override

```json
{
  "trap": {
    "overrides": {
      "1.3.6.1.4.1.xxxx.0.2001": {
        "level": "critical",
        "facility": "power"
      }
    }
  }
}
```

---

## 8. 推荐校验步骤

### 8.1 先做数据层校验

```bash
# tests/backend-go
go test ./internal/snmpmib -v
```

这个测试会帮助你发现：

- JSON 结构错误
- 必填字段缺失
- 不支持的 schema 内容

### 8.2 再做采集链路校验

```bash
go test ./internal/devices -v
```

重点确认：

- 候选优先级正确
- 厂商优先、通用回退逻辑正确
- probe OID 仍可读取

### 8.3 Trap 变更再做 Trap 校验

```bash
go test ./internal/logs -v
```

### 8.4 影响设备管理页时补前端校验

```bash
# frontend
pnpm test -- --runTestsByPath ../tests/frontend/devices/utils/deviceFormMapper.test.ts
pnpm type-check
```

### 8.5 如涉及巡检或 API 接口，补 handlers 回归

```bash
# tests/backend-go
go test ./internal/http/handlers -v
```

---

## 9. 推荐人工验证方法

自动化测试通过后，仍建议用真实设备做一次 SNMP 验证。

示例：

```bash
snmpget -v2c -c public 10.0.0.10 1.3.6.1.2.1.1.1.0
snmpwalk -v2c -c public 10.0.0.10 1.3.6.1.4.1.xxxx
```

人工验证重点：

- OID 是否真实可返回
- 返回值单位是否和 `strategy` 假设一致
- 同一设备是否存在多实例，需要 `avg_non_zero` / `max` 之类聚合

---

## 10. 常见坑

### 厂商 key 不统一

错误示例：

- JSON 写 `Huawei`
- 前端写 `huawei`
- 数据库里历史值是 `huawei_vrp`

正确做法：

- 统一标准 key
- 历史兼容靠 `aliases`

### `oids` 顺序写反

有些 `strategy` 依赖 `oids` 顺序，比如“已用 + 空闲”或“usage + total size”。顺序写反会导致结果错但不一定报错。

### 误把新规则塞进旧策略

如果你发现要写一大堆“特殊判断”，这通常说明应该新增 `strategy`，而不是继续把 JSON 写得越来越绕。

### 忘了前端厂商枚举

后端支持了新厂商，不代表设备表单就能选到。需要显式补前端枚举。

---

## 11. 建议的提交思路

如果后续你继续扩展，建议拆成下面这种节奏：

1. 先改 `vendor-oids.json`
2. 跑 `internal/snmpmib` 和 `internal/devices` 测试
3. 如果需要，再补前端枚举和测试
4. 如果还需要新策略，再改 `snmp_collector.go`

这样最容易判断问题到底出在“数据层”还是“执行层”。

---

## 12. 相关文档

- [SNMP MIB JSON Registry 落地实施说明](./snmp-mib-json-registry-implementation.md)
- [vendor-oids.json 字段逐项参考](./snmp-mib-vendor-oids-json-reference.md)
- [厂商 SNMP OID 映射表](../../integration/vendor-oid-mapping.md)
