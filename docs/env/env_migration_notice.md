# 环境变量文件整理通知

## 变更日期
2026-01-30

## 变更内容

### 前端 .env 文件整理

**删除的文件：**
- ❌ `frontend/.env.test` - E2E测试配置文件已删除

**保留的文件：**
- ✅ `frontend/.env.example` - 前端配置模板（版本控制）
- ✅ `frontend/.env.local` - 本地开发配置（git忽略）

**变更原因：**
1. 简化配置文件结构，只保留必要的两个文件
2. 测试配置已合并到 `.env.example` 中的注释部分
3. 统一使用中文注释，提高可读性

## 影响范围

### 对开发者的影响
- **首次克隆项目**: 需要执行 `cp frontend/.env.example frontend/.env.local`
- **现有开发者**: 无影响，`.env.local` 文件保持不变
- **E2E测试**: 测试配置可在 `.env.example` 中找到，需要时取消注释

### 对CI/CD的影响
- E2E测试需要在CI环境中设置相应的环境变量
- 或者在测试脚本中动态创建 `.env.test` 文件

## 迁移步骤

### 新团队成员
```bash
# 1. 克隆项目后，复制前端配置模板
cd frontend
cp .env.example .env.local

# 2. 根据实际情况修改 .env.local
# 主要配置：API地址、功能开关等
```

### 现有团队成员
```bash
# 无需操作，现有的 .env.local 文件继续使用
# 如需更新配置，可参考新的 .env.example
```

### E2E测试配置
如果需要运行E2E测试，可以：

**方案1：使用环境变量**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1 npm run test:e2e
```

**方案2：创建临时测试配置**
```bash
# 在测试脚本中动态创建
cat > frontend/.env.test << EOF
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NODE_ENV=test
NEXT_TELEMETRY_DISABLED=1
EOF
```

## 配置文件说明

### frontend/.env.example
- **用途**: 配置模板，供团队成员参考
- **内容**: 包含所有配置项的示例和中文说明
- **版本控制**: ✅ 提交到Git
- **更新**: 当添加新配置项时需要更新此文件

### frontend/.env.local
- **用途**: 本地开发实际使用的配置
- **内容**: 个人开发环境的实际配置
- **版本控制**: ❌ 被 .gitignore 忽略
- **更新**: 开发者根据需要自行修改

## 配置项变更

### 新增配置项说明
所有配置项现在都有详细的中文注释，包括：
- 配置项用途
- 可选值说明
- 开发/生产环境建议值
- 安全警告

### 测试配置位置
原 `.env.test` 中的配置已移至 `.env.example` 的注释部分：
```bash
# ==========================================
# 测试环境配置（E2E测试使用）
# ==========================================

# E2E测试时的API地址
# API_URL=http://localhost:8080

# 测试数据库配置（用于后端测试）
# TEST_DATABASE_URL=host=localhost user=inspect_dev password=...

# 测试模式标识
# NODE_ENV=test

# 禁用遥测数据收集
# NEXT_TELEMETRY_DISABLED=1
```

## 相关文档

- [环境变量配置指南](./env_configuration_guide.md) - 完整的配置说明
- [开发环境搭建指南](../development/development-environment-guide.md)
- [快速启动指南](../docker/compose_quick_start.md)

## 问题反馈

如果在使用过程中遇到问题，请：
1. 检查 [环境变量配置指南](./env_configuration_guide.md)
2. 确认配置文件格式正确
3. 验证环境变量是否生效（重启开发服务器）
4. 联系团队技术负责人

## 注意事项

1. ⚠️ 修改环境变量后必须重启开发服务器
2. ⚠️ 不要将 `.env.local` 提交到版本控制
3. ⚠️ 生产环境必须使用强密钥和密码
4. ✅ 定期检查 `.env.example` 的更新
