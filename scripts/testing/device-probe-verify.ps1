#!/usr/bin/env pwsh
<#
.SYNOPSIS
    设备探测联调验证脚本（ICMP/SNMP）

.DESCRIPTION
    调用 Go 后端 /devices/batch-probe 进行真实设备探测并汇总结果。
    支持自动拉取设备列表、筛选 SNMP 配置与输出结果归档。

.PARAMETER ApiBase
    API 基础地址（默认: http://localhost:8000/api/v1）

.PARAMETER Token
    Bearer Token。若不提供，自动读取环境变量 INSPECT_AUTH_TOKEN 或 AUTH_TOKEN。

.PARAMETER DeviceIds
    指定设备 ID 列表。未提供时将自动获取设备列表。

.PARAMETER Limit
    自动获取设备列表的最大数量（默认 200）。

.PARAMETER MaxConcurrent
    批量探测并发数（默认 20）。

.PARAMETER UpdateStatus
    是否回写设备探测状态（默认 true）。

.PARAMETER IncludeInactive
    是否包含非激活设备（默认不包含）。

.PARAMETER OnlySnmpConfigured
    仅探测具备 SNMP 配置的设备。

.PARAMETER Output
    输出 JSON 结果到指定文件。

.EXAMPLE
    .\scripts\testing\device-probe-verify.ps1 -Token $env:AUTH_TOKEN -DeviceIds 1,2,3

.EXAMPLE
    .\scripts\testing\device-probe-verify.ps1 -Token $env:AUTH_TOKEN -Limit 200 -OnlySnmpConfigured
#>

[CmdletBinding()]
param(
    [string]$ApiBase = "http://localhost:8000/api/v1",
    [string]$Token,
    [int[]]$DeviceIds,
    [int]$Limit = 200,
    [int]$MaxConcurrent = 20,
    [bool]$UpdateStatus = $true,
    [switch]$IncludeInactive,
    [switch]$OnlySnmpConfigured,
    [string]$Output
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

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

function Resolve-AuthToken {
    param(
        [string]$Provided
    )

    if (-not [string]::IsNullOrWhiteSpace($Provided)) {
        return $Provided.Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($env:INSPECT_AUTH_TOKEN)) {
        return $env:INSPECT_AUTH_TOKEN.Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($env:AUTH_TOKEN)) {
        return $env:AUTH_TOKEN.Trim()
    }
    return ""
}

function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body
    )

    $headers = @{
        "Authorization" = "Bearer $script:AuthToken"
        "Content-Type" = "application/json"
    }

    $uri = "$ApiBase$Path"
    if ($Method -eq "GET") {
        return Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    }

    $payload = $null
    if ($null -ne $Body) {
        $payload = $Body | ConvertTo-Json -Depth 10
    }

    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $payload
}

function Convert-TagsObject {
    param(
        [object]$Value
    )

    if ($null -eq $Value) {
        return $null
    }
    if ($Value -is [string]) {
        try {
            return $Value | ConvertFrom-Json
        } catch {
            return $null
        }
    }
    return $Value
}

function Test-SnmpConfigured {
    param(
        [object]$Device
    )

    $hasCommunity = -not [string]::IsNullOrWhiteSpace([string]$Device.snmp_community)
    $hasVersion = -not [string]::IsNullOrWhiteSpace([string]$Device.snmp_version)
    $tags = Convert-TagsObject $Device.tags
    $hasTags = $false
    if ($null -ne $tags -and $null -ne $tags.snmp_config) {
        $hasTags = $true
    }

    return ($hasCommunity -or $hasVersion -or $hasTags)
}

$script:AuthToken = Resolve-AuthToken $Token
if ([string]::IsNullOrWhiteSpace($script:AuthToken)) {
    Write-ColorOutput "未提供 Token，请使用 -Token 或设置 INSPECT_AUTH_TOKEN/AUTH_TOKEN 环境变量。" "Red"
    exit 1
}

Write-ColorOutput "开始设备探测联调验证..." "Cyan"

