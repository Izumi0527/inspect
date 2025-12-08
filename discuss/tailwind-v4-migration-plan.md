# Tailwind CSS v4 迁移方案

## 📋 迁移概述

本文档详细说明了将项目从 Tailwind CSS v3.4.0 升级到 v4.1.17 的完整迁移方案。

### 版本信息
- **当前版本**: Tailwind CSS v3.4.0
- **目标版本**: Tailwind CSS v4.1.17
- **迁移日期**: 2025-12-08
- **项目类型**: Next.js 15.5.7 + React 19.0.1

---

## 🎯 核心变化分析

### 1. 配置方式的根本性转变

**v3 (JavaScript 配置)**
```typescript
// tailwind.config.ts
export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: { ... },
      animation: { ... }
    }
  },
  plugins: [...]
}
```

**v4 (CSS 配置)**
```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.5 0.2 250);
  --animate-fade-in: fade-in 0.5s ease-out;

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}

@plugin "@tailwindcss/forms";
@plugin "@tailwindcss/typography";
```

### 2. 关键区别总结

| 方面 | v3 | v4 |
|------|----|----|
| **配置文件** | tailwind.config.{js,ts} | CSS 中的 @theme |
| **导入方式** | @tailwind base/components/utilities | @import "tailwindcss" |
| **内容发现** | 手动配置 content 数组 | 自动发现（无需配置） |
| **插件引入** | plugins 数组 + require() | @plugin 指令 |
| **自定义主题** | theme.extend 对象 | @theme { CSS 变量 } |
| **动画定义** | keyframes 对象 | @keyframes 在 @theme 内 |
| **暗黑模式** | darkMode 配置 | CSS 类名策略（保持兼容） |
| **性能** | 基准线 | 全量构建快 5 倍，增量快 100 倍 |

---

## 🔍 项目现状深度分析

### 当前配置文件结构

#### 1. tailwind.config.ts (103 行)
```typescript
{
  darkMode: 'class',
  content: [4 个路径模式],
  theme: {
    extend: {
      colors: [11 个自定义颜色变量],
      borderRadius: [3 个尺寸],
      fontFamily: [2 个字体族],
      animation: [5 个动画],
      keyframes: [5 个关键帧],
      backdropBlur: [1 个自定义值],
      backgroundImage: [3 个渐变]
    }
  },
  plugins: [2 个插件]
}
```

**配置复杂度评估**：
- ✅ **低耦合**: 颜色通过 CSS 变量实现，易于迁移
- ⚠️ **中等复杂度**: 5 个自定义动画需要转换为 @keyframes
- ✅ **标准插件**: 使用官方插件，v4 完全支持

#### 2. globals.css (107 行)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base { ... }  /* CSS 变量定义 */
@layer components { ... }  /* 自定义组件类 */
```

**CSS 结构评估**：
- ✅ **良好的分层设计**: 使用 @layer 清晰分离关注点
- ✅ **CSS 变量就绪**: 已使用 CSS 变量定义主题，v4 兼容
- ✅ **自定义组件**: @layer components 中的类可以无缝迁移

#### 3. 依赖关系
- ✅ `@tailwindcss/forms@0.5.9` - 支持 v4
- ✅ `@tailwindcss/typography@0.5.15` - 支持 v4
- ✅ `postcss@8.4.47` - 兼容 v4
- ✅ `autoprefixer@10.4.20` - 继续使用

---

## 📐 迁移策略设计

### 策略选择: 渐进式手动迁移

**为什么不用自动化工具 (`npx @tailwindcss/upgrade@next`)**:
1. **深度理解**: 手动迁移有助于团队深刻理解 v4 的新特性
2. **精细控制**: 可以优化配置结构，而非简单转换
3. **质量保证**: 逐步验证每个变更，确保无副作用
4. **学习曲线**: 通过实践掌握 v4 的最佳实践

**迁移阶段划分**:
```
阶段 1: 备份与分析 (已完成)
   ↓
