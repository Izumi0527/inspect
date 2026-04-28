# SNMP MIB JSON Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将设备管理相关 SNMP OID/MIB 运行时数据从 Go 代码中剥离到独立 `JSON` 文件，后端统一通过 registry 加载调用，后续新增厂商或 OID 时优先只改数据文件而不是继续膨胀业务代码。

**Architecture:** 新增共享包 `backend-go/internal/snmpmib`，使用 `go:embed` 加载 `vendor-oids.json` 并做结构校验；`devices` 的 probe/collector 与 `logs` 的 trap 统一从 registry 取 OID，不再在业务代码内硬编码。设备管理前端补充“可编辑厂商字段”，让运行时能够优先命中厂商专属 OID，再回退到标准 MIB。

**Tech Stack:** Go 1.23, `encoding/json`, `go:embed`, `gosnmp`, Next.js/React, Jest, Go tests

---

## 范围与边界

- 本次改造的**唯一运行时数据源**是：`backend-go/internal/snmpmib/vendor-oids.json`
- 本次改造要覆盖：
  - 设备探测使用的 SNMP 基础 OID
  - 设备性能采集使用的通用 OID 与厂商 OID
  - Trap 核心 OID 与 Trap 告警级别/设施映射
- 本次改造**不引入** ASN.1 MIB 解析器，不直接把 `.mib/.my` 当运行时输入
- `docs/integration/vendor-oid-mapping.md` 保留为人类阅读文档，但不再作为运行时事实来源
- 本次改造顺手修复一个现有问题：`inspection` 执行 SNMP 采集时当前传入了 `nil` tags，导致无法稳定复用 `tags.snmp_config` 中的 v3 凭据与端口

## 目标目录

```text
backend-go/internal/snmpmib/
  registry.go
  types.go
  vendor-oids.json

tests/backend-go/internal/snmpmib/
  registry_test.go

tests/backend-go/internal/devices/
  snmp_collector_registry_test.go
  probe_snmp_registry_test.go

tests/backend-go/internal/logs/
  snmp_trap_registry_test.go
```

## 运行时 JSON 结构（首版）

```json
{
  "schema_version": 1,
  "description": "Inspect SNMP runtime registry",
  "vendors": {
    "cisco": {
      "display_name": "Cisco",
      "aliases": ["cisco", "cisco_ios", "cisco_nxos"],
      "enterprise_prefixes": ["1.3.6.1.4.1.9"]
    },
    "huawei": {
      "display_name": "Huawei",
      "aliases": ["huawei", "huawei_vrp"],
      "enterprise_prefixes": ["1.3.6.1.4.1.2011"]
    }
  },
  "common": {
    "probe": {
      "sys_descr": { "oid": "1.3.6.1.2.1.1.1.0", "method": "get", "value_type": "string" }
    },
    "system": {
      "sys_object_id": { "oid": "1.3.6.1.2.1.1.2.0", "method": "get", "value_type": "oid" },
      "sys_uptime": { "oid": "1.3.6.1.2.1.1.3.0", "method": "get", "value_type": "timeticks" },
      "sys_name": { "oid": "1.3.6.1.2.1.1.5.0", "method": "get", "value_type": "string" },
      "sys_location": { "oid": "1.3.6.1.2.1.1.6.0", "method": "get", "value_type": "string" }
    },
    "interfaces": {
      "if_descr": { "oid": "1.3.6.1.2.1.2.2.1.2", "method": "bulkwalk", "value_type": "string" },
      "if_hc_in_octets": { "oid": "1.3.6.1.2.1.31.1.1.1.6", "method": "bulkwalk", "value_type": "counter64" },
      "if_hc_out_octets": { "oid": "1.3.6.1.2.1.31.1.1.1.10", "method": "bulkwalk", "value_type": "counter64" }
    }
  },
  "metrics": {
    "cpu_usage": [
      {
        "id": "huawei_entity_cpu",
        "vendors": ["huawei"],
        "method": "bulkwalk",
        "oids": ["1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"],
        "strategy": "walk_percent_auto",
        "aggregate": "avg_non_zero"
      },
      {
        "id": "host_resources_processor_load",
        "vendors": ["*"],
        "method": "bulkwalk",
        "oids": ["1.3.6.1.2.1.25.3.3.1.2"],
        "strategy": "walk_percent",
        "aggregate": "avg_all"
      }
    ]
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
      "1.3.6.1.6.3.1.1.5.3": { "level": "warning", "facility": "interface" }
    }
  }
}
```

