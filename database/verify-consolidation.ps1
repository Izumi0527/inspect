# 数据库整合验证脚本
# 验证SQL文件整合的完整性和正确性

param(
    [switch]$Detailed,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "数据库整合验证脚本" -ForegroundColor Cyan
    Write-Host "用法:" -ForegroundColor Cyan
    Write-Host "    .\verify-consolidation.ps1 [-Detailed]" -ForegroundColor White
    Write-Host ""
    Write-Host "选项:" -ForegroundColor Cyan
    Write-Host "    -Detailed    显示详细的验证信息" -ForegroundColor White
    Write-Host "    -Help        显示此帮助信息" -ForegroundColor White
    exit 0
}

# 颜色输出函数
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    $colorMap = @{
        "Red" = "Red"; "Green" = "Green"; "Yellow" = "Yellow"
        "Blue" = "Blue"; "Cyan" = "Cyan"; "White" = "White"; "Gray" = "Gray"
    }
    $actualColor = $colorMap[$Color]
    if (-not $actualColor) { $actualColor = "White" }
    Write-Host $Message -ForegroundColor $actualColor
}

Write-ColorOutput "🔍 数据库整合验证" "Cyan"
Write-ColorOutput "$('=' * 50)" "Cyan"

$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:DatabasePath = $script:ScriptPath

# 验证项目计数器
$script:TotalChecks = 0
$script:PassedChecks = 0
$script:FailedChecks = 0

function Test-Condition {
    param(
        [string]$Description,
        [bool]$Condition,
        [string]$Details = ""
    )
    
    $script:TotalChecks++
    
    if ($Condition) {
        Write-ColorOutput "✅ $Description" "Green"
        $script:PassedChecks++
        if ($Detailed -and $Details) {
            Write-ColorOutput "   $Details" "Gray"
        }
    } else {
        Write-ColorOutput "❌ $Description" "Red"
        $script:FailedChecks++
        if ($Details) {
            Write-ColorOutput "   $Details" "Yellow"
        }
    }
}

# 1. 验证整合文件存在
Write-ColorOutput "`n📁 验证整合文件" "Blue"

$initCompleteFile = Join-Path $script:DatabasePath "database-init-complete.sql"
$templatesCompleteFile = Join-Path $script:DatabasePath "builtin-templates-complete.sql"

Test-Condition "完整初始化脚本存在" (Test-Path $initCompleteFile) "database-init-complete.sql"
Test-Condition "完整模板脚本存在" (Test-Path $templatesCompleteFile) "builtin-templates-complete.sql"

# 2. 验证原始文件已移动到legacy目录
Write-ColorOutput "`n📦 验证原始文件清理" "Blue"

$legacyPath = Join-Path $script:DatabasePath "legacy"
$originalFiles = @(
    "init.sql", "timescaledb-init.sql", "migrate-bps-to-mbps.sql", "seed-test-data.sql",
    "insert-builtin-inspection-templates.sql", "insert-builtin-inspection-templates-part2.sql", 
    "insert-builtin-inspection-templates-part3.sql"
)

Test-Condition "Legacy目录存在" (Test-Path $legacyPath) "database/legacy/"

foreach ($file in $originalFiles) {
    $legacyFile = Join-Path $legacyPath $file
    $originalFile = Join-Path $script:DatabasePath $file
    
    Test-Condition "原始文件已移动: $file" ((Test-Path $legacyFile) -and (-not (Test-Path $originalFile))) "已移动到legacy目录"
}

# 3. 验证整合文件内容完整性
Write-ColorOutput "`n🔍 验证内容完整性" "Blue"

if (Test-Path $initCompleteFile) {
    $initContent = Get-Content $initCompleteFile -Raw
    
    # 检查关键内容
    Test-Condition "包含PostgreSQL扩展创建" ($initContent -match "CREATE EXTENSION IF NOT EXISTS") "uuid-ossp, timescaledb等"
    Test-Condition "包含TimescaleDB配置" ($initContent -match "create_hypertable") "时序表创建"
    Test-Condition "包含带宽单位迁移" ($initContent -match "1000000\.0") "bps到Mbps转换"
    Test-Condition "包含测试数据" ($initContent -match "Test Custom.*Template") "E2E测试模板"
}

