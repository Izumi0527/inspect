# ===== 前端构建阶段 =====
FROM node:20-alpine AS frontend-builder

# 设置工作目录
WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package*.json ./
COPY frontend/pnpm-lock.yaml* ./

# 安装 pnpm 并安装依赖
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# 复制前端源码
COPY frontend/ ./

# 构建前端应用
RUN pnpm build

# ===== 后端基础镜像 =====
FROM python:3.11-slim AS backend-base

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 uv
RUN pip install uv

# 设置工作目录
WORKDIR /app

# 复制后端依赖文件
COPY backend/requirements.txt ./
COPY backend/pyproject.toml ./

# 使用 uv 安装 Python 依赖
RUN uv pip install --system -r requirements.txt

# ===== 生产环境镜像 =====
FROM backend-base AS production

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser appuser

# 复制后端源码
COPY backend/ ./
COPY --chown=appuser:appuser backend/ ./

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package.json ./frontend/package.json

# 创建必要的目录并设置权限
RUN mkdir -p logs data uploads && \
    chown -R appuser:appuser /app

# 切换到非 root 用户
USER appuser

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 启动命令
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ===== 开发环境镜像 =====
FROM backend-base AS development

# 安装开发依赖
RUN uv pip install --system pytest pytest-asyncio pytest-cov black isort mypy

# 复制全部源码
COPY backend/ ./
COPY frontend/ ./frontend/

# 设置开发环境权限
RUN chmod -R 755 /app

# 暴露端口（开发环境可能需要更多端口）
EXPOSE 8000 3000

# 开发环境启动命令
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--log-level", "debug"]