## 策略设计原则

- **优先数据驱动，少量策略驱动**：新增厂商优先只追加 JSON candidate，只有遇到全新取值模式才新增 Go 策略
- **先厂商，后通用**：collector 先按 `device.vendor` 取厂商 candidate，再回退 `*`
- **保留标准 MIB 兜底**：即使厂商字段不准，标准 OID 仍能继续工作
- **启动即校验**：JSON 结构坏了就启动失败，不允许系统带着半残 OID 表运行
- **Trap 与 Metrics 同源**：避免设备采集和 Trap 告警各自维护一份 SNMP OID 标准

### Task 1: 建立共享 `snmpmib` 包与嵌入式 JSON loader

**Files:**
- Create: `backend-go/internal/snmpmib/types.go`
- Create: `backend-go/internal/snmpmib/registry.go`
- Create: `backend-go/internal/snmpmib/vendor-oids.json`
- Test: `tests/backend-go/internal/snmpmib/registry_test.go`

**Step 1: Write the failing test**

```go
func TestDefaultRegistry_ShouldLoadEmbeddedJSON(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	if registry.SchemaVersion != 1 {
		t.Fatalf("SchemaVersion=%d, want 1", registry.SchemaVersion)
	}

	if registry.Common.Probe.SysDescr.OID != "1.3.6.1.2.1.1.1.0" {
		t.Fatalf("sysDescr oid=%q", registry.Common.Probe.SysDescr.OID)
	}
}
```

**Step 2: Run test to verify it fails**

Run（workdir=`tests/backend-go`）: `go test ./internal/snmpmib -run TestDefaultRegistry_ShouldLoadEmbeddedJSON -v`

Expected: FAIL，提示包或 `DefaultRegistry`/`Registry` 尚不存在

**Step 3: Write minimal implementation**

```go
package snmpmib

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed vendor-oids.json
var embeddedRegistry []byte

var (
	defaultRegistry *Registry
	loadOnce        sync.Once
	loadErr         error
)

func DefaultRegistry() (*Registry, error) {
	loadOnce.Do(func() {
		var registry Registry
		loadErr = json.Unmarshal(embeddedRegistry, &registry)
		if loadErr == nil {
			loadErr = registry.Validate()
		}
		if loadErr == nil {
			defaultRegistry = &registry
		}
	})
	return defaultRegistry, loadErr
}
```

**Step 4: Run test to verify it passes**

Run（workdir=`tests/backend-go`）: `go test ./internal/snmpmib -run TestDefaultRegistry_ShouldLoadEmbeddedJSON -v`

Expected: PASS

**Step 5: Commit**

```bash
git add backend-go/internal/snmpmib tests/backend-go/internal/snmpmib
git commit -m "feat(snmp-mib): 新增 SNMP JSON 注册表加载器"
```

### Task 2: 固化 `vendor-oids.json` 首版 schema 与必需数据

**Files:**
- Modify: `backend-go/internal/snmpmib/vendor-oids.json`
- Modify: `backend-go/internal/snmpmib/types.go`
- Modify: `backend-go/internal/snmpmib/registry.go`
- Test: `tests/backend-go/internal/snmpmib/registry_test.go`

**Step 1: Write the failing test**

```go
func TestRegistryValidate_ShouldRequireCoreSections(t *testing.T) {
	registry := snmpmib.Registry{}
	err := registry.Validate()
	if err == nil {
		t.Fatal("Validate() error = nil, want non-nil")
	}
}

func TestDefaultRegistry_ShouldContainCurrentSupportedCandidates(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	if len(registry.Metrics.CPUUsage) == 0 {
		t.Fatal("cpu_usage candidates should not be empty")
	}
	if registry.Trap.Core.TrapOID == "" {
		t.Fatal("trap core oid should not be empty")
	}
}
```

**Step 2: Run test to verify it fails**

