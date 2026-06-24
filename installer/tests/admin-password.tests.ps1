# admin-password.tests.ps1 — 初始管理员口令生成器纯断言测试（无需 Pester）
# 运行：powershell -NoProfile -ExecutionPolicy Bypass -File installer/tests/admin-password.tests.ps1
# 失败则以非零码退出，便于 CI/脚本集成。
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "..\scripts\lib\admin-password.ps1")

$failures = New-Object System.Collections.Generic.List[string]
function Assert-That([bool]$Condition, [string]$Message) {
    if (-not $Condition) { $script:failures.Add($Message) }
}

# 允许字符集：去除易混淆的 0/O/1/l/I，便于一次性手工输入。
$allowed = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

# 默认长度 20
$pw = New-InitialAdminPassword
Assert-That ($pw.Length -eq 20) "默认长度应为 20，实际 $($pw.Length)"

# 指定长度生效
$pw32 = New-InitialAdminPassword -Length 32
Assert-That ($pw32.Length -eq 32) "指定长度应为 32，实际 $($pw32.Length)"

# 仅含允许字符集（CSPRNG + 无偏采样后不应出现集外字符）
$illegal = $pw32.ToCharArray() | Where-Object { $allowed.IndexOf($_) -lt 0 }
Assert-That (@($illegal).Count -eq 0) "包含非允许字符: $($illegal -join '')"

# 随机性：连续两次不应相同
$a = New-InitialAdminPassword
$b = New-InitialAdminPassword
Assert-That ($a -ne $b) "两次生成不应相同（随机性不足）"

if ($failures.Count -gt 0) {
    foreach ($f in $failures) { Write-Host "FAIL: $f" }
    exit 1
}
Write-Host "admin-password 测试通过（4 项断言）"
exit 0
