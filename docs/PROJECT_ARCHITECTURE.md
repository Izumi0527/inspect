# 企业级网络设备巡检系统详细架构文档

本文档是本项目的正式架构说明，面向开发、测试、运维和后续功能扩展。内容以当前代码库为准：

- 前端主工程：`frontend/`
- 后端主工程：`backend-go/`
- 数据库初始化：`database/`
- 开发与运维脚本：`scripts/`
- 测试工程：`tests/frontend/`、`tests/backend-go/`
- 开发编排：`docker-compose.dev.yml`
- 生产编排：`docker-compose.prod.yml`

`docs/PROJECT_ARCHITECTURE.md` 是 `docs/` 目录中唯一进入版本控制的正式文档；`docs/` 下其他内容作为本地资料归档目录，不再进入版本控制。本文件作为项目级架构事实源。

## 1. 系统定位

企业级网络设备巡检系统用于统一管理网络设备、采集监控指标、执行巡检策略、生成巡检与监控报告，并提供告警、日志、流量分析和系统设置能力。

系统核心目标：

- 统一设备台账、探测、SNMP 采集和巡检执行链路。
- 提供监控中心、巡检管理、报表中心、告警中心、日志中心等业务页面。
- 使用 PostgreSQL + TimescaleDB 存储业务数据和时序指标。
- 使用 Redis 承担缓存、下载票据、会话辅助和实时能力的可选支撑。
- 通过 WebSocket 推送设备状态、监控指标、告警和巡检进度。
- 支持 Docker 开发/生产部署，也支持本地前后端分离开发。

## 2. 总体架构

```mermaid
flowchart TB
  User[浏览器用户] --> Frontend[Next.js 前端应用]
  Frontend -->|REST /api/v1| Backend[Go Echo 后端 API]
  Frontend -->|WebSocket /api/v1/ws/:user_id| WS[WebSocket 管理器]
  Backend --> DB[(PostgreSQL 16 + TimescaleDB)]
  Backend --> Redis[(Redis 7)]
  Backend --> Files[本地数据与报告目录 data/]
  Backend --> Devices[网络设备 SNMP / Ping / SSH / HTTP]
  Backend --> Syslog[Syslog 接收器]
  Backend --> Trap[SNMP Trap 监听器]
  Backend --> Scheduler[调度器与巡检策略任务]
  Scheduler --> Devices
  WS --> Frontend
```

### 2.1 分层说明

| 层级 | 目录或服务 | 职责 |
|------|------------|------|
| 用户界面层 | `frontend/src/app`、`frontend/src/features` | 页面路由、业务视图、交互状态、表单和图表 |
| 前端基础层 | `frontend/src/lib`、`frontend/src/services` | API 客户端、认证上下文、WebSocket、HTTP 拦截器、日志工具 |
| HTTP 接入层 | `backend-go/internal/http` | Echo 路由、中间件、错误处理、请求追踪、CORS、处理器注册 |
| 应用编排层 | `backend-go/internal/app` | 加载配置、初始化依赖、组装服务、启动后台任务和 HTTP 服务 |
| 业务服务层 | `backend-go/internal/*` | 设备、监控、巡检、报表、告警、设置、日志、流量分析等领域逻辑 |
| 数据访问层 | `backend-go/internal/db`、GORM 模型 | PostgreSQL 连接、迁移、事务、查询和 TimescaleDB 支撑 |
| 缓存与实时层 | `backend-go/internal/redis`、`backend-go/internal/ws` | Redis 客户端、监控缓存、下载票据、WebSocket 连接与广播 |
| 外部协议层 | `devices`、`logs`、`snmpmib` | SNMP、Trap、Syslog、设备探测、厂商 OID 注册表 |
| 运行与部署层 | `docker-compose.*.yml`、`scripts/` | 容器编排、开发启动、数据库管理、缓存清理 |

## 3. 技术栈

### 3.1 后端

后端工程位于 `backend-go/`，模块名为：

```text
github.com/your-org/inspect-system/backend-go
```

关键技术：

