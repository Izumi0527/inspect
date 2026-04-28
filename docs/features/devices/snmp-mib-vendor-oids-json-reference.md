# vendor-oids.json 字段逐项参考

先看一个最小可读示例，再看每个字段是什么意思。这份文档不是新的运行时来源，它只是对下面这个文件的结构化说明：

```text
backend-go/internal/snmpmib/vendor-oids.json
```

---

## 1. 最小骨架示例

```json
{
  "schema_version": 1,
  "description": "Inspect SNMP runtime registry",
  "vendors": {
    "cisco": {
      "display_name": "Cisco",
      "aliases": ["cisco", "cisco_ios"],
      "enterprise_prefixes": ["1.3.6.1.4.1.9"]
    }
  },
  "common": {
    "probe": {
      "sys_descr": {
        "oid": "1.3.6.1.2.1.1.1.0",
        "method": "get",
        "value_type": "string"
      }
    },
    "system": {
      "sys_uptime": {
        "oid": "1.3.6.1.2.1.1.3.0",
        "method": "get",
        "value_type": "timeticks"
      }
    },
    "interfaces": {
      "if_descr": {
        "oid": "1.3.6.1.2.1.2.2.1.2",
        "method": "bulkwalk",
        "value_type": "string"
      }
    }
  },
  "metrics": {
    "cpu_usage": [
      {
        "id": "cisco_avg_busy_5s",
        "vendors": ["cisco"],
        "method": "get",
        "oids": ["1.3.6.1.4.1.9.2.1.56.0"],
        "strategy": "get_percent"
      }
    ],
    "memory_usage": [],
    "temperature": []
  },
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
  },
  "trap": {
    "core": {
      "trap_oid": "1.3.6.1.6.3.1.1.4.1.0",
      "sys_uptime": "1.3.6.1.2.1.1.3.0",
      "community": "1.3.6.1.6.3.18.1.4.0",
      "enterprise": "1.3.6.1.6.3.18.1.5.0",
      "agent_address": "1.3.6.1.6.3.18.1.3.0"
    },
    "overrides": {
      "1.3.6.1.6.3.1.1.5.3": {
        "level": "warning",
        "facility": "interface"
      }
    }
  }
}
```

上面只是理解结构的最小骨架。真实运行时文件比它更完整。

---

## 2. 顶层字段说明

### `schema_version`

- 含义：当前 registry 的结构版本。
- 当前固定值：`1`
- 作用：后端加载时用它判断是否支持该 JSON 结构。
- 注意：不要随意改成 `2`、`3`，除非后端 `types.go` 已经同步支持。

### `description`

- 含义：给人看的说明文字。
- 作用：帮助维护者快速识别文件用途。
- 对运行时行为：无直接影响。

### `vendors`

- 含义：厂商元数据字典。
- key：厂商标准 key，比如 `cisco`、`huawei`。
- value：该厂商的显示名、别名、企业 OID 前缀。

### `common`

- 含义：通用标准 MIB OID。
- 作用：给 probe、系统信息、接口信息等共用。

### `metrics`

- 含义：指标候选项集合。
- 当前包含：
  - `cpu_usage`
  - `memory_usage`
  - `temperature`

### `catalog`

- 含义：厂商扩展功能 OID 目录。
- 作用：把暂未直接挂到当前运行时采集逻辑的厂商私有 OID，统一沉淀在同一个 JSON 文件里。
- 常见分类：
  - `environment`
  - `interface_monitor`
  - `bgp`
  - `poe`
  - `optical`

### `trap`

- 含义：Trap 解析配置。
- 当前包含：
  - `core`
  - `overrides`

---

## 3. `vendors` 字段说明

示例：

```json
{
  "huawei": {
    "display_name": "Huawei",
    "aliases": ["huawei", "huawei_vrp"],
    "enterprise_prefixes": ["1.3.6.1.4.1.2011"]
  }
}
```

### 厂商 key，例如 `huawei`

