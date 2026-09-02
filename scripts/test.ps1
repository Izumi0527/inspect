#!/usr/bin/env pwsh
<#
.SYNOPSIS
    测试与质量校验统一入口（PowerShell 版）

.DESCRIPTION
    封装后端与前端的构建/测试校验，提供单一验证入口，满足项目脚本化规范。
    - 后端：go build（可跳过）+ backend-go 单测 + tests/backend-go 外置测试模块
    - 前端：tsc 类型检查（可跳过）+ jest 单元测试
    - 安装包：installer 与 tests/installer PowerShell 脚本回归测试
    - 部署脚本：tests/deploy 下 install.sh 等 Bash 脚本回归测试

    所有步骤默认全部执行并在结尾汇总；任一步骤失败则整体以非零码退出。

.PARAMETER Scope
    校验范围：all（默认）、backend、frontend、installer、deploy

.PARAMETER SkipBuild
    跳过后端 go build（仅跑测试）

.PARAMETER SkipTypeCheck
    跳过前端 tsc 类型检查（仅跑 jest）

.PARAMETER Package
    仅测试指定 Go 包（相对模块根的路径模式，如 ./internal/devices/...）。
    供 TDD 循环取得秒级反馈；指定后跳过 go build 与全量用例，并在主模块与
    外置测试模块中各自探测该包是否存在，不存在的一侧跳过而非报错。

.EXAMPLE
    .\scripts\test.ps1
    执行后端与前端的完整校验

.EXAMPLE
    .\scripts\test.ps1 -Scope backend
    仅执行后端校验

.NOTES
    文件名: test.ps1
    作者: 技术团队
    版本: 1.0.0
#>

[CmdletBinding()]
param(
    [ValidateSet("all", "backend", "frontend", "installer", "deploy")]
    [string]$Scope = "all",

    [switch]$SkipBuild,

    [switch]$SkipTypeCheck,

    [string]$Package = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Get-Location).Path
}

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    $colorMap = @{
        "Red" = [ConsoleColor]::Red; "Green" = [ConsoleColor]::Green
        "Yellow" = [ConsoleColor]::Yellow; "Blue" = [ConsoleColor]::Blue
        "Cyan" = [ConsoleColor]::Cyan; "Gray" = [ConsoleColor]::DarkGray
        "White" = [ConsoleColor]::White
    }
    Write-Host $Message -ForegroundColor $colorMap[$Color]
}

# 步骤执行结果累积；用调用运算符直接执行外部命令，避免动态字符串执行被安全软件误判。
$Script:Failures = @()

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-ColorOutput "`n🔄 $Name..." "Cyan"
    if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
        Write-ColorOutput "⚠️ 跳过 $Name：目录不存在 ($WorkingDirectory)" "Yellow"
        return
    }

    $originalLocation = Get-Location
    try {
        Set-Location -LiteralPath $WorkingDirectory
        & $Action
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            throw "退出码 $LASTEXITCODE"
        }
        Write-ColorOutput "✅ $Name 通过" "Green"
    }
    catch {
        Write-ColorOutput "❌ $Name 失败: $($_.Exception.Message)" "Red"
        $Script:Failures += $Name
    }
    finally {
        Set-Location $originalLocation
    }
}

# Invoke-GoPackageTest 在指定模块内运行单个包的测试。
# 先用 go list 探测包是否属于该模块：-Package 场景下主模块与外置测试模块
# 通常只有一侧包含目标包，另一侧「无匹配包」是预期情况，不应计为失败。
function Invoke-GoPackageTest {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
        return
    }

    $found = $null
    $originalLocation = Get-Location
    try {
        Set-Location -LiteralPath $WorkingDirectory
        $found = & go list $Pattern 2>$null
    }
    catch {
        $found = $null
    }
    finally {
        Set-Location $originalLocation
    }

    if (-not $found) {
        Write-ColorOutput "⏭️ 跳过 $Name：模块内无匹配包 ($Pattern)" "Gray"
        return
    }

    Invoke-Step -Name $Name -WorkingDirectory $WorkingDirectory -Action { & go test $Pattern -count=1 }
}

function Test-Backend {
    $backendDir = Join-Path $ProjectRoot "backend-go"
    $testsDir = Join-Path $ProjectRoot "tests/backend-go"

    if ($Package) {
        Invoke-GoPackageTest -Name "后端主模块测试 ($Package)" -WorkingDirectory $backendDir -Pattern $Package
        Invoke-GoPackageTest -Name "后端外置测试模块 ($Package)" -WorkingDirectory $testsDir -Pattern $Package
        return
    }

    if (-not $SkipBuild) {
        Invoke-Step -Name "后端构建 (go build ./...)" -WorkingDirectory $backendDir -Action { & go build ./... }
    }
    Invoke-Step -Name "后端主模块测试 (backend-go)" -WorkingDirectory $backendDir -Action { & go test ./... -count=1 }
    Invoke-Step -Name "后端外置测试模块 (tests/backend-go)" -WorkingDirectory $testsDir -Action { & go test ./... -count=1 }
}