| 技术 | 当前版本或依赖 | 用途 |
|------|----------------|------|
| Go | `go 1.23` | 后端主语言 |
| Echo | `github.com/labstack/echo/v4 v4.12.0` | HTTP 服务、路由和中间件 |
| GORM | `gorm.io/gorm v1.25.12` | ORM、迁移、数据库访问 |
| PostgreSQL Driver | `gorm.io/driver/postgres v1.5.9` | PostgreSQL 连接 |
| Redis | `github.com/redis/go-redis/v9 v9.5.1` | 缓存、下载票据、可选实时支撑 |
| JWT | `github.com/golang-jwt/jwt/v5 v5.2.1` | 登录认证与访问令牌 |
| Zap | `go.uber.org/zap v1.27.0` | 结构化日志 |
| GoSNMP | `github.com/gosnmp/gosnmp v1.38.0` | SNMP 探测和指标采集 |
| Cron | `github.com/robfig/cron/v3 v3.0.1` | 调度任务和巡检策略 |
| gofpdf | `github.com/phpdave11/gofpdf v1.4.3` | PDF 报表生成 |
| Excelize | `github.com/xuri/excelize/v2 v2.8.1` | Excel 报表生成 |
| go-chart | `github.com/wcharczuk/go-chart/v2 v2.1.2` | 报表图表渲染 |

### 3.2 前端

前端工程位于 `frontend/`，包名为 `inspect-system-frontend`。

关键技术：

| 技术 | 当前版本或依赖 | 用途 |
|------|----------------|------|
| Node.js | `>=20.0.0` | 前端运行环境 |
| Next.js | `^15.5.7` | App Router、页面渲染、开发服务器 |
| React | `^19.0.1` | UI 组件和交互 |
| TypeScript | `^5.7.2` | 类型系统 |
| TanStack Query | `^5.59.16` | 请求缓存、重试、数据同步 |
| Zustand | `^5.0.1` | 局部或跨组件状态管理 |
| Radix UI | 多个 `@radix-ui/*` 包 | 可访问基础组件 |
| Lucide React | `^0.453.0` | 图标 |
| Visx | `4.0.1-alpha.0` | 图表渲染 |
| Jest | `^29.7.0` | 单元测试 |
| Playwright | `^1.48.2` | 端到端测试 |

### 3.3 数据与基础设施

| 组件 | 当前配置 | 用途 |
|------|----------|------|
| PostgreSQL | 16 | 业务数据、用户、设备、报表、告警等 |
| TimescaleDB | 2.15.3 | 时序指标、设备历史、监控数据 |
| Redis | 7 Alpine | 缓存、下载票据、会话辅助、实时能力支撑 |
| Docker Compose | `docker-compose.dev.yml` / `docker-compose.prod.yml` | 开发和生产环境编排 |
| 本地数据目录 | `data/` | 报表导出、监控报告、运行时数据 |
| 日志目录 | `logs/` | 后端日志、开发脚本日志 |

## 4. 仓库结构

```text
C:\Coder\Inspect
├─ backend-go/                 Go 后端主工程
│  ├─ cmd/api/                 API 服务启动入口
│  ├─ internal/app/            应用装配、启动、关闭
│  ├─ internal/http/           Echo 路由、中间件、HTTP handlers
│  ├─ internal/auth/           登录、JWT、用户会话
│  ├─ internal/authz/          权限键与权限映射
│  ├─ internal/devices/        设备管理、探测、SNMP 采集、扫描
│  ├─ internal/monitoring/     指标写入、监控缓存、监控报表
│  ├─ internal/inspection/     巡检模板、策略、执行和结果
│  ├─ internal/reports/        报表渲染、PDF/Excel/Word 输出
│  ├─ internal/alerts/         告警、告警评估、Trap/Syslog 桥接
│  ├─ internal/settings/       系统设置、通知、备份、监控配置
│  ├─ internal/dashboard/      首页聚合和通知状态
│  ├─ internal/logs/           系统日志、Syslog、SNMP Trap
│  ├─ internal/traffic/        流量分析
│  ├─ internal/ws/             WebSocket 连接、权限、广播
│  ├─ internal/snmpmib/        SNMP MIB / 厂商 OID 注册表
│  ├─ internal/db/             数据库连接与迁移
│  ├─ internal/config/         环境配置加载
│  └─ internal/logger/         Zap 日志封装
├─ frontend/                   Next.js 前端主工程
│  ├─ src/app/                 App Router 页面和布局
│  ├─ src/features/            业务功能模块
│  ├─ src/components/          共享组件
│  ├─ src/lib/                 API、认证、WebSocket、基础工具
│  └─ src/services/            HTTP 拦截器等服务
├─ database/                   数据库初始化 SQL 与内置模板 SQL
├─ tests/backend-go/           后端仓库级测试模块
├─ tests/frontend/             前端单元测试与 E2E 测试
├─ scripts/                    开发、数据库、清理脚本
├─ config/                     PostgreSQL 等服务配置
├─ data/                       本地运行时数据和报表输出
├─ logs/                       本地日志
├─ docs/
│  └─ PROJECT_ARCHITECTURE.md  本架构文档
├─ README.md                   项目介绍与快速说明
└─ docker-compose.*.yml        开发/生产容器编排
```

