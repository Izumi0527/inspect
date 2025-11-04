#!/bin/bash

# 企业级网络设备巡检系统 - 生产环境部署脚本

set -e

echo "🚀 开始部署企业级网络设备巡检系统到生产环境..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查系统要求
check_requirements() {
    log_info "检查系统要求..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    # 检查磁盘空间（至少需要 10GB）
    available_space=$(df / | awk 'NR==2 {print $4}')
    required_space=10485760  # 10GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        log_warning "磁盘空间不足，建议至少预留 10GB 空间"
    fi
    
    # 检查内存（至少需要 4GB）
    available_memory=$(free -m | awk 'NR==2{print $7}')
    if [ "$available_memory" -lt 4096 ]; then
        log_warning "可用内存不足，建议至少 4GB 内存"
    fi
    
    log_success "系统要求检查完成"
}

# 创建生产环境配置
create_production_config() {
    log_info "创建生产环境配置..."
    
    # 创建 .env.prod 文件
    if [ ! -f ".env.prod" ]; then
        cat > .env.prod << EOL
# 生产环境配置
NODE_ENV=production
ENVIRONMENT=production

# 安全密钥（生产环境需要修改）
SECRET_KEY=change_this_secret_key_in_production_$(date +%s)
JWT_SECRET_KEY=change_this_jwt_secret_$(date +%s)

# 数据库配置
POSTGRES_DB=inspect_system_prod
POSTGRES_USER=inspect_prod
POSTGRES_PASSWORD=change_this_password_$(date +%s)
DATABASE_URL=postgresql://inspect_prod:change_this_password_$(date +%s)@postgres:5432/inspect_system_prod

# Redis 配置
REDIS_PASSWORD=change_this_redis_password_$(date +%s)
REDIS_URL=redis://:change_this_redis_password_$(date +%s)@redis:6379/0

# InfluxDB 配置
INFLUXDB_ADMIN_PASSWORD=change_this_influx_password_$(date +%s)
INFLUXDB_TOKEN=change_this_influx_token_$(date +%s)
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_ORG=inspect_prod
INFLUXDB_BUCKET=device_metrics_prod

# 应用配置
DEBUG=false
LOG_LEVEL=info
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# SSL 配置
SSL_CERT_PATH=/etc/ssl/certs/inspect.crt
SSL_KEY_PATH=/etc/ssl/private/inspect.key

# 监控配置
ENABLE_METRICS=true
METRICS_PORT=9090

# 邮件配置（告警通知）
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=alerts@yourdomain.com
SMTP_PASSWORD=change_this_email_password
SMTP_FROM=alerts@yourdomain.com
EOL
        log_warning "已创建 .env.prod 文件，请修改其中的密码和配置！"
        log_warning "生产环境部署前必须修改所有默认密码！"
    else
        log_info "生产环境配置文件已存在"
    fi
}

# 创建目录结构
create_directories() {
    log_info "创建生产环境目录结构..."
    
    # 创建数据目录
    mkdir -p data/{postgres,redis,influxdb}
    mkdir -p logs/{nginx,backend,monitoring}
    mkdir -p backups/{database,logs,config}
    mkdir -p ssl/{certs,private}
    mkdir -p config/{nginx,monitoring}
    
    # 设置目录权限
    chmod 755 data logs backups config
    chmod 700 ssl/private
    chmod 755 ssl/certs
    
    log_success "目录结构创建完成"
}

# 构建生产镜像
build_production_images() {
    log_info "构建生产环境 Docker 镜像..."
    
    # 构建应用镜像
    docker build -f Dockerfile --target production -t inspect-system:latest .
    
    log_success "生产镜像构建完成"
}