- 含义：系统内部标准厂商标识。
- 建议：全小写，必要时用下划线。
- 约束：尽量与前端 `vendor` 值保持一致。

### `display_name`

- 含义：给人看的展示名称。
- 示例：`Huawei`、`Cisco`、`Juniper`

### `aliases`

- 含义：别名集合。
- 用途：兼容历史数据、导入数据、不同写法。
- 示例：
  - `huawei`
  - `huawei_vrp`
  - `fortigate`

### `enterprise_prefixes`

- 含义：企业 OID 前缀。
- 用途：后续排障、对照资料、厂商识别参考。
- 示例：`1.3.6.1.4.1.2011`

---

## 4. `common` 字段说明

`common` 下面主要分 3 段：

- `probe`
- `system`
- `interfaces`

### 4.1 `common.probe`

当前重点字段：

```json
{
  "sys_descr": {
    "oid": "1.3.6.1.2.1.1.1.0",
    "method": "get",
    "value_type": "string"
  }
}
```

用途：

- SNMP 探测阶段读取设备系统描述。

### 4.2 `common.system`

典型字段：

- `sys_object_id`
- `sys_uptime`
- `sys_name`
- `sys_location`

用途：

- 系统基础信息采集。

### 4.3 `common.interfaces`

典型字段：

- `if_descr`
- `if_speed`
- `if_in_octets`
- `if_out_octets`
- `if_hc_in_octets`
- `if_hc_out_octets`
- `if_high_speed`

用途：

- 接口名称、速率、流量和高容量计数器采集。

---

## 5. `OIDDefinition` 结构说明

`common` 区块里的每个对象基本都长这样：

```json
{
  "oid": "1.3.6.1.2.1.1.3.0",
  "method": "get",
  "value_type": "timeticks"
}
```

### `oid`

- 含义：具体 OID 字符串。
- 必填：是

### `method`

- 含义：采集方式。
- 常见值：
  - `get`
  - `bulkwalk`

### `value_type`

- 含义：返回值类型说明。
- 常见值：
  - `string`
  - `oid`
  - `timeticks`
  - `gauge32`
  - `counter32`
  - `counter64`

说明：

- `value_type` 主要用于表达语义和帮助维护理解。
- 真正如何解释指标值，核心还是看 `strategy`。

---

## 6. `metrics` 字段说明

`metrics` 是本文件最核心的部分。每个指标不是单个 OID，而是一组“候选项”。

示例：

```json
{
  "id": "huawei_entity_cpu",
  "vendors": ["huawei"],
  "method": "bulkwalk",
  "oids": ["1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"],
  "strategy": "walk_percent_auto",
  "aggregate": "avg_non_zero"
}
```

### `id`

- 含义：候选项唯一标识。
- 建议：`厂商_语义`
- 示例：
  - `huawei_entity_cpu`
  - `cisco_memory_pool`
  - `ucd_cpu_split`

### `vendors`

- 含义：该候选项适用于哪些厂商。
- 示例：
  - `["huawei"]`
  - `["cisco"]`
  - `["*"]`

规则：

- 专属厂商项写具体厂商 key。
- 通用回退项写 `["*"]`。

### `method`

- 含义：该候选项的采集方式。
- 当前常见值：
  - `get`
  - `bulkwalk`
  - `composite`

### `oids`

- 含义：该候选项需要使用的 OID 列表。
- 可以是 1 个，也可以是多个。

关键点：

- 多个 OID 的顺序必须和 `strategy` 预期一致。
- 比如“已用 + 空闲”如果顺序写反，结果会错但不一定报错。

### `strategy`

- 含义：后端如何解释这些 OID 返回值。
- 这是最关键字段。

### `aggregate`

- 含义：Walk 出多条值后，怎么聚合。
- 目前不是所有策略都需要。
- 常见值：
  - `avg_non_zero`
  - `avg_all`
  - `avg_non_zero_total_sum`

---

## 7. `catalog` 字段说明

