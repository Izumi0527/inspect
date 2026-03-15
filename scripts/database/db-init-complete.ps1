# 企业级网络设备巡检系统 - 完整数据库初始化脚本
# 使用整合的 SQL 文件进行一次性完整初始化

param(
    [switch]$InitOnly,      # 仅执行基础初始化，不包含模板
    [switch]$TemplatesOnly, # 仅执行模板初始化
    [switch]$Force,         # 强制执行，跳过确认
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "完整数据库初始化脚本" -ForegroundColor Cyan
    Write-Host "用法:" -ForegroundColor Cyan
    Write-Host "    .\db-init-complete.ps1 [选项]" -ForegroundColor White
    Write-Host ""
    Write-Host "选项:" -ForegroundColor Cyan
    Write-Host "    -InitOnly       仅执行基础初始化（数据库配置、TimescaleDB、迁移）" -ForegroundColor White
    Write-Host "    -TemplatesOnly  仅执行模板初始化（内置巡检模板）" -ForegroundColor White
    Write-Host "    -Force          强制执行，跳过确认提示" -ForegroundColor White
    Write-Host "    -Help           显示此帮助信息" -ForegroundColor White
    Write-Host ""
    Write-Host "说明:" -ForegroundColor Cyan
    Write-Host "    默认执行完整初始化（基础配置 + 内置模板）" -ForegroundColor Gray
    Write-Host "    读取根目录 .env/.env.development 获取数据库连接信息" -ForegroundColor Gray
    exit 0
}

# 获取脚本路径
$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ScriptsRoot = Split-Path -Parent $script:ScriptPath
$script:ProjectRoot = Split-Path -Parent $script:ScriptsRoot
$script:DatabasePath = Join-Path $script:ProjectRoot "database"

# 检查必要文件
$initCompleteFile = Join-Path $script:DatabasePath "database-init-complete.sql"
$templatesCompleteFile = Join-Path $script:DatabasePath "builtin-templates-complete.sql"

if (-not (Test-Path $initCompleteFile)) {
    throw "找不到完整初始化文件: $initCompleteFile"
}

if (-not (Test-Path $templatesCompleteFile)) {
    throw "找不到完整模板文件: $templatesCompleteFile"
}

# 检查 psql 命令或 Docker
$useDocker = $false
$dockerContainer = "inspect-postgres-dev"

if (-not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
    Write-Host "[信息] 未检测到本地 psql 命令，尝试使用 Docker..." -ForegroundColor Blue
    
    if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
        throw "未检测到 psql 或 docker 命令，请安装 PostgreSQL 客户端或 Docker"
    }
    
    # 检查 Docker 容器是否运行
    $containerStatus = docker ps --filter "name=$dockerContainer" --format "{{.Names}}" 2>&1
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerStatus)) {
        throw "Docker 容器 '$dockerContainer' 未运行，请先启动数据库容器"
    }
    
    Write-Host "[信息] 将使用 Docker 容器执行 SQL 命令" -ForegroundColor Blue
    $useDocker = $true
}

# 读取环境变量
$envFile = Join-Path $script:ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    $envFile = Join-Path $script:ProjectRoot ".env.development"
}

# Docker 容器内部使用的默认值
$dbHost = "localhost"
$dbPort = "15500"  # Docker 映射的外部端口
$dbName = "inspect_system_dev"
$dbUser = "inspect_dev"
$dbPassword = "dev_password_2024"

# 如果使用 Docker，需要使用容器内部的配置
if ($useDocker) {
    $dbHost = "localhost"  # 容器内部
    $dbPort = "5432"       # 容器内部端口
}

if (Test-Path $envFile) {
    Write-Host "[信息] 读取环境文件: $envFile" -ForegroundColor Blue
    
    $envContent = Get-Content $envFile
    foreach ($line in $envContent) {
        if ($line -match "^DB_HOST=(.+)$") { $dbHost = $matches[1] }
        if ($line -match "^DB_PORT=(.+)$") { $dbPort = $matches[1] }
        if ($line -match "^DB_NAME=(.+)$") { $dbName = $matches[1] }
        if ($line -match "^DB_USER=(.+)$") { $dbUser = $matches[1] }
        if ($line -match "^DB_PASSWORD=(.+)$") { $dbPassword = $matches[1] }
    }
} else {
    Write-Host "[警告] 未找到 .env 文件，使用默认配置" -ForegroundColor Yellow
}

# 设置数据库连接环境变量
$env:PGPASSWORD = $dbPassword

# 定义 SQL 执行函数
function Invoke-Sql {
    param(
        [string]$Command,
        [string]$File
    )
    
    if ($useDocker) {
        # 使用 Docker 执行
        if ($File) {
            # 执行 SQL 文件
            $result = docker exec -i $dockerContainer psql -U $dbUser -d $dbName -f "/docker-entrypoint-initdb.d/$(Split-Path -Leaf $File)" 2>&1
            
            # 如果文件不在 initdb 目录，尝试直接复制并执行
            if ($LASTEXITCODE -ne 0) {
                # 将文件内容通过管道传入
                $sqlContent = Get-Content $File -Raw
                $result = $sqlContent | docker exec -i $dockerContainer psql -U $dbUser -d $dbName 2>&1
            }
        } else {
            # 执行 SQL 命令
            $result = docker exec -i $dockerContainer psql -U $dbUser -d $dbName -c $Command 2>&1
        }
    } else {
        # 使用本地 psql
        if ($File) {
            $result = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $File 2>&1
        } else {
            $result = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c $Command 2>&1
        }
    }
    
    return $result
}

Write-Host "数据库连接信息:" -ForegroundColor Cyan
if ($useDocker) {
    Write-Host "  连接方式: Docker 容器 ($dockerContainer)" -ForegroundColor Gray
} else {
    Write-Host "  连接方式: 本地 psql" -ForegroundColor Gray
    Write-Host "  主机: $dbHost" -ForegroundColor Gray
    Write-Host "  端口: $dbPort" -ForegroundColor Gray
}
Write-Host "  数据库: $dbName" -ForegroundColor Gray
Write-Host "  用户: $dbUser" -ForegroundColor Gray

# 确认执行
if (-not $Force) {
    $confirmation = Read-Host "确认执行数据库初始化？(y/N)"
    if ($confirmation -ne "y" -and $confirmation -ne "Y") {
        Write-Host "操作已取消" -ForegroundColor Yellow
        exit 0
    }
}

# 测试数据库连接
Write-Host "[信息] 测试数据库连接..." -ForegroundColor Blue
try {
    $testResult = Invoke-Sql -Command "SELECT 1;"
    if ($LASTEXITCODE -ne 0) {
        throw "数据库连接失败: $testResult"
    }
    Write-Host "[成功] 数据库连接正常" -ForegroundColor Green
} catch {
    Write-Host "[错误] 数据库连接失败: $_" -ForegroundColor Red
    Write-Host "请检查:" -ForegroundColor Yellow
    if ($useDocker) {
        Write-Host "  1. Docker 容器是否运行: docker ps | findstr postgres" -ForegroundColor Gray
        Write-Host "  2. 容器名称是否正确: $dockerContainer" -ForegroundColor Gray
        Write-Host "  3. 数据库是否已初始化" -ForegroundColor Gray
    } else {
        Write-Host "  1. PostgreSQL 服务是否运行" -ForegroundColor Gray
        Write-Host "  2. 数据库连接信息是否正确" -ForegroundColor Gray
        Write-Host "  3. 用户权限是否足够" -ForegroundColor Gray
    }
    exit 1
}

# 执行基础初始化
if (-not $TemplatesOnly) {
    Write-Host "[信息] 执行基础数据库初始化..." -ForegroundColor Blue
    Write-Host "  - 基础配置（用户、权限、扩展）" -ForegroundColor Gray
    Write-Host "  - TimescaleDB 时序数据库配置" -ForegroundColor Gray
    Write-Host "  - 数据压缩和保留策略" -ForegroundColor Gray
    Write-Host "  - 网络带宽单位迁移 (bps → Mbps)" -ForegroundColor Gray
    Write-Host "  - 测试数据种子" -ForegroundColor Gray
    
    try {
        $result = Invoke-Sql -File $initCompleteFile
        if ($LASTEXITCODE -ne 0) {
            throw "基础初始化失败: $result"
        }
        Write-Host "[成功] 基础数据库初始化完成" -ForegroundColor Green
    } catch {
        Write-Host "[错误] 基础初始化失败: $_" -ForegroundColor Red
        exit 1
    }
}

# 执行模板初始化
if (-not $InitOnly) {
    Write-Host "[信息] 执行内置模板初始化..." -ForegroundColor Blue
    Write-Host "  - 18个厂商设备模板（6厂商 × 3设备类型）" -ForegroundColor Gray
    Write-Host "  - Cisco、Huawei、H3C、Juniper、Arista、Fortinet" -ForegroundColor Gray
    Write-Host "  - 路由器、交换机、防火墙模板" -ForegroundColor Gray
    
    try {
        $result = Invoke-Sql -File $templatesCompleteFile
        if ($LASTEXITCODE -ne 0) {
            throw "模板初始化失败: $result"
        }
        Write-Host "[成功] 内置模板初始化完成" -ForegroundColor Green
    } catch {
        Write-Host "[错误] 模板初始化失败: $_" -ForegroundColor Red
        exit 1
    }
}

# 验证初始化结果
Write-Host "[信息] 验证初始化结果..." -ForegroundColor Blue

try {
    # 检查表是否存在
    $tableCheck = Invoke-Sql -Command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
    if ($LASTEXITCODE -eq 0) {
        $tableCount = ($tableCheck | Select-String -Pattern "\d+" | Select-Object -First 1).Matches.Value
        if ($tableCount) {
            Write-Host "  数据库表数量: $tableCount" -ForegroundColor Gray
        }
    }
    
    # 检查 TimescaleDB 扩展
    $timescaleCheck = Invoke-Sql -Command "SELECT COUNT(*) FROM pg_extension WHERE extname = 'timescaledb';"
    if ($LASTEXITCODE -eq 0) {
        $tsCount = ($timescaleCheck | Select-String -Pattern "\d+" | Select-Object -First 1).Matches.Value
        if ($tsCount -eq "1") {
            Write-Host "  TimescaleDB 扩展: 已启用" -ForegroundColor Gray
        }
    }
    
    # 检查内置模板数量（如果执行了模板初始化）
    if (-not $InitOnly) {
        $templateCheck = Invoke-Sql -Command "SELECT COUNT(*) FROM inspection_templates WHERE is_default = true;"
        if ($LASTEXITCODE -eq 0) {
            $templateCount = ($templateCheck | Select-String -Pattern "\d+" | Select-Object -First 1).Matches.Value
            if ($templateCount) {
                Write-Host "  内置模板数量: $templateCount" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host "[成功] 数据库初始化验证通过" -ForegroundColor Green
} catch {
    Write-Host "[警告] 验证过程中出现问题: $_" -ForegroundColor Yellow
}

# 显示后续步骤
Write-Host ""
Write-Host "🎉 数据库初始化完成！" -ForegroundColor Green
Write-Host ""
Write-Host "后续步骤:" -ForegroundColor Cyan
Write-Host "  1. 启动后端服务（推荐）: .\scripts\development\dev-start.ps1 -Services backend" -ForegroundColor White
Write-Host "  2. 启动前端服务（手动）: cd frontend; pnpm dev" -ForegroundColor White
Write-Host "  3. 访问系统: http://localhost:33000" -ForegroundColor White
Write-Host ""
Write-Host "数据库管理:" -ForegroundColor Cyan
Write-Host "  - 查看数据库状态: .\scripts\database\db-manage.ps1 status" -ForegroundColor White
Write-Host "  - 初始化默认管理员账号: .\scripts\database\db-manage.ps1 seed-admin" -ForegroundColor White
Write-Host "  - 数据库管理面板: .\scripts\database\db-manage.ps1" -ForegroundColor White

# 清理环境变量
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
