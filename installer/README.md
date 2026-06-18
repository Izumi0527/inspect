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
- 自动生成 `SECRET_KEY` 和 `JWT_SECRET_KEY`
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
