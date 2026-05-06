# UltraThink 脚本目录结构

本目录包含项目当前仍在维护的脚本。数据库脚本已收敛为根目录下的
`db-manage.ps1` / `db-manage.sh`，不再保留旧的数据库脚本子目录。

## 目录结构

```text
scripts/
├── db-manage.ps1       # 数据库统一管理、初始化、验证与管理员种子
├── db-manage.sh        # 数据库统一管理 Bash 版
├── development/        # 开发服务脚本
│   ├── setup-dev-env.ps1
│   ├── dev-start.ps1
│   └── README.md
├── tests/              # 测试与维护脚本
│   ├── run-tests.ps1
│   ├── quality-check.ps1
│   ├── clean-cache.ps1
│   ├── view-logs.ps1
│   └── README.md
└── README.md
```

> Python 后端相关脚本已迁移至 `legacy/scripts/`，仅保留历史参考。

## 快速开始

### 环境设置

```powershell
.\scripts\development\setup-dev-env.ps1
```

### 启动开发服务

```powershell
.\scripts\development\dev-start.ps1
```

也可以手动启动：

```powershell
cd backend-go
go run ./cmd/api

cd frontend
pnpm dev
```

## 数据库管理

统一入口：

```powershell
.\scripts\db-manage.ps1 <start|stop|reset|backup|status|logs|init|verify|seed-admin>
```

```bash
./scripts/db-manage.sh <start|stop|reset|backup|status|logs|init|verify|seed-admin>
```

如果 Bash 环境提示没有执行权限，可改用 `bash scripts/db-manage.sh ...` 执行。

常用命令：

```powershell
# 启动 PostgreSQL 与 Redis
.\scripts\db-manage.ps1 start

# 查看数据库服务状态
.\scripts\db-manage.ps1 status

# 查看数据库服务日志
.\scripts\db-manage.ps1 logs

# 执行完整初始化（基础配置 + 内置模板）
.\scripts\db-manage.ps1 init

# 仅执行基础初始化
.\scripts\db-manage.ps1 init -InitOnly

# 仅导入内置模板
.\scripts\db-manage.ps1 init -TemplatesOnly

# 静态验证整合 SQL、文档归档和 Docker 引用
.\scripts\db-manage.ps1 verify

# 初始化默认管理员账号与 RBAC
.\scripts\db-manage.ps1 seed-admin -Username admin -Password admin123 -Email admin@admin.com -Role superadmin

# 停止服务
.\scripts\db-manage.ps1 stop
```

```bash
# 启动 PostgreSQL 与 Redis
./scripts/db-manage.sh start

# 查看数据库服务状态
./scripts/db-manage.sh status

# 执行完整初始化（基础配置 + 内置模板）
./scripts/db-manage.sh init --force

# 仅执行基础初始化
./scripts/db-manage.sh init --init-only --force

# 仅导入内置模板
./scripts/db-manage.sh init --templates-only --force

# 静态验证整合 SQL、文档归档和 Docker 引用
./scripts/db-manage.sh verify

# 初始化默认管理员账号与 RBAC
./scripts/db-manage.sh seed-admin --username admin --password admin123 --email admin@admin.com --role superadmin
```

`db-manage.ps1 init` 和 `db-manage.sh init` 均已合并原独立初始化脚本的能力：

- 基础数据库初始化
- TimescaleDB 扩展、hypertable、压缩策略和保留策略配置
- 带宽单位迁移
- 18 个内置巡检模板导入
- 静态整合验证

## 测试与维护

```powershell
# 运行测试
.\scripts\tests\run-tests.ps1

# 代码质量检查
.\scripts\tests\quality-check.ps1

# 清理缓存和临时文件
.\scripts\tests\clean-cache.ps1

# 查看日志
.\scripts\tests\view-logs.ps1
```

## 使用建议

1. 新环境优先运行 `setup-dev-env.ps1`。
2. 日常开发优先使用 `dev-start.ps1`。
3. 数据库操作在 Windows PowerShell 下使用 `db-manage.ps1`，在 Bash 环境下使用 `db-manage.sh`。
4. 提交前按改动范围运行 `run-tests.ps1` 或定向测试。
5. 新增脚本时同步更新本文件和对应子目录 README。
