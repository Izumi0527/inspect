# Inspect Windows 安装包说明

本目录用于生成 Windows `.exe` 安装包。

## 目录说明

```text
installer/
├─ inspect.iss
├─ README.md
├─ docker-compose.installer.yml
├─ assets/
│  └─ inspect.ico
├─ config/
│  └─ .env.example
├─ database/
│  └─ inspect-runtime-seed.sql
└─ scripts/
   ├─ prepare-env.ps1
   ├─ start-infra.ps1
   ├─ init-database.ps1
   ├─ start-backend.ps1
   ├─ start-frontend.ps1
   ├─ start-all.ps1
   ├─ stop-infra.ps1
   └─ stop-all.ps1
```

打包输入目录：

```text
build/installer/InspectRuntime/
```

该目录只保存构建产物：

```text
build/installer/InspectRuntime/
├─ backend/
├─ frontend/
└─ runtime/
```

安装脚本、图标、配置模板和 SQL 源文件不复制进该目录，
由 `installer/inspect.iss` 在编译安装包时分别从以下源码目录读取：

```text
installer/
database/
config/postgres/
```

安装包输出目录：

```text
build/installer-output/
```

## 生成安装包

先准备打包输入目录，再使用 Inno Setup 编译：

```powershell
ISCC.exe installer\inspect.iss
```

前端运行依赖建议在打包输入目录内重新安装生产依赖，不建议直接复制开发目录的 `frontend/node_modules`，因为 pnpm 会创建大量链接目录，不适合直接封装。

如果未安装 Inno Setup，请先安装 Inno Setup 6，并确保 `ISCC.exe` 在 PATH 中。

## 安装后启动

安装后直接运行 `Inspect 启动服务` 即可。启动脚本会按顺序执行：

- 首次启动时复制 `config/.env.example` 为 `config/.env`
- 自动生成 `SECRET_KEY`、`JWT_SECRET_KEY`，以及 PostgreSQL/Redis 强随机口令（写入 `config/.env`）
- 创建 `logs/`、`data/`、`data/reports/`、`data/backups/` 等运行目录
- 使用 Docker Compose 启动 TimescaleDB/PostgreSQL 和 Redis
- 启动 `backend/app.exe`
- 等待后端健康检查通过，确保数据库迁移完成
- 执行默认管理员、内置权限、内置角色和业务种子数据初始化
- 使用 `runtime/node.exe` 启动前端

安装完成后，开始菜单会包含：

- `Inspect 启动服务`
- `Inspect 停止服务`
- `Inspect 前端`

安装向导默认会创建桌面快捷方式：

- `Inspect 启动服务`

该快捷方式使用 `assets/inspect.ico` 作为启动图标。

启动脚本会：

- 运行 `backend/app.exe`
- 优先使用安装目录 `runtime/node.exe` 启动前端
- 若安装目录没有 `runtime/node.exe`，再回退使用系统 `node`
- 默认前端端口为 `3000`

当前打包输入目录已包含：

```text
runtime/node.exe
```

## 配置文件

安装包默认携带：

```text
config/.env.example
config/postgres/postgresql.conf
database/database-init-complete.sql
database/builtin-templates-complete.sql
database/inspect-runtime-seed.sql
docker-compose.installer.yml
```

首次启动会自动复制为：

```text
config/.env
```

可根据实际数据库、Redis、端口等环境修改 `config/.env`。

## 数据库与 Redis 口令（首启自动随机化）

首次启动时，`prepare-env.ps1` 会用操作系统级 CSPRNG 为 PostgreSQL 与 Redis 各生成一个 64 位十六进制强随机口令并写入 `config/.env`，安装包不再随模板下发任何可知的默认数据库/Redis 口令：

- `DATABASE_URL` 内嵌口令与 `POSTGRES_PASSWORD` 始终一致（由同一占位符替换保证），后端与 Postgres 容器使用同一口令；
- `REDIS_URL` 内嵌口令与 `REDIS_PASSWORD` 同理；
- 口令仅在占位符（`__DB_PASSWORD__` / `__REDIS_PASSWORD__`）仍存在时生成；再次启动不会改动已生成的口令（幂等）。

### 存量数据卷升级（重要）

PostgreSQL 只在**首次初始化空数据卷**时固化数据库用户口令，此后修改 `config/.env` 不会改变卷内已有口令。为避免“装过旧版本的机器升级后连不上库”，`prepare-env.ps1` 会检测 `data/postgres` 是否已初始化（是否存在 `PG_VERSION`）：

- **全新安装**（空卷）：生成强随机口令；
- **存量卷**（卷已初始化）：沿用既有口令以保证连库，并打印告警。

如需将存量库轮换为强随机口令，请在停机维护窗口手动执行：

1. 修改数据库用户口令（示例）：

   ```powershell
   docker exec -it inspect-postgres-installer psql -U inspect_dev -d inspect_system_dev -c "ALTER USER inspect_dev WITH PASSWORD '<新强随机口令>';"
   ```

2. 将同一口令同步写入 `config/.env` 的 `DATABASE_URL` 与 `POSTGRES_PASSWORD`（两处必须一致）；
3. 重启服务。

Redis 口令不固化在数据卷中（每次启动从 `--requirepass` 读取），可随时随机化，无需上述迁移步骤。

## 默认登录账号

首次安装并启动完成后，系统会创建默认管理员（用户名 `admin`，初始口令 `admin123`）。

> **首次登录会被强制要求修改密码**，改密前无法访问业务接口。请在首登时立即设置强密码。

## 外部依赖

当前一键运行方案依赖 Docker Desktop：

- 使用 `timescale/timescaledb:2.15.3-pg16` 作为 PostgreSQL/TimescaleDB
- 使用 `redis:7-alpine` 作为 Redis
- 默认 PostgreSQL 映射到 `127.0.0.1:15500`
- 默认 Redis 映射到 `127.0.0.1:26380`

首次启动前请确认 Docker Desktop 已安装并正在运行。
