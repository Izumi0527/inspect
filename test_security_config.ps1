$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc2MjMxMDc5OCwidHlwZSI6ImFjY2VzcyJ9.TDhjZpGjPfzSAAAs-pMkXtj8jfTHzqPMbK5PLgXIrVE"
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/settings/system/settings?category=security" -Headers $headers -Method Get

    Write-Host "=== 安全配置列表 ==="
    Write-Host "总配置数: $($response.Count)"
    Write-Host ""

    $response.PSObject.Properties | ForEach-Object {
        Write-Host "配置Key: $($_.Name)"
        Write-Host "  描述: $($_.Value.description)"
        Write-Host ""
    }
}
catch {
    Write-Host "错误: $_"
    Write-Host $_.Exception.Message
}