## 5. 后端架构

### 5.1 启动入口

后端入口：

```text
backend-go/cmd/api/main.go
```

启动流程：

1. 调用 `app.New()` 加载配置、日志、数据库、Redis 和业务服务。
2. 初始化 SNMP MIB 注册表，确保厂商 OID 数据可用。
3. 打开 PostgreSQL 连接，并执行 `db.Migrate()`。
4. 初始化 Redis；开发调试模式下 Redis 不可用会降级继续启动，生产模式下会启动失败。
5. 创建 WebSocket Manager、认证服务、监控写入器、设备服务、巡检服务、报表服务、告警服务、设置服务等。
6. 启动调度器、巡检策略调度、Syslog 接收器、SNMP Trap 监听器。
7. 调用 `httpserver.NewServer()` 创建 Echo 实例并注册路由。
8. 调用 `application.Start()` 监听 `SERVER_HOST:SERVER_PORT`。
9. 收到系统信号后调用 `application.Shutdown()` 优雅关闭。

### 5.2 应用装配层

核心文件：

```text
backend-go/internal/app/app.go
```

`app.New()` 是后端依赖装配中心。它负责把多个领域服务连接起来：

- `auth.Service` 提供 JWT、用户和权限解析。
- `ws.Manager` 维护 WebSocket 连接、房间、广播和权限。
- `monitoring.MetricsWriter` 负责写入设备指标并触发实时推送。
- `devices.Service`、`ProbeService`、`SNMPCollector`、`Scanner` 支撑设备管理与探测。
- `inspection.Service` 与 `InspectionHandler.StartStrategyScheduler()` 支撑巡检任务和定时策略。
- `reports.Service` 支撑报表中心和巡检报告渲染。
- `alerts.Service`、`Evaluator`、Trap/Syslog 桥接器支撑告警生成与联动。
- `settings.Service` 是多个模块读取系统配置的共享依赖。
- `scheduler.Service` 统一执行周期性任务、设备扫描、指标采集、报表和告警评估。
- `logs.SyslogReceiver` 与 `logs.SNMPTrapListener` 接收外部日志与 Trap。

这种装配方式的特点是：业务包之间尽量通过服务接口和构造函数连接，避免包级全局状态；存在循环风险的地方使用适配器，例如 `wsAuthAdapter` 将认证服务适配给 WebSocket 鉴权。

### 5.3 HTTP 接入层

核心文件：

```text
backend-go/internal/http/router.go
```

Echo 服务统一配置：

- `Recover()`：防止 panic 直接中断进程。
- `RequestTracking`：为请求补充追踪上下文。
- `RequestLogger`：结构化记录请求日志。
- `CORSWithConfig`：显式允许 `Authorization`、`Content-Type`、`X-Request-ID` 等请求头。
- `/health`：健康检查。
- `/api/v1`：所有业务 API 的根路径。
- `BodyLimit("10M")`：限制请求体，避免超大 payload 拖垮服务。

注册的处理器：

| Handler | 业务路径 | 主要职责 |
|---------|----------|----------|
| `AuthHandler` | `/auth` | 登录、刷新令牌、退出、当前用户、权限验证 |
| `ws.Handler` | `/ws` | WebSocket 连接、广播、房间消息 |
| `MonitoringHandler` | `/monitoring` | 监控中心聚合、指标查询、监控报告导出 |
| `AlertsHandler` | `/alerts` | 告警列表、详情、处理、统计、导出 |
| `EscalationHandler` | `/escalation` | 告警升级策略 |
| `DevicesHandler` | `/devices` | 设备 CRUD、扫描、探测、SNMP 扩展指标 |
| `SchedulerHandler` | `/scheduler` | 调度任务管理 |
| `ReportsHandler` | `/reports` | 报表中心、统计报表、自定义报表、文件导出 |
| `InspectionHandler` | `/inspection` | 巡检模板、策略、执行、统计分析、巡检报告 |
| `SettingsHandler` | `/settings` | 系统设置、用户、角色、审计、通知等 |
| `DashboardHandler` | `/dashboard` | 首页概览、通知和快捷状态 |
| `LogsHandler` | `/logs` | 日志查询、采集、导出、Syslog/Trap 配置 |
| `TrafficHandler` | `/traffic` | 流量分析 |

### 5.4 后端领域模块边界

