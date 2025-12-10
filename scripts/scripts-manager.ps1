#!/usr/bin/env pwsh
<#
.SYNOPSIS
    脚本管理工具 - 统一管理所有项目脚本

.DESCRIPTION
    提供项目中所有脚本的统一管理界面，包括脚本列表、帮助信息、执行状态等
    支持脚本分类、搜索、批量操作等功能

.PARAMETER Action
    操作类型: list, help, run, check, update, clean

.PARAMETER Script
    指定脚本名称

.PARAMETER Category
    脚本分类: setup, database, development, quality, test, all

.EXAMPLE
    .\scripts-manager.ps1 list
    列出所有可用脚本

.EXAMPLE
    .\scripts-manager.ps1 help -Script setup-dev-env
    显示指定脚本的帮助信息

.EXAMPLE
    .\scripts-manager.ps1 run -Script db-manage -Category database
    运行数据库相关脚本

.NOTES
    文件名: scripts-manager.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("list", "help", "run", "check", "update", "clean")]
    [string]$Action,
    
    [string]$Script,
    
    [ValidateSet("setup", "database", "development", "quality", "test", "all")]
    [string]$Category = "all"
)

# 设置错误处理
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    $colorMap = @{
        "Red" = [ConsoleColor]::Red
        "Green" = [ConsoleColor]::Green
        "Yellow" = [ConsoleColor]::Yellow
        "Blue" = [ConsoleColor]::Blue
        "Cyan" = [ConsoleColor]::Cyan
        "Magenta" = [ConsoleColor]::Magenta
        "White" = [ConsoleColor]::White
        "Gray" = [ConsoleColor]::DarkGray
    }
    
    Write-Host $Message -ForegroundColor $colorMap[$Color]
}