阶段 2: 更新 CSS 入口文件
   ├─ 替换 @tailwind 为 @import
   ├─ 添加 @theme 块
   └─ 配置 @plugin 指令
   ↓
阶段 3: 迁移主题配置
   ├─ 颜色变量 (已有 CSS 变量，直接引用)
   ├─ 字体族配置
   ├─ 动画与关键帧
   ├─ 边框圆角
   └─ 其他自定义配置
   ↓
阶段 4: 删除旧配置文件
   └─ 删除 tailwind.config.ts
   ↓
阶段 5: 验证与测试
   ├─ 构建测试
   ├─ 类型检查
   ├─ Lint 检查
   └─ 视觉回归测试
```

---

## 🛠️ 详细迁移步骤

### 步骤 1: 更新 globals.css 的导入指令

**变更前** (v3):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**变更后** (v4):
```css
@import "tailwindcss";
```

**原理说明**: v4 的单一 `@import` 指令内部已包含 base、components、utilities 的所有功能，并且支持更好的树摇优化。

---

### 步骤 2: 添加 @theme 配置块

#### 2.1 迁移字体族配置

**v3 配置**:
```typescript
fontFamily: {
  sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
  mono: ['var(--font-mono)', 'Consolas', 'monospace'],
}
```

**v4 迁移**:
```css
@theme {
  --font-family-sans: var(--font-inter), system-ui, sans-serif;
  --font-family-mono: var(--font-mono), Consolas, monospace;
}
```

**命名规则**: `theme.fontFamily.{key}` → `--font-family-{key}`

---

#### 2.2 迁移边框圆角配置

**v3 配置**:
```typescript
borderRadius: {
  lg: 'var(--radius)',
  md: 'calc(var(--radius) - 2px)',
  sm: 'calc(var(--radius) - 4px)',
}
```

**v4 迁移**:
```css
@theme {
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```

**兼容性注意**: CSS `calc()` 函数在 v4 中完全支持。

---

#### 2.3 迁移背景渐变配置

**v3 配置**:
```typescript
backgroundImage: {
  'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
  'glass': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0))',
}
```

**v4 迁移**:
```css
@theme {
  --background-image-gradient-radial: radial-gradient(var(--tw-gradient-stops));
  --background-image-gradient-conic: conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops));
  --background-image-glass: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
}
```

**使用方式**: `bg-gradient-radial` 类名保持不变。

---

#### 2.4 迁移自定义模糊配置

**v3 配置**:
```typescript
backdropBlur: {
  xs: '2px',
}
```

**v4 迁移**:
```css
@theme {
  --backdrop-blur-xs: 2px;
}
```

---

#### 2.5 迁移动画与关键帧 (最复杂部分)

**v3 配置**:
```typescript
animation: {
  'accordion-down': 'accordion-down 0.2s ease-out',
  'accordion-up': 'accordion-up 0.2s ease-out',
  'fade-in': 'fade-in 0.5s ease-out',
  'slide-in': 'slide-in 0.3s ease-out',
  'scale-in': 'scale-in 0.2s ease-out',
},
keyframes: {
  'accordion-down': {
    from: { height: '0' },
    to: { height: 'var(--radix-accordion-content-height)' },
  },
  // ... 其他 4 个
}
```

**v4 迁移** (关键难点):
```css
@theme {
  /* 动画定义 */
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
  --animate-fade-in: fade-in 0.5s ease-out;
  --animate-slide-in: slide-in 0.3s ease-out;
  --animate-scale-in: scale-in 0.2s ease-out;

  /* 关键帧定义 */
  @keyframes accordion-down {
    from { height: 0; }
    to { height: var(--radix-accordion-content-height); }
  }

  @keyframes accordion-up {
    from { height: var(--radix-accordion-content-height); }
    to { height: 0; }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slide-in {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes scale-in {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
}
```

**重要语法注意事项**:
1. **引号处理**: @keyframes 内的属性值通常不需要引号（除非包含空格）
2. **多属性**: 一个关键帧步骤可包含多个属性，用分号分隔
3. **变量引用**: 可以在关键帧内引用 CSS 变量（如 `var(--radix-accordion-content-height)`）
4. **嵌套位置**: @keyframes 必须直接嵌套在 @theme 块内

---

#### 2.6 颜色配置 (特殊处理)

**当前实现**: 项目已使用 CSS 变量定义颜色，并在 tailwind.config.ts 中引用：

```typescript
// tailwind.config.ts
colors: {
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  // ...
}
```

```css
/* globals.css */
:root {
  --primary: 262 83% 58%;
  --primary-foreground: 0 0% 98%;
}
```

**v4 迁移策略** (推荐保留现有方案):

✅ **保持现有的 CSS 变量定义** - 这已经是 v4 推荐的最佳实践！

```css
@import "tailwindcss";

/* 保留现有的 CSS 变量，无需修改 */
@layer base {
  :root {
    --primary: 262 83% 58%;
    --primary-foreground: 0 0% 98%;
    /* ... 其他颜色 */
  }
}

/* 在 @theme 中引用这些变量 */
@theme {
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  /* 或者直接使用，v4 会自动识别 CSS 变量 */
}
```

**注意**: 由于项目已经使用了 CSS 变量 + hsl() 的模式，并且这种模式与 v4 完全兼容，我们可以选择：
- **方案 A**: 完全保留现有实现（最简单，零风险）
- **方案 B**: 在 @theme 中显式声明（更明确，但增加重复）

**推荐**: 方案 A，因为 v4 会自动识别 CSS 变量作为设计令牌。

---

### 步骤 3: 添加插件配置

**v3 配置**:
```typescript
plugins: [
  require('@tailwindcss/forms'),
  require('@tailwindcss/typography'),
]
```

**v4 迁移**:
```css
@plugin "@tailwindcss/forms";
@plugin "@tailwindcss/typography";
```

**位置**: 放在 @import 之后，@theme 之前或之后均可（推荐之后）。

---

### 步骤 4: 删除 tailwind.config.ts

完成 CSS 迁移后，`tailwind.config.ts` 将不再需要，可以安全删除。

**验证清单**:
- ✅ 所有 theme.extend 配置已迁移到 @theme
- ✅ 所有 plugins 已迁移到 @plugin
- ✅ content 配置不再需要（v4 自动发现）
- ✅ darkMode: 'class' 策略已在 CSS 中通过 .dark 类实现（保持兼容）

---

### 步骤 5: 保留 postcss.config.js (无需修改)

```javascript
// postcss.config.js - 保持不变
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

module.exports = config
```

**说明**: Tailwind CSS v4 仍然通过 PostCSS 运行，该配置文件继续有效。

---

## 🧪 测试验证计划

### 1. 构建测试
```bash
cd frontend && pnpm build
```
**预期结果**: 构建成功，无错误，文件体积可能减小。

### 2. 类型检查
```bash
cd frontend && pnpm type-check
```
**预期结果**: 0 错误（CSS 变更不影响 TypeScript）。

### 3. Lint 检查
```bash
cd frontend && pnpm lint
```
**预期结果**: 0 警告，0 错误。

### 4. 开发服务器测试
```bash
cd frontend && pnpm dev
```
**验证项**:
- ✅ 页面正常加载
- ✅ 自定义颜色正确应用
- ✅ 动画效果正常
- ✅ 暗黑模式切换正常
- ✅ 响应式布局无异常
- ✅ 自定义组件类（glass、gradient 等）正常工作

### 5. 视觉回归测试 (手动)
重点检查以下页面:
- `/` - 首页
- `/monitoring` - 监控页面（使用了自定义动画）
- `/dashboard` - 仪表盘（使用了自定义颜色和渐变）

**检查点**:
- [ ] 所有动画流畅播放（fade-in、slide-in、scale-in 等）
- [ ] 毛玻璃效果正确（glass、glass-dark 类）
- [ ] 渐变背景正确（gradient-primary、gradient-accent 等）
- [ ] 卡片悬停效果正常（card-hover 类）
- [ ] 颜色一致性（border、background、text 等）

---

## 🎨 完整的迁移后 globals.css 结构

```css
/* ============================================
   Tailwind CSS v4 配置
   ============================================ */

/* 1. 导入 Tailwind CSS v4 */
@import "tailwindcss";

/* 2. 插件配置 */
@plugin "@tailwindcss/forms";
@plugin "@tailwindcss/typography";

/* 3. 主题配置 */
@theme {
  /* 字体族 */
  --font-family-sans: var(--font-inter), system-ui, sans-serif;
  --font-family-mono: var(--font-mono), Consolas, monospace;

  /* 边框圆角 */
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  /* 背景图像 */
  --background-image-gradient-radial: radial-gradient(var(--tw-gradient-stops));
  --background-image-gradient-conic: conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops));
  --background-image-glass: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));

  /* 模糊效果 */
  --backdrop-blur-xs: 2px;

  /* 动画定义 */
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
  --animate-fade-in: fade-in 0.5s ease-out;
  --animate-slide-in: slide-in 0.3s ease-out;
  --animate-scale-in: scale-in 0.2s ease-out;

  /* 关键帧定义 */
  @keyframes accordion-down {
    from { height: 0; }
    to { height: var(--radix-accordion-content-height); }
  }

  @keyframes accordion-up {
    from { height: var(--radix-accordion-content-height); }
    to { height: 0; }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slide-in {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes scale-in {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
}

/* ============================================
   自定义 CSS 变量（保留）
   ============================================ */

@layer base {
  :root {
    --background: 220 20% 98%;
    --foreground: 220 10% 10%;
    --card: 0 0% 100%;
    --card-foreground: 220 10% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 220 10% 10%;
    --primary: 262 83% 58%;
    --primary-foreground: 0 0% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 220 10% 10%;
    --muted: 210 40% 96%;
    --muted-foreground: 220 10% 45%;
    --accent: 198 93% 60%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 262 83% 58%;
    --radius: 16px;
  }

  .dark {
    --background: 220 20% 8%;
    --foreground: 220 10% 95%;
    --card: 220 20% 10%;
    --card-foreground: 220 10% 95%;
    --popover: 220 20% 10%;
    --popover-foreground: 220 10% 95%;
    --primary: 262 83% 58%;
    --primary-foreground: 0 0% 98%;
    --secondary: 220 20% 14%;
    --secondary-foreground: 220 10% 95%;
    --muted: 220 20% 14%;
    --muted-foreground: 220 10% 65%;
    --accent: 198 93% 60%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    --border: 220 20% 18%;
    --input: 220 20% 18%;
    --ring: 262 83% 58%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

/* ============================================
   自定义组件类（保留）
   ============================================ */

@layer components {
  .glass {
    @apply bg-white/80 backdrop-blur-lg border border-white/20;
  }

  .glass-dark {
    @apply bg-gray-900/80 backdrop-blur-lg border border-gray-700/20;
  }

  .gradient-primary {
    @apply bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400;
  }

  .gradient-secondary {
    @apply bg-gradient-to-br from-pink-400 via-red-500 to-yellow-500;
  }

  .gradient-accent {
    @apply bg-gradient-to-br from-blue-400 via-cyan-400 to-teal-400;
  }

  .card-hover {
    @apply transition-all duration-300 hover:scale-105 hover:shadow-xl;
  }

  .button-glass {
    @apply glass rounded-xl px-6 py-3 font-medium transition-all duration-300 hover:bg-white/90 active:scale-95;
  }
}
```

---

## ⚡ 性能预期

根据官方数据，v4 迁移后的性能提升：

| 指标 | v3 基准 | v4 提升 | 实际影响 |
|------|---------|---------|----------|
| **全量构建** | 100% | ~5x 更快 | 首次构建时间从约 10s 降至 2s |
| **增量构建** | 100% | ~100x 更快 | HMR 响应从约 100ms 降至 1ms |
| **CSS 产物体积** | 100% | ~10-20% 减少 | 更好的树摇优化 |
| **运行时性能** | - | 无变化 | CSS 本身无运行时开销 |

---

## 🚨 风险评估与缓解措施

### 高风险项

#### 1. 动画语法错误
**风险**: @keyframes 语法敏感，引号、分号错误会导致构建失败。
**缓解**:
- 严格遵循文档示例
- 逐个动画测试
- 使用浏览器开发工具验证生成的 CSS

#### 2. 颜色引用失效
**风险**: 如果 @theme 中的颜色定义有误，现有的 `text-primary` 等类可能失效。
**缓解**:
- 保留现有 CSS 变量定义
- 利用 v4 的自动识别机制
- 充分的视觉回归测试

### 中风险项

#### 3. 插件兼容性
**风险**: @tailwindcss/forms 和 @tailwindcss/typography 可能在 v4 下行为不同。
**缓解**:
- 重点测试表单组件和排版组件
- 参考插件的 v4 迁移文档

#### 4. 自定义类名冲突
**风险**: @layer components 中的自定义类可能与 v4 的新工具类冲突。
**缓解**:
- 使用明确的命名前缀（如 `.custom-glass`）
- 检查 v4 的新增工具类列表

### 低风险项

#### 5. PostCSS 配置
**风险**: 极低，v4 仍使用 PostCSS。
**缓解**: 保持 postcss.config.js 不变。

---

## 📚 参考资源

### 官方文档
- [Tailwind CSS v4 升级指南](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind CSS v4 发布公告](https://tailwindcss.com/blog/tailwindcss-v4)
- [主题变量文档](https://tailwindcss.com/docs/theme)
- [@keyframes 用法](https://stackoverflow.com/questions/79393540/how-to-use-keyframes-in-tailwind-css-version-4)

### 社区资源
- [shadcn/ui Tailwind v4 迁移](https://ui.shadcn.com/docs/tailwind-v4)
- [TypeScript.tv 迁移指南](https://typescript.tv/hands-on/upgrading-to-tailwind-css-v4-a-migration-guide/)
- [StaticBlock 综合指南](https://staticblock.tech/posts/comprehensive-guide-tailwind-v4)

### 相关 Issue
- [自定义 keyframes 问题](https://github.com/tailwindlabs/tailwindcss/issues/14622)
- [@theme 输出讨论](https://github.com/tailwindlabs/tailwindcss/discussions/15133)

---

## ✅ 迁移完成清单

在执行迁移后，使用此清单验证所有步骤：

### 配置文件
- [ ] globals.css 已更新为 @import "tailwindcss"
- [ ] @theme 块已添加并包含所有自定义配置
- [ ] @plugin 指令已添加
- [ ] @layer base/components 保持不变
- [ ] tailwind.config.ts 已删除
- [ ] postcss.config.js 保持不变

### 功能验证
- [ ] 构建成功 (pnpm build)
- [ ] 类型检查通过 (pnpm type-check)
- [ ] Lint 通过 (pnpm lint)
- [ ] 开发服务器正常 (pnpm dev)
- [ ] 所有自定义动画正常播放
- [ ] 暗黑模式切换正常
- [ ] 自定义颜色正确应用
- [ ] 表单样式正确（@tailwindcss/forms）
- [ ] 排版样式正确（@tailwindcss/typography）
- [ ] 玻璃态效果正常
- [ ] 渐变背景正确

### 文档与提交
- [ ] 迁移方案文档已创建 (discuss/tailwind-v4-migration-plan.md)
- [ ] Git 提交消息清晰描述变更
- [ ] 团队成员已通知

---

## 🎓 深度思考：v4 设计哲学

### 为什么 Tailwind 要转向 CSS 配置？

#### 1. **性能优化的根本需求**
- **编译时优化**: JavaScript 配置需要 Node.js 运行时解析，而 CSS 配置可以直接被 PostCSS 解析，减少了一层抽象
- **增量构建**: CSS 变更可以被更高效地追踪，因为它是纯文本，不涉及 JavaScript 模块解析
- **树摇优化**: CSS-first 配置使得静态分析更加精确，未使用的样式可以更激进地被移除

#### 2. **Web 平台的回归**
- **CSS 原生能力**: 现代 CSS 已经足够强大（`@property`、`color-mix()`、cascade layers），不再需要 JavaScript 作为配置语言
- **标准化**: CSS 配置文件是标准的 CSS 语法，任何 CSS 工具都能理解和处理
- **去 JavaScript 化**: 前端工具链正在减少对 JavaScript 的依赖（如 Vite 使用 esbuild，Turbopack 使用 Rust）

#### 3. **开发体验的演进**
- **零配置**: 自动发现模板文件意味着新项目可以做到真正的零配置启动
- **热更新友好**: CSS 文件的变更可以被浏览器直接热替换，无需重新加载 JavaScript 模块
- **IDE 支持**: CSS 变量的智能提示比 JavaScript 对象更直观

### v4 的权衡取舍

#### 优势
✅ **性能飞跃**: 5-100 倍的构建速度提升不是营销数字，而是架构变革的结果
✅ **简化依赖**: 更少的 npm 包，更小的 node_modules
✅ **未来导向**: 拥抱 Web 标准，而非构建自己的抽象层

#### 劣势
⚠️ **学习曲线**: 熟悉 v3 的开发者需要重新学习 @theme 语法
⚠️ **向后兼容性**: 虽然提供了 @config 指令，但不是长期解决方案
⚠️ **工具生态**: 部分第三方工具可能尚未适配 v4

### 对项目的长期影响

1. **技术债务减少**: 配置即代码（CSS）意味着更少的间接层，未来重构更容易
2. **团队技能**: 团队需要更深入理解 CSS，而非依赖 JavaScript 配置抽象
3. **可维护性提升**: CSS 配置更易于审查、版本控制和协作

---

## 🔮 后续优化建议

迁移完成后，可以考虑以下进一步优化：

### 1. 探索 Tailwind CSS v4 的新特性
- **容器查询**: v4 原生支持 `@container` 查询
- **现代颜色空间**: 使用 `oklch()` 替代 `hsl()` 获得更好的颜色一致性
- **CSS 嵌套**: 利用原生 CSS 嵌套简化自定义样式

### 2. 性能监控
- 比较迁移前后的构建时间
- 测量 CSS 产物体积变化
- 监控 HMR 响应速度

### 3. 组件库升级
- 如果使用 shadcn/ui，考虑跟进其 v4 迁移
- 检查其他依赖的 UI 库是否有 v4 适配

---

## 📝 迁移执行时间表

| 阶段 | 预计耗时 | 负责人 | 备注 |
|------|----------|--------|------|
| 分析与规划 | ✅ 完成 | Claude | 本文档 |
| 更新 globals.css | 30 分钟 | - | 核心迁移 |
| 删除配置文件 | 5 分钟 | - | - |
| 构建测试 | 15 分钟 | - | 自动化 |
| 视觉回归测试 | 1 小时 | - | 手动检查 |
| 文档与提交 | 20 分钟 | - | - |
| **总计** | **~2 小时** | - | 低风险迁移 |

---

**最后更新**: 2025-12-08
**文档版本**: v1.0
**状态**: 待执行

---

## 🤝 贡献者
- 方案设计: Claude Sonnet 4.5
- 技术审核: 待定
- 执行负责: 待定
