#!/bin/bash

# 企业级网络设备巡检系统 - 数据库备份脚本
# 支持PostgreSQL、Redis、InfluxDB三种数据库的备份

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
POSTGRES_PASSWORD="dev_password_2024"

REDIS_CONTAINER="inspect-redis-dev"
REDIS_PASSWORD="dev_redis_2024"

INFLUXDB_CONTAINER="inspect-influxdb-dev"
INFLUXDB_TOKEN="dev_token_2024"
INFLUXDB_ORG="inspect_dev"
INFLUXDB_BUCKET="device_metrics_dev"
INFLUXDB_URL="http://localhost:8087"

# 备份目录配置
BACKUP_ROOT="./backups"
POSTGRES_BACKUP_DIR="${BACKUP_ROOT}/postgres"
REDIS_BACKUP_DIR="${BACKUP_ROOT}/redis"
INFLUXDB_BACKUP_DIR="${BACKUP_ROOT}/influxdb"

# 时间戳
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_DIR=$(date +"%Y%m%d")

# 创建备份目录
create_backup_dirs() {
    log_info "创建备份目录..."
    mkdir -p "${POSTGRES_BACKUP_DIR}/${DATE_DIR}"
    mkdir -p "${REDIS_BACKUP_DIR}/${DATE_DIR}"
    mkdir -p "${INFLUXDB_BACKUP_DIR}/${DATE_DIR}"
    log_success "备份目录创建完成"
}

# PostgreSQL 备份
backup_postgresql() {
    log_info "开始备份 PostgreSQL 数据库..."
    
    # 检查容器是否运行
    if ! docker ps --format "table {{.Names}}" | grep -q "^${POSTGRES_CONTAINER}$"; then
        log_error "PostgreSQL 容器 ${POSTGRES_CONTAINER} 未运行"
        return 1
    fi
    
    local backup_file="${POSTGRES_BACKUP_DIR}/${DATE_DIR}/inspect_db_backup_${TIMESTAMP}.sql"
    local backup_custom="${POSTGRES_BACKUP_DIR}/${DATE_DIR}/inspect_db_backup_${TIMESTAMP}.custom"
    
    # SQL格式备份 (便于查看和恢复)
    log_info "创建 SQL 格式备份..."
    if docker exec ${POSTGRES_CONTAINER} pg_dump \
        -U ${POSTGRES_USER} \
        -d ${POSTGRES_DB} \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges > "${backup_file}"; then
        
        # 压缩SQL备份文件
        gzip "${backup_file}"
        log_success "PostgreSQL SQL 备份完成: ${backup_file}.gz"
    else
        log_error "PostgreSQL SQL 备份失败"
        return 1
    fi
    
    # Custom格式备份 (更快的恢复)
    log_info "创建 Custom 格式备份..."
    if docker exec ${POSTGRES_CONTAINER} pg_dump \
        -U ${POSTGRES_USER} \
        -d ${POSTGRES_DB} \
        -Fc \
        --no-owner \
        --no-privileges > "${backup_custom}"; then
        
        log_success "PostgreSQL Custom 备份完成: ${backup_custom}"
    else
        log_error "PostgreSQL Custom 备份失败"
        return 1
    fi
    
    # 显示备份文件大小
    if [ -f "${backup_file}.gz" ]; then
        local size=$(du -h "${backup_file}.gz" | cut -f1)
        log_info "SQL 备份文件大小: ${size}"
    fi
    
    if [ -f "${backup_custom}" ]; then
        local size=$(du -h "${backup_custom}" | cut -f1)
        log_info "Custom 备份文件大小: ${size}"
    fi
    
    return 0
}

