# E2E 测试环境设置脚本
# 此脚本用于准备 E2E 测试运行环境

param(
    [Parameter(Mandatory=$false)]
    [string]$Action = "setup",
    
    [Parameter(Mandatory=$false)]
    [string]$DatabaseUrl = "host=localhost user=inspect_dev password=inspect_dev_password dbname=inspect_system_dev port=5432 sslmode=disable"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 E2E 测试环境设置" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

function Test-PostgreSQL {
    Write-Host "🔍 检查 PostgreSQL 连接..." -ForegroundColor Yellow
    
    try {
        $env:PGPASSWORD = "inspect_dev_password"
        $result = psql -h localhost -U inspect_dev -d inspect_system_dev -c "SELECT 1;" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ PostgreSQL 正在运行且可访问" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ PostgreSQL 连接失败" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ PostgreSQL 未运行或无法访问" -ForegroundColor Red
        Write-Host "   错误: $_" -ForegroundColor Red
        return $false
    }
}

function Test-Backend {
    Write-Host "🔍 检查后端 API..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
        
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ 后端 API 正在运行" -ForegroundColor Green
            return $true
        } else {
            Write-Host "⚠️  后端 API 返回状态: $($response.StatusCode)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "❌ 后端 API 未运行" -ForegroundColor Red
        Write-Host "   请使用以下命令启动后端: cd backend-go && go run cmd/api/main.go" -ForegroundColor Yellow
        return $false
    }
}

function Seed-TestData {
    Write-Host "🌱 填充测试数据..." -ForegroundColor Yellow
    
    $seedScript = "database/database-init-complete.sql"
    
    if (-not (Test-Path $seedScript)) {
        Write-Host "❌ 未找到数据填充脚本: $seedScript" -ForegroundColor Red
        return $false
    }
    
    try {
        $env:PGPASSWORD = "inspect_dev_password"
        psql -h localhost -U inspect_dev -d inspect_system_dev -f $seedScript
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ 测试数据填充成功" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ 测试数据填充失败" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ 填充测试数据时出错: $_" -ForegroundColor Red
        return $false
    }
}

function Cleanup-TestData {
    Write-Host "🧹 清理测试数据..." -ForegroundColor Yellow
    
    try {
        $env:PGPASSWORD = "inspect_dev_password"
        $query = "DELETE FROM inspection_templates WHERE is_default = false AND (name LIKE '%Test%' OR name LIKE '%E2E%' OR name LIKE '%测试%' OR name LIKE '%Imported%');"
        psql -h localhost -U inspect_dev -d inspect_system_dev -c $query
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ 测试数据清理成功" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ 测试数据清理失败" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ 清理测试数据时出错: $_" -ForegroundColor Red
        return $false
    }
}

function Install-PlaywrightBrowsers {
    Write-Host "🌐 安装 Playwright 浏览器..." -ForegroundColor Yellow
    
    try {
        Push-Location frontend
        pnpm exec playwright install chromium
        Pop-Location
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Playwright 浏览器安装完成" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Playwright 浏览器安装失败" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ 安装 Playwright 浏览器时出错: $_" -ForegroundColor Red
        Pop-Location
        return $false
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "📊 E2E 测试环境状态" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host ""
    
    $pgStatus = Test-PostgreSQL
    $backendStatus = Test-Backend
    
    Write-Host ""
    Write-Host "摘要:" -ForegroundColor Cyan
    Write-Host "  PostgreSQL: $(if ($pgStatus) { '✅ 运行中' } else { '❌ 未运行' })"
    Write-Host "  后端 API: $(if ($backendStatus) { '✅ 运行中' } else { '❌ 未运行' })"
    Write-Host ""
    
    if ($pgStatus -and $backendStatus) {
        Write-Host "✅ 环境已就绪，可以运行 E2E 测试！" -ForegroundColor Green
        Write-Host ""
        Write-Host "运行测试命令:" -ForegroundColor Yellow
        Write-Host "  cd frontend" -ForegroundColor Gray
        Write-Host "  pnpm test:e2e" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  环境尚未完全就绪" -ForegroundColor Yellow
        Write-Host ""
        if (-not $pgStatus) {
            Write-Host "请启动 PostgreSQL" -ForegroundColor Yellow
        }
        if (-not $backendStatus) {
            Write-Host "请启动后端 API:" -ForegroundColor Yellow
            Write-Host "  cd backend-go" -ForegroundColor Gray
            Write-Host "  go run cmd/api/main.go" -ForegroundColor Gray
        }
    }
}

# 主执行逻辑
switch ($Action.ToLower()) {
    "setup" {
        Write-Host "正在设置 E2E 测试环境..." -ForegroundColor Cyan
        Write-Host ""
        
        $pgOk = Test-PostgreSQL
        if (-not $pgOk) {
            Write-Host ""
            Write-Host "❌ 设置失败: PostgreSQL 无法访问" -ForegroundColor Red
            exit 1
        }
        
        $seedOk = Seed-TestData
        if (-not $seedOk) {
            Write-Host ""
            Write-Host "❌ 设置失败: 无法填充测试数据" -ForegroundColor Red
            exit 1
        }
        
        $browsersOk = Install-PlaywrightBrowsers
        if (-not $browsersOk) {
            Write-Host ""
            Write-Host "⚠️  警告: 无法安装 Playwright 浏览器" -ForegroundColor Yellow
            Write-Host "   您可能需要手动安装:" -ForegroundColor Yellow
            Write-Host "   cd frontend && pnpm exec playwright install chromium" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "✅ E2E 测试环境设置完成！" -ForegroundColor Green
        Write-Host ""
        
        Show-Status
    }
    
    "cleanup" {
        Write-Host "正在清理测试数据..." -ForegroundColor Cyan
        Write-Host ""
        
        $cleanupOk = Cleanup-TestData
        
        if ($cleanupOk) {
            Write-Host ""
            Write-Host "✅ 清理完成！" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "❌ 清理失败" -ForegroundColor Red
            exit 1
        }
    }
    
    "seed" {
        Write-Host "正在填充测试数据..." -ForegroundColor Cyan
        Write-Host ""
        
        $seedOk = Seed-TestData
        
        if ($seedOk) {
            Write-Host ""
            Write-Host "✅ 测试数据填充完成！" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "❌ 填充失败" -ForegroundColor Red
            exit 1
        }
    }
    
    "status" {
        Show-Status
    }
    
    "install-browsers" {
        Write-Host "正在安装 Playwright 浏览器..." -ForegroundColor Cyan
        Write-Host ""
        
        $browsersOk = Install-PlaywrightBrowsers
        
        if ($browsersOk) {
            Write-Host ""
            Write-Host "✅ 浏览器安装完成！" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "❌ 安装失败" -ForegroundColor Red
            exit 1
        }
    }
    
    default {
        Write-Host "❌ 未知操作: $Action" -ForegroundColor Red
        Write-Host ""
        Write-Host "可用操作:" -ForegroundColor Yellow
        Write-Host "  setup            - 完整设置 (填充数据 + 安装浏览器)" -ForegroundColor Gray
        Write-Host "  cleanup          - 清理测试数据" -ForegroundColor Gray
        Write-Host "  seed             - 仅填充测试数据" -ForegroundColor Gray
        Write-Host "  status           - 检查环境状态" -ForegroundColor Gray
        Write-Host "  install-browsers - 安装 Playwright 浏览器" -ForegroundColor Gray
        Write-Host ""
        Write-Host "示例:" -ForegroundColor Yellow
        Write-Host "  .\setup-e2e-tests.ps1 -Action setup" -ForegroundColor Gray
        exit 1
    }
}
