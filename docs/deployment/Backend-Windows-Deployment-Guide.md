# 后端Windows部署指南

## 概览

本文档提供企业级网络设备巡检系统后端在Windows环境下的全面部署指南。后端基于FastAPI、PostgreSQL、Redis和InfluxDB构建。

## 先决条件

### 系统要求

- **操作系统**: Windows 10/11专业版或Windows Server 2016+
- **内存**: 最低8GB，推荐16GB+
- **存储**: 最低50GB可用空间，推荐100GB+
- **CPU**: 最低4核心，推荐8核心+
- **网络**: 高速互联网连接

### 软件依赖

| 软件 | 版本 | 用途 |
|------|------|------|
| Python | 3.12+ | 后端运行时 |
| Docker Desktop | 24.0.0+ | 容器化平台 |
| Docker Compose | 2.0.0+ | 多容器编排 |
| Git | 2.40.0+ | 源代码管理 |
| uv | 最新版 | Python包管理器 |

## 安装指南

### 步骤1：安装Docker Desktop

1. **下载Windows版Docker Desktop**
   ```powershell
   # 访问 https://docs.docker.com/desktop/install/windows/
   # 下载 Docker Desktop Installer.exe
   ```

2. **安装Docker Desktop**
   ```powershell
   # 以管理员身份运行
   .\Docker\ Desktop\ Installer.exe install
   
   # 安装过程中启用WSL 2后端
   ```

3. **验证Docker安装**
   ```powershell
   docker --version
   docker-compose --version
   ```

### 步骤2：安装Python 3.12

1. **下载Python 3.12**
   ```powershell
   # 访问 https://www.python.org/downloads/windows/
   # 下载Python 3.12.x (64位)
   ```

2. **使用自定义选项安装Python**
   ```powershell
   # 安装过程中勾选：
   # - 添加Python到PATH
   # - 安装pip
   # - 为所有用户安装（如果是管理员）
   ```

3. **安装uv包管理器**
   ```powershell
   pip install uv
   ```

### 步骤3：克隆和设置项目

1. **克隆仓库**
   ```powershell
   git clone <repository-url>
   cd Inspect
   ```

2. **设置目录结构**
   ```powershell
   # 创建必要的目录
   New-Item -ItemType Directory -Path logs, data, config -Force
   New-Item -ItemType Directory -Path logs\backend, logs\frontend -Force
   New-Item -ItemType Directory -Path data\uploads, data\exports, data\backups -Force
   ```

## 配置

### 环境变量

1. **创建生产环境文件**
   ```powershell
   # 在项目根目录创建.env.prod文件
   Copy-Item .env.example .env.prod
   ```

2. **配置生产环境设置** (`.env.prod`)
   ```env
   # 应用程序设置
   APP_NAME=网络设备巡检系统
   VERSION=1.0.0
   DEBUG=false
   ENVIRONMENT=production
   
   # 服务器配置
   HOST=0.0.0.0
   PORT=8000
   ALLOWED_HOSTS=["yourdomain.com", "*.yourdomain.com"]
   
   # 数据库配置
   DATABASE_URL=postgresql+asyncpg://postgres:your_secure_password@localhost:5432/inspect_prod
   DATABASE_POOL_SIZE=20
   DATABASE_MAX_OVERFLOW=30
   
   # Redis配置
   REDIS_URL=redis://:your_redis_password@localhost:6379/0
   REDIS_CACHE_TTL=3600
   
   # InfluxDB配置
   INFLUXDB_URL=http://localhost:8086
   INFLUXDB_TOKEN=your_influxdb_token
   INFLUXDB_ORG=inspect-org
   INFLUXDB_BUCKET=device-metrics
   
   # 安全配置
   SECRET_KEY=your_super_secure_secret_key_change_this
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   REFRESH_TOKEN_EXPIRE_DAYS=7
   
   # Celery配置
   CELERY_BROKER_URL=redis://:your_redis_password@localhost:6379/1
   CELERY_RESULT_BACKEND=redis://:your_redis_password@localhost:6379/2
   
   # 日志配置
   LOG_LEVEL=INFO
   LOG_FORMAT=json
   LOG_FILE=logs/app.log
   
   # 邮件配置（可选）
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASSWORD=your_app_password
   SMTP_TLS=true
   ```