| 模块 | 目录 | 边界说明 |
|------|------|----------|
| 认证与授权 | `auth`、`authz` | 负责用户身份、JWT、角色权限，不直接处理业务实体 |
| 设备管理 | `devices` | 负责设备台账、探测、扫描、SNMP 采集和设备统计 |
| 监控中心 | `monitoring` | 负责指标写入、历史查询、缓存、监控报表导出 |
| 巡检管理 | `inspection` | 负责巡检模板、策略、执行、结果、统计分析 |
| 报表中心 | `reports` | 负责通用报表渲染、文件输出和报表记录 |
| 告警中心 | `alerts`、`escalation` | 负责告警规则、告警记录、告警升级和外部日志告警桥接 |
| 系统设置 | `settings` | 负责配置读取、保存、通知、备份、监控设置等 |
| 首页看板 | `dashboard` | 负责首页聚合数据、通知状态、孤儿数据过滤 |
| 日志中心 | `logs` | 负责应用日志、Syslog、SNMP Trap、日志导出 |
| 流量分析 | `traffic` | 负责网络流量数据分析和接口输出 |
| 实时通信 | `ws` | 负责 WebSocket 鉴权、连接、订阅、广播和权限控制 |
| SNMP MIB | `snmpmib` | 负责嵌入式厂商 OID 注册表和解析 |

### 5.5 后端配置加载

核心文件：

```text
backend-go/internal/config/config.go
```

配置加载规则：

1. 如果设置了 `ENV_FILE`，优先读取该文件。
2. 如果未设置 `ENV_FILE`，从当前目录向上查找 `.env`、`.env.development`、`.env.production`。
3. 系统环境变量优先级高于环境文件中同名变量。
4. `LOG_FILE`、`REPORT_OUTPUT_DIR`、`REPORTS_OUTPUT_DIR` 等相对路径以环境文件所在目录为基准。
5. `SERVER_PORT` 必须是 `1..65535` 内的有效端口。
6. `DATABASE_URL` 兼容历史 `postgresql+asyncpg://` 前缀，会归一化为 `postgresql://`。
7. `CORS_ORIGINS` 支持 JSON 数组和逗号分隔字符串。

关键环境变量：

```env
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@localhost:15500/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@127.0.0.1:26380/0
DB_AUTO_MIGRATE=true
TIMESCALE_ENABLED=true
REPORT_OUTPUT_DIR=data/reports/monitoring
REPORTS_OUTPUT_DIR=data/reports
LOG_FILE=logs/backend-go/app.log
```

### 5.6 端口回退策略

后端启动时会先监听 `SERVER_HOST:SERVER_PORT`。如果开发模式下端口被占用或 Windows 系统保留导致无法监听，后端会尝试从当前端口向后探测可用端口。

这是一种开发环境兜底能力，不是配置替代方案。实际端口变化后必须同步：

```env
NEXT_PUBLIC_API_URL=http://localhost:<实际端口>
NEXT_PUBLIC_WS_URL=ws://localhost:<实际端口>
```

生产环境不应依赖端口自动回退。

## 6. 前端架构

### 6.1 应用入口

前端使用 Next.js App Router。核心目录：

```text
frontend/src/app/
```

`frontend/src/components/providers.tsx` 负责装配前端全局 Provider：

- `ThemeProvider`：主题模式。
- `QueryClientProvider`：TanStack Query 请求缓存。
- `AuthProvider`：认证上下文。
- `WebSocketBootstrap`：登录态可用时建立 WebSocket 连接。
- `SidebarProvider`：侧边栏状态。
- `Toaster`：全局消息提示。
- `ReactQueryDevtools`：开发调试。

### 6.2 业务模块

当前前端业务模块集中在：

```text
frontend/src/features/
├─ alerts
├─ dashboard
├─ devices
├─ inspection
├─ logs
├─ monitoring
├─ reports
├─ settings
└─ traffic-analysis
```

模块职责：

| 模块 | 页面职责 |
|------|----------|
| `dashboard` | 首页概览、通知、快捷操作、网络状态 |
| `devices` | 设备列表、设备详情、设备探测、批量操作 |
| `inspection` | 巡检模板、巡检策略、执行记录、统计分析 |
| `monitoring` | 监控中心、设备状态、指标图表、监控报告导出 |
| `alerts` | 告警列表、告警详情、过滤、处理 |
| `reports` | 报表分析、统计报表、趋势分析、自定义报表 |
| `settings` | 用户、角色、权限、安全、通知、备份、监控配置 |
| `logs` | 日志列表、日志采集、日志导出、日志配置 |
| `traffic-analysis` | 网络流量分析视图 |

### 6.3 HTTP 客户端

核心文件：

```text
frontend/src/lib/api-client.ts
```

职责：

