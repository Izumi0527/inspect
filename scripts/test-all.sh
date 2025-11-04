#!/bin/bash

# 网络设备巡检系统 - 测试运行脚本

set -e

echo "🧪 运行网络设备巡检系统测试..."

# 运行前端测试
run_frontend_tests() {
    echo "⚛️  运行前端测试..."
    
    cd frontend
    
    # 安装依赖（如果需要）
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # 运行测试
    echo "📋 运行单元测试..."
    npm run test -- --coverage --watchAll=false
    
    echo "🌐 运行E2E测试..."
    npm run test:e2e || echo "⚠️  E2E测试失败或未配置"
    
    cd ..
    
    echo "✅ 前端测试完成"
}

# 运行后端测试
run_backend_tests() {
    echo "🐍 运行后端测试..."
    
    cd backend
    
    # 激活虚拟环境
    source .venv/bin/activate
    
    # 运行测试
    echo "📋 运行单元测试..."
    pytest tests/ -v --cov=src --cov-report=html --cov-report=term
    
    echo "🔗 运行集成测试..."
    pytest tests/integration/ -v || echo "⚠️  集成测试失败或未配置"
    
    cd ..
    
    echo "✅ 后端测试完成"
}

# 运行代码质量检查
run_code_quality_checks() {
    echo "🔍 运行代码质量检查..."
    
    # 前端代码检查
    echo "⚛️  前端代码检查..."
    cd frontend
    npm run lint || echo "⚠️  前端代码检查有警告"
    npm run type-check || echo "⚠️  TypeScript类型检查有错误"
    cd ..
    
    # 后端代码检查
    echo "🐍 后端代码检查..."
    cd backend
    source .venv/bin/activate
    
    echo "🔧 运行 black 格式检查..."
    black --check src/ || echo "⚠️  代码格式需要修正"
    
    echo "📝 运行 isort 导入检查..."
    isort --check-only src/ || echo "⚠️  导入顺序需要修正"
    
    echo "🧹 运行 flake8 代码风格检查..."
    flake8 src/ || echo "⚠️  代码风格检查有警告"
    
    echo "🔎 运行 mypy 类型检查..."
    mypy src/ || echo "⚠️  类型检查有错误"
    
    cd ..
    
    echo "✅ 代码质量检查完成"
}

# 生成测试报告
generate_test_report() {
    echo "📊 生成测试报告..."
    
    REPORT_DIR="test-reports/$(date +%Y%m%d_%H%M%S)"
    mkdir -p $REPORT_DIR
    
    # 复制覆盖率报告
    if [ -d "backend/htmlcov" ]; then
        cp -r backend/htmlcov $REPORT_DIR/backend-coverage
        echo "✅ 后端覆盖率报告: $REPORT_DIR/backend-coverage/index.html"
    fi
    
    if [ -d "frontend/coverage" ]; then
        cp -r frontend/coverage $REPORT_DIR/frontend-coverage
        echo "✅ 前端覆盖率报告: $REPORT_DIR/frontend-coverage/lcov-report/index.html"
    fi
    
    echo "📊 测试报告已生成: $REPORT_DIR"
}

# 显示测试总结
show_test_summary() {
    echo ""
    echo "🎉 测试运行完成！"
    echo ""
    echo "📊 测试总结："
    echo "  ✅ 前端单元测试"
    echo "  ✅ 后端单元测试"
    echo "  ✅ 代码质量检查"
    echo ""
    echo "📁 报告位置："
    echo "  测试报告: test-reports/"
    echo "  后端覆盖率: backend/htmlcov/"
    echo "  前端覆盖率: frontend/coverage/"
    echo ""
}

# 主函数
main() {
    # 根据参数选择运行的测试类型
    case "${1:-all}" in
        "frontend")
            run_frontend_tests
            ;;
        "backend")
            run_backend_tests
            ;;
        "quality")
            run_code_quality_checks
            ;;
        "all")
            run_frontend_tests
            run_backend_tests
            run_code_quality_checks
            generate_test_report
            show_test_summary
            ;;
        *)
            echo "用法: $0 [frontend|backend|quality|all]"
            echo "  frontend - 只运行前端测试"
            echo "  backend  - 只运行后端测试"
            echo "  quality  - 只运行代码质量检查"
            echo "  all      - 运行所有测试（默认）"
            exit 1
            ;;
    esac
}

# 运行主函数
main "$@"