### 数据库配置

1. **PostgreSQL设置**
   ```powershell
   # 使用Docker运行PostgreSQL
   docker run -d `
     --name inspect-postgres `
     -e POSTGRES_DB=inspect_prod `
     -e POSTGRES_USER=postgres `
     -e POSTGRES_PASSWORD=your_secure_password `
     -p 5432:5432 `
     -v postgres_data:/var/lib/postgresql/data `
     postgres:16-alpine
   ```

2. **Redis设置**
   ```powershell
   # 使用Docker运行Redis
   docker run -d `
     --name inspect-redis `
     -p 6379:6379 `
     -v redis_data:/data `
     redis:7-alpine redis-server --appendonly yes --requirepass your_redis_password
   ```

3. **InfluxDB设置**
   ```powershell
   # 使用Docker运行InfluxDB
   docker run -d `
     --name inspect-influxdb `
     -p 8086:8086 `
     -e DOCKER_INFLUXDB_INIT_MODE=setup `
     -e DOCKER_INFLUXDB_INIT_USERNAME=admin `
     -e DOCKER_INFLUXDB_INIT_PASSWORD=your_influxdb_password `
     -e DOCKER_INFLUXDB_INIT_ORG=inspect-org `
     -e DOCKER_INFLUXDB_INIT_BUCKET=device-metrics `
     -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=your_influxdb_token `
     -v influxdb_data:/var/lib/influxdb2 `
     influxdb:2.7-alpine
   ```

## 部署选项

### 选项1：Docker部署（推荐）

1. **构建生产镜像**
   ```powershell
   # 构建后端镜像
   docker build -t inspect-backend:latest -f Dockerfile --target production .
   ```

2. **使用Docker Compose部署**
   ```powershell
   # 复制生产环境compose文件
   Copy-Item docker-compose.prod.yml docker-compose.yml
   
   # 启动生产环境服务
   docker-compose up -d
   ```

3. **验证部署**
   ```powershell
   # 检查服务状态
   docker-compose ps
   
   # 检查日志
   docker-compose logs backend
   
   # 测试API健康状态
   curl http://localhost:8000/health
   ```

### 选项2：Windows原生部署

1. **设置Python虚拟环境**
   ```powershell
   # 创建虚拟环境
   python -m venv .venv
   
   # 激活虚拟环境
   .venv\Scripts\Activate.ps1
   ```

2. **安装依赖**
   ```powershell
   # 进入后端目录
   cd backend
   
   # 使用uv安装依赖
   uv pip install -r requirements.txt
   ```

3. **数据库迁移**
   ```powershell
   # 运行数据库迁移
   alembic upgrade head
   ```

4. **启动后端服务**
   ```powershell
   # 启动主应用程序
   uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4
   
   # 在另一个终端中启动Celery工作进程
   celery -A src.workers worker --loglevel=info --pool=threads
   
   # 在另一个终端中启动Celery定时任务调度器
   celery -A src.workers beat --loglevel=info
   ```

### 选项3：Windows服务部署

1. **安装NSSM（Non-Sucking Service Manager）**
   ```powershell
   # 从 https://nssm.cc/download 下载
   # 解压到 C:\nssm\
   ```

2. **创建后端服务**
   ```powershell
   # 为主应用创建服务
   C:\nssm\nssm.exe install InspectBackend C:\Python312\Scripts\uvicorn.exe
   C:\nssm\nssm.exe set InspectBackend Parameters "src.main:app --host 0.0.0.0 --port 8000"
   C:\nssm\nssm.exe set InspectBackend AppDirectory "C:\Inspect\backend"
   C:\nssm\nssm.exe set InspectBackend DisplayName "Inspect系统后端"
   C:\nssm\nssm.exe set InspectBackend Description "企业级网络设备巡检系统后端API"
   
   # 为Celery工作进程创建服务
   C:\nssm\nssm.exe install InspectWorker C:\Python312\Scripts\celery.exe
   C:\nssm\nssm.exe set InspectWorker Parameters "-A src.workers worker --loglevel=info"
   C:\nssm\nssm.exe set InspectWorker AppDirectory "C:\Inspect\backend"
   C:\nssm\nssm.exe set InspectWorker DisplayName "Inspect系统工作进程"
   
   # 启动服务
   net start InspectBackend
   net start InspectWorker
   ```

## 安全配置

### 防火墙设置

```powershell
# 允许后端端口通过Windows防火墙
New-NetFirewallRule -DisplayName "Inspect后端API" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
New-NetFirewallRule -DisplayName "PostgreSQL" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow
New-NetFirewallRule -DisplayName "Redis" -Direction Inbound -Protocol TCP -LocalPort 6379 -Action Allow
New-NetFirewallRule -DisplayName "InfluxDB" -Direction Inbound -Protocol TCP -LocalPort 8086 -Action Allow
```

### SSL/TLS配置

1. **生成SSL证书**
   ```powershell
   # 使用Windows版OpenSSL或Let's Encrypt
   # 将证书放置在ssl/目录下
   ```

2. **配置反向代理（Nginx）**
   ```powershell
   # 安装Windows版Nginx
   # 配置SSL终端
   # 代理请求到后端
   ```

## 性能优化

### 数据库优化

1. **PostgreSQL配置**
   ```sql
   -- 优化PostgreSQL设置
   ALTER SYSTEM SET shared_buffers = '2GB';
   ALTER SYSTEM SET effective_cache_size = '6GB';
   ALTER SYSTEM SET maintenance_work_mem = '512MB';
   ALTER SYSTEM SET checkpoint_completion_target = 0.9;
   SELECT pg_reload_conf();
   ```

2. **数据库索引**
   ```sql
   -- 添加性能索引
   CREATE INDEX CONCURRENTLY idx_devices_status ON devices(status);
   CREATE INDEX CONCURRENTLY idx_inspections_created_at ON inspections(created_at);
   CREATE INDEX CONCURRENTLY idx_alerts_severity ON alerts(severity);
   ```

### 应用性能

1. **工作进程配置**
   ```env
   # 根据CPU核心数优化工作进程
   # 公式：(2 x CPU核心数) + 1
   WORKERS=9  # 适用于4核CPU
   ```

2. **内存设置**
   ```env
   # 优化数据库连接池
   DATABASE_POOL_SIZE=20
   DATABASE_MAX_OVERFLOW=30
   
   # 优化Redis缓存
   REDIS_CACHE_TTL=3600
   ```

## 监控和日志

### 日志管理

1. **配置日志轮转**
   ```powershell
   # 创建日志轮转脚本
   $logrotate = @"
   Get-ChildItem "C:\Inspect\logs\*.log" | 
   Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | 
   ForEach-Object {
       Compress-Archive -Path $_.FullName -DestinationPath "$($_.DirectoryName)\archive\$($_.BaseName)_$(Get-Date -Format 'yyyyMMdd').zip"
       Remove-Item $_.FullName
   }
   "@
   
   # 保存为log-rotate.ps1并使用任务计划程序调度
   ```

2. **性能监控**
   ```powershell
   # 监控系统资源
   Get-Process | Where-Object {$_.ProcessName -like "*python*"}
   Get-Counter "\Processor(_Total)\% Processor Time"
   Get-Counter "\Memory\Available MBytes"
   ```

### 健康检查

1. **自动健康监控**
   ```powershell
   # 创建健康检查脚本
   $healthCheck = @"
   $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method GET
   if ($response.status -eq "healthy") {
       Write-Host "后端运行正常" -ForegroundColor Green
   } else {
       Write-Host "后端异常" -ForegroundColor Red
       # 在此处添加告警逻辑
   }
   "@
   
   # 使用任务计划程序每5分钟执行一次
   ```

## 备份和恢复

### 数据库备份

1. **自动PostgreSQL备份**
   ```powershell
   # 创建备份脚本
   $backupScript = @"
   $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
   $backupPath = "C:\Inspect\data\backups\postgres_backup_$timestamp.sql"
   
   docker exec inspect-postgres pg_dump -U postgres inspect_prod > $backupPath
   
   # 压缩备份
   Compress-Archive -Path $backupPath -DestinationPath "$backupPath.zip"
   Remove-Item $backupPath
   
   # 清理旧备份（保留最近30天）
   Get-ChildItem "C:\Inspect\data\backups\" -Filter "*.zip" | 
   Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | 
   Remove-Item
   "@
   
   # 每天凌晨2点执行
   ```

### 应用状态备份

```powershell
# 备份配置和日志
$configBackup = @"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\Inspect\data\backups\config_$timestamp"