- 从 `NEXT_PUBLIC_API_URL` 解析后端 Origin。
- 统一拼接 `/api/v1`。
- 兼容误配成 `http://host/api/v1` 的地址。
- 管理访问令牌和刷新令牌。
- 封装请求超时、重试、错误类型和 JSON 处理。
- 为业务 API 提供统一请求基础设施。

默认配置：

```text
DEFAULT_API_ORIGIN = http://127.0.0.1:8000
API_PREFIX = /api/v1
```

推荐环境变量：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 6.4 WebSocket 客户端

核心文件：

```text
frontend/src/lib/websocket.ts
```

职责：

- 从 `NEXT_PUBLIC_WS_URL` 解析 WebSocket Origin。
- 统一拼接 `/api/v1/ws/:user_id`。
- 将 `http/https` 误配自动转换为 `ws/wss`。
- 通过 WebSocket 子协议传递访问令牌。
- 维护连接状态、心跳、重连、订阅恢复。
- 支持设备监控、告警、巡检任务等实时事件。

令牌传递方式：

```typescript
new WebSocket(url, ['inspect-token', accessToken])
```

这种方式避免把 token 放进 URL 查询参数，降低日志泄露风险。

### 6.5 前端数据流

```mermaid
sequenceDiagram
  participant Page as 页面组件
  participant Hook as Feature Hook
  participant Query as TanStack Query
  participant API as API Client
  participant Backend as Go API
  participant WS as WebSocket

  Page->>Hook: 读取业务状态
  Hook->>Query: useQuery / useMutation
  Query->>API: 请求 /api/v1
  API->>Backend: Bearer Token + JSON
  Backend-->>API: ApiResponse / 文件 / 错误
  API-->>Query: 结构化结果
  Query-->>Hook: 缓存后的数据
  Hook-->>Page: 渲染状态
  WS-->>Hook: 实时事件触发局部刷新
```

## 7. 数据架构

### 7.1 数据库拓扑

开发环境使用 `docker-compose.dev.yml` 启动：

| 服务 | 容器名 | 宿主机端口 | 容器端口 |
|------|--------|------------|----------|
| PostgreSQL / TimescaleDB | `inspect-postgres-dev` | `15500` | `5432` |
| Redis | `inspect-redis-dev` | `26380` | `6379` |
| pgAdmin | `inspect-pgadmin-dev` | `5050` | `80` |
| Redis Commander | `inspect-redis-commander-dev` | `8081` | `8081` |

### 7.2 初始化文件

```text
database/database-init-complete.sql
database/builtin-templates-complete.sql
```

开发数据库容器首次启动时会将上述 SQL 挂载到 PostgreSQL 初始化目录：

```text
/docker-entrypoint-initdb.d/01-init.sql
/docker-entrypoint-initdb.d/02-templates.sql
```

Go 后端启动后还会根据 `DB_AUTO_MIGRATE=true` 执行 GORM 迁移，用于补齐模型结构和索引。

### 7.3 数据类型分层

| 数据类型 | 存储位置 | 说明 |
|----------|----------|------|
| 用户、角色、权限 | PostgreSQL | 登录、权限、用户管理 |
| 设备台账 | PostgreSQL | 设备基础信息、凭据、分组、状态 |
| 巡检模板和策略 | PostgreSQL | 模板、检查项、Cron 策略、执行记录 |
| 监控指标 | PostgreSQL + TimescaleDB | CPU、内存、接口、温度、可用性等时序数据 |
| 告警记录 | PostgreSQL | 告警状态、处理动作、升级记录 |
| 报表记录 | PostgreSQL + `data/` | 元数据入库，文件落本地目录 |
| 系统日志 | PostgreSQL + 文件日志 | 日志查询、Syslog、Trap、审计 |
| 缓存和短期票据 | Redis | 监控缓存、报表下载 token、实时能力辅助 |

### 7.4 运行时文件目录

| 目录 | 用途 |
|------|------|
| `data/reports/monitoring` | 监控中心导出报告 |
| `data/reports` | 报表中心、巡检统计和通用导出文件 |
| `logs/backend-go` | Go 后端日志 |
| `logs/dev` | Bash 开发脚本后台进程日志 |

`data/` 和 `logs/` 均属于运行时产物，不应进入版本控制。

## 8. 实时通信架构

### 8.1 服务端

服务端 WebSocket 位于：

```text
backend-go/internal/ws/
```

职责：

- 校验连接来源和访问令牌。
- 从 token 解析用户与权限。
- 管理用户连接、房间和订阅关系。
- 向前端推送设备指标、告警、巡检进度和系统事件。
- 在权限不足时拒绝订阅或推送敏感事件。

