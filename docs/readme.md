# docs 文档索引与归档规范

本目录用于存放**可长期维护的项目正式文档**（安装/部署/配置/运维/接口/迁移/排错等）。  
如果某篇文档更偏“方案讨论/取舍过程/阶段性结论”，建议放入 `discuss/`，并在此处保留指向最终结论的链接。

---

## 1) 快速入口（建议按这个顺序阅读）

1. **开发环境与启动**
   - `development/development-environment-guide.md`：开发环境搭建与常见问题
   - `backend/backend_build_guide.md`：后端构建/启动指南
2. **环境变量与端口**
   - `env/env_configuration_guide.md`：环境变量配置指南
   - `env/quick_port_reference.md`：常用端口速查
   - `env/env_migration_notice.md`：环境配置迁移说明
3. **数据库 / Docker**
   - `datebase/`：数据库相关（⚠️目录名当前为 `datebase`，建议后续统一更名为 `database`）
   - `docker/`：Docker / compose 相关

---

## 2) 文档分类（按主题归档）

### API 接口
- `api/readme.md`：API 文档入口
- `api/quick_reference.md`：API 快捷索引
- `api/websocket-contract.md`：WebSocket 协议
- `api/dashboard.md`：看板相关接口说明
- `api/template-api.md`：模板相关接口说明
- `api/changelog.md`：接口变更记录

### 数据库（PostgreSQL/TimescaleDB/Redis）
- `datebase/`：数据库容器、端口、部署、脚本说明、查询指南等
- `datebase/timescaledb_migration_fix.md`：TimescaleDB 迁移/修复说明

### Docker / Compose
- `docker/compose_quick_start.md`：快速启动
- `docker/docker_compose_migration.md`：compose 迁移说明

### 功能文档（按业务模块）
- `features/`：按模块拆分（devices/inspection/settings 等）

### 方案与计划（带日期的设计稿/执行计划）
- `plans/`：阶段性计划与设计文档（建议文件名保持 `YYYY-MM-DD-<主题>.md`）

### 报表基线
- `report-baseline/readme.md`：报表基线说明

### 环境与构建（根目录散落文档，建议后续归档）
> 这些文件目前位于 `docs/` 根目录；建议后续按主题移动到对应子目录（见“归档建议”）。

- 后端构建/依赖/编译：
  - `backend/backend_build_guide.md`
  - `backend/backend_compile_fix.md`
  - `backend/go_module_fix.md`
- 后端数据库连接/排错：
  - `backend/backend_database_connection_fix.md`
- 环境变量与迁移：
  - `env/env_configuration_guide.md`
  - `env/env_migration_notice.md`
  - `env/quick_port_reference.md`
- 流程与数据流（建议后续归档到 `flows/`）：
  - `flows/inspection-analytics-flow.md`
  - `flows/inspection-strategy-flow.md`
  - `flows/monitoring-data-flow-summary.md`
- 其他主题：
  - `integration/vendor-oid-mapping.md`
  - `frontend/visx-react19-update-analysis.md`
  - `release/implementation_summary.md`

---

## 3) 归档建议（待确认后可执行）

为减少根目录“散文档”，建议把 `docs/` 根目录的主题文档归档到子目录中，例如：

- 新增 `docs/backend/`：放后端构建/编译/依赖相关
- 新增 `docs/env/`：放环境变量、端口、迁移说明
- 新增 `docs/flows/`：放流程/数据流文档
- 新增 `docs/frontend/`：放前端技术专项分析（已归档）
- 新增 `docs/integration/`：放厂商/OID/对接映射等（已归档）
- （可选）把 `docs/datebase/` 更名为 `docs/database/` 统一拼写

⚠️ **说明**：移动/重命名会影响引用链接与外部笔记，属于高风险操作。执行前我会给出“移动清单 + 影响面”，并请你明确确认后再做。

---

## 4) 写作与命名规范（建议）

- **路径即归档**：新文档优先放到最贴近主题的子目录中，避免放在 `docs/` 根目录。
- **文件名清晰**：避免 `README2.md`、`test.md`；用“主题-用途”命名，如 `database-port-change-guide.md`。
- **计划类文档带日期**：`plans/YYYY-MM-DD-<主题>.md`，便于排序与追踪。
- **一文一事实源**：同一主题尽量只有一个“正式指南”，其它讨论稿放 `discuss/`，并链接到正式指南。