# 脚本定义
function Get-ProjectScripts {
    return @{
        "setup-dev-env" = @{
            Category = "setup"
            Description = "一键开发环境设置脚本"
            Usage = ".\scripts\setup-dev-env.ps1 [-SkipPrerequisites] [-SkipDatabase] [-SkipTests]"
            Examples = @(
                ".\scripts\setup-dev-env.ps1                    # 完整环境设置",
                ".\scripts\setup-dev-env.ps1 -SkipTests         # 跳过测试验证"
            )
            Dependencies = @("Docker", "uv", "pnpm")
        }
        "db-manage" = @{
            Category = "database"
            Description = "数据库管理工具"
            Usage = ".\scripts\db-manage.ps1 <action> [-Service <service>] [-BackupPath <path>]"
            Examples = @(
                ".\scripts\db-manage.ps1 start                  # 启动所有数据库服务",
                ".\scripts\db-manage.ps1 backup                 # 备份数据库",
                ".\scripts\db-manage.ps1 reset                  # 重置数据库"
            )
            Dependencies = @("Docker", "docker-compose")
        }
        "dev-start" = @{
            Category = "development"
            Description = "开发环境快速启动脚本"
            Usage = ".\scripts\dev-start.ps1 [-Services <services>] [-Wait <seconds>]"
            Examples = @(
                ".\scripts\dev-start.ps1                        # 启动所有服务",
                ".\scripts\dev-start.ps1 -Services database     # 仅启动数据库"
            )
            Dependencies = @("Docker", "uv", "pnpm")
        }
        "quality-check" = @{
            Category = "quality"
            Description = "代码质量检查脚本"
            Usage = ".\scripts\quality-check.ps1 [-Target <target>] [-Fix] [-Strict]"
            Examples = @(
                ".\scripts\quality-check.ps1                    # 检查所有代码",
                ".\scripts\quality-check.ps1 -Target backend -Fix # 检查并修复后端代码"
            )
            Dependencies = @("uv", "pnpm")
        }
        "run-tests" = @{
            Category = "test"
            Description = "统一测试运行脚本"
            Usage = ".\scripts\run-tests.ps1 [-Target <target>] [-Type <type>] [-Coverage]"
            Examples = @(
                ".\scripts\run-tests.ps1                        # 运行所有测试",
                ".\scripts\run-tests.ps1 -Target backend -Coverage # 后端测试+覆盖率"
            )
            Dependencies = @("uv", "pnpm")
        }
        "frontend-setup" = @{
            Category = "setup"
            Description = "前端开发环境设置脚本"
            Usage = ".\scripts\frontend-setup.ps1 <action> [-SkipInstall] [-Production]"
            Examples = @(
                ".\scripts\frontend-setup.ps1 setup             # 设置前端环境",
                ".\scripts\frontend-setup.ps1 dev               # 启动开发服务器"
            )
            Dependencies = @("node", "pnpm")
        }
        "backend-setup" = @{
            Category = "setup"
            Description = "后端开发环境设置脚本"
            Usage = ".\scripts\backend-setup.ps1 <action> [-Python <version>] [-Production]"
            Examples = @(
                ".\scripts\backend-setup.ps1 setup              # 设置后端环境",
                ".\scripts\backend-setup.ps1 dev                # 启动开发服务器"
            )
            Dependencies = @("Python", "uv")
        }
        "start-backend" = @{
            Category = "development"
            Description = "后端服务启动脚本"
            Usage = ".\scripts\start-backend.ps1 [-Environment <env>] [-Port <port>]"
            Examples = @(
                ".\scripts\start-backend.ps1                    # 启动后端服务",
                ".\scripts\start-backend.ps1 -Port 8001         # 指定端口启动"
            )
            Dependencies = @("uv")
        }
        "run-all-tests" = @{
            Category = "test"
            Description = "运行所有测试套件"
            Usage = ".\scripts\run-all-tests.ps1 [-Coverage] [-Parallel]"
            Examples = @(
                ".\scripts\run-all-tests.ps1                    # 运行所有测试",
                ".\scripts\run-all-tests.ps1 -Coverage          # 包含覆盖率报告"
            )
            Dependencies = @("uv", "pnpm")
        }
        "db-health-check" = @{
            Category = "database"
            Description = "数据库健康检查脚本"
            Usage = ".\scripts\db-health-check.ps1 [-Detailed] [-Fix]"
            Examples = @(
                ".\scripts\db-health-check.ps1                  # 基础健康检查",
                ".\scripts\db-health-check.ps1 -Detailed        # 详细检查报告"
            )
            Dependencies = @("Docker")
        }
        "clean-cache" = @{
            Category = "development"
            Description = "清理项目缓存脚本"
            Usage = ".\scripts\clean-cache.ps1 [-Target <target>] [-Deep]"
            Examples = @(
                ".\scripts\clean-cache.ps1                      # 清理所有缓存",
                ".\scripts\clean-cache.ps1 -Target backend      # 仅清理后端缓存"
            )
            Dependencies = @()
        }
    }
}

# 列出脚本
function Show-ScriptList {
    Write-ColorOutput "📋 项目脚本列表" "Blue"
    Write-ColorOutput "$('=' * 60)" "Cyan"
    
    $scripts = Get-ProjectScripts
    $categories = $scripts.Values | Group-Object Category | Sort-Object Name
    
    foreach ($categoryGroup in $categories) {
        if ($Category -ne "all" -and $categoryGroup.Name -ne $Category) {
            continue
        }
        
        Write-ColorOutput "`n📂 $($categoryGroup.Name.ToUpper()) 类脚本:" "Blue"
        
        foreach ($scriptInfo in ($categoryGroup.Group | Sort-Object { $_.PSObject.Properties.Name })) {
            $scriptName = ($scripts.GetEnumerator() | Where-Object { $_.Value -eq $scriptInfo }).Key
            
            # 检查脚本文件是否存在
            $scriptPath = "scripts\$scriptName.ps1"
            $status = if (Test-Path $scriptPath) { "✅" } else { "❌" }
            
            Write-ColorOutput "  $status $scriptName" "White"
            Write-ColorOutput "      $($scriptInfo.Description)" "Gray"
            
            # 显示依赖
            if ($scriptInfo.Dependencies.Count -gt 0) {
                $depStatus = @()
                foreach ($dep in $scriptInfo.Dependencies) {
                    try {
                        $null = Get-Command $dep.ToLower() -ErrorAction Stop
                        $depStatus += "✅$dep"
                    }
                    catch {
                        $depStatus += "❌$dep"
                    }
                }
                Write-ColorOutput "      依赖: $($depStatus -join ', ')" "Gray"
            }
        }
    }
    
    # 统计信息
    $totalScripts = $scripts.Count
    $existingScripts = ($scripts.Keys | Where-Object { Test-Path "scripts\$_.ps1" }).Count
    
    Write-ColorOutput "`n📊 统计信息:" "Blue"
    Write-ColorOutput "  总脚本数: $totalScripts" "White"
    Write-ColorOutput "  已实现: $existingScripts" "Green"
    Write-ColorOutput "  待实现: $($totalScripts - $existingScripts)" $(if ($totalScripts -eq $existingScripts) { "Green" } else { "Yellow" })
}