### 8.2 客户端

客户端 WebSocket 位于：

```text
frontend/src/lib/websocket.ts
```

连接地址：

```text
ws://localhost:8000/api/v1/ws/:user_id
```

事件类型覆盖：

- 设备状态变化。
- 网络统计变化。
- 性能指标推送。
- 告警新增、更新、恢复。
- 巡检开始、进度、完成。
- 系统状态和用户活动。

### 8.3 可靠性策略

- 客户端有最大重连次数和重连间隔。
- 客户端有心跳与 stale 判断。
- 客户端记录订阅意图，重连后自动恢复订阅。
- 服务端通过权限解析控制订阅和广播范围。

## 9. 报表与导出架构

系统有两条主要导出链路：

1. 监控中心导出：由 `MonitoringHandler` 和 `monitoring` 模块负责。
2. 报表中心/巡检报表：由 `ReportsHandler`、`InspectionHandler` 和 `reports` 模块负责。

报表输出目录：

```env
REPORT_OUTPUT_DIR=data/reports/monitoring
REPORTS_OUTPUT_DIR=data/reports
```

监控报告下载采用短期下载票据：

```env
MONITORING_REPORT_DOWNLOAD_TOKEN_TTL=5m
MONITORING_REPORT_DOWNLOAD_TOKEN_MAX_USES=3
```

典型流程：

```mermaid
sequenceDiagram
  participant UI as 前端导出按钮
  participant API as 后端导出接口
  participant Renderer as 报表渲染器
  participant File as data/reports
  participant Redis as Redis 票据
  participant Browser as 浏览器下载

  UI->>API: POST 导出请求
  API->>Renderer: 查询数据并渲染 PDF
  Renderer->>File: 写入报告文件
  API->>Redis: 写入 download_token
  API-->>UI: 返回 token / download_url
  UI->>Browser: form POST 下载
  Browser->>API: 使用 token 下载
  API-->>Browser: PDF 文件流
```

设计约束：

- 导出文件属于运行时产物，写入 `data/`，不进入 Git。
- 大文件下载优先使用 token + form POST，减少前端 blob 内存占用。
- 生成文件名应由后端统一控制，避免前后端规则分裂。

## 10. 认证、授权与安全边界

### 10.1 登录认证

认证模块位于：

```text
backend-go/internal/auth/
frontend/src/lib/contexts/auth-context
```

基本机制：

- 用户通过 `/api/v1/auth/login` 登录。
- 后端签发访问令牌和刷新令牌。
- 前端将令牌保存在浏览器本地认证数据中。
- API 请求使用 `Authorization: Bearer <token>`。
- WebSocket 使用 `Sec-WebSocket-Protocol` 子协议携带 token。

### 10.2 权限控制

权限由后端认证服务解析角色并映射为权限集合。前端可以基于权限隐藏入口，但最终权限判断必须由后端接口保证。

后端重要约束：

- 所有敏感操作必须在 handler 或 service 层校验认证与权限。
- WebSocket 订阅也需要权限解析。
- CORS 必须显式允许认证头，避免浏览器预检失败。
- 生产环境必须替换 `.env.example` 中所有默认密钥和密码。

### 10.3 输入和文件边界

- `/api/v1` 请求体限制为 `10M`。
- 报表、日志和上传文件必须写入受控目录。
- 运行时目录不进入 Git。
- 生产环境应限制 `ALLOWED_HOSTS` 和 `CORS_ORIGINS`，不能使用开发默认值。

## 11. 部署架构

### 11.1 开发环境

开发 Compose 文件：

```text
docker-compose.dev.yml
```

服务：

| 服务 | 职责 |
|------|------|
| `postgres` | TimescaleDB / PostgreSQL 开发库 |
| `redis` | Redis 缓存 |
| `backend` | Go API，挂载 `backend-go/`、`logs/`、`data/` |
| `frontend` | Next.js 开发服务器，挂载 `frontend/` |
| `pgadmin` | 数据库管理工具，tools profile |
| `redis-commander` | Redis 管理工具，tools profile |

常用命令：

```powershell
docker-compose -f "docker-compose.dev.yml" up -d postgres redis
docker-compose -f "docker-compose.dev.yml" up -d --build backend frontend
docker-compose -f "docker-compose.dev.yml" --profile tools up -d pgadmin redis-commander
```

### 11.2 本地分离开发

推荐流程：

```powershell
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
docker-compose -f "docker-compose.dev.yml" up -d postgres redis

$env:ENV_FILE = (Resolve-Path ".env").Path
Set-Location "backend-go"
go run ./cmd/api
```