Run（workdir=`tests/backend-go`）: `go test ./internal/snmpmib -run 'TestRegistryValidate|TestDefaultRegistry_ShouldContainCurrentSupportedCandidates' -v`

Expected: FAIL，提示 Validate 未校验必需区块或 JSON 缺少首版内容

**Step 3: Write minimal implementation**

```go
type Registry struct {
	SchemaVersion int              `json:"schema_version"`
	Description   string           `json:"description"`
	Vendors       map[string]Vendor `json:"vendors"`
	Common        CommonSection    `json:"common"`
	Metrics       MetricsSection   `json:"metrics"`
	Trap          TrapSection      `json:"trap"`
}

func (r Registry) Validate() error {
	if r.SchemaVersion != 1 {
		return fmt.Errorf("unsupported schema_version: %d", r.SchemaVersion)
	}
	if strings.TrimSpace(r.Common.Probe.SysDescr.OID) == "" {
		return fmt.Errorf("common.probe.sys_descr.oid is required")
	}
	if len(r.Metrics.CPUUsage) == 0 {
		return fmt.Errorf("metrics.cpu_usage must not be empty")
	}
	if strings.TrimSpace(r.Trap.Core.TrapOID) == "" {
		return fmt.Errorf("trap.core.trap_oid is required")
	}
	return nil
}
```

首版 JSON 必须至少覆盖当前代码已在使用的 OID：

- `common.probe.sys_descr`
- `common.system.sys_uptime/sys_name/sys_location/sys_object_id`
- `metrics.cpu_usage`
- `metrics.memory_usage`
- `metrics.temperature`
- `metrics.interfaces`
- `trap.core`
- `trap.overrides`

并且首版厂商条目必须包含：

- `cisco`
- `huawei`
- `h3c`
- `juniper`
- `arista`
- `fortinet`
- `linux`

**Step 4: Run test to verify it passes**

Run（workdir=`tests/backend-go`）: `go test ./internal/snmpmib -v`

Expected: PASS

**Step 5: Commit**

```bash
git add backend-go/internal/snmpmib tests/backend-go/internal/snmpmib
git commit -m "feat(snmp-mib): 固化首版厂商 OID JSON 结构"
```

### Task 3: 将 `SNMPCollector` 改为 registry 驱动而不是硬编码常量

**Files:**
- Modify: `backend-go/internal/devices/snmp_collector.go`
- Create: `tests/backend-go/internal/devices/snmp_collector_registry_test.go`

**Step 1: Write the failing test**

```go
func TestResolveMetricCandidates_ShouldPreferVendorSpecificThenFallback(t *testing.T) {
	registry := buildTestRegistry()
	collector := devices.NewSNMPCollectorWithRegistry(zap.NewNop(), registry)

	candidates := collector.ResolveMetricCandidates("cpu_usage", "huawei")
	if len(candidates) < 2 {
		t.Fatalf("len(candidates)=%d, want >= 2", len(candidates))
	}
	if candidates[0].ID != "huawei_entity_cpu" {
		t.Fatalf("first candidate=%q, want huawei_entity_cpu", candidates[0].ID)
	}
}
```

**Step 2: Run test to verify it fails**

Run（workdir=`tests/backend-go`）: `go test ./internal/devices -run TestResolveMetricCandidates_ShouldPreferVendorSpecificThenFallback -v`

Expected: FAIL，提示 `NewSNMPCollectorWithRegistry` 或 `ResolveMetricCandidates` 不存在

**Step 3: Write minimal implementation**

```go
type SNMPCollector struct {
	logger     *zap.Logger
	registry   *snmpmib.Registry
	lastOctets map[string]map[int]octetsCache
	mu         sync.RWMutex
}

func NewSNMPCollector(logger *zap.Logger) *SNMPCollector {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		panic(err)
	}
	return NewSNMPCollectorWithRegistry(logger, registry)
}

func NewSNMPCollectorWithRegistry(logger *zap.Logger, registry *snmpmib.Registry) *SNMPCollector {
	return &SNMPCollector{
		logger:     logger,
		registry:   registry,
		lastOctets: make(map[string]map[int]octetsCache),
	}
}
```

实现要求：

