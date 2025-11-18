# clean-cache.ps1 脚本更新说明

## 📅 更新日期
2025-11-19

## 🎯 更新目标
梳理并添加项目特定临时文件的清理功能，提升缓存清理的完整性和针对性。

## ✨ 新增功能

### 1. 新增 `-ProjectFiles` 参数
- **用途**: 专门清理项目特定的临时文件和运行时生成文件
- **位置**: 参数列表第 10 行
- **说明**: 可与其他参数组合使用，或单独使用

### 2. 新增 `Clear-ProjectSpecificCache` 函数
**位置**: 第 301-365 行

**清理内容详解**:

#### 📄 运行时配置文件
- `context.json` - 项目根目录的运行时配置（213 字节）

#### 🎨 前端临时文件
- `frontend/lint-report.json` - ESLint 详细报告（~324 KB）
- `frontend/lint-result.json` - ESLint 结果文件（~859 KB）
- `frontend/coverage-report/` - 前端测试覆盖率报告目录
- `frontend/**/*.tsbuildinfo` - TypeScript 增量构建信息（~320 KB）
- `frontend/.vitest/` - Vitest 测试缓存

#### 🐍 后端临时文件
- `backend/.coverage` - Python 测试覆盖率数据（~52 KB）
- `backend/htmlcov/` - Python 覆盖率 HTML 报告目录
- `backend/data/*.json`（排除 `*.example.json`）- 运行时数据文件（~24 KB）

#### 🔐 认证文件（仅警告，不删除）
- `frontend/auth.json` - 前端认证令牌（仅显示警告，需手动删除）

**安全特性**:
- ✅ 自动排除 `.example.json` 示例文件
- ✅ 对敏感认证文件仅警告不删除
- ✅ 支持 `-WhatIf` 预览模式

### 3. 更新交互式菜单
**位置**: 第 388-424 行

新增选项 `[6]`:
```
[6] 仅清理项目特定文件（推荐）
```

**提示**: 将选择范围从 `0-5` 更新为 `0-6`

### 4. 更新帮助文档
**位置**: 第 61-94 行

新增说明:
- 清理选项中添加 `-ProjectFiles` 说明
- 示例中添加使用 `-ProjectFiles` 的演示
- 更新 `-All` 说明，明确包含项目文件

## 📊 清理效果预估

基于当前项目状态，`-ProjectFiles` 选项可清理：

| 类别 | 文件数量 | 总大小 |
|------|---------|--------|
| ESLint 报告 | 2 个 | ~1.15 MB |
| TypeScript 构建 | 1 个 | ~320 KB |
| Python 覆盖率 | 1 个 | ~52 KB |
| 运行时配置 | 2 个 | ~24 KB |
| **总计** | **~6 个** | **~1.55 MB** |

## 🔧 使用方法

### 基础用法
```powershell
# 交互式选择（现在包含选项 6）
.\scripts\clean-cache.ps1

# 仅清理项目特定文件
.\scripts\clean-cache.ps1 -ProjectFiles

# 预览将要删除的内容
.\scripts\clean-cache.ps1 -ProjectFiles -WhatIf

# 强制清理（跳过确认）
.\scripts\clean-cache.ps1 -ProjectFiles -Force

# 详细输出
.\scripts\clean-cache.ps1 -ProjectFiles -Verbose
```

### 组合用法
```powershell
# 清理所有缓存（现在包含项目文件）
.\scripts\clean-cache.ps1 -All

# 仅清理前端相关（前端缓存 + 项目文件）
.\scripts\clean-cache.ps1 -Frontend -ProjectFiles

# 仅清理 Python 相关（Python 缓存 + 项目文件）
.\scripts\clean-cache.ps1 -Python -ProjectFiles
```

## 🛡️ 安全保护机制

1. **示例文件保护**: 自动跳过所有 `*.example.json` 文件
2. **认证文件警告**: 对 `auth.json` 仅显示警告，不自动删除
3. **预览模式**: `-WhatIf` 参数可预览而不实际删除
4. **确认机制**: 默认需要用户确认（除非使用 `-Force`）
5. **详细日志**: 每个删除操作都有清晰的说明

## 📝 注意事项

### ⚠️ 重要提醒
1. **运行时数据**: `backend/data/*.json` 包含系统运行时设置，清理后需要重新配置
2. **覆盖率数据**: 清理后需要重新运行测试才能生成覆盖率报告
3. **认证令牌**: `frontend/auth.json` 如需清理请手动删除

### 💡 最佳实践
1. **首次使用**: 建议先使用 `-WhatIf` 预览
2. **定期清理**: 建议在开发过程中定期清理临时文件
3. **重要数据**: 清理前确认 `backend/data/` 中没有重要数据
4. **版本控制**: 这些文件已在 `.gitignore` 中配置，不会被 git 追踪

## 🔗 相关文件

- 主脚本: [scripts/clean-cache.ps1](./clean-cache.ps1)
- Git 忽略配置: [.gitignore](../.gitignore)
- 脚本 README: [scripts/README.md](./README.md)

## 📈 后续优化建议

1. **添加备份功能**: 清理前自动备份 `backend/data/*.json`
2. **配置文件**: 支持通过配置文件自定义清理规则
3. **统计报告**: 生成清理报告并保存到日志
4. **计划任务**: 支持配置定时自动清理

## 🐛 已知问题

- 无

## 📞 支持

如遇到问题，请查看脚本帮助信息：
```powershell
.\scripts\clean-cache.ps1 -Help
```

---

**更新者**: Claude Code
**版本**: v1.1.0
**兼容性**: Windows PowerShell 5.1+, PowerShell Core 7.0+
