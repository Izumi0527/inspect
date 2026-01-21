# 测试文件目录

本目录包含项目的所有测试文件，按照后端和前端分类组织。

## 目录结构

```
tests/
├── backend/              # 后端测试文件（Go）
│   ├── devices/          # 设备相关测试
│   │   ├── snmp_collector_test.go           # SNMP 采集器单元测试
│   │   └── snmp_collector_property_test.go  # SNMP 采集器属性测试
│   └── dashboard/        # 仪表板相关测试
│       ├── service_test.go                  # Dashboard 服务单元测试
│       └── service_property_test.go         # Dashboard 服务属性测试
└── frontend/             # 前端测试文件（TypeScript/React）
    ├── components/       # 组件测试
    │   ├── AnimationSystem.test.tsx         # 动画系统组件测试
    │   └── FeedbackSystem.test.tsx          # 反馈系统组件测试
    ├── utils/            # 工具函数测试
    │   └── formatBandwidth.test.ts          # 带宽格式化函数测试
    └── dashboard/        # 仪表板组件测试
        └── StatsGrid.test.tsx               # StatsGrid 组件测试
```

## 运行测试

### 后端测试（Go）

```bash
# 运行所有后端测试
cd backend-go
go test ./...

# 运行特定包的测试
go test ./internal/devices/...
go test ./internal/dashboard/...

# 运行测试并显示覆盖率
go test -cover ./...

# 运行属性测试（需要更多迭代）
go test -v ./internal/devices/ -run Property
go test -v ./internal/dashboard/ -run Property
```

### 前端测试（TypeScript/React）

```bash
# 运行所有前端测试
cd frontend
npm test

# 运行特定测试文件
npm test formatBandwidth.test.ts
npm test StatsGrid.test.tsx

# 运行测试并显示覆盖率
npm test -- --coverage

# 监听模式运行测试
npm test -- --watch
```

## 测试说明

### 后端测试

- **单元测试** (`*_test.go`): 测试特定功能和边界条件
- **属性测试** (`*_property_test.go`): 使用 gopter 进行基于属性的测试，验证数学属性和不变量

### 前端测试

- **工具函数测试**: 测试纯函数的输入输出
- **组件测试**: 测试 React 组件的渲染和交互

## 测试覆盖的功能

### 网络流量单位转换（Mbps → bps）

1. **带宽计算公式正确性**
   - 验证公式：`bandwidth_bps = (bytes / elapsed) * 8`
   - 测试各种字节数和时间间隔组合
   - 验证数学属性（线性、非负性等）

2. **合理性阈值验证**
   - 验证 10 Gbps 阈值检查
   - 测试边界值和异常值处理
   - 验证警告日志格式

3. **前端格式化**
   - 验证 bps 到人类可读格式的转换
   - 测试单位自动选择（bps, Kbps, Mbps, Gbps）
   - 验证边界情况和错误处理

## 注意事项

- 测试文件使用英文注释以符合国际惯例
- 属性测试至少运行 100 次迭代以确保可靠性
- 所有测试都应该是独立的，不依赖外部状态
- 测试数据应该覆盖正常情况、边界情况和异常情况