`catalog` 的定位可以理解成：**统一 MIB 库里的“扩展目录层”**。

它和 `metrics` 的区别是：

- `metrics`：当前已经被后端直接消费
- `catalog`：先收口资料，后续按需接入运行时

当前例外：

- `catalog.huawei.bgp`
- `catalog.h3c.bgp`
- `catalog.huawei.optical`
- `catalog.h3c.optical`

这些目录项已经会被 `SNMPCollector` 读取，并在采集结果里返回：

- `bgp_peers`
- `optical_transceivers`

同时，设备监控写入时会把扩展摘要放进 `device_metrics.tags -> snmp_extensions`，并补充少量计数型数值指标。

当前已经提供对应的读取入口：

```text
GET /monitoring/devices/:device_id/snmp-extensions
```

接口返回的不是原始 `tags`，而是后端解包后的稳定结构：

- `device_id`
- `timestamp`
- `bgp_peers`
- `optical_transceivers`

结构示例：

```json
{
  "catalog": {
    "huawei": {
      "poe": [
        {
          "id": "hw_poe_port_consuming_power",
          "name": "hwPoePortConsumingPower",
          "oid": "1.3.6.1.4.1.2011.6.3.18.1.4.1.6",
          "method": "bulkwalk",
          "value_type": "integer",
          "description": "PoE 端口当前功耗"
        }
      ]
    }
  }
}
```

### 第一层：厂商 key

- 示例：`huawei`、`h3c`
- 要求：必须先存在于 `vendors`

### 第二层：功能分类

- 推荐使用小写英文，下划线分隔
- 示例：
  - `environment`
  - `interface_monitor`
  - `bgp`
  - `poe`
  - `optical`

### 每条 catalog OID 的字段

- `id`
  - 内部唯一标识，建议 `厂商_语义`
- `name`
  - 原始对象名，例如 `hwBgpPeerState`
- `oid`
  - 具体 OID
- `method`
  - 未来建议采集方式，例如 `get` / `bulkwalk`
- `value_type`
  - 数据类型说明，例如 `integer`、`gauge32`、`octet_string`
- `unit`
  - 可选，单位说明
- `description`
  - 中文语义说明

什么时候优先写 `catalog`：

- 这个 OID 现在只是先做厂商资料沉淀
- 当前业务还没有消费入口
- 返回值解释方式还没最终敲定

什么时候再升级到运行时区块：

- 已经确定要采集它
- 已经确定采集方式与策略
- 必要时已补完新的 Go 解析策略

---

## 8. 当前已用 `strategy` 说明

下面是当前运行时已经支持的策略名，新增厂商时尽量优先复用。

### CPU 相关

#### `walk_percent_auto`

- 含义：Walk 百分比序列，并做自动过滤。
- 适合：某些厂商会返回不稳定或无效值的 CPU 表。

#### `walk_percent`

- 含义：Walk 一组百分比，再按规则聚合。
- 适合：多核心、多板卡 CPU 使用率表。

#### `get_percent`

- 含义：单个 OID 直接取百分比。
- 适合：直接给出 CPU 使用率的设备。

#### `get_percent_from_parts`

- 含义：多个 OID 组合成一个百分比结果。
- 适合：UCD 一类拆分统计值。

### 内存相关

#### `walk_percent_with_size_kb`

- 含义：Walk 内存占用百分比和总容量，容量单位是 KB。

#### `walk_percent_with_size_bytes`

- 含义：Walk 内存占用百分比和总容量，容量单位是字节。

#### `walk_percent_with_size_mb`

- 含义：Walk 内存占用百分比和总容量，容量单位是 MB。

#### `get_percent`

- 含义：直接读取一个百分比。

#### `get_percent_with_size_kb`

- 含义：读取占用百分比和总容量，容量单位是 KB。

#### `get_used_free_bytes`

- 含义：读取已用值和空闲值，后端自行计算 total/used/usage。

#### `host_resources_ram_storage`

- 含义：基于 Host-Resources MIB 的多表组合内存计算。