- 删除 `snmp_collector.go` 顶部 OID const 大块
- `collectCPU/collectMemory/collectTemperature/collectInterfaces/collectUptime` 改为从 `registry` 取 candidate
- 允许少量保留“策略逻辑”代码，但不再保留“厂商 OID 字符串”在 collector 里
- 把当前的数值归一化逻辑抽象成固定策略名，例如：
  - `walk_percent`
  - `walk_percent_auto`
  - `ucd_cpu_triplet`
  - `huawei_memory_usage_size`
  - `temperature_tenth_celsius`
  - `temperature_celsius`
  - `interface_octets_64_then_32`

**Step 4: Run test to verify it passes**

Run（workdir=`tests/backend-go`）: `go test ./internal/devices -run TestResolveMetricCandidates_ShouldPreferVendorSpecificThenFallback -v`

Expected: PASS

**Step 5: Commit**

```bash
git add backend-go/internal/devices/snmp_collector.go tests/backend-go/internal/devices/snmp_collector_registry_test.go
git commit -m "refactor(snmp-mib): 让采集器改为读取 JSON OID 注册表"
```

### Task 4: 收口 probe / inspection 调用方并修复 tags 透传问题

**Files:**
- Modify: `backend-go/internal/devices/probe.go`
- Modify: `backend-go/internal/http/handlers/inspection.go`
- Modify: `backend-go/internal/app/app.go`
- Test: `tests/backend-go/internal/devices/probe_snmp_registry_test.go`
- Test: `tests/backend-go/internal/http/handlers/devices_probe_status_update_auth_test.go`

**Step 1: Write the failing test**

```go
func TestProbeSNMP_ShouldUseRegistryProbeOID(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}
	if registry.Common.Probe.SysDescr.OID != "1.3.6.1.2.1.1.1.0" {
		t.Fatalf("probe sysDescr oid=%q", registry.Common.Probe.SysDescr.OID)
	}
}
```

补充一条回归检查要求：

- `inspection.go` 中 `executeCheckItems()` 当前 `CollectMetrics(..., nil)` 必须改成 `CollectMetrics(..., device.Tags)`，否则设备表中 `tags.snmp_config` 的 v3 凭据与端口在巡检执行链路中无法被复用

**Step 2: Run test to verify it fails**

Run（workdir=`tests/backend-go`）: `go test ./internal/devices -run TestProbeSNMP_ShouldUseRegistryProbeOID -v`

Expected: FAIL，提示仍然只能依赖硬编码常量或缺少 registry 访问器

**Step 3: Write minimal implementation**

```go
func probeSystemDescrOID() string {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		panic(err)
	}
	return registry.Common.Probe.SysDescr.OID
}
```

并完成以下改动：

- `probe.go` 中 `snmpOIDSysDescr` 改成 registry lookup
- `app.go` 启动时主动调用一次 `snmpmib.DefaultRegistry()`，提早失败并输出日志
- `inspection.go` 不再在每次执行时“盲创建 collector + 传 nil tags”

优先方案：

- 给 `InspectionHandler` 增加 `SNMPCollector *devices.SNMPCollector`
- 在 `app.go` 初始化时复用共享 collector
- 在 `executeCheckItems()` 中直接调用共享 collector，并传 `device.Tags`

**Step 4: Run test to verify it passes**

Run（workdir=`tests/backend-go`）:

- `go test ./internal/devices -run TestProbeSNMP_ShouldUseRegistryProbeOID -v`
- `go test ./internal/http/handlers -run TestDevicesHandler_CollectDeviceMetrics_ShouldRequireDevicesUpdatePermission -v`

Expected: PASS

**Step 5: Commit**

```bash
git add backend-go/internal/devices/probe.go backend-go/internal/http/handlers/inspection.go backend-go/internal/app/app.go tests/backend-go/internal/devices tests/backend-go/internal/http/handlers
git commit -m "fix(snmp-mib): 统一探测与巡检链路的注册表调用"
```

### Task 5: 设备管理前端补充“可编辑厂商字段”，提高 vendor-specific OID 命中率

**Files:**
- Modify: `frontend/src/features/devices/types/index.ts`
- Modify: `frontend/src/features/devices/components/forms/DeviceForm.tsx`
- Modify: `frontend/src/features/devices/utils/deviceFormMapper.ts`
- Test: `tests/frontend/devices/utils/deviceFormMapper.test.ts`