New-Item -ItemType Directory -Path $backupDir -Force
Copy-Item ".env.prod" "$backupDir\"
Copy-Item "logs\*" "$backupDir\logs\" -Recurse
Copy-Item "data\uploads\*" "$backupDir\uploads\" -Recurse

Compress-Archive -Path $backupDir -DestinationPath "$backupDir.zip"
Remove-Item $backupDir -Recurse
"@
```

## 故障排除

### 常见问题

1. **端口已被占用**
   ```powershell
   # 查找占用端口8000的进程
   netstat -ano | findstr :8000
   
   # 终止进程
   taskkill /PID <process_id> /F
   ```

2. **数据库连接问题**
   ```powershell
   # 测试数据库连接
   docker exec inspect-postgres psql -U postgres -d inspect_prod -c "SELECT version();"
   
   # 检查数据库日志
   docker logs inspect-postgres
   ```

3. **内存问题**
   ```powershell
   # 监控内存使用情况
   Get-Process python | Sort-Object WorkingSet -Descending
   
   # 在.env.prod中优化内存设置
   ```

### 日志分析

```powershell
# 检查应用日志
Get-Content "C:\Inspect\logs\app.log" -Tail 100

# 过滤错误日志
Get-Content "C:\Inspect\logs\app.log" | Select-String "ERROR"

