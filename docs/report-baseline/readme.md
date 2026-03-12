# 报表导出基线

> 注意：Python 后端已废弃。本目录保留历史 Python 基线用于对比，当前以 Go 版本输出为准。

## 目录结构

- `data/`：用于生成报表的固定输入数据
- `output/`：历史 Python 版本基线（冻结不再更新）
- `output-go/`：Go 版本基线（当前对齐基准）

## 生成方式（Go，推荐）

在仓库根目录执行：

```bash
cd backend-go
# 生成 docs/report-baseline/output-go
# 测试内会清理并重建输出目录
go test ./internal/reports -run TestGenerateReportBaseline
```

## 固定时间

基线生成时间固定为 `2026-01-01 00:00:00`，用于稳定输出中的时间信息。

## 历史基线（Python，已冻结）

如需对比历史输出，可参考以下命令（不再建议执行）：

```
C:\coder\Inspect\backend\.venv\Scripts\python.exe scripts\report\generate-report-baseline.py
```

Python 基线依赖的库（历史参考）：

- reportlab
- openpyxl
- python-docx
- matplotlib

