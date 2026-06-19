[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [int]$Port = 13000,
    [string]$Hostname = "0.0.0.0",
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$frontendDir = Join-Path $InstallRoot "frontend"
$runtimeNode = Join-Path $InstallRoot "runtime/node.exe"
$nextCli = Join-Path $frontendDir "node_modules/next/dist/bin/next"
$logsDir = Join-Path $InstallRoot "logs"
$pidFile = Join-Path $logsDir "frontend.pid"
$stdoutLog = Join-Path $logsDir "frontend.stdout.log"
$stderrLog = Join-Path $logsDir "frontend.stderr.log"

function Test-FrontendEndpoint {
    param([Parameter(Mandatory = $true)][string]$Url)

    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = "GET"
    $request.Timeout = 3000

    $response = $null
    try {
        $response = $request.GetResponse()
        $statusCode = [int]$response.StatusCode
        return ($statusCode -ge 200 -and $statusCode -lt 500)
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $response = $_.Exception.Response
            $statusCode = [int]$response.StatusCode
            return ($statusCode -ge 200 -and $statusCode -lt 500)
        }
        return $false
    } finally {
        if ($response) {
            $response.Close()
        }
    }
}

function Wait-FrontendHealth {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 60,
        [int]$ProcessId = 0
    )

    if ($WhatIfPreference) {
        return
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($ProcessId -gt 0 -and -not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
            $stdoutTail = ""
            $stderrTail = ""
            if (Test-Path -LiteralPath $stdoutLog) {
                $stdoutTail = (Get-Content -LiteralPath $stdoutLog -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
            }
            if (Test-Path -LiteralPath $stderrLog) {
                $stderrTail = (Get-Content -LiteralPath $stderrLog -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
            }
            throw "Frontend process exited before health check passed. See $stderrLog$([Environment]::NewLine)STDOUT:$([Environment]::NewLine)$stdoutTail$([Environment]::NewLine)STDERR:$([Environment]::NewLine)$stderrTail"
        }

        if (Test-FrontendEndpoint -Url $Url) {
            Write-Host "Frontend health check passed: $Url"
            return
        }

        Start-Sleep -Seconds 2
    }

    throw "Frontend did not become healthy within $TimeoutSeconds seconds: $Url"
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendDir ".next"))) {
    throw "Frontend build directory not found: $(Join-Path $frontendDir ".next")"
}

if (-not (Test-Path -LiteralPath $nextCli)) {
    throw "Next.js entrypoint not found: $nextCli"
}

if (Test-Path -LiteralPath $runtimeNode) {
    $node = $runtimeNode
} else {
    $nodeCommand = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw "node.exe not found. Install Node.js or place node.exe under the runtime/ directory."
    }
    $node = $nodeCommand.Source
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

if (Test-Path -LiteralPath $pidFile) {
    $oldPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
        Write-Host "Frontend is already running. PID=$oldPid"
        Wait-FrontendHealth -Url "http://127.0.0.1:$Port" -TimeoutSeconds $TimeoutSeconds -ProcessId ([int]$oldPid)
        return
    }
}

$frontendArgs = @("`"$nextCli`"", "start", "`"$frontendDir`"", "-p", "$Port", "-H", "$Hostname")
Write-Verbose "Frontend start command: `"$node`" $($frontendArgs -join ' ')"

if ($PSCmdlet.ShouldProcess($frontendDir, "Start frontend service")) {
    $process = Start-Process `
        -FilePath $node `
        -ArgumentList $frontendArgs `
        -WorkingDirectory $frontendDir `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    Set-Content -LiteralPath $pidFile -Value $process.Id
    Write-Host "Frontend started. PID=$($process.Id), URL=http://localhost:$Port"
    Wait-FrontendHealth -Url "http://127.0.0.1:$Port" -TimeoutSeconds $TimeoutSeconds -ProcessId $process.Id
}