if ($null -eq $DeviceIds -or $DeviceIds.Count -eq 0) {
    Write-ColorOutput "未指定 DeviceIds，开始自动拉取设备列表（Limit=$Limit）..." "Gray"
    $deviceList = Invoke-ApiRequest -Method "GET" -Path "/devices?limit=$Limit"
    if ($null -eq $deviceList) {
        Write-ColorOutput "无法获取设备列表，结束。" "Red"
        exit 1
    }

    if ($deviceList -isnot [array]) {
        $deviceList = @($deviceList)
    }

    $deviceList = $deviceList | Where-Object {
        -not [string]::IsNullOrWhiteSpace([string]$_.ip_address)
    }
    if (-not $IncludeInactive) {
        $deviceList = $deviceList | Where-Object { $_.is_active -eq $true }
    }
    if ($OnlySnmpConfigured) {
        $deviceList = $deviceList | Where-Object { Test-SnmpConfigured $_ }
    }

    $DeviceIds = $deviceList | ForEach-Object { $_.id } | Sort-Object -Unique
}

if ($null -eq $DeviceIds -or $DeviceIds.Count -eq 0) {
    Write-ColorOutput "设备列表为空，无法执行探测。" "Yellow"
    exit 0
}

Write-ColorOutput "探测设备数量: $($DeviceIds.Count)" "Cyan"

$path = "/devices/batch-probe"
if (-not $UpdateStatus) {
    $path = "$path?update_status=false"
}

$payload = @{
    device_ids = $DeviceIds
    max_concurrent = $MaxConcurrent
}

$startTime = Get-Date
$response = Invoke-ApiRequest -Method "POST" -Path $path -Body $payload
$elapsed = (Get-Date) - $startTime

$results = @()
if ($null -ne $response -and $null -ne $response.results) {
    $results = $response.results
    if ($results -isnot [array]) {
        $results = @($results)
    }
}

$icmpOk = ($results | Where-Object { $_.icmp_reachable -eq $true }).Count
$snmpOk = ($results | Where-Object { $_.snmp_reachable -eq $true }).Count
$missing = $DeviceIds.Count - $results.Count

$summary = [ordered]@{
    total_requested = $DeviceIds.Count
    probed = $results.Count
    missing = $missing
    icmp_ok = $icmpOk
    icmp_fail = $results.Count - $icmpOk
    snmp_ok = $snmpOk
    snmp_fail = $results.Count - $snmpOk
    max_concurrent = $MaxConcurrent
    update_status = $UpdateStatus
    elapsed_seconds = [math]::Round($elapsed.TotalSeconds, 2)
}

Write-ColorOutput "探测完成，耗时 $($summary.elapsed_seconds)s" "Green"
Write-ColorOutput "ICMP 成功/失败: $($summary.icmp_ok)/$($summary.icmp_fail)" "Gray"
Write-ColorOutput "SNMP 成功/失败: $($summary.snmp_ok)/$($summary.snmp_fail)" "Gray"
if ($missing -gt 0) {
    Write-ColorOutput "未返回结果数量: $missing" "Yellow"
}

$icmpErrors = $results | Where-Object { $_.icmp_error } | Select-Object -First 5
$snmpErrors = $results | Where-Object { $_.snmp_error } | Select-Object -First 5

if ($icmpErrors.Count -gt 0) {
    Write-ColorOutput "ICMP 失败示例（前 5 条）:" "Yellow"
    $icmpErrors | ForEach-Object { Write-ColorOutput "  [$($_.device_id)] $($_.ip_address) -> $($_.icmp_error)" "Gray" }
}
if ($snmpErrors.Count -gt 0) {
    Write-ColorOutput "SNMP 失败示例（前 5 条）:" "Yellow"
    $snmpErrors | ForEach-Object { Write-ColorOutput "  [$($_.device_id)] $($_.ip_address) -> $($_.snmp_error)" "Gray" }
}

if (-not [string]::IsNullOrWhiteSpace($Output)) {
    $outputPayload = [ordered]@{
        summary = $summary
        results = $results
    }
    $outputPayload | ConvertTo-Json -Depth 10 | Set-Content -Path $Output -Encoding UTF8
    Write-ColorOutput "结果已写入: $Output" "Cyan"
}
