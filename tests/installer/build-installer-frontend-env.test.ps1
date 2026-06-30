[CmdletBinding()]
param()

# build-installer 前端 API 地址注入静态回归测试。
# NEXT_PUBLIC_* 会被 Next.js build 内联进客户端产物，必须在 build 阶段注入安装包后端端口 9165。

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$psBuild = Join-Path $repoRoot "scripts/build-installer.ps1"
$shBuild = Join-Path $repoRoot "scripts/build-installer.sh"
$prepareEnvScript = Join-Path $repoRoot "installer/scripts/prepare-env.ps1"
$installerEnvExample = Join-Path $repoRoot "installer/config/.env.example"

if (-not (Test-Path -LiteralPath $psBuild)) { throw "build-installer.ps1 not found: $psBuild" }
if (-not (Test-Path -LiteralPath $shBuild)) { throw "build-installer.sh not found: $shBuild" }
if (-not (Test-Path -LiteralPath $prepareEnvScript)) { throw "prepare-env.ps1 not found: $prepareEnvScript" }
if (-not (Test-Path -LiteralPath $installerEnvExample)) { throw "installer .env.example not found: $installerEnvExample" }

$psContent = Get-Content -LiteralPath $psBuild -Raw
$shContent = Get-Content -LiteralPath $shBuild -Raw
$prepareEnvContent = Get-Content -LiteralPath $prepareEnvScript -Raw
$installerEnvContent = Get-Content -LiteralPath $installerEnvExample -Raw

function Assert-Contains {
    param(
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if ($Content -notmatch $Pattern) {
        throw $Message
    }
}

Assert-Contains -Content $psContent -Pattern '\$InstallerFrontendApiUrl\s*=\s*"http://localhost:9165"' -Message "PowerShell 构建脚本未定义安装包前端 API 地址 localhost:9165"
Assert-Contains -Content $psContent -Pattern '\$env:NEXT_PUBLIC_API_URL\s*=\s*\$InstallerFrontendApiUrl' -Message "PowerShell 构建脚本未在 next build 前注入 NEXT_PUBLIC_API_URL"
Assert-Contains -Content $psContent -Pattern '\$env:NEXT_PUBLIC_WS_URL\s*=\s*\$InstallerFrontendWsUrl' -Message "PowerShell 构建脚本未在 next build 前注入 NEXT_PUBLIC_WS_URL"
Assert-Contains -Content $psContent -Pattern 'NEXT_PUBLIC_API_URL=\$InstallerFrontendApiUrl' -Message "PowerShell 构建脚本未把运行时 .env.local 写成 9165 API 地址"
Assert-Contains -Content $psContent -Pattern '\$global:LASTEXITCODE\s*=\s*0' -Message "PowerShell 构建脚本未清理 robocopy 成功退出码，可能成功构建但进程返回 1"

Assert-Contains -Content $shContent -Pattern 'INSTALLER_FRONTEND_API_URL="http://localhost:9165"' -Message "Bash 构建脚本未定义安装包前端 API 地址 localhost:9165"
Assert-Contains -Content $shContent -Pattern 'NEXT_PUBLIC_API_URL="\$INSTALLER_FRONTEND_API_URL"' -Message "Bash 构建脚本未在 next build 前注入 NEXT_PUBLIC_API_URL"
Assert-Contains -Content $shContent -Pattern 'NEXT_PUBLIC_WS_URL="\$INSTALLER_FRONTEND_WS_URL"' -Message "Bash 构建脚本未在 next build 前注入 NEXT_PUBLIC_WS_URL"
Assert-Contains -Content $shContent -Pattern 'NEXT_PUBLIC_API_URL=\$INSTALLER_FRONTEND_API_URL' -Message "Bash 构建脚本未把运行时 .env.local 写成 9165 API 地址"

Assert-Contains -Content $prepareEnvContent -Pattern 'NEXT_PUBLIC_API_URL=http://localhost:\$serverPort' -Message "prepare-env.ps1 生成的前端 API 地址未使用 localhost，可能导致 Cookie 跨站丢失"
Assert-Contains -Content $prepareEnvContent -Pattern 'NEXT_PUBLIC_WS_URL=ws://localhost:\$serverPort' -Message "prepare-env.ps1 生成的前端 WS 地址未使用 localhost"
Assert-Contains -Content $installerEnvContent -Pattern 'NEXT_PUBLIC_API_URL=http://localhost:9165' -Message "installer/config/.env.example 前端 API 地址未使用 localhost:9165"
Assert-Contains -Content $installerEnvContent -Pattern 'NEXT_PUBLIC_WS_URL=ws://localhost:9165' -Message "installer/config/.env.example 前端 WS 地址未使用 localhost:9165"

Write-Host "build-installer frontend API env injection test passed."
