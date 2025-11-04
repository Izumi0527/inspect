#!/bin/bash

# 企业级网络设备巡检系统 - 开发环境启动脚本
# 启动完整的开发环境：数据库、缓存、后端、前端

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# 显示启动横幅
show_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║         🌐 企业级网络设备巡检系统 - 开发环境启动                    ║
║                                                                      ║
║   ⚡ FastAPI + Next.js + PostgreSQL + Redis + InfluxDB           ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# 检查必要的命令
check_dependencies() {
    log_step "检查系统依赖..."
    
    local deps=("docker" "docker-compose" "uv" "node" "pnpm")
    for dep in "${deps[@]}"; do
        if command -v "$dep" &> /dev/null; then
            log_success "$dep 已安装"
        else
            log_error "$dep 未安装，请先安装此依赖"
            exit 1
        fi
    done
}

# 创建必要的目录
create_directories() {
    log_step "创建必要的目录..."
    mkdir -p logs data
    log_success "目录创建完成"
}

# 检查环境配置文件
check_env_files() {
    log_step "检查环境配置文件..."
    
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            log_info "复制环境配置文件..."
            cp .env.example .env
            log_warning "请根据需要修改 .env 文件中的配置"
        else
            log_error ".env.example 文件不存在"
            exit 1
        fi
    else
        log_success "环境配置文件已存在"
    fi
}

# 启动基础设施服务（Docker容器）
start_infrastructure() {
    log_step "启动基础设施服务..."
    
    log_info "停止现有容器..."
    docker-compose -f docker-compose.dev.yml down --remove-orphans
    
    log_info "构建并启动Docker容器..."
    docker-compose -f docker-compose.dev.yml up -d
    
    log_info "等待服务启动完成..."
    sleep 10
    
    # 等待PostgreSQL就绪
    log_info "等待PostgreSQL数据库就绪..."
    local retries=30
    while ! docker exec inspect-postgres-dev pg_isready -U inspect_dev -d inspect_system_dev > /dev/null 2>&1; do
        if [[ $retries -eq 0 ]]; then
            log_error "PostgreSQL启动超时"
            exit 1
        fi
        echo -n "."
        sleep 2
        ((retries--))
    done
    log_success "PostgreSQL已就绪"
    
    # 等待Redis就绪
    log_info "等待Redis缓存服务就绪..."
    retries=15
    while ! docker exec inspect-redis-dev redis-cli -a dev_redis_2024 ping > /dev/null 2>&1; do
        if [[ $retries -eq 0 ]]; then
            log_error "Redis启动超时"
            exit 1
        fi
        echo -n "."
        sleep 2
        ((retries--))
    done
    log_success "Redis已就绪"
    
    # 等待InfluxDB就绪
    log_info "等待InfluxDB时序数据库就绪..."
    retries=20
    while ! docker exec inspect-influxdb-dev curl -f -H "Authorization: Token dev_token_2024" http://localhost:8086/health > /dev/null 2>&1; do
        if [[ $retries -eq 0 ]]; then
            log_error "InfluxDB启动超时"
            exit 1
        fi
        echo -n "."
        sleep 3
        ((retries--))
    done
    log_success "InfluxDB已就绪"
    
    log_success "所有基础设施服务启动完成！"
}

# 初始化后端
setup_backend() {
    log_step "设置后端环境..."
    
    cd backend
    
    # 检查Python虚拟环境
    if [[ ! -d ".venv" ]]; then
        log_info "创建Python虚拟环境..."
        uv venv
    fi
    
    # 激活虚拟环境并安装依赖
    log_info "安装后端依赖..."
    uv sync
    
    # 运行数据库迁移
    log_info "运行数据库迁移..."
    uv run alembic upgrade head
    
    log_success "后端环境设置完成"
    cd ..
}

# 启动后端服务
start_backend() {
    log_step "启动后端API服务..."
    
    cd backend
    
    # 检查是否已有后端服务在运行
    if [[ -f "../logs/backend.pid" ]]; then
        BACKEND_PID=$(cat ../logs/backend.pid)
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
            log_warning "后端服务已在运行 (PID: $BACKEND_PID)"
            cd ..
            return 0
        fi
    fi
    
    # 启动后端服务（后台模式）
    log_info "启动FastAPI服务器..."
    nohup uv run python start_backend.py > ../logs/backend.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../logs/backend.pid
    
    log_success "后端服务已启动 (PID: $BACKEND_PID)"
    
    # 等待后端服务就绪
    log_info "等待后端API服务就绪..."
    local retries=15
    while ! curl -f http://localhost:8001/health > /dev/null 2>&1; do
        if [[ $retries -eq 0 ]]; then
            log_error "后端API启动超时"
            exit 1
        fi
        echo -n "."
        sleep 2
        ((retries--))
    done
    log_success "后端API服务已就绪"
    
    cd ..
}

# 启动前端服务
start_frontend() {
    log_step "启动前端开发服务..."
    
    if [[ ! -d "frontend" ]]; then
        log_warning "前端目录不存在，跳过前端启动"
        return 0
    fi
    
    cd frontend
    
    # 检查是否已有前端服务在运行
    if [[ -f "../logs/frontend.pid" ]]; then
        FRONTEND_PID=$(cat ../logs/frontend.pid)
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
            log_warning "前端服务已在运行 (PID: $FRONTEND_PID)"
            cd ..
            return 0
        fi
    fi
    
    # 安装前端依赖
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        log_info "安装前端依赖..."
        pnpm install
    fi
    
    # 启动前端服务（后台模式）
    log_info "启动Next.js开发服务器..."
    nohup pnpm dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../logs/frontend.pid
    
    log_success "前端服务已启动 (PID: $FRONTEND_PID)"
    
    # 等待前端服务就绪
    log_info "等待前端服务就绪..."
    local retries=20
    while ! curl -f http://localhost:3000 > /dev/null 2>&1; do
        if [[ $retries -eq 0 ]]; then
            log_warning "前端服务启动可能需要更多时间"
            break
        fi
        echo -n "."
        sleep 3
        ((retries--))
    done
    
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        log_success "前端服务已就绪"
    fi
    
    cd ..
}

# 显示服务状态
show_status() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                        🎉 系统启动完成！                            ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║                                                                      ║${NC}"
    echo -e "${CYAN}║  📱 前端应用:     http://localhost:3000                             ║${NC}"
    echo -e "${CYAN}║  🚀 后端API:      http://localhost:8001                             ║${NC}"
    echo -e "${CYAN}║  📚 API文档:      http://localhost:8001/docs                        ║${NC}"
    echo -e "${CYAN}║  💓 健康检查:     http://localhost:8001/health                      ║${NC}"
    echo -e "${CYAN}║                                                                      ║${NC}"
    echo -e "${CYAN}║  🗄️  PostgreSQL:   localhost:5433                                   ║${NC}"
    echo -e "${CYAN}║  🗃️  Redis:        localhost:6380                                   ║${NC}"
    echo -e "${CYAN}║  📊 InfluxDB:     localhost:8087                                    ║${NC}"
    echo -e "${CYAN}║                                                                      ║${NC}"
    echo -e "${CYAN}║  📝 后端日志:     logs/backend.log                                  ║${NC}"
    echo -e "${CYAN}║  📝 前端日志:     logs/frontend.log                                 ║${NC}"
    echo -e "${CYAN}║                                                                      ║${NC}"
    echo -e "${CYAN}║  ⚠️  停止服务:     ./scripts/dev-stop.sh                           ║${NC}"
    echo -e "${CYAN}║                                                                      ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# 监控服务状态
monitor_services() {
    log_info "系统正在运行，按 Ctrl+C 退出监控..."
    
    while true; do
        sleep 30
        
        # 检查后端服务
        if [[ -f "logs/backend.pid" ]]; then
            BACKEND_PID=$(cat logs/backend.pid)
            if ! ps -p $BACKEND_PID > /dev/null 2>&1; then
                log_error "后端服务意外停止！"
                break
            fi
        fi
        
        # 检查前端服务
        if [[ -f "logs/frontend.pid" ]]; then
            FRONTEND_PID=$(cat logs/frontend.pid)
            if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
                log_warning "前端服务意外停止！"
            fi
        fi
        
        # 检查Docker容器
        if ! docker ps --format "{{.Names}}" | grep -q "inspect-postgres-dev"; then
            log_error "PostgreSQL容器意外停止！"
            break
        fi
    done
}

# 清理函数
cleanup() {
    echo ""
    log_info "正在停止开发环境..."
    ./scripts/dev-stop.sh
    exit 0
}

# 主函数
main() {
    # 捕获中断信号
    trap cleanup INT TERM
    
    show_banner
    
    check_dependencies
    create_directories
    check_env_files
    start_infrastructure
    setup_backend
    start_backend
    start_frontend
    show_status
    
    # 可选：监控服务状态
    read -p "是否启动服务监控？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        monitor_services
    else
        log_info "开发环境已启动完成！使用 ./scripts/dev-stop.sh 停止服务"
    fi
}

# 运行主函数
main "$@"