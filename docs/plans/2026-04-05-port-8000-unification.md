# 端口统一为 8000 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库内旧的默认后端端口统一调整为 `8000`，同步更新配置、代码、脚本、测试和文档。

**Architecture:** 本次变更仅调整默认端口与联调地址，不改变接口路径、服务职责或覆盖变量名称。保留 `SERVER_PORT`、`BACKEND_HOST_PORT`、`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_WS_URL` 的环境覆盖能力，同时确保默认值和文档说明一致。

**Tech Stack:** Go、React/Next.js、PowerShell、Docker Compose、Markdown 文档

---

### Task 1: 统一代码与配置中的默认端口

**Files:**
- Modify: `backend-go/internal/config/config.go`
- Modify: `backend-go/internal/app/app.go`
- Modify: `.env.example`
- Modify: `frontend/.env.example`
- Modify: `docker-compose.dev.yml`

**Step 1: 定位所有默认端口与回退端口常量**

运行：`rg -n "8000|SERVER_PORT|NEXT_PUBLIC_API_URL|NEXT_PUBLIC_WS_URL" backend-go .env.example frontend/.env.example docker-compose.dev.yml`

**Step 2: 将默认端口统一改为 8000**

修改 Go 配置默认值、回退起点、Docker 默认映射与前端默认联调地址。

**Step 3: 保留环境变量覆盖能力**

确认 `SERVER_PORT`、`BACKEND_HOST_PORT`、`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_WS_URL` 仍可覆盖默认值。

### Task 2: 统一脚本与测试中的后端地址

**Files:**
- Modify: `scripts/development/setup-dev-env.ps1`
- Modify: `scripts/development/dev-start.ps1`
- Modify: `tests/frontend/**`
- Modify: `frontend/src/lib/api-client.ts`
- Modify: `frontend/src/lib/websocket.ts`

**Step 1: 替换脚本中的默认后端访问地址**

将脚本输出、健康检查地址、建议配置统一为 `8000`。

**Step 2: 替换前端默认联调地址**

确保默认 API Origin 与 WS Origin 都指向 `127.0.0.1:8000`。

**Step 3: 更新测试中的默认地址常量**

保证前端测试中的 URL 断言与默认环境变量保持一致。

### Task 3: 同步文档并完成验证

**Files:**
- Modify: `README.md`
- Modify: `backend-go/README.md`
- Modify: `docs/**`
- Modify: `scripts/development/README.md`

**Step 1: 批量同步端口示例与说明**

将端口说明、健康检查示例、Docker 映射示例统一更新为 `8000`。

**Step 2: 保留非端口语义的旧数字示例**

不得修改手机号示例 `13800138000` 等非端口内容。

**Step 3: 执行验证检索**

运行：`rg -n --hidden "8000|旧端口" C:/Coder/Inspect`

预期：仅剩手机号或与端口无关的业务示例。
