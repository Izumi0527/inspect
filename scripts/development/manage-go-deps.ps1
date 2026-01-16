# Go 依赖管理脚本
param(
    [Parameter(Position=0)]
    [ValidateSet("install", "update", "verify", "list", "clean", "add", "help")]
    [string]$Action = "help",
    
    [Parameter(Position=1)]
    [string]$Package = "",
    
    [Parameter(Position=2)]
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$script:ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ProjectRoot = Split-Path -Parent (Split-Path -Parent $script:ScriptPath)
$script:BackendPath = Join-Path $script:ProjectRoot "backend-go"

function Write-Info($Message) { Write-Host "[信息] $Message" -ForegroundColor Blue }
function Write-Success($Message) { Write-Host "[成功] $Message" -ForegroundColor Green }
function Write-Error($Message) { Write-Host "[错误] $Message" -ForegroundColor Red }

if (-not (Test-Path $script:BackendPath)) {
    Write-Error "backend-go 目录不存在: $script:BackendPath"
    exit 1
}

Push-Location $script:BackendPath
try {
    switch ($Action) {
        "install" {
            Write-Info "下载并安装所有依赖..."
            go mod download
            go mod tidy
            Write-Success "依赖安装完成"
        }
        
        "update" {
            Write-Info "更新所有依赖到最新版本..."
            go get -u ./...
            go mod tidy
            Write-Success "依赖更新完成"
        }
        
        "verify" {
            Write-Info "验证依赖完整性..."
            go mod verify
            Write-Success "依赖验证通过"
        }
        
        "list" {
            Write-Info "当前依赖列表:"
            go list -m all
        }
        
        "clean" {
            Write-Info "清理模块缓存..."
            go clean -modcache
            Write-Success "缓存清理完成"
        }
        
        "add" {
            if ($Package -eq "") {
                Write-Error "请指定要添加的包名"
                exit 1
            }
            
            $packageSpec = $Package
            if ($Version -ne "") {
                $packageSpec = "$Package@$Version"
            }
            
            Write-Info "添加依赖: $packageSpec"
            go get $packageSpec
            go mod tidy
            Write-Success "依赖添加完成"
        }
        
        "help" {
            Write-Host "Go 依赖管理脚本" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "用法:" -ForegroundColor Yellow
            Write-Host "  .\manage-go-deps.ps1 install                    # 安装所有依赖"
            Write-Host "  .\manage-go-deps.ps1 update                     # 更新所有依赖"
            Write-Host "  .\manage-go-deps.ps1 verify                     # 验证依赖"
            Write-Host "  .\manage-go-deps.ps1 list                       # 列出依赖"
            Write-Host "  .\manage-go-deps.ps1 clean                      # 清理缓存"
            Write-Host "  .\manage-go-deps.ps1 add <package> [version]    # 添加依赖"
            Write-Host ""
            Write-Host "示例:" -ForegroundColor Yellow
            Write-Host "  .\manage-go-deps.ps1 add github.com/gin-gonic/gin"
            Write-Host "  .\manage-go-deps.ps1 add github.com/gin-gonic/gin v1.9.1"
        }
        
        default {
            Write-Error "未知操作: $Action"
            Write-Host "使用 'help' 查看可用操作"
            exit 1
        }
    }
} finally {
    Pop-Location
}