# Docker 镜像加速配置指南

## 问题描述

如果遇到 Docker 镜像拉取失败的错误：
```
failed to do request: Head "https://registry-1.docker.io/v2/library/python/manifests/3.11-slim": 
dialing registry-1.docker.io:443 container via direct connection because disabled has no HTTPS proxy
```

这是由于网络连接问题导致无法访问 Docker Hub，需要配置镜像加速器。

## Windows 环境配置

### 方法 1：Docker Desktop 图形界面配置

1. 打开 Docker Desktop
2. 点击右上角的齿轮图标（Settings）
3. 选择 "Docker Engine"
4. 在 JSON 配置中添加以下内容：

```json
{
  "registry-mirrors": [
    "https://dockerhub.azk8s.cn",
    "https://docker.mirrors.ustc.edu.cn",
    "https://reg-mirror.qiniu.com",
    "https://hub-mirror.c.163.com"
  ]
}
```

5. 点击 "Apply & restart"

### 方法 2：手动创建配置文件

在 Windows 上，创建或编辑文件：`C:\ProgramData\docker\config\daemon.json`

```json
{
  "registry-mirrors": [
    "https://dockerhub.azk8s.cn",
    "https://docker.mirrors.ustc.edu.cn", 
    "https://reg-mirror.qiniu.com",
    "https://hub-mirror.c.163.com"
  ],
  "experimental": false,
  "debug": true
}
```

重启 Docker Desktop 服务。

## 推荐镜像源

### 国内镜像源（推荐顺序）

1. **阿里云**: `https://dockerhub.azk8s.cn`
2. **中科大**: `https://docker.mirrors.ustc.edu.cn`
3. **七牛云**: `https://reg-mirror.qiniu.com`
4. **网易云**: `https://hub-mirror.c.163.com`
5. **腾讯云**: `https://mirror.ccs.tencentyun.com`

## 验证配置

配置完成后，运行以下命令验证：

```bash
# 检查 Docker 配置
docker info | findstr "Registry Mirrors"

# 测试拉取镜像
docker pull hello-world
```

## 替代解决方案

如果镜像加速器配置后仍有问题，可以：

### 1. 使用预构建镜像

编辑 `docker-compose.dev.yml`，使用国内镜像：

```yaml
services:
  backend-dev:
    image: python:3.11-slim  # 直接使用镜像而不是构建
    # build: 注释掉构建配置
    #   context: .
    #   dockerfile: Dockerfile
    #   target: development
```

### 2. 使用本地开发环境

跳过 Docker 构建，直接在本地运行：

```bash
# 启动数据库服务
docker-compose -f docker-compose.dev.yml up postgres-dev redis-dev influxdb-dev -d

# 本地运行后端
cd backend
python -m venv .venv
.\.venv\Scripts\activate  # Windows
pip install uv
uv pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001

# 本地运行前端
cd frontend
pnpm install
pnpm dev
```

## 故障排查

### 常见错误及解决方案

1. **权限问题**
   ```bash
   # 以管理员身份运行 PowerShell
   # 重启 Docker Desktop
   ```

2. **配置文件格式错误**
   - 检查 JSON 语法是否正确
   - 确保没有多余的逗号

3. **网络代理冲突**
   ```json
   {
     "registry-mirrors": ["..."],
     "proxies": {
       "default": {
         "httpProxy": "http://proxy.example.com:8080",
         "httpsProxy": "http://proxy.example.com:8080"
       }
     }
   }
   ```

## 测试命令

配置完成后运行项目构建测试：

```bash
# 清理缓存重新构建
docker system prune -f
docker-compose -f docker-compose.dev.yml build --no-cache

# 启动开发环境
./scripts/dev-start.sh
```

## 注意事项

1. 配置镜像加速器后，第一次拉取可能仍需要一些时间
2. 不同镜像源的稳定性可能有差异，建议配置多个备用源
3. 企业环境可能需要额外的代理配置
4. 定期更新镜像源列表，避免使用已停用的服务