另开前端终端：

```powershell
Set-Location "frontend"
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm dev
```

### 11.3 生产环境

生产编排文件：

```text
docker-compose.prod.yml
```

生产部署需要额外关注：

- 替换全部默认密钥、数据库密码和 Redis 密码。
- 关闭开发调试开关。
- 固定 CORS 和 Allowed Hosts。
- 配置持久化卷、备份策略和日志采集。
- 为 HTTP 入口配置反向代理和 TLS。
- 确认 SNMP Trap、Syslog 等端口权限。

## 12. 脚本体系

| 脚本 | 用途 |
|------|------|
| `scripts/dev-start.ps1` | Windows PowerShell 开发环境启动、诊断、依赖准备 |
| `scripts/dev-start.sh` | Bash 开发环境启动、诊断、后台运行 |
| `scripts/db-manage.ps1` | Windows 数据库启动、停止、初始化、验证、备份、seed-admin |
| `scripts/db-manage.sh` | Bash 数据库管理 |
| `scripts/clean-cache.ps1` | PowerShell 缓存、日志、数据输出清理 |
| `scripts/clean-cache.sh` | Bash 缓存、日志、数据输出清理 |

`dev-start.ps1` 中的 `Get-BackendDevConfig` 会读取根目录 `.env`，汇总：

- `SERVER_HOST`
- `SERVER_PORT`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`

这让根 `.env` 成为本地联调地址的统一来源。

## 13. 测试架构

### 13.1 后端测试

后端测试分两类：

1. `backend-go/` 包内测试。
2. `tests/backend-go/` 仓库级测试模块。

`tests/backend-go/go.mod` 通过 replace 指向主后端模块：

```text
replace github.com/your-org/inspect-system/backend-go => ../../backend-go
```

常用命令：

```powershell
Set-Location "backend-go"
go test ./...

Set-Location "..\tests\backend-go"
go test ./...
```

测试覆盖重点：

- 配置加载。
- CORS 与 HTTP 路由契约。
- 认证、权限和 WebSocket 鉴权。
- 设备探测、SNMP 扩展、告警过滤。
- 巡检模板、策略、统计分析。
- 报表 PDF 渲染和导出。

### 13.2 前端测试

前端测试目录：

```text
tests/frontend/
```

Jest 配置：

```text
frontend/jest.config.js
```

Playwright 配置：

```text
frontend/playwright.config.ts
```

常用命令：

```powershell
Set-Location "frontend"
pnpm run type-check
pnpm test -- --runInBand
pnpm exec jest ../tests/frontend/monitoring/components/ReportExportButton.test.tsx --runInBand
pnpm run test:e2e -- --project=chromium
```

测试覆盖重点：

- 页面权限和路由保护。
- 业务组件状态和错误态。
- API 客户端参数透传与错误处理。
- WebSocket URL 和连接行为。
- 报表、监控、巡检、设置等核心流程。

## 14. 核心业务流

### 14.1 登录与页面访问

```mermaid
sequenceDiagram
  participant User as 用户
  participant FE as 前端
  participant Auth as AuthHandler
  participant DB as PostgreSQL

  User->>FE: 输入用户名和密码
  FE->>Auth: POST /api/v1/auth/login
  Auth->>DB: 查询用户与角色
  Auth-->>FE: access token + refresh token
  FE->>FE: 保存认证数据
  FE->>Auth: GET /api/v1/auth/me
  Auth-->>FE: 用户信息和权限
  FE->>FE: 渲染可访问页面
```

### 14.2 设备监控指标写入

```mermaid
flowchart LR
  Scheduler[调度器] --> DeviceService[设备服务]
  DeviceService --> Probe[探测服务]
  DeviceService --> SNMP[SNMP Collector]
  SNMP --> MetricsWriter[MetricsWriter]
  MetricsWriter --> DB[(TimescaleDB)]
  MetricsWriter --> Cache[Redis 缓存]
  MetricsWriter --> WS[WebSocket 推送]
  WS --> Frontend[监控中心页面]
```

### 14.3 巡检策略执行

```mermaid
flowchart TD
  Strategy[巡检策略 Cron] --> Scheduler[策略调度器]
  Scheduler --> Execution[创建执行记录]
  Execution --> DeviceProbe[设备探测 / SNMP / SSH / HTTP / Ping]
  DeviceProbe --> Result[写入巡检结果]
  Result --> Stats[统计分析]
  Result --> Report[巡检报告]
  Result --> WS[推送巡检进度]