#### `get_total_avail_kb`

- 含义：读取 total 和 available，再反推 used/usage。

### 温度相关

#### `walk_max_tenths_celsius`

- 含义：Walk 一组十分之一摄氏度值，取最大值并换算。

#### `walk_max_celsius`

- 含义：Walk 一组摄氏度值，取最大值。

---

## 9. `trap` 字段说明

### 9.1 `trap.core`

示例：

```json
{
  "trap_oid": "1.3.6.1.6.3.1.1.4.1.0",
  "sys_uptime": "1.3.6.1.2.1.1.3.0",
  "community": "1.3.6.1.6.3.18.1.4.0",
  "enterprise": "1.3.6.1.6.3.18.1.5.0",
  "agent_address": "1.3.6.1.6.3.18.1.3.0"
}
```

字段含义：

- `trap_oid`
  - Trap 事件 OID 字段
- `sys_uptime`
  - Trap 自带 uptime 字段
- `community`
  - 社区串字段
- `enterprise`
  - 企业 OID 字段
- `agent_address`
  - 代理地址字段

### 9.2 `trap.overrides`

示例：

```json
{
  "1.3.6.1.6.3.1.1.5.3": {
    "level": "warning",
    "facility": "interface"
  }
}
```

规则：

- key 是 Trap OID
- value 是该 Trap 的等级和设施映射

字段说明：

- `level`
  - 告警等级，比如 `info`、`warning`
- `facility`
  - 告警设施分类，比如 `system`、`interface`、`security`

---

## 10. 新增厂商时的推荐填写顺序

推荐按照下面顺序修改：

1. 先补 `vendors.<vendor_key>`
2. 再补 `metrics.cpu_usage`
3. 如有需要，再补 `metrics.memory_usage`
4. 再补 `metrics.temperature`
5. 如有 Trap，再补 `trap.overrides`
6. 如果前端可选厂商列表需要更新，再同步前端枚举

这样做的好处是：

- 更容易定位问题
- 更容易做增量测试
- 不会一上来把所有链路混在一起改

---

## 11. 一份可复制的新增厂商模板

下面这个模板适合“新增一个厂商，且 CPU/内存/温度都能复用现有策略”的场景：

```json
{
  "vendors": {
    "ruijie": {
      "display_name": "Ruijie",
      "aliases": ["ruijie", "rgos"],
      "enterprise_prefixes": ["1.3.6.1.4.1.xxxx"]
    }
  },
  "metrics": {
    "cpu_usage": [
      {
        "id": "ruijie_cpu_usage",
        "vendors": ["ruijie"],
        "method": "bulkwalk",
        "oids": ["1.3.6.1.4.1.xxxx.1.1.1"],
        "strategy": "walk_percent",
        "aggregate": "avg_non_zero"
      }
    ],
    "memory_usage": [
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
    ],
    "temperature": [
      {
        "id": "ruijie_temperature",
        "vendors": ["ruijie"],
        "method": "bulkwalk",
        "oids": ["1.3.6.1.4.1.xxxx.3.1.1"],
        "strategy": "walk_max_celsius"
      }
    ]
  }
}
```

---

## 12. 修改后最少要做哪些验证

建议最少执行：

```bash
# tests/backend-go
go test ./internal/snmpmib -v
go test ./internal/devices -v
go test ./internal/logs -v

# frontend（如果改了厂商枚举或表单）
pnpm test -- --runTestsByPath ../tests/frontend/devices/utils/deviceFormMapper.test.ts
pnpm type-check
```

如果改动涉及巡检或接口回归，再补：

```bash
go test ./internal/http/handlers -v
```

---

## 13. 相关文档

- [SNMP MIB JSON Registry 落地实施说明](./snmp-mib-json-registry-implementation.md)
- [SNMP MIB OID 新增厂商维护指南](./snmp-mib-oid-maintenance-guide.md)
- [厂商 SNMP OID 映射表](../../integration/vendor-oid-mapping.md)
