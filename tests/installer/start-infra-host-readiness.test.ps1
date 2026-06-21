[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repoRoot "installer/scripts/start-infra.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("inspect-start-infra-host-readiness-" + [Guid]::NewGuid().ToString("N"))
$originalPath = $env:Path

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $testRoot "config") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $testRoot "bin") | Out-Null
    Set-Content -LiteralPath (Join-Path $testRoot "docker-compose.installer.yml") -Value "name: inspect-installer" -Encoding UTF8

    @"
DATABASE_URL=postgresql://inspect_dev:dev_password_2024@127.0.0.1:1/inspect_system_dev
REDIS_URL=redis://:dev_redis_2024@127.0.0.1:1/0
POSTGRES_PASSWORD=dev_password_2024
REDIS_PASSWORD=dev_redis_2024
"@ | Set-Content -LiteralPath (Join-Path $testRoot "config/.env") -Encoding UTF8

    $fakeDockerSource = @"
using System;
using System.Linq;

public static class FakeDocker
{
    public static int Main(string[] args)
    {
        var joined = string.Join(" ", args);
        if (args.Length > 0 && args[0] == "info")
        {
            return 0;
        }
        if (args.Length > 0 && args[0] == "compose")
        {
            Console.WriteLine("Container inspect-postgres-installer Started");
            Console.WriteLine("Container inspect-redis-installer Started");
            return 0;
        }
        if (args.Length > 2 && args[0] == "exec")
        {
            if (args[2] == "pg_isready")
            {
                return 0;
            }
            if (args[2] == "redis-cli")
            {
                Console.WriteLine("PONG");
                return 0;
            }
            if (args[2] == "psql")
            {
                if (joined.Contains("server_version_num"))
                {
                    Console.WriteLine("160003");
                    return 0;
                }
                if (joined.Contains("SHOW server_version"))
                {
                    Console.WriteLine("16.3");
                    return 0;
                }
                if (joined.Contains("pg_available_extensions"))
                {
                    Console.WriteLine("2.15.3");
                    return 0;
                }
            }
        }
        Console.Error.WriteLine("unexpected docker args: " + joined);
        return 1;
    }
}
"@
    Add-Type -TypeDefinition $fakeDockerSource -OutputAssembly (Join-Path $testRoot "bin/docker.exe") -OutputType ConsoleApplication

    $env:Path = (Join-Path $testRoot "bin") + [System.IO.Path]::PathSeparator + $originalPath

    $failedAsExpected = $false
    $outputText = ""
    try {
        $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -InstallRoot $testRoot -TimeoutSeconds 1 2>&1
        $outputText = ($output | Out-String)
    } catch {
        $failedAsExpected = $true
        $outputText = (($_ | Out-String) + [Environment]::NewLine + ($_.Exception.Message | Out-String))
    }

    if (-not $failedAsExpected) {
        throw "start-infra 应在宿主机端口不可达时失败，但脚本返回成功。Output:`n$outputText"
    }
    if ($outputText -notmatch "PostgreSQL host port is not ready") {
        throw "start-infra 失败信息应指出 PostgreSQL 宿主机端口未就绪。Output:`n$outputText"
    }

    Write-Host "start-infra host readiness test passed."
} finally {
    $env:Path = $originalPath
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