# 备份现有数据
backup_existing_data() {
    log_info "备份现有数据..."
    
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    
    # 备份数据库
    if docker ps | grep -q inspect-postgres; then
        docker exec inspect-postgres pg_dump -U inspect_prod inspect_system_prod > $BACKUP_DIR/database.sql
        log_success "数据库备份完成: $BACKUP_DIR/database.sql"
    else
        log_info "PostgreSQL容器未运行，跳过数据库备份"
    fi
    
    # 备份配置文件
    cp .env.prod $BACKUP_DIR/ 2>/dev/null || log_warning "配置文件备份失败"
    
    log_success "数据备份完成: $BACKUP_DIR"
}

# 部署应用
deploy_application() {
    log_info "部署应用服务..."
    
    # 停止现有服务
    docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
    
    # 启动所有服务
    docker-compose -f docker-compose.prod.yml up -d
    
    # 等待服务启动
    sleep 30
    
    # 检查服务状态
    docker-compose -f docker-compose.prod.yml ps
    
    log_success "应用服务部署完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    # 检查后端 API
    max_attempts=30
    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f http://localhost:8000/health > /dev/null 2>&1; then
            log_success "后端 API 健康检查通过"
            break
        fi
        attempt=$((attempt + 1))
        log_info "等待后端服务启动... ($attempt/$max_attempts)"
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_error "后端服务健康检查失败"
        return 1
    fi
    
    # 检查数据库连接
    if docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready -U inspect_prod > /dev/null 2>&1; then
        log_success "数据库连接检查通过"
    else
        log_error "数据库连接检查失败"
        return 1
    fi
    
    log_success "所有健康检查通过"
}

# 设置监控和日志
setup_monitoring() {
    log_info "设置监控和日志..."
    
    # 设置日志轮转
    cat > /tmp/inspect-system-logrotate << EOL
$PWD/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    create 644 $(whoami) $(whoami)
    postrotate
        docker-compose -f docker-compose.prod.yml restart nginx 2>/dev/null || true
    endscript
}
EOL
    
    # 移动到系统日志轮转目录（需要 root 权限）
    if [ -w "/etc/logrotate.d" ]; then
        sudo mv /tmp/inspect-system-logrotate /etc/logrotate.d/inspect-system
        log_success "日志轮转设置完成"
    else
        log_warning "无法设置系统日志轮转，请手动配置"
    fi
    
    log_success "监控和日志设置完成"
}

# 显示部署信息
show_deployment_info() {
    echo ""
    log_success "🎉 生产环境部署完成！"
    echo ""
    echo "📊 服务访问地址："
    echo "  🌐 主应用: http://localhost"
    echo "  📊 API文档: http://localhost/api/docs"
    echo "  🔧 Portainer: http://localhost:9000"
    echo "  🗄️  PgAdmin: http://localhost:5050"
    echo ""
    echo "🔧 管理命令："
    echo "  查看日志: docker-compose -f docker-compose.prod.yml logs -f [service]"
    echo "  重启服务: docker-compose -f docker-compose.prod.yml restart [service]"
    echo "  停止服务: docker-compose -f docker-compose.prod.yml down"
    echo "  备份数据: ./scripts/backup.sh"
    echo ""
    echo "📁 重要文件："
    echo "  配置文件: .env.prod"
    echo "  日志目录: logs/"
    echo "  备份目录: backups/"
    echo ""
    log_warning "⚠️  重要提醒："
    log_warning "1. 请修改 .env.prod 中的所有默认密码"
    log_warning "2. 生产环境建议使用真实的 SSL 证书"
    log_warning "3. 定期执行数据备份"
    log_warning "4. 监控系统资源使用情况"
    echo ""
}

# 主函数
main() {
    case "$1" in
        --check-only)
            check_requirements
            ;;
        --build-only)
            check_requirements
            create_production_config
            create_directories
            build_production_images
            ;;
        --deploy-only)
            deploy_application
            health_check
            ;;
        *)
            check_requirements
            create_production_config
            create_directories
            build_production_images
            backup_existing_data
            deploy_application
            health_check
            setup_monitoring
            show_deployment_info
            ;;
    esac
}

# 运行主函数
main "$@"