# 显示脚本帮助
function Show-ScriptHelp {
    if (-not $Script) {
        Write-ColorOutput "❌ 请指定脚本名称" "Red"
        Write-ColorOutput "使用: .\scripts-manager.ps1 help -Script <script-name>" "Cyan"
        return
    }
    
    $scripts = Get-ProjectScripts
    
    if (-not $scripts.ContainsKey($Script)) {
        Write-ColorOutput "❌ 脚本 '$Script' 不存在" "Red"
        Write-ColorOutput "可用脚本: $($scripts.Keys -join ', ')" "Yellow"
        return
    }
    
    $scriptInfo = $scripts[$Script]
    $scriptPath = "scripts\$Script.ps1"
    
    Write-ColorOutput "📖 脚本帮助: $Script" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    Write-ColorOutput "`n📝 描述:" "Blue"
    Write-ColorOutput "  $($scriptInfo.Description)" "White"
    
    Write-ColorOutput "`n📂 分类:" "Blue"
    Write-ColorOutput "  $($scriptInfo.Category)" "White"
    
    Write-ColorOutput "`n🔧 用法:" "Blue"
    Write-ColorOutput "  $($scriptInfo.Usage)" "White"
    
    Write-ColorOutput "`n💡 示例:" "Blue"
    foreach ($example in $scriptInfo.Examples) {
        Write-ColorOutput "  $example" "Gray"
    }
    
    Write-ColorOutput "`n📦 依赖:" "Blue"
    if ($scriptInfo.Dependencies.Count -gt 0) {
        foreach ($dep in $scriptInfo.Dependencies) {
            try {
                $null = Get-Command $dep.ToLower() -ErrorAction Stop
                Write-ColorOutput "  ✅ $dep" "Green"
            }
            catch {
                Write-ColorOutput "  ❌ $dep (未安装)" "Red"
            }
        }
    } else {
        Write-ColorOutput "  无特殊依赖" "Gray"
    }
    
    Write-ColorOutput "`n📁 文件状态:" "Blue"
    if (Test-Path $scriptPath) {
        $fileInfo = Get-Item $scriptPath
        Write-ColorOutput "  ✅ 文件存在: $scriptPath" "Green"
        Write-ColorOutput "  📅 修改时间: $($fileInfo.LastWriteTime)" "Gray"
        Write-ColorOutput "  📏 文件大小: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" "Gray"
    } else {
        Write-ColorOutput "  ❌ 文件不存在: $scriptPath" "Red"
    }
    
    # 显示详细帮助
    if (Test-Path $scriptPath) {
        Write-ColorOutput "`n📋 详细帮助:" "Blue"
        try {
            & $scriptPath -?
        }
        catch {
            Write-ColorOutput "  ⚠️ 无法获取详细帮助信息" "Yellow"
        }
    }
}

