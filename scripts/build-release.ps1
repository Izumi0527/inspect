# 构建 Linux 发布产物（后端静态二进制 + 数据库初始化 SQL + 校验和），PowerShell 版
#
# 用法:
#   .\scripts\build-release.ps1                          # 按 VERSION 构建 amd64
#   .\scripts\build-release.ps1 -Arch arm64
#   .\scripts\build-release.ps1 -Arch amd64,arm64
#   .\scripts\build-release.ps1 -Version 1.1.1 -Out build\release
#
# 产物: <Out>\inspect_<version>_linux_<arch>.tar.gz 及同名 .sha256
#
# 范围说明: 仅打包后端与数据库脚本，不含前端产物。前端 NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL
# 在 next build 阶段被内联进客户端 bundle，预编译产物会把构建机域名烤死，
# 因此前端仍由 deploy-ubuntu.sh 在目标机按实际域名构建。

[CmdletBinding()]
param(
    [string[]]$Arch = @('amd64'),
    [string]$Version = '',
    [string]$Out = ''
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir  = Join-Path $ProjectRoot 'backend-go'
$GoModule    = 'github.com/your-org/inspect-system/backend-go'

if (-not $Out) { $Out = Join-Path $ProjectRoot 'build\release' }

function Fail([string]$msg) { Write-Error "ERR $msg"; exit 1 }
function Step([string]$msg) { Write-Host "`n=== $msg ===" }

# 版本号唯一权威源是仓库根 VERSION 文件
if (-not $Version) {
    $versionFile = Join-Path $ProjectRoot 'VERSION'
    if (-not (Test-Path $versionFile)) { Fail "缺少 VERSION 文件，且未通过 -Version 指定" }
    $Version = (Get-Content $versionFile -Raw).Trim()
}
if (-not $Version) { Fail "版本号为空" }

if (-not (Get-Command go -ErrorAction SilentlyContinue)) { Fail "未找到 go，请先安装 Go 工具链" }
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) { Fail "未找到 tar（Windows 10+ 自带 tar.exe）" }

New-Item -ItemType Directory -Force -Path $Out | Out-Null

foreach ($a in $Arch) {
    $arch = $a.Trim()
    if ($arch -notin @('amd64', 'arm64')) { Fail "不支持的架构: $arch（仅 amd64 / arm64）" }

    $name  = "inspect_${Version}_linux_${arch}"
    $stage = Join-Path $Out $name

    Step "构建 $name"
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    New-Item -ItemType Directory -Force -Path (Join-Path $stage 'bin') | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $stage 'database') | Out-Null

    # CGO_ENABLED=0 与 deploy-ubuntu.sh 的编译参数保持一致，产出无依赖静态二进制
    $env:CGO_ENABLED = '0'
    $env:GOOS = 'linux'
    $env:GOARCH = $arch
    try {
        Push-Location $BackendDir
        & go build -trimpath `
            -ldflags "-s -w -X '$GoModule/internal/config.defaultAppVersion=$Version'" `
            -o (Join-Path $stage 'bin\inspect-api') ./cmd/api
        if ($LASTEXITCODE -ne 0) { Fail "go build 失败 (arch=$arch)" }
    } finally {
        Pop-Location
        Remove-Item Env:CGO_ENABLED, Env:GOOS, Env:GOARCH -ErrorAction SilentlyContinue
    }

    Copy-Item (Join-Path $ProjectRoot 'database\database-init-complete.sql') (Join-Path $stage 'database') -Force
    Set-Content -Path (Join-Path $stage 'VERSION') -Value $Version -Encoding utf8NoBOM
    $license = Join-Path $ProjectRoot 'LICENSE'
    if (Test-Path $license) { Copy-Item $license $stage -Force }

    Push-Location $Out
    try {
        & tar -czf "$name.tar.gz" $name
        if ($LASTEXITCODE -ne 0) { Fail "tar 打包失败 (arch=$arch)" }
    } finally { Pop-Location }
    Remove-Item -Recurse -Force $stage

    $tarball = Join-Path $Out "$name.tar.gz"
    $hash = (Get-FileHash -Algorithm SHA256 $tarball).Hash.ToLower()
    Set-Content -Path "$tarball.sha256" -Value "$hash  $name.tar.gz" -Encoding utf8NoBOM
    $sizeMB = [math]::Round((Get-Item $tarball).Length / 1MB, 1)
    Write-Host "OK  $name.tar.gz ($sizeMB MB)"
}

Step "完成"
Get-ChildItem $Out | Select-Object -ExpandProperty Name
