#!/usr/bin/env pwsh
<#
.SYNOPSIS
    前端开发环境设置脚本

.DESCRIPTION
    专门用于设置和管理前端开发环境的脚本
    包括依赖安装、环境配置、开发工具设置等

.PARAMETER Action
    操作类型: setup, install, dev, build, clean, analyze

.PARAMETER SkipInstall
    跳过依赖安装

.PARAMETER Production
    生产环境模式

.EXAMPLE
    .\frontend-setup.ps1 setup
    完整的前端环境设置

.EXAMPLE
    .\frontend-setup.ps1 dev
    启动开发服务器

.EXAMPLE
    .\frontend-setup.ps1 build -Production
    生产环境构建

.NOTES
    文件名: frontend-setup.ps1
    作者: 技术团队
    版本: 1.0.0
    创建日期: 2025-12-10
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("setup", "install", "dev", "build", "clean", "analyze", "test")]
    [string]$Action,
    
    [switch]$SkipInstall,
    
    [switch]$Production
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

# 执行命令函数
function Invoke-CommandSafely {
    param(
        [string]$Command,
        [string]$Description,
        [string]$WorkingDirectory = "frontend",
        [switch]$IgnoreErrors
    )
    
    Write-ColorOutput "🔄 $Description..." "Cyan"
    
    try {
        $originalLocation = Get-Location
        Set-Location $WorkingDirectory
        
        $result = Invoke-Expression $Command
        
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-ColorOutput "✅ $Description 完成" "Green"
            return $true
        } else {
            throw "命令执行失败，退出代码: $LASTEXITCODE"
        }
    }
    catch {
        if ($IgnoreErrors) {
            Write-ColorOutput "⚠️ $Description 失败: $($_.Exception.Message)" "Yellow"
            return $false
        } else {
            Write-ColorOutput "❌ $Description 失败: $($_.Exception.Message)" "Red"
            throw
        }
    }
    finally {
        Set-Location $originalLocation
    }
}

# 检查前置条件
function Test-Prerequisites {
    Write-ColorOutput "🔍 检查前端开发前置条件..." "Blue"
    
    $tools = @(
        @{ Command = "node"; Name = "Node.js"; MinVersion = "20.0.0" },
        @{ Command = "pnpm"; Name = "pnpm"; MinVersion = "8.0.0" }
    )
    
    $allOk = $true
    
    foreach ($tool in $tools) {
        try {
            $version = & $tool.Command --version 2>$null
            if ($version) {
                Write-ColorOutput "✅ $($tool.Name) 已安装: $version" "Green"
                
                # 版本检查
                if ($tool.MinVersion) {
                    $currentVersion = [Version]($version -replace '[^\d\.]', '')
                    $minVersion = [Version]$tool.MinVersion
                    
                    if ($currentVersion -lt $minVersion) {
                        Write-ColorOutput "⚠️ $($tool.Name) 版本过低，建议升级到 $($tool.MinVersion) 以上" "Yellow"
                    }
                }
            } else {
                throw "版本信息获取失败"
            }
        }
        catch {
            Write-ColorOutput "❌ $($tool.Name) 未安装或不可用" "Red"
            $allOk = $false
        }
    }
    
    if (-not $allOk) {
        Write-ColorOutput "`n安装指南:" "Yellow"
        Write-ColorOutput "  Node.js: https://nodejs.org/" "Gray"
        Write-ColorOutput "  pnpm: npm install -g pnpm" "Gray"
        throw "前置条件检查失败"
    }
}

# 检查前端目录
function Test-FrontendDirectory {
    if (-not (Test-Path "frontend")) {
        Write-ColorOutput "❌ 前端目录不存在" "Red"
        throw "前端目录不存在，请确认项目结构"
    }
    
    if (-not (Test-Path "frontend\package.json")) {
        Write-ColorOutput "❌ package.json 不存在" "Red"
        throw "package.json 不存在，请确认前端项目配置"
    }
    
    Write-ColorOutput "✅ 前端目录结构正常" "Green"
}