# 运行脚本
function Invoke-ProjectScript {
    if (-not $Script) {
        Write-ColorOutput "❌ 请指定脚本名称" "Red"
        Write-ColorOutput "使用: .\scripts-manager.ps1 run -Script <script-name>" "Cyan"
        return
    }
    
    $scripts = Get-ProjectScripts
    
    if (-not $scripts.ContainsKey($Script)) {
        Write-ColorOutput "❌ 脚本 '$Script' 不存在" "Red"
        Write-ColorOutput "可用脚本: $($scripts.Keys -join ', ')" "Yellow"
        return
    }
    
    $scriptPath = "scripts\$Script.ps1"
    
    if (-not (Test-Path $scriptPath)) {
        Write-ColorOutput "❌ 脚本文件不存在: $scriptPath" "Red"
        return
    }
    
    $scriptInfo = $scripts[$Script]
    
    Write-ColorOutput "🚀 运行脚本: $Script" "Blue"
    Write-ColorOutput "描述: $($scriptInfo.Description)" "Gray"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    # 检查依赖
    $missingDeps = @()
    foreach ($dep in $scriptInfo.Dependencies) {
        try {
            $null = Get-Command $dep.ToLower() -ErrorAction Stop
        }
        catch {
            $missingDeps += $dep
        }
    }
    
    if ($missingDeps.Count -gt 0) {
        Write-ColorOutput "⚠️ 缺少依赖: $($missingDeps -join ', ')" "Yellow"
        $confirmation = Read-Host "是否继续运行? (y/N)"
        if ($confirmation -ne "y" -and $confirmation -ne "Y") {
            Write-ColorOutput "❌ 脚本执行已取消" "Yellow"
            return
        }
    }
    
    # 运行脚本
    try {
        Write-ColorOutput "`n🎯 正在执行脚本..." "Cyan"
        & $scriptPath
        Write-ColorOutput "`n✅ 脚本执行完成" "Green"
    }
    catch {
        Write-ColorOutput "`n❌ 脚本执行失败: $($_.Exception.Message)" "Red"
    }
}

# 检查脚本状态
function Test-ScriptsStatus {
    Write-ColorOutput "🔍 脚本状态检查" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    $scripts = Get-ProjectScripts
    $issues = @()
    
    foreach ($scriptName in $scripts.Keys) {
        $scriptPath = "scripts\$scriptName.ps1"
        $scriptInfo = $scripts[$scriptName]
        
        Write-ColorOutput "`n📄 检查脚本: $scriptName" "Cyan"
        
        # 检查文件存在
        if (-not (Test-Path $scriptPath)) {
            $issues += "❌ $scriptName - 文件不存在"
            Write-ColorOutput "  ❌ 文件不存在" "Red"
            continue
        }
        
        Write-ColorOutput "  ✅ 文件存在" "Green"
        
        # 检查文件编码
        try {
            $bytes = [System.IO.File]::ReadAllBytes($scriptPath)
            $hasBOM = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
            if ($hasBOM) {
                Write-ColorOutput "  ✅ UTF-8 BOM 编码正确" "Green"
            } else {
                $issues += "⚠️ $scriptName - 缺少 UTF-8 BOM"
                Write-ColorOutput "  ⚠️ 缺少 UTF-8 BOM" "Yellow"
            }
        }
        catch {
            $issues += "❌ $scriptName - 编码检查失败"
            Write-ColorOutput "  ❌ 编码检查失败" "Red"
        }
        
        # 检查语法
        try {
            $content = Get-Content $scriptPath -Raw -Encoding UTF8
            $null = [System.Management.Automation.PSParser]::Tokenize($content, [ref]$null)
            Write-ColorOutput "  ✅ PowerShell 语法正确" "Green"
        }
        catch {
            $issues += "❌ $scriptName - 语法错误"
            Write-ColorOutput "  ❌ PowerShell 语法错误" "Red"
        }
        
        # 检查依赖
        $missingDeps = @()
        foreach ($dep in $scriptInfo.Dependencies) {
            try {
                $null = Get-Command $dep.ToLower() -ErrorAction Stop
            }
            catch {
                $missingDeps += $dep
            }
        }
        
        if ($missingDeps.Count -eq 0) {
            Write-ColorOutput "  ✅ 所有依赖可用" "Green"
        } else {
            $issues += "⚠️ $scriptName - 缺少依赖: $($missingDeps -join ', ')"
            Write-ColorOutput "  ⚠️ 缺少依赖: $($missingDeps -join ', ')" "Yellow"
        }
    }
    
    # 总结
    Write-ColorOutput "`n📊 检查总结:" "Blue"
    if ($issues.Count -eq 0) {
        Write-ColorOutput "✅ 所有脚本状态正常" "Green"
    } else {
        Write-ColorOutput "发现 $($issues.Count) 个问题:" "Yellow"
        foreach ($issue in $issues) {
            Write-ColorOutput "  $issue" "Yellow"
        }
    }
}