**Step 1: Write the failing test**

```ts
it('应保留用户显式选择的 vendor，而不是总按 device_type 自动覆盖', () => {
  const payload = mapFormDataToApiPayload({
    name: 'agg-01',
    ip: '10.0.0.8',
    device_type: 'switch',
    vendor: 'huawei',
    location: '',
    description: '',
    cli_protocol: 'none',
    ssh_config: { username: '', password: '', port: 22, use_key_auth: false, private_key: '' },
    telnet_config: { username: '', password: '', port: 23, enable_password: '' },
    snmp_config: {
      version: 'v2c',
      port: 161,
      v2c_config: { community: 'public', write_community: '' },
      v3_config: { username: '', security_level: 'noAuthNoPriv', auth_protocol: 'SHA', auth_password: '', priv_protocol: 'AES128', priv_password: '', context_name: '' }
    },
    advanced_config: { timeout: 30, retry: 3 },
    snmp_community: 'public',
    ssh_username: '',
    ssh_password: '',
  } as any)

  expect(payload.vendor).toBe('huawei')
})
```

**Step 2: Run test to verify it fails**

Run（workdir=`frontend`）: `pnpm test -- --runTestsByPath ../tests/frontend/devices/utils/deviceFormMapper.test.ts`

Expected: FAIL，提示当前仍按 `device_type -> vendorMap` 自动覆盖成 `cisco`

**Step 3: Write minimal implementation**

```ts
export const DEVICE_VENDORS = [
  'cisco',
  'huawei',
  'h3c',
  'juniper',
  'arista',
  'fortinet',
  'other',
] as const

export type DeviceVendor = typeof DEVICE_VENDORS[number]
```

实现要求：

- 在 `DeviceForm` 新增厂商下拉，默认值仍可按 `device_type` 预填
- 用户显式改动后，不再被 `vendorMap` 覆盖
- `deviceFormMapper.ts` 中 `payload.vendor` 改为：
  - 优先 `formData.vendor`
  - 为空时才回退 `vendorMap[device_type]`

**Step 4: Run test to verify it passes**

Run（workdir=`frontend`）:

- `pnpm test -- --runTestsByPath ../tests/frontend/devices/utils/deviceFormMapper.test.ts`
- `pnpm type-check`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/devices tests/frontend/devices/utils/deviceFormMapper.test.ts
git commit -m "feat(snmp-mib): 让设备表单支持显式厂商选择"
```

### Task 6: 将 Trap OID 也切到同一份 JSON registry，避免双标准

**Files:**
- Modify: `backend-go/internal/logs/snmp_trap_listener.go`
- Test: `tests/backend-go/internal/logs/snmp_trap_registry_test.go`

**Step 1: Write the failing test**

```go
func TestTrapRegistry_ShouldContainLevelAndFacilityOverrides(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry error: %v", err)
	}

	override, ok := registry.Trap.Overrides["1.3.6.1.6.3.1.1.5.3"]
	if !ok {
		t.Fatal("trap override missing")
	}
	if override.Level != "warning" || override.Facility != "interface" {
		t.Fatalf("override=%+v", override)
	}
}
```

**Step 2: Run test to verify it fails**

Run（workdir=`tests/backend-go`）: `go test ./internal/logs -run TestTrapRegistry_ShouldContainLevelAndFacilityOverrides -v`

Expected: FAIL，提示 `Trap` registry 或 override 结构未接通

**Step 3: Write minimal implementation**

```go
func trapRegistry() *snmpmib.TrapSection {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		panic(err)
	}
	return &registry.Trap
}
```

实现要求：

- 删除 `snmp_trap_listener.go` 顶部 Trap OID const 和 override map
- 改由 `registry.Trap.Core` 与 `registry.Trap.Overrides` 读取
- 行为必须与当前版本完全一致，不在本任务引入新的 Trap 解析语义

**Step 4: Run test to verify it passes**

Run（workdir=`tests/backend-go`）: `go test ./internal/logs -run TestTrapRegistry_ShouldContainLevelAndFacilityOverrides -v`

Expected: PASS

**Step 5: Commit**

```bash
git add backend-go/internal/logs/snmp_trap_listener.go tests/backend-go/internal/logs/snmp_trap_registry_test.go
git commit -m "refactor(snmp-mib): 统一 trap OID 与告警映射来源"
```

### Task 7: 文档迁移、回归验证与发布说明

**Files:**
- Modify: `docs/integration/vendor-oid-mapping.md`
- Modify: `docs/template-configuration-guide.md`
- Modify: `docs/flows/monitoring-data-flow-summary.md`
- Modify: `docs/readme.md`

**Step 1: Write the failing test**

这里不写自动化测试，改写为“文档回归检查清单”：

- 文档必须明确 `vendor-oids.json` 是唯一运行时来源
- 文档必须说明新增厂商时的最小步骤
- 文档必须说明何时只改 JSON、何时需要新增 Go 策略

**Step 2: Run check to verify current docs are outdated**

Run（workdir=`C:/Coder/Inspect`）: `rg -n "vendor-oid-mapping.md|config.oid|内置 SNMP 指标" docs`

Expected: 能看到仍把 Markdown 当主要说明入口、且未描述 JSON 注册表的新文案

**Step 3: Write minimal implementation**

文档至少补充下面 3 个小节：

- `运行时来源`：`backend-go/internal/snmpmib/vendor-oids.json`
- `新增厂商流程`：
  1. 补 vendor 元数据
  2. 补 metric candidate
  3. 运行 targeted tests
  4. 如需新 strategy 再改 Go
- `回退逻辑`：vendor-specific -> common -> Linux/UCD 等兼容 candidate

**Step 4: Run verification**

Run（建议按顺序执行）:

- `go test ./internal/snmpmib -v`（workdir=`tests/backend-go`）
- `go test ./internal/devices -v`（workdir=`tests/backend-go`）
- `go test ./internal/logs -v`（workdir=`tests/backend-go`）
- `go test ./internal/http/handlers -run 'TestDevicesHandler_CollectDeviceMetrics_ShouldRequireDevicesUpdatePermission|TestDevicesHandler_HealthCheckDevice_ShouldDowngradeUpdateStatusWithoutDevicesUpdatePermission' -v`（workdir=`tests/backend-go`）
- `pnpm test -- --runTestsByPath ../tests/frontend/devices/utils/deviceFormMapper.test.ts`（workdir=`frontend`）
- `pnpm type-check`（workdir=`frontend`）

Expected: 全部 PASS，单条命令尽量控制在 60 秒内

**Step 5: Commit**

```bash
git add docs backend-go frontend tests
git commit -m "docs(snmp-mib): 补充 JSON MIB 注册表维护说明"
```

## 验收标准

- `snmp_collector.go` 中不再存在厂商 OID 字符串常量块
- `snmp_trap_listener.go` 中不再存在 Trap OID/override 硬编码 map
- `vendor-oids.json` 成为唯一运行时 OID 数据源
- 新增一个“同策略的新厂商 OID”时，只需改 JSON 与测试，不必改 collector 主逻辑
- 设备管理表单允许显式选择厂商，不再只能依赖 `device_type -> vendorMap`
- `inspection` 执行链路会把 `device.Tags` 透传给 `CollectMetrics`

## 风险提示

- 如果不补前端显式厂商选择，后续 Huawei/H3C/Juniper/Arista 交换机仍可能被错误标成 `cisco`
- 如果 JSON 里只存 OID、不存 strategy/aggregate/meta，后续仍会回到“新增厂商就改 Go”这一旧问题
- 如果不把 Trap 一起收口，仓库里会长期存在两套 SNMP 标准来源

## 推荐发布顺序

1. 先合并 registry 包与 JSON loader
2. 再合并 collector/probe 改造
3. 再合并前端 vendor 显式化
4. 最后收 Trap 与文档

Plan complete and saved to `docs/plans/2026-04-28-snmp-mib-json-decoupling-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - 我在当前会话按任务逐段实现、逐段验证、逐段回顾

**2. Parallel Session (separate)** - 你新开一个执行会话，按这个计划批量推进并在关键节点回报

**Which approach?**