# 创建环境配置文件
function New-EnvironmentConfig {
    Write-ColorOutput "📝 创建前端环境配置..." "Blue"
    
    $envFiles = @{
        ".env.local" = @"
# 开发环境配置
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NODE_ENV=development
NEXT_PUBLIC_ENV=development

# 功能开关
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_DEBUG=true
"@
        ".env.production" = @"
# 生产环境配置
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
NODE_ENV=production
NEXT_PUBLIC_ENV=production

# 功能开关
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_DEBUG=false
"@
        ".env.example" = @"
# 环境配置示例文件
# 复制此文件为 .env.local 并修改相应配置

# API 配置
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# 环境标识
NODE_ENV=development
NEXT_PUBLIC_ENV=development

# 功能开关
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_DEBUG=true
"@
    }
    
    foreach ($file in $envFiles.Keys) {
        $filePath = "frontend\$file"
        if (-not (Test-Path $filePath)) {
            $envFiles[$file] | Out-File -FilePath $filePath -Encoding UTF8
            Write-ColorOutput "✅ 已创建 $file" "Green"
        } else {
            Write-ColorOutput "⚠️ $file 已存在，跳过创建" "Yellow"
        }
    }
}

# 安装依赖
function Install-Dependencies {
    if ($SkipInstall) {
        Write-ColorOutput "⏭️ 跳过依赖安装" "Yellow"
        return
    }
    
    Write-ColorOutput "`n📦 安装前端依赖..." "Blue"
    
    # 检查 pnpm-lock.yaml 是否存在
    if (Test-Path "frontend\pnpm-lock.yaml") {
        Write-ColorOutput "🔒 发现锁定文件，使用精确版本安装" "Cyan"
        Invoke-CommandSafely "pnpm install --frozen-lockfile" "安装依赖 (锁定版本)"
    } else {
        Write-ColorOutput "📦 首次安装，生成锁定文件" "Cyan"
        Invoke-CommandSafely "pnpm install" "安装依赖"
    }
    
    # 验证关键依赖
    Write-ColorOutput "🔍 验证关键依赖..." "Cyan"
    
    $keyDependencies = @("next", "react", "typescript", "tailwindcss")
    
    foreach ($dep in $keyDependencies) {
        try {
            $version = pnpm list $dep --depth=0 --json | ConvertFrom-Json
            if ($version) {
                Write-ColorOutput "✅ $dep 已安装" "Green"
            }
        }
        catch {
            Write-ColorOutput "⚠️ $dep 可能未正确安装" "Yellow"
        }
    }
}

# 设置开发工具
function Initialize-DevelopmentTools {
    Write-ColorOutput "`n🛠️ 设置开发工具..." "Blue"
    
    # 检查并创建必要的配置文件
    $configFiles = @{
        "next.config.js" = @"
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['localhost'],
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
}

module.exports = nextConfig
"@
        "tailwind.config.ts" = @"
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
}

export default config
"@
        "tsconfig.json" = @"
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
"@
    }
    
    foreach ($file in $configFiles.Keys) {
        $filePath = "frontend\$file"
        if (-not (Test-Path $filePath)) {
            $configFiles[$file] | Out-File -FilePath $filePath -Encoding UTF8
            Write-ColorOutput "✅ 已创建 $file" "Green"
        }
    }
    
    # 设置 Git 忽略文件
    $gitignoreContent = @"
# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
"@
    
    $gitignorePath = "frontend\.gitignore"
    if (-not (Test-Path $gitignorePath)) {
        $gitignoreContent | Out-File -FilePath $gitignorePath -Encoding UTF8
        Write-ColorOutput "✅ 已创建 .gitignore" "Green"
    }
}

# 运行开发服务器
function Start-DevelopmentServer {
    Write-ColorOutput "`n🚀 启动前端开发服务器..." "Blue"
    
    # 检查端口是否被占用
    try {
        $portCheck = Test-NetConnection -ComputerName localhost -Port 3000 -WarningAction SilentlyContinue
        if ($portCheck.TcpTestSucceeded) {
            Write-ColorOutput "⚠️ 端口 3000 已被占用，尝试使用其他端口" "Yellow"
        }
    }
    catch {
        # 端口检查失败，继续执行
    }
    
    Write-ColorOutput "🌐 前端服务将在以下地址启动:" "Cyan"
    Write-ColorOutput "  本地: http://localhost:3000" "White"
    Write-ColorOutput "  网络: http://[你的IP]:3000" "White"
    Write-ColorOutput "`n💡 提示:" "Yellow"
    Write-ColorOutput "  - 修改代码后会自动重载" "Gray"
    Write-ColorOutput "  - 按 Ctrl+C 停止服务" "Gray"
    Write-ColorOutput "  - 使用 --turbo 启用 Turbopack (实验性)" "Gray"
    
    # 启动开发服务器
    try {
        Set-Location "frontend"
        Write-ColorOutput "`n🎯 正在启动..." "Cyan"
        pnpm dev
    }
    catch {
        Write-ColorOutput "❌ 开发服务器启动失败: $($_.Exception.Message)" "Red"
        throw
    }
}