# 更新脚本
function Update-Scripts {
    Write-ColorOutput "🔄 脚本更新检查" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    # 检查 Git 状态
    try {
        $gitStatus = git status --porcelain scripts/ 2>$null
        if ($gitStatus) {
            Write-ColorOutput "📝 发现脚本更改:" "Yellow"
            $gitStatus | ForEach-Object { Write-ColorOutput "  $_" "Gray" }
        } else {
            Write-ColorOutput "✅ 脚本目录无更改" "Green"
        }
    }
    catch {
        Write-ColorOutput "⚠️ 无法检查 Git 状态" "Yellow"
    }
    
    # 检查脚本权限
    Write-ColorOutput "`n🔐 检查脚本权限..." "Cyan"
    $scripts = Get-ProjectScripts
    
    foreach ($scriptName in $scripts.Keys) {
        $scriptPath = "scripts\$scriptName.ps1"
        if (Test-Path $scriptPath) {
            try {
                # 在 Windows 上检查执行策略
                $policy = Get-ExecutionPolicy -Scope CurrentUser
                if ($policy -eq "Restricted") {
                    Write-ColorOutput "⚠️ PowerShell 执行策略受限，可能无法运行脚本" "Yellow"
                    Write-ColorOutput "建议运行: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" "Cyan"
                    break
                }
            }
            catch {
                Write-ColorOutput "⚠️ 无法检查执行策略" "Yellow"
            }
        }
    }
    
    Write-ColorOutput "✅ 脚本更新检查完成" "Green"
}

# 清理脚本
function Clear-Scripts {
    Write-ColorOutput "🧹 脚本清理工具" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    # 清理临时文件
    $tempPatterns = @("*.tmp", "*.log", "*.bak", "*~")
    $cleanedFiles = 0
    
    foreach ($pattern in $tempPatterns) {
        $files = Get-ChildItem -Path "scripts" -Filter $pattern -File
        foreach ($file in $files) {
            Remove-Item $file.FullName -Force
            Write-ColorOutput "🗑️ 已删除: $($file.Name)" "Gray"
            $cleanedFiles++
        }
    }
    
    if ($cleanedFiles -eq 0) {
        Write-ColorOutput "✅ 无需清理的文件" "Green"
    } else {
        Write-ColorOutput "✅ 已清理 $cleanedFiles 个临时文件" "Green"
    }
    
    # 检查孤立脚本
    Write-ColorOutput "`n🔍 检查孤立脚本..." "Cyan"
    $definedScripts = (Get-ProjectScripts).Keys
    $actualScripts = Get-ChildItem -Path "scripts" -Filter "*.ps1" | ForEach-Object { $_.BaseName }
    
    $orphanedScripts = $actualScripts | Where-Object { $_ -notin $definedScripts -and $_ -ne "scripts-manager" }
    
    if ($orphanedScripts.Count -gt 0) {
        Write-ColorOutput "⚠️ 发现孤立脚本:" "Yellow"
        foreach ($script in $orphanedScripts) {
            Write-ColorOutput "  - $script.ps1" "Gray"
        }
    } else {
        Write-ColorOutput "✅ 无孤立脚本" "Green"
    }
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🛠️ 项目脚本管理工具" "Green"
        Write-ColorOutput "操作: $Action" "Cyan"
        if ($Script) { Write-ColorOutput "脚本: $Script" "Cyan" }
        if ($Category -ne "all") { Write-ColorOutput "分类: $Category" "Cyan" }
        Write-ColorOutput "$('=' * 60)" "Cyan"
        
        switch ($Action) {
            "list" { Show-ScriptList }
            "help" { Show-ScriptHelp }
            "run" { Invoke-ProjectScript }
            "check" { Test-ScriptsStatus }
            "update" { Update-Scripts }
            "clean" { Clear-Scripts }
        }
        
        Write-ColorOutput "`n✅ 操作完成" "Green"
        
    }
    catch {
        Write-ColorOutput "`n❌ 操作失败: $($_.Exception.Message)" "Red"
        exit 1
    }
}

# 执行主函数
Main