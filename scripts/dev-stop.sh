#!/bin/bash

# 网络设备巡检系统 - 开发环境停止脚本

set -e

echo "🛑 停止网络设备巡检系统开发环境..."

# 停止前端服务
stop_frontend() {
    echo "⚛️  停止前端服务..."
    
    if [ -f "logs/frontend.pid" ]; then
        FRONTEND_PID=$(cat logs/frontend.pid)
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
            kill $FRONTEND_PID
            echo "✅ 前端服务已停止 (PID: $FRONTEND_PID)"
        else
            echo "⚠️  前端服务进程不存在"
        fi
        rm -f logs/frontend.pid
    else
        echo "⚠️  前端服务PID文件不存在"
    fi
}

# 停止后端服务
stop_backend() {
    echo "🐍 停止后端服务..."
    
    if [ -f "logs/backend.pid" ]; then
        BACKEND_PID=$(cat logs/backend.pid)
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
            kill $BACKEND_PID
            echo "✅ 后端服务已停止 (PID: $BACKEND_PID)"
        else
            echo "⚠️  后端服务进程不存在"
        fi
        rm -f logs/backend.pid
    else
        echo "⚠️  后端服务PID文件不存在"
    fi
}

# 停止基础服务
stop_infrastructure() {
    echo "📦 停止基础服务..."
    
    # 停止 Docker 容器
    docker-compose down
    
    echo "✅ 基础服务已停止"
}

# 清理日志文件（可选）
cleanup_logs() {
    read -p "是否清理日志文件? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f logs/*.log
        echo "✅ 日志文件已清理"
    else
        echo "📝 日志文件保留"
    fi
}

# 显示停止状态
show_status() {
    echo ""
    echo "✅ 开发环境已完全停止"
    echo ""
    echo "🔄 重新启动: ./scripts/dev-start.sh"
    echo ""
}

# 主函数
main() {
    stop_frontend
    stop_backend
    stop_infrastructure
    cleanup_logs
    show_status
}

# 运行主函数
main "$@"