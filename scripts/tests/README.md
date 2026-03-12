# 测试与维护脚本说明（scripts/tests）

本目录集中放置项目的测试与质量检查脚本，用于在本地开发/CI 场景下快速完成：

- 前端/后端测试运行（单测/集成/E2E）
- 基础设施健康检查（数据库/Redis/API）
- 代码质量检查（格式化/静态检查/测试）

> 建议在项目根目录 `C:/Coder/Inspect` 执行这些脚本。

---

## 常用命令速查

```powershell
# 仅跑 Go 后端测试
.\scripts\tests\run-tests.ps1 -Target backend

# 仅跑前端测试（可选覆盖率）
.\scripts\tests\run-tests.ps1 -Target frontend -Coverage

# 基础设施检查（容器状态）
.\scripts\database\db-manage.ps1 status

# 质量检查（不修复）
.\scripts\tests\quality-check.ps1

# 质量检查（自动修复可修复项）
.\scripts\tests\quality-check.ps1 -Fix

# 清理缓存（交互式/或指定项）
.\scripts\tests\clean-cache.ps1
.\scripts\tests\clean-cache.ps1 -All -Force

# 查看日志（自动扫描 logs/*.log）
.\scripts\tests\view-logs.ps1 -Service backend-go -Tail 300
```

---

## 脚本清单与作用

### 1) `run-tests.ps1`

**定位**：统一测试运行器（面向“前端/后端/全部”）。

**主要能力**
- 支持选择测试目标：`-Target frontend|backend|all`
- 支持选择测试类型：`-Type unit|integration|e2e|all`
- 支持覆盖率：`-Coverage`
- 支持监听模式：`-Watch`（前端会使用对应的 watch/interactive 命令）

**依赖**
- 后端：Go（用于 `go test` 等）
- 前端：pnpm（并要求 `frontend/node_modules` 已安装）

---

### 2) `quality-check.ps1`

**定位**：代码质量检查（前端 + Go 后端）。

**主要能力**
- 目标选择：`-Target frontend|backend|all`
- 自动修复：`-Fix`
  - 后端：`gofmt -w .`
  - 前端：`pnpm run lint --fix`
- 严格模式：`-Strict`（将告警视为错误）
- 跳过测试：`-SkipTests`（只做格式/静态检查）

**检查项示例**
- 后端：gofmt / go vet / golangci-lint（若已安装）/ go test
- 前端：TypeScript type-check / ESLint lint

---

### 3) `clean-cache.ps1`

**定位**：清理开发过程中产生的缓存/临时文件（前端构建缓存、Go 测试覆盖率、logs 等）。

**主要能力**
- 支持选择清理目标：`-Backend`（Go 后端缓存/覆盖率）/ `-Frontend` / `-Logs` / `-Temp` / `-ProjectFiles` / `-All`
- 支持安全模式：`-WhatIf` 预览、`-Force` 跳过确认

---

### 4) `view-logs.ps1`

**定位**：日志查看工具，自动扫描项目根目录 `logs/`（递归查找 `*.log`）。

**主要能力**
- 按服务筛选：`-Service <name|all>`（服务名为 `logs/` 下一级目录名）
- 关键词过滤：`-Filter`
- 级别过滤：`-Level debug|info|warn|error|fatal|panic`
- 时间范围：`-Since` / `-Until`
- Tail/Follow：`-Tail` / `-Follow`

---

## 排查建议

- 前端测试提示依赖缺失：先在 `frontend` 目录执行 `pnpm install`。
- 基础设施检查失败：先确认数据库/Redis 容器已启动（可用 `.\scripts\database\db-manage.ps1 status` 查看）。