function Test-Frontend {
    $frontendDir = Join-Path $ProjectRoot "frontend"

    if (-not $SkipTypeCheck) {
        Invoke-Step -Name "前端类型检查 (tsc --noEmit)" -WorkingDirectory $frontendDir -Action { & pnpm run type-check }
    }
    Invoke-Step -Name "前端单元测试 (jest)" -WorkingDirectory $frontendDir -Action { & pnpm test --runInBand }
}

function Get-PowerShellTestHost {
    $windowsPowerShell = Get-Command "powershell.exe" -ErrorAction SilentlyContinue
    if ($windowsPowerShell) {
        return $windowsPowerShell.Source
    }

    $powerShellCore = Get-Command "pwsh" -ErrorAction SilentlyContinue
    if ($powerShellCore) {
        return $powerShellCore.Source
    }

    throw "未找到 powershell.exe 或 pwsh，无法运行安装脚本测试"
}

function Test-Installer {
    $testFiles = @()
    $installerTestsDir = Join-Path $ProjectRoot "tests/installer"
    $legacyInstallerTestsDir = Join-Path $ProjectRoot "installer/tests"

    if (Test-Path -LiteralPath $installerTestsDir) {
        $testFiles += Get-ChildItem -LiteralPath $installerTestsDir -Filter "*.test.ps1" -File
    }
    if (Test-Path -LiteralPath $legacyInstallerTestsDir) {
        $testFiles += Get-ChildItem -LiteralPath $legacyInstallerTestsDir -Filter "*.tests.ps1" -File
    }

    if ($testFiles.Count -eq 0) {
        Write-ColorOutput "⚠️ 跳过安装脚本测试：未找到测试文件" "Yellow"
        return
    }

    $powerShellHost = Get-PowerShellTestHost
    foreach ($testFile in ($testFiles | Sort-Object FullName)) {
        Invoke-Step -Name "安装脚本测试 ($($testFile.Name))" -WorkingDirectory $ProjectRoot -Action {
            & $powerShellHost -NoProfile -ExecutionPolicy Bypass -File $testFile.FullName
        }
    }
}

Write-ColorOutput "🧪 测试校验入口 (范围: $Scope)" "Blue"
Write-ColorOutput ("=" * 60) "Cyan"

function Get-BashTestHost {
    # System32\bash.exe 是 WSL 启动器，它把 C:\ 路径当作 Linux 路径解释，
    # 与 Git Bash 语义不同，必须排除，否则测试会以令人费解的方式失败。
    $found = @(
        (Join-Path $env:ProgramFiles "Git\bin\bash.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Git\bin\bash.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

    if ($found) {
        return $found
    }

    $fromPath = Get-Command "bash.exe" -ErrorAction SilentlyContinue
    if ($fromPath -and $fromPath.Source -notlike '*\System32\*') {
        return $fromPath.Source
    }

    return $null
}

function Test-Deploy {
    $deployTestsDir = Join-Path $ProjectRoot "tests/deploy"
    if (-not (Test-Path -LiteralPath $deployTestsDir)) {
        Write-ColorOutput "⚠️ 跳过部署脚本测试：未找到 tests/deploy 目录" "Yellow"
        return
    }

    $testFiles = @(Get-ChildItem -LiteralPath $deployTestsDir -Filter "*.test.sh" -File)
    if ($testFiles.Count -eq 0) {
        Write-ColorOutput "⚠️ 跳过部署脚本测试：未找到测试文件" "Yellow"
        return
    }

    $bashExe = Get-BashTestHost
    if (-not $bashExe) {
        Write-ColorOutput "⚠️ 跳过部署脚本测试：未找到 Git Bash（System32\bash.exe 为 WSL 启动器，不适用）" "Yellow"
        return
    }

    foreach ($testFile in ($testFiles | Sort-Object FullName)) {
        # Git Bash 的 dirname 不识别反斜杠，传反斜杠路径会让被测脚本算错项目根目录
        $posixPath = $testFile.FullName.Replace('\', '/')
        Invoke-Step -Name "部署脚本测试 ($($testFile.Name))" -WorkingDirectory $ProjectRoot -Action {
            & $bashExe $posixPath
        }
    }
}

switch ($Scope) {
    "backend" { Test-Backend }
    "frontend" { Test-Frontend }
    "installer" { Test-Installer }
    "deploy" { Test-Deploy }
    "all" { Test-Backend; Test-Frontend; Test-Installer; Test-Deploy }
}

Write-ColorOutput "`n$('=' * 60)" "Cyan"
if ($Script:Failures.Count -gt 0) {
    Write-ColorOutput "❌ 校验失败的步骤 ($($Script:Failures.Count)):" "Red"
    foreach ($failure in $Script:Failures) {
        Write-ColorOutput "   - $failure" "Red"
    }
    exit 1
}

Write-ColorOutput "✅ 全部校验通过" "Green"