```

### 14.4 告警生成

```mermaid
flowchart LR
  Metrics[监控指标] --> Evaluator[告警评估器]
  Syslog[Syslog] --> Bridge[Syslog 告警桥接]
  Trap[SNMP Trap] --> TrapBridge[Trap 告警桥接]
  Evaluator --> Alerts[(告警记录)]
  Bridge --> Alerts
  TrapBridge --> Alerts
  Alerts --> WS[WebSocket 推送]
  Alerts --> UI[告警中心]
```

## 15. 扩展规范

### 15.1 新增后端业务接口

建议顺序：

1. 在对应领域包新增或扩展 service 方法。
2. 在 `backend-go/internal/http/handlers` 中补充 handler。
3. 在 handler 的 `Register()` 中注册路由。
4. 如需依赖其他服务，在 `app.New()` 中装配。
5. 为权限、参数、错误码和响应结构补测试。
6. 如涉及前端，新增 API 封装和组件测试。

### 15.2 新增前端业务页面

建议顺序：

1. 在 `frontend/src/features/<module>` 建立业务组件、hooks、api 和 types。
2. 在 `frontend/src/app` 增加页面入口。
3. 使用统一 API 客户端，不在组件内手写 fetch。
4. 使用 TanStack Query 管理远程数据状态。
5. 权限入口前端可隐藏，后端必须强校验。
6. 在 `tests/frontend/<module>` 增加组件或 API 测试。

### 15.3 新增数据库结构

建议顺序：

1. 优先通过 Go 模型和 `db.Migrate()` 描述结构。
2. 若是基础初始化或内置模板数据，同步更新 `database/` 下 SQL。
3. TimescaleDB 时序表需确认 hypertable、索引和保留策略。
4. 增加对应的查询、迁移或契约测试。

### 15.4 新增导出或报告

建议顺序：

1. 后端统一确定文件格式、文件名和输出目录。
2. 文件写入 `data/reports` 或子目录。
3. 下载优先使用短期 token 或受控 URL。
4. 前端只负责触发、展示状态和保存响应。
5. 测试覆盖文件名、Content-Type、权限、空数据和异常场景。

## 16. 架构约束与维护原则

- 根 `.env` 是本地联调配置的主要事实源。
- `SERVER_PORT`、`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_WS_URL` 必须保持一致。
- `docs/PROJECT_ARCHITECTURE.md` 是项目架构说明的长期维护入口。
- `docs/` 下除本文件外的其他内容作为本地资料归档，不进入版本控制。
- 运行时目录 `data/`、`logs/`、`backend-go/data/` 不进入 Git。
- 前端业务代码优先放在 `features/`，共享基础能力放在 `lib/` 或 `components/`。
- 后端新增能力优先落在明确领域包，不把业务逻辑堆入 HTTP handler。
- 权限必须以后端校验为准，前端隐藏入口只作为用户体验优化。
- 报表和导出命名规则应集中在后端，避免前后端重复实现。
- Redis 在开发环境可降级，生产环境不可静默缺失。
- 外部协议能力如 SNMP、Trap、Syslog 需要考虑端口权限、设备超时和异常输入。

## 17. 快速验证入口

本架构文档涉及的关键命令：

```powershell
# 查看工作区状态
git status --short

# 诊断开发环境
.\scripts\dev-start.ps1 -Diagnose

# 启动数据库
docker-compose -f "docker-compose.dev.yml" up -d postgres redis

# 启动后端
$env:ENV_FILE = (Resolve-Path ".env").Path
Set-Location "backend-go"
go run ./cmd/api

# 启动前端
Set-Location "frontend"
pnpm dev
```

常用访问地址：

| 入口 | 地址 |
|------|------|
| 前端 | `http://localhost:3000` |
| 后端健康检查 | `http://localhost:8000/health` |
| 后端 API 根路径 | `http://localhost:8000/api/v1` |
| WebSocket | `ws://localhost:8000/api/v1/ws/:user_id` |
| PostgreSQL | `localhost:15500` |
| Redis | `localhost:26380` |
| pgAdmin | `http://localhost:5050` |
| Redis Commander | `http://localhost:8081` |

## 18. 文档维护规则

修改本文件时，应同时核对：

- `backend-go/go.mod`
- `frontend/package.json`
- `.env.example`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `backend-go/internal/app/app.go`
- `backend-go/internal/http/router.go`
- `frontend/src/lib/api-client.ts`
- `frontend/src/lib/websocket.ts`
- `scripts/dev-start.ps1`
- `scripts/dev-start.sh`

当代码结构、端口、启动脚本、导出目录、认证方式或部署方式发生变化时，应同步更新本文档。
