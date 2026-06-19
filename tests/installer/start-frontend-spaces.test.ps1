[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repoRoot "installer/scripts/start-frontend.ps1"

# 在路径含空格的临时目录下构造最小安装结构，复现 C:\Program Files 安装场景。
$installRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("Inspect Space Test " + [guid]::NewGuid().ToString("N"))
$frontendDir = Join-Path $installRoot "frontend"
$nextBinDir = Join-Path $frontendDir "node_modules/next/dist/bin"
$runtimeDir = Join-Path $installRoot "runtime"

try {
    New-Item -ItemType Directory -Force -Path $nextBinDir | Out-Null
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    # 仅需通过 Test-Path 的哨兵文件；-WhatIf 下不会真正执行 node。
    New-Item -ItemType File -Force -Path (Join-Path $frontendDir ".next") | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $nextBinDir "next") | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $runtimeDir "node.exe") | Out-Null

    # 点源执行脚本（-WhatIf 跳过真正的 Start-Process），直接检查它构建的参数数组，
    # 避免子进程把 Verbose 文本按控制台宽度折行带来的解析不确定性。
    . $scriptPath -InstallRoot $installRoot -Port 3100 -TimeoutSeconds 5 -WhatIf | Out-Null

    if (-not $frontendArgs) {
        throw "start-frontend.ps1 did not expose `$frontendArgs."
    }

    # 第 0 个参数是 Next.js 入口，第 2 个是前端目录；二者都含安装路径，
    # 在 C:\Program Files 这类含空格路径下必须整体加双引号，否则 node 会把 "C:\Program" 当作模块。
    $checks = @(
        @{ Name = "Next.js entrypoint"; Value = $frontendArgs[0] },
        @{ Name = "frontend directory"; Value = $frontendArgs[2] }
    )
    foreach ($check in $checks) {
        $value = [string]$check.Value
        if (-not ($value.StartsWith('"') -and $value.EndsWith('"'))) {
            throw "Expected $($check.Name) argument to be wrapped in double quotes, got: $value"
        }
        if ($value.Trim('"') -notmatch [regex]::Escape("Inspect Space Test")) {
            throw "Expected $($check.Name) argument to contain the install path. got: $value"
        }
    }

    Write-Host "start-frontend spaces-in-path quoting test passed."
} finally {
    if (Test-Path -LiteralPath $installRoot) {
        Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
