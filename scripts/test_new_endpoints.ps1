$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc2MjMxMDc5OCwidHlwZSI6ImFjY2VzcyJ9.TDhjZpGjPfzSAAAs-pMkXtj8jfTHzqPMbK5PLgXIrVE"
$headers = @{
    "Authorization" = "Bearer $token"
}

Write-Host "===== 测试1: GET /categories ====="
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/settings/system/categories" -Headers $headers -Method Get
    Write-Host "✓ 成功: 返回 $($response.Count) 个分类"
    $response | ForEach-Object { Write-Host "  - $($_.displayName)" }
} catch {
    Write-Host "✗ 失败: $($_.Exception.Message)"
}

Write-Host "`n===== 测试2: GET /info ====="
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/settings/system/info" -Headers $headers -Method Get
    Write-Host "✓ 成功: 应用名称=$($response.application_name), 版本=$($response.version)"
} catch {
    Write-Host "✗ 失败: $($_.Exception.Message)"
}

Write-Host "`n===== 测试3: GET /backup (备份列表) ====="
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/settings/system/backup" -Headers $headers -Method Get
    Write-Host "✓ 成功: 返回 $($response.Count) 个备份"
} catch {
    Write-Host "✗ 失败: $($_.Exception.Message)"
}

Write-Host "`n===== 测试4: POST /settings/bulk (原有端点测试) ====="
try {
    $body = @{
        settings = @{
            "system.timezone" = "Asia/Shanghai"
        }
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/settings/system/settings/bulk" -Headers $headers -Method Post -Body $body -ContentType "application/json"
    Write-Host "✓ 成功: 批量更新完成"
} catch {
    Write-Host "✗ 失败: $($_.Exception.Message)"
}

Write-Host "`n===== 所有测试完成 ====="
