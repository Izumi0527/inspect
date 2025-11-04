#!/bin/bash

# 企业级网络设备巡检系统 - 数据库健康检查脚本
# 用于检查PostgreSQL、Redis、InfluxDB三种数据库的健康状态

set -e

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

# 配置信息
POSTGRES_CONTAINER="inspect-postgres-dev"
POSTGRES_USER="inspect_dev"
POSTGRES_DB="inspect_system_dev"
POSTGRES_PORT="5433"

REDIS_CONTAINER="inspect-redis-dev"
REDIS_PASSWORD="dev_redis_2024"
REDIS_PORT="6380"

INFLUXDB_CONTAINER="inspect-influxdb-dev"
INFLUXDB_TOKEN="dev_token_2024"
INFLUXDB_URL="http://localhost:8087"

# 检查结果统计
total_checks=0
passed_checks=0
failed_checks=0

# 记录检查结果
record_check() {
    total_checks=$((total_checks + 1))
    if [ $1 -eq 0 ]; then
        passed_checks=$((passed_checks + 1))
        return 0
    else
        failed_checks=$((failed_checks + 1))
        return 1
    fi
}

# PostgreSQL 健康检查
check_postgresql() {
    log_info "检查 PostgreSQL 数据库..."
    
    # 检查容器是否运行
    if ! docker ps --format "table {{.Names}}" | grep -q "^${POSTGRES_CONTAINER}$"; then
        log_error "PostgreSQL 容器 ${POSTGRES_CONTAINER} 未运行"
        record_check 1
        return 1
    fi
    
    # 检查数据库连接
    if docker exec -it ${POSTGRES_CONTAINER} pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB} > /dev/null 2>&1; then
        log_success "PostgreSQL 连接正常"
        
        # 检查数据库版本
        DB_VERSION=$(docker exec -it ${POSTGRES_CONTAINER} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
        log_info "PostgreSQL 版本: ${DB_VERSION}"
        
        # 检查数据库大小
        DB_SIZE=$(docker exec -it ${POSTGRES_CONTAINER} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -t -c "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DB}'));" 2>/dev/null | xargs)
        log_info "数据库大小: ${DB_SIZE}"
        
        record_check 0
    else
        log_error "PostgreSQL 连接失败"
        record_check 1
    fi
    
    # 检查端口连通性
    if nc -z localhost ${POSTGRES_PORT} 2>/dev/null; then
        log_success "PostgreSQL 端口 ${POSTGRES_PORT} 可访问"
        record_check 0
    else
        log_error "PostgreSQL 端口 ${POSTGRES_PORT} 不可访问"
        record_check 1
    fi
}

# Redis 健康检查
check_redis() {
    log_info "检查 Redis 缓存数据库..."
    
    # 检查容器是否运行
    if ! docker ps --format "table {{.Names}}" | grep -q "^${REDIS_CONTAINER}$"; then
        log_error "Redis 容器 ${REDIS_CONTAINER} 未运行"
        record_check 1
        return 1
    fi
    
    # 检查Redis连接
    if docker exec -it ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} ping 2>/dev/null | grep -q "PONG"; then
        log_success "Redis 连接正常"
        
        # 检查Redis版本
        REDIS_VERSION=$(docker exec -it ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} INFO server 2>/dev/null | grep redis_version | cut -d: -f2 | tr -d '\r')
        log_info "Redis 版本: ${REDIS_VERSION}"
        
        # 检查内存使用情况
        REDIS_MEMORY=$(docker exec -it ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} INFO memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        log_info "Redis 内存使用: ${REDIS_MEMORY}"
        
        # 检查连接数
        REDIS_CONNECTIONS=$(docker exec -it ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} INFO clients 2>/dev/null | grep connected_clients | cut -d: -f2 | tr -d '\r')
        log_info "Redis 连接数: ${REDIS_CONNECTIONS}"
        
        record_check 0
    else
        log_error "Redis 连接失败"
        record_check 1
    fi
    
    # 检查端口连通性
    if nc -z localhost ${REDIS_PORT} 2>/dev/null; then
        log_success "Redis 端口 ${REDIS_PORT} 可访问"
        record_check 0
    else
        log_error "Redis 端口 ${REDIS_PORT} 不可访问"
        record_check 1
    fi
}

# InfluxDB 健康检查
check_influxdb() {
    log_info "检查 InfluxDB 时序数据库..."
    
    # 检查容器是否运行
    if ! docker ps --format "table {{.Names}}" | grep -q "^${INFLUXDB_CONTAINER}$"; then
        log_error "InfluxDB 容器 ${INFLUXDB_CONTAINER} 未运行"
        record_check 1
        return 1
    fi
    
    # 检查InfluxDB健康状态
    if curl -s -H "Authorization: Token ${INFLUXDB_TOKEN}" ${INFLUXDB_URL}/health > /dev/null 2>&1; then
        # 获取健康状态详情
        HEALTH_STATUS=$(curl -s -H "Authorization: Token ${INFLUXDB_TOKEN}" ${INFLUXDB_URL}/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        
        if [ "${HEALTH_STATUS}" = "pass" ]; then
            log_success "InfluxDB 健康检查通过"
            
            # 检查InfluxDB版本
            INFLUXDB_VERSION=$(curl -s -H "Authorization: Token ${INFLUXDB_TOKEN}" ${INFLUXDB_URL}/health | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            log_info "InfluxDB 版本: ${INFLUXDB_VERSION}"
            
            record_check 0
        else
            log_error "InfluxDB 健康检查失败，状态: ${HEALTH_STATUS}"
            record_check 1
        fi
    else
        log_error "InfluxDB 健康检查API无响应"
        record_check 1
    fi
    
    # 检查端口连通性  
    if nc -z localhost 8087 2>/dev/null; then
        log_success "InfluxDB 端口 8087 可访问"
        record_check 0
    else
        log_error "InfluxDB 端口 8087 不可访问"
        record_check 1
    fi
    
    # 检查存储桶
    if curl -s -H "Authorization: Token ${INFLUXDB_TOKEN}" "${INFLUXDB_URL}/api/v2/buckets" | grep -q "device_metrics_dev"; then
        log_success "InfluxDB 存储桶 device_metrics_dev 存在"
        record_check 0
    else
        log_warning "InfluxDB 存储桶 device_metrics_dev 不存在或无法访问"
        record_check 1
    fi
}

# 检查必要工具
check_dependencies() {
    log_info "检查必要工具..."
    
    # 检查 docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    # 检查 curl
    if ! command -v curl &> /dev/null; then
        log_error "curl 未安装"
        exit 1
    fi
    
    # 检查 nc (netcat)
    if ! command -v nc &> /dev/null; then
        log_warning "nc (netcat) 未安装，跳过端口检查"
    fi
}

# 显示检查结果汇总
show_summary() {
    echo ""
    log_info "====== 数据库健康检查汇总 ======"
    echo -e "总检查项: ${total_checks}"
    echo -e "通过: ${GREEN}${passed_checks}${NC}"
    echo -e "失败: ${RED}${failed_checks}${NC}"
    
    if [ ${failed_checks} -eq 0 ]; then
        log_success "所有数据库健康检查通过！"
        exit 0
    else
        log_error "存在 ${failed_checks} 项检查失败"
        exit 1
    fi
}

# 主函数
main() {
    echo "🏥 企业级网络设备巡检系统 - 数据库健康检查"
    echo "=================================================="
    
    check_dependencies
    
    echo ""
    check_postgresql
    echo ""
    check_redis
    echo ""
    check_influxdb
    
    show_summary
}

# 如果脚本被直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi