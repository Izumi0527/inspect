# Docker 流程可直接用改造 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让开发环境可一键用 Docker Compose 启动（至少 postgres/redis 稳定可用，并修复当前 Compose/Dockerfile/脚本/文档的不一致，避免缺文件与健康检查导致的启动失败）。

**Architecture:** 以 `docker-compose.dev.yml` / `docker-compose.prod.yml` 为单一事实源（不再依赖已删除的 `docker-compose.yml`）；补齐前端缺失 Dockerfile；将健康检查从 `curl` 统一调整为 Alpine 系镜像普遍可用的 `wget`；数据库初始化脚本去掉对特定 dev 库名/用户名的硬编码，确保 dev/prod 均可复用。

**Tech Stack:** Docker Compose、TimescaleDB(PostgreSQL)、Redis、Go(Echo/GORM)、Next.js、PowerShell 脚本。

---

### Task 1: 修复前端容器构建缺口（阻塞项）

**Files:**
- Create: `frontend/Dockerfile.dev`
- Create: `frontend/Dockerfile.prod`
- Create: `frontend/src/app/health/route.ts`

**Steps:**
1. 增加 `Dockerfile.dev`：使用 `node:20-alpine` + corepack/pnpm，配合 compose 的卷挂载运行 `pnpm dev`。
2. 增加 `Dockerfile.prod`：多阶段构建（deps/build/runtime），运行 `pnpm start`，暴露 3000。
3. 增加前端健康检查路由 `/health`（返回 200 + JSON）。

**Verification:**
- `docker-compose -f docker-compose.dev.yml build frontend`
- `docker-compose -f docker-compose.prod.yml build frontend`

---

### Task 2: 修复后端/前端健康检查（避免容器长期 unhealthy）

**Files:**
- Modify: `docker-compose.dev.yml`
- Modify: `docker-compose.prod.yml`

**Steps:**
1. 将后端 healthcheck 从 `curl` 改为 `wget`（兼容 `golang:alpine` 与 `alpine` 运行时镜像）。
2. 将生产前端 healthcheck 从 `curl` 改为 `wget`，并指向新增的 `/health` 路由。
3. （可选）为开发前端补充 healthcheck，便于 `docker-compose ps` 观察状态。

**Verification:**
- `docker-compose -f docker-compose.dev.yml up -d backend frontend`
- `docker-compose -f docker-compose.dev.yml ps`

---

### Task 3: 数据库初始化脚本去硬编码（兼容生产默认库名/用户名）

**Files:**
- Modify: `database/database-init-complete.sql`

**Steps:**
1. 删除/替换脚本内对 `inspect_system_dev` / `inspect_dev` 的硬编码（如创建角色、GRANT、ALTER DATABASE）。
2. 使用 `current_database()` / `current_user` + `EXECUTE format(...)` 动态应用数据库级设置。
3. 将脚本末尾的状态输出改为动态值（避免误导）。

**Verification:**
- 首次启动 dev postgres：`docker-compose -f docker-compose.dev.yml up -d postgres`
- 查看 postgres 日志确认 initdb 脚本执行成功：`docker logs inspect-postgres-dev --tail 200`

---

### Task 4: 脚本与文档收口到“双 Compose”结构（消除旧引用）

**Files:**
- Modify: `scripts/development/dev-start.ps1`
- Modify: `scripts/development/diagnose.ps1`
- Modify: `scripts/testing/run-tests.ps1`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `discuss/development-environment-guide.md`
- (按需) Modify: `docs/datebase/database-container-setup-guide.md`

**Steps:**
1. `dev-start.ps1` 启动数据库仅依赖 `docker-compose.dev.yml`（不再要求 `docker-compose.yml`）。
2. `diagnose.ps1` 去掉对 `docker-compose.yml` 的强依赖检查。
3. 修正测试脚本中 `db-manage.ps1` 的调用路径，指向 `scripts/database/db-manage.ps1`。
4. 将文档/示例命令统一替换为：
   - 开发：`docker-compose -f docker-compose.dev.yml up -d`
   - 生产：`docker-compose -f docker-compose.prod.yml up -d`

**Verification:**
- `rg -n \"docker-compose\\.yml\" .` 仅允许出现在“迁移历史说明”或“已删除提示”语境中。

---

### Task 5: 实际部署与验收（以 dev postgres/redis 为先）

**Steps:**
1. 启动 dev 数据库：
   - `docker-compose -f docker-compose.dev.yml up -d postgres redis`
2. 验证：
   - `docker-compose -f docker-compose.dev.yml ps`
   - `docker exec inspect-postgres-dev pg_isready -U inspect_dev -d inspect_system_dev`
   - `docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping`
3. 再启动完整 dev：
   - `docker-compose -f docker-compose.dev.yml up -d`