# 构建生产版本
function Build-Production {
    Write-ColorOutput "`n🏗️ 构建生产版本..." "Blue"
    
    # 清理之前的构建
    if (Test-Path "frontend\.next") {
        Remove-Item -Recurse -Force "frontend\.next"
        Write-ColorOutput "🧹 清理旧的构建文件" "Gray"
    }
    
    # 设置生产环境变量
    $env:NODE_ENV = "production"
    
    # 执行构建
    Invoke-CommandSafely "pnpm build" "构建生产版本"
    
    # 构建分析
    if (Test-Path "frontend\.next\analyze") {
        Write-ColorOutput "📊 构建分析报告已生成" "Cyan"
        Write-ColorOutput "  查看: frontend\.next\analyze" "Gray"
    }
    
    # 显示构建结果
    if (Test-Path "frontend\.next") {
        $buildSize = (Get-ChildItem -Recurse "frontend\.next" | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-ColorOutput "📦 构建大小: $($buildSize.ToString('F2')) MB" "Cyan"
    }
    
    Write-ColorOutput "✅ 生产版本构建完成" "Green"
    Write-ColorOutput "🚀 使用 'pnpm start' 启动生产服务器" "Cyan"
}

# 清理项目
function Clear-Project {
    Write-ColorOutput "`n🧹 清理前端项目..." "Blue"
    
    $cleanTargets = @(
        "frontend\node_modules",
        "frontend\.next",
        "frontend\out",
        "frontend\dist",
        "frontend\.turbo",
        "frontend\coverage"
    )
    
    foreach ($target in $cleanTargets) {
        if (Test-Path $target) {
            Remove-Item -Recurse -Force $target
            Write-ColorOutput "🗑️ 已删除 $target" "Gray"
        }
    }
    
    # 清理缓存
    try {
        Set-Location "frontend"
        pnpm store prune 2>$null
        Write-ColorOutput "🧹 已清理 pnpm 缓存" "Gray"
    }
    catch {
        Write-ColorOutput "⚠️ pnpm 缓存清理失败" "Yellow"
    }
    
    Write-ColorOutput "✅ 项目清理完成" "Green"
}

# 分析项目
function Invoke-ProjectAnalysis {
    Write-ColorOutput "`n📊 前端项目分析..." "Blue"
    
    # 依赖分析
    Write-ColorOutput "📦 依赖分析:" "Cyan"
    try {
        Set-Location "frontend"
        $deps = pnpm list --depth=0 --json | ConvertFrom-Json
        Write-ColorOutput "  总依赖数: $($deps.dependencies.Count)" "White"
    }
    catch {
        Write-ColorOutput "  依赖信息获取失败" "Yellow"
    }
    
    # 代码统计
    Write-ColorOutput "`n📝 代码统计:" "Cyan"
    $srcPath = "frontend\src"
    if (Test-Path $srcPath) {
        $tsFiles = Get-ChildItem -Recurse -Path $srcPath -Filter "*.ts" -File
        $tsxFiles = Get-ChildItem -Recurse -Path $srcPath -Filter "*.tsx" -File
        $totalFiles = $tsFiles.Count + $tsxFiles.Count
        
        Write-ColorOutput "  TypeScript 文件: $($tsFiles.Count)" "White"
        Write-ColorOutput "  TSX 文件: $($tsxFiles.Count)" "White"
        Write-ColorOutput "  总文件数: $totalFiles" "White"
        
        # 代码行数统计
        $totalLines = 0
        foreach ($file in ($tsFiles + $tsxFiles)) {
            $lines = (Get-Content $file.FullName | Measure-Object -Line).Lines
            $totalLines += $lines
        }
        Write-ColorOutput "  总代码行数: $totalLines" "White"
    }
    
    # 构建大小分析
    if (Test-Path "frontend\.next") {
        Write-ColorOutput "`n📦 构建分析:" "Cyan"
        $buildSize = (Get-ChildItem -Recurse "frontend\.next" | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-ColorOutput "  构建大小: $($buildSize.ToString('F2')) MB" "White"
    }
    
    # 运行 Bundle Analyzer
    try {
        Invoke-CommandSafely "pnpm analyze" "运行包分析器" -IgnoreErrors
    }
    catch {
        Write-ColorOutput "⚠️ 包分析器未配置" "Yellow"
    }
}

# 运行测试
function Invoke-Tests {
    Write-ColorOutput "`n🧪 运行前端测试..." "Blue"
    
    # 单元测试
    Invoke-CommandSafely "pnpm test --run" "运行单元测试" -IgnoreErrors
    
    # 类型检查
    Invoke-CommandSafely "pnpm type-check" "TypeScript 类型检查" -IgnoreErrors
    
    # 代码检查
    Invoke-CommandSafely "pnpm lint" "ESLint 代码检查" -IgnoreErrors
    
    # E2E 测试
    try {
        Invoke-CommandSafely "pnpm test:e2e" "E2E 测试" -IgnoreErrors
    }
    catch {
        Write-ColorOutput "⚠️ E2E 测试未配置" "Yellow"
    }
}

# 显示项目信息
function Show-ProjectInfo {
    Write-ColorOutput "`n📋 前端项目信息:" "Blue"
    Write-ColorOutput "$('=' * 50)" "Cyan"
    
    # 项目基本信息
    if (Test-Path "frontend\package.json") {
        try {
            $packageJson = Get-Content "frontend\package.json" | ConvertFrom-Json
            Write-ColorOutput "📦 项目名称: $($packageJson.name)" "White"
            Write-ColorOutput "🏷️ 版本: $($packageJson.version)" "White"
            Write-ColorOutput "📝 描述: $($packageJson.description)" "White"
        }
        catch {
            Write-ColorOutput "⚠️ package.json 解析失败" "Yellow"
        }
    }
    
    # 可用脚本
    Write-ColorOutput "`n🛠️ 可用命令:" "Blue"
    Write-ColorOutput "  pnpm dev          - 启动开发服务器" "White"
    Write-ColorOutput "  pnpm build        - 构建生产版本" "White"
    Write-ColorOutput "  pnpm start        - 启动生产服务器" "White"
    Write-ColorOutput "  pnpm test         - 运行测试" "White"
    Write-ColorOutput "  pnpm lint         - 代码检查" "White"
    Write-ColorOutput "  pnpm type-check   - 类型检查" "White"
    
    # 环境信息
    Write-ColorOutput "`n🌐 环境配置:" "Blue"
    if (Test-Path "frontend\.env.local") {
        Write-ColorOutput "  ✅ 开发环境配置已设置" "Green"
    } else {
        Write-ColorOutput "  ⚠️ 开发环境配置未设置" "Yellow"
    }
    
    # 访问地址
    Write-ColorOutput "`n🔗 访问地址:" "Blue"
    Write-ColorOutput "  开发服务器: http://localhost:3000" "Cyan"
    Write-ColorOutput "  API 服务器: http://localhost:8000" "Cyan"
}

# 主执行函数
function Main {
    try {
        Write-ColorOutput "🎨 前端开发环境管理工具" "Green"
        Write-ColorOutput "操作: $Action" "Cyan"
        if ($Production) { Write-ColorOutput "模式: 生产环境" "Yellow" }
        Write-ColorOutput "$('=' * 50)" "Cyan"
        
        # 检查前置条件
        Test-Prerequisites
        Test-FrontendDirectory
        
        # 根据操作执行相应功能
        switch ($Action) {
            "setup" {
                New-EnvironmentConfig
                Install-Dependencies
                Initialize-DevelopmentTools
                Show-ProjectInfo
            }
            "install" {
                Install-Dependencies
            }
            "dev" {
                if (-not $SkipInstall) {
                    Install-Dependencies
                }
                Start-DevelopmentServer
            }
            "build" {
                if (-not $SkipInstall) {
                    Install-Dependencies
                }
                Build-Production
            }
            "clean" {
                Clear-Project
            }
            "analyze" {
                Invoke-ProjectAnalysis
            }
            "test" {
                Invoke-Tests
            }
        }
        
        Write-ColorOutput "`n✅ 前端操作完成！" "Green"
        
    }
    catch {
        Write-ColorOutput "`n❌ 前端操作失败: $($_.Exception.Message)" "Red"
        Write-ColorOutput "请检查错误信息并重新运行" "Yellow"
        exit 1
    }
}

# 执行主函数
Main