# Redis 备份
backup_redis() {
    log_info "开始备份 Redis 数据库..."
    
    # 检查容器是否运行
    if ! docker ps --format "table {{.Names}}" | grep -q "^${REDIS_CONTAINER}$"; then
        log_error "Redis 容器 ${REDIS_CONTAINER} 未运行"
        return 1
    fi
    
    local backup_file="${REDIS_BACKUP_DIR}/${DATE_DIR}/redis_dump_${TIMESTAMP}.rdb"
    
    # 触发后台保存
    log_info "触发 Redis BGSAVE..."
    if docker exec ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} BGSAVE > /dev/null 2>&1; then
        log_info "BGSAVE 已触发，等待完成..."
        
        # 等待BGSAVE完成
        while true; do
            local save_status=$(docker exec ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} LASTSAVE 2>/dev/null)
            sleep 2
            local new_save_status=$(docker exec ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} LASTSAVE 2>/dev/null)
            
            if [ "${save_status}" != "${new_save_status}" ]; then
                break
            fi
            
            log_info "等待 BGSAVE 完成..."
            sleep 3
        done
        
        # 复制RDB文件
        if docker cp ${REDIS_CONTAINER}:/data/dump.rdb "${backup_file}"; then
            # 压缩RDB文件
            gzip "${backup_file}"
            log_success "Redis 备份完成: ${backup_file}.gz"
            
            local size=$(du -h "${backup_file}.gz" | cut -f1)
            log_info "Redis 备份文件大小: ${size}"
        else
            log_error "复制 Redis RDB 文件失败"
            return 1
        fi
    else
        log_error "Redis BGSAVE 失败"
        return 1
    fi
    
    # 备份Redis配置信息
    local config_file="${REDIS_BACKUP_DIR}/${DATE_DIR}/redis_config_${TIMESTAMP}.txt"
    if docker exec ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASSWORD} CONFIG GET "*" > "${config_file}"; then
        log_success "Redis 配置备份完成: ${config_file}"
    fi
    
    return 0
}

# InfluxDB 备份
backup_influxdb() {
    log_info "开始备份 InfluxDB 数据库..."
    
    # 检查容器是否运行
    if ! docker ps --format "table {{.Names}}" | grep -q "^${INFLUXDB_CONTAINER}$"; then
        log_error "InfluxDB 容器 ${INFLUXDB_CONTAINER} 未运行"
        return 1
    fi
    
    local backup_dir="${INFLUXDB_BACKUP_DIR}/${DATE_DIR}/influxdb_backup_${TIMESTAMP}"
    mkdir -p "${backup_dir}"
    
    # 使用InfluxDB CLI备份
    log_info "使用 influx CLI 备份数据..."
    if docker exec ${INFLUXDB_CONTAINER} influx backup \
        --host http://localhost:8086 \
        --token ${INFLUXDB_TOKEN} \
        --org ${INFLUXDB_ORG} \
        --bucket ${INFLUXDB_BUCKET} \
        "/tmp/backup_${TIMESTAMP}"; then
        
        # 从容器复制备份文件
        if docker cp ${INFLUXDB_CONTAINER}:/tmp/backup_${TIMESTAMP} "${backup_dir}"; then
            log_success "InfluxDB 备份完成: ${backup_dir}"
            
            # 压缩备份目录
            tar -czf "${backup_dir}.tar.gz" -C "${INFLUXDB_BACKUP_DIR}/${DATE_DIR}" "influxdb_backup_${TIMESTAMP}"
            rm -rf "${backup_dir}"
            
            local size=$(du -h "${backup_dir}.tar.gz" | cut -f1)
            log_info "InfluxDB 压缩备份大小: ${size}"
        else
            log_error "从容器复制 InfluxDB 备份失败"
            return 1
        fi
        
        # 清理容器内临时文件
        docker exec ${INFLUXDB_CONTAINER} rm -rf /tmp/backup_${TIMESTAMP} || true
    else
        log_error "InfluxDB 备份失败"
        return 1
    fi
    
    # 备份InfluxDB配置
    local config_file="${INFLUXDB_BACKUP_DIR}/${DATE_DIR}/influxdb_config_${TIMESTAMP}.json"
    if curl -s -H "Authorization: Token ${INFLUXDB_TOKEN}" "${INFLUXDB_URL}/api/v2/config" > "${config_file}"; then
        log_success "InfluxDB 配置备份完成: ${config_file}"
    fi
    
    return 0
}

# 清理旧备份
cleanup_old_backups() {
    local retention_days=${1:-7}
    
    log_info "清理 ${retention_days} 天前的备份文件..."
    
    # 清理PostgreSQL旧备份
    find "${POSTGRES_BACKUP_DIR}" -type f -name "*.gz" -mtime +${retention_days} -delete 2>/dev/null || true
    find "${POSTGRES_BACKUP_DIR}" -type f -name "*.custom" -mtime +${retention_days} -delete 2>/dev/null || true
    
    # 清理Redis旧备份
    find "${REDIS_BACKUP_DIR}" -type f -name "*.gz" -mtime +${retention_days} -delete 2>/dev/null || true
    find "${REDIS_BACKUP_DIR}" -type f -name "*.txt" -mtime +${retention_days} -delete 2>/dev/null || true
    
    # 清理InfluxDB旧备份
    find "${INFLUXDB_BACKUP_DIR}" -type f -name "*.tar.gz" -mtime +${retention_days} -delete 2>/dev/null || true
    find "${INFLUXDB_BACKUP_DIR}" -type f -name "*.json" -mtime +${retention_days} -delete 2>/dev/null || true
    
    # 清理空目录
    find "${BACKUP_ROOT}" -type d -empty -delete 2>/dev/null || true
    
    log_success "旧备份清理完成"
}