if (Test-Path $templatesCompleteFile) {
    $templatesContent = Get-Content $templatesCompleteFile -Raw
    
    # 检查模板数量
    $templateCount = ([regex]::Matches($templatesContent, "INSERT INTO inspection_templates")).Count
    Test-Condition "包含18个内置模板" ($templateCount -eq 18) "实际数量: $templateCount"
    
    # 检查厂商覆盖 - 每个厂商应该有3个模板，但每个模板有3行匹配
    $vendors = @("Cisco", "Huawei", "H3C", "Juniper", "Arista", "Fortinet")
    foreach ($vendor in $vendors) {
        # 只匹配模板名称行，避免重复计数
        $vendorPattern = "'$vendor.*标准巡检'"
        $vendorMatches = [regex]::Matches($templatesContent, $vendorPattern)
        $vendorCount = $vendorMatches.Count
        Test-Condition "包含${vendor}设备模板" ($vendorCount -eq 3) "实际数量: $vendorCount (路由器、交换机、防火墙)"
    }
}

# 4. 验证管理脚本
Write-ColorOutput "`n🔧 验证管理脚本" "Blue"

$scriptsPath = Join-Path (Split-Path $script:DatabasePath) "scripts/database"
$initScript = Join-Path $scriptsPath "db-init-complete.ps1"
$manageScript = Join-Path $scriptsPath "db-manage.ps1"

Test-Condition "专用初始化脚本存在" (Test-Path $initScript) "db-init-complete.ps1"

if (Test-Path $manageScript) {
    $manageContent = Get-Content $manageScript -Raw
    Test-Condition "管理脚本支持init操作" ($manageContent -match '"init"') "db-manage.ps1包含init命令"
}

# 5. 验证文档更新
Write-ColorOutput "`n📚 验证文档更新" "Blue"

$readmeFile = Join-Path $script:DatabasePath "README-inspection-templates.md"
$migrationGuide = Join-Path $script:DatabasePath "MIGRATION_GUIDE.md"
$consolidationSummary = Join-Path $script:DatabasePath "CONSOLIDATION_SUMMARY.md"

Test-Condition "数据库README已更新" (Test-Path $readmeFile) "README-inspection-templates.md"
Test-Condition "迁移指南存在" (Test-Path $migrationGuide) "MIGRATION_GUIDE.md"
Test-Condition "整合总结存在" (Test-Path $consolidationSummary) "CONSOLIDATION_SUMMARY.md"

if (Test-Path $readmeFile) {
    $readmeContent = Get-Content $readmeFile -Raw
    Test-Condition "README包含新脚本说明" ($readmeContent -match "database-init-complete\.sql") "整合脚本文档"
}

# 6. 验证Docker配置更新
Write-ColorOutput "`n🐳 验证Docker配置" "Blue"

$dockerCompose = Join-Path (Split-Path $script:DatabasePath) "docker-compose.yml"
if (Test-Path $dockerCompose) {
    $dockerContent = Get-Content $dockerCompose -Raw
    Test-Condition "Docker配置已更新" ($dockerContent -match "database-init-complete\.sql") "使用新的初始化脚本"
}

# 7. 显示验证结果
Write-ColorOutput "`n📊 验证结果" "Blue"
Write-ColorOutput "$('=' * 50)" "Cyan"

$successRate = [math]::Round(($script:PassedChecks / $script:TotalChecks) * 100, 1)

Write-ColorOutput "总检查项: $($script:TotalChecks)" "White"
Write-ColorOutput "通过检查: $($script:PassedChecks)" "Green"
Write-ColorOutput "失败检查: $($script:FailedChecks)" "Red"
Write-ColorOutput "成功率: $successRate%" $(if ($successRate -ge 95) { "Green" } elseif ($successRate -ge 80) { "Yellow" } else { "Red" })

if ($script:FailedChecks -eq 0) {
    Write-ColorOutput "`n🎉 整合验证完全通过！" "Green"
    Write-ColorOutput "数据库SQL文件整合工作已成功完成。" "Green"
} elseif ($script:FailedChecks -le 2) {
    Write-ColorOutput "`n⚠️ 整合基本完成，有少量问题需要关注。" "Yellow"
} else {
    Write-ColorOutput "`n❌ 整合存在问题，需要进一步检查和修复。" "Red"
}

Write-ColorOutput "`n🚀 后续步骤:" "Cyan"
Write-ColorOutput "1. 测试新的初始化脚本: .\scripts\database\db-manage.ps1 init" "White"
Write-ColorOutput "2. 验证数据库功能正常" "White"
Write-ColorOutput "3. 更新团队文档和培训材料" "White"

exit $(if ($script:FailedChecks -eq 0) { 0 } else { 1 })