# 监控实时日志
Get-Content "C:\Inspect\logs\app.log" -Wait -Tail 50
```

## 生产环境检查清单

### 部署前

- [ ] 系统要求已验证
- [ ] 所有依赖已安装
- [ ] 环境变量已配置
- [ ] 数据库设置已完成
- [ ] SSL证书已配置
- [ ] 防火墙规则已应用
- [ ] 备份程序已测试

### 部署后

- [ ] 健康检查通过
- [ ] API端点响应正常
- [ ] 数据库连接正常
- [ ] 缓存功能正常
- [ ] 日志正常生成
- [ ] 监控告警已配置
- [ ] 备份计划已激活
- [ ] 性能基准达标

## 维护

### 常规维护任务

1. **每日**
   - 检查健康端点
   - 监控错误日志
   - 验证备份完成情况

2. **每周**
   - 审查性能指标
   - 更新依赖（安全补丁）
   - 清理临时文件

3. **每月**
   - 数据库维护（VACUUM, ANALYZE）
   - 日志归档和清理
   - 安全更新
   - 容量规划审查

### 更新程序

```powershell
# 更新应用程序
git pull origin main
docker-compose pull
docker-compose up -d --force-recreate

# 更新依赖
cd backend
uv pip install -r requirements.txt --upgrade

# 运行数据库迁移
alembic upgrade head
```

## 支持和资源

- **文档**: `/docs/api/` 查看API文档
- **日志**: 查看 `/logs/` 目录的应用日志
- **健康检查**: `http://localhost:8000/health`
- **API文档**: `http://localhost:8000/docs`
- **监控**: 设置Prometheus/Grafana进行高级监控

---

**注意**: 本部署指南适用于生产环境。开发环境部署请使用 `/scripts/` 目录下提供的开发脚本。