# 显示备份统计
show_backup_summary() {
    log_info "====== 备份统计 ======"
    
    if [ -d "${POSTGRES_BACKUP_DIR}/${DATE_DIR}" ]; then
        local pg_count=$(find "${POSTGRES_BACKUP_DIR}/${DATE_DIR}" -name "*${TIMESTAMP}*" | wc -l)
        echo "PostgreSQL 备份文件: ${pg_count}"
    fi
    
    if [ -d "${REDIS_BACKUP_DIR}/${DATE_DIR}" ]; then
        local redis_count=$(find "${REDIS_BACKUP_DIR}/${DATE_DIR}" -name "*${TIMESTAMP}*" | wc -l)
        echo "Redis 备份文件: ${redis_count}"
    fi
    
    if [ -d "${INFLUXDB_BACKUP_DIR}/${DATE_DIR}" ]; then
        local influx_count=$(find "${INFLUXDB_BACKUP_DIR}/${DATE_DIR}" -name "*${TIMESTAMP}*" | wc -l)
        echo "InfluxDB 备份文件: ${influx_count}"
    fi
    
    # 显示备份目录总大小
    if [ -d "${BACKUP_ROOT}" ]; then
        local total_size=$(du -sh "${BACKUP_ROOT}" 2>/dev/null | cut -f1)
        echo "备份总大小: ${total_size}"
    fi
}

# 显示使用帮助
show_help() {
    echo "企业级网络设备巡检系统 - 数据库备份脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --postgresql, -p    只备份 PostgreSQL"
    echo "  --redis, -r         只备份 Redis"
    echo "  --influxdb, -i      只备份 InfluxDB"
    echo "  --cleanup <天数>    清理指定天数前的备份 (默认7天)"
    echo "  --help, -h          显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                  # 备份所有数据库"
    echo "  $0 -p               # 只备份PostgreSQL"
    echo "  $0 --cleanup 30     # 清理30天前的备份"
    echo ""
}

# 主函数
main() {
    local backup_postgres=true
    local backup_redis=true
    local backup_influxdb=true
    local cleanup_days=""
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --postgresql|-p)
                backup_postgres=true
                backup_redis=false
                backup_influxdb=false
                shift
                ;;
            --redis|-r)
                backup_postgres=false
                backup_redis=true
                backup_influxdb=false
                shift
                ;;
            --influxdb|-i)
                backup_postgres=false
                backup_redis=false
                backup_influxdb=true
                shift
                ;;
            --cleanup)
                cleanup_days="$2"
                shift 2
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    echo "🗄️  企业级网络设备巡检系统 - 数据库备份"
    echo "=============================================="
    echo "备份时间: $(date)"
    echo ""
    
    # 创建备份目录
    create_backup_dirs
    
    local backup_success=true
    
    # 执行备份
    if [ "$backup_postgres" = true ]; then
        if ! backup_postgresql; then
            backup_success=false
        fi
        echo ""
    fi
    
    if [ "$backup_redis" = true ]; then
        if ! backup_redis; then
            backup_success=false
        fi
        echo ""
    fi
    
    if [ "$backup_influxdb" = true ]; then
        if ! backup_influxdb; then
            backup_success=false
        fi
        echo ""
    fi
    
    # 清理旧备份
    if [ -n "$cleanup_days" ]; then
        cleanup_old_backups "$cleanup_days"
        echo ""
    fi
    
    # 显示备份统计
    show_backup_summary
    
    if [ "$backup_success" = true ]; then
        log_success "所有数据库备份完成！"
        exit 0
    else
        log_error "部分数据库备份失败"
        exit 1
    fi
}

# 检查必要工具
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    if ! command -v gzip &> /dev/null; then
        log_error "gzip 未安装"
        exit 1
    fi
    
    if ! command -v tar &> /dev/null; then
        log_error "tar 未安装"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl 未安装"
        exit 1
    fi
}

# 如果脚本被直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies
    main "$@"
fi