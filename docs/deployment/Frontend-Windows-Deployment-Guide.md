# 前端Windows部署指南

## 概览

本文档提供企业级网络设备巡检系统前端在Windows环境下的全面部署指南。前端基于React 18.3.1 + Next.js 15.5.0构建，采用现代化的技术栈和苹果风格UI设计。

## 系统要求

### 硬件要求

- **操作系统**: Windows 10/11 专业版或Windows Server 2016+
- **内存**: 最低 8GB，推荐 16GB+
- **存储**: 最低 20GB 可用空间，推荐 50GB+
- **CPU**: 最低 4核心，推荐 8核心+
- **网络**: 高速互联网连接

### 软件依赖

| 软件 | 版本 | 用途 |
|------|------|------|
| Node.js | 20.0.0+ | JavaScript运行时 |
| npm | 10.0.0+ | 包管理器（推荐使用pnpm） |
| pnpm | 最新版 | 快速包管理器（推荐） |
| Git | 2.40.0+ | 源代码管理 |
| Docker Desktop | 24.0.0+ | 容器化部署（可选） |

## 安装指南

### 步骤1：安装Node.js

1. **下载Node.js 20+**
   ```powershell
   # 访问 https://nodejs.org/
   # 下载 Node.js v20 LTS (Windows x64 Installer)
   ```

2. **安装Node.js**
   ```powershell
   # 运行下载的安装程序
   # 选择"Add to PATH"选项
   # 安装完成后重启PowerShell
   ```

3. **验证安装**
   ```powershell
   node --version
   npm --version
   ```

### 步骤2：安装pnpm（推荐）

```powershell
# 通过npm安装pnpm
npm install -g pnpm

# 验证安装
pnpm --version
```

### 步骤3：克隆项目代码

```powershell
# 克隆仓库
git clone <repository-url>
cd Inspect

# 进入前端目录
cd frontend
```

### 步骤4：安装依赖

```powershell
# 使用pnpm安装依赖（推荐）
pnpm install

# 或使用npm
npm install

# 或使用yarn（如果已安装）
yarn install
```

## 配置设置

### 环境变量配置

1. **创建环境配置文件**
   ```powershell
   # 在前端根目录创建.env.local文件
   New-Item -ItemType File -Path .env.local
   ```

2. **配置环境变量** (`.env.local`)
   ```env
   # API配置
   NEXT_PUBLIC_API_URL=http://localhost:8001
   NEXT_PUBLIC_WS_URL=ws://localhost:8001
   
   # 环境设置
   NODE_ENV=development
   
   # 应用配置
   NEXT_PUBLIC_APP_NAME=企业级网络设备巡检系统
   NEXT_PUBLIC_APP_VERSION=1.0.0
   
   # 功能开关
   NEXT_PUBLIC_ENABLE_ANALYTICS=false
   NEXT_PUBLIC_ENABLE_MONITORING=true
   
   # UI主题配置
   NEXT_PUBLIC_DEFAULT_THEME=light
   NEXT_PUBLIC_ENABLE_GLASSMORPHISM=true
   ```

3. **生产环境配置** (`.env.production`)
   ```env
   # 生产环境API地址
   NEXT_PUBLIC_API_URL=https://your-backend-domain.com
   NEXT_PUBLIC_WS_URL=wss://your-backend-domain.com
   
   # 安全配置
   NODE_ENV=production
   NEXT_PUBLIC_ENABLE_DEVTOOLS=false
   
   # 性能优化
   NEXT_PUBLIC_ENABLE_SERVICE_WORKER=true
   NEXT_PUBLIC_CACHE_STRATEGY=stale-while-revalidate
   ```

### Next.js配置优化

检查并根据需要调整`next.config.js`：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 性能优化
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  
  // 图片域名配置
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif'],
  },
  
  // 构建优化
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // 安全配置
  poweredByHeader: false,
  reactStrictMode: true,
  
  // TypeScript配置
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // ESLint配置
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig
```

## 部署选项

### 选项1：开发环境部署

1. **启动开发服务器**
   ```powershell
   # 使用pnpm启动（推荐）
   pnpm dev
   
   # 或使用npm
   npm run dev
   
   # 指定端口启动
   pnpm dev --port 3000
   ```

2. **访问应用**
   ```
   前端应用: http://localhost:3000 (端口自动分配)
   ```

3. **开发环境特性**
   - 热重载（Hot Reload）
   - 详细错误提示
   - 开发者工具支持
   - 源代码映射

### 选项2：生产环境构建部署

1. **构建生产版本**
   ```powershell
   # 构建生产环境代码
   pnpm build
   
   # 检查构建产物
   ls .next
   ```

2. **启动生产服务器**
   ```powershell
   # 启动生产环境服务器
   pnpm start
   
   # 指定端口
   pnpm start --port 3000
   ```

3. **性能验证**
   ```powershell
   # 分析构建包大小
   pnpm build --analyze
   
   # 运行性能测试
   pnpm test:performance
   ```

### 选项3：静态导出部署

1. **配置静态导出**
   
   修改`next.config.js`：
   ```javascript
   const nextConfig = {
     output: 'export',
     trailingSlash: true,
     images: {
       unoptimized: true
     }
   }
   ```

2. **构建静态文件**
   ```powershell
   # 构建并导出静态文件
   pnpm build
   
   # 检查输出目录
   ls out
   ```

3. **部署到Web服务器**
   ```powershell
   # 复制到IIS网站目录
   xcopy out C:\inetpub\wwwroot\inspect-frontend /E /I
   
   # 或复制到Nginx目录
   xcopy out C:\nginx\html\inspect-frontend /E /I
   ```

### 选项4：Docker容器部署

1. **创建前端Dockerfile**
   
   在`frontend`目录创建`Dockerfile`：
   ```dockerfile
   # 构建阶段
   FROM node:20-alpine AS builder
   
   WORKDIR /app
   
   # 复制依赖文件
   COPY package.json pnpm-lock.yaml ./
   RUN npm install -g pnpm
   RUN pnpm install --frozen-lockfile
   
   # 复制源码并构建
   COPY . .
   RUN pnpm build
   
   # 生产阶段
   FROM node:20-alpine AS runner
   WORKDIR /app
   
   ENV NODE_ENV production
   
   # 创建用户
   RUN addgroup --system --gid 1001 nodejs
   RUN adduser --system --uid 1001 nextjs
   
   # 复制构建产物
   COPY --from=builder /app/.next/standalone ./
   COPY --from=builder /app/.next/static ./.next/static
   COPY --from=builder /app/public ./public
   
   USER nextjs
   
   EXPOSE 3000
   
   ENV PORT 3000
   ENV HOSTNAME "0.0.0.0"
   
   CMD ["node", "server.js"]
   ```

2. **构建Docker镜像**
   ```powershell
   # 构建前端镜像
   docker build -t inspect-frontend:latest .
   ```

3. **运行容器**
   ```powershell
   # 启动前端容器
   docker run -d --name inspect-frontend -p 3000:3000 inspect-frontend:latest
   ```

### 选项5：IIS部署

1. **安装IIS和相关模块**
   ```powershell
   # 启用IIS功能
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpLogging
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-RequestFiltering
   Enable-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent
   
   # 安装Node.js for IIS
   # 下载并安装 iisnode 模块
   ```

2. **配置IIS站点**
   ```powershell
   # 创建应用程序池
   New-WebAppPool -Name "InspectFrontend" -Force
   Set-ItemProperty -Path "IIS:\AppPools\InspectFrontend" -Name "managedRuntimeVersion" -Value ""
   
   # 创建网站
   New-Website -Name "InspectFrontend" -Port 3000 -PhysicalPath "C:\inetpub\wwwroot\inspect-frontend" -ApplicationPool "InspectFrontend"
   ```

3. **配置web.config**
   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <configuration>
     <system.webServer>
       <handlers>
         <add name="iisnode" path="server.js" verb="*" modules="iisnode"/>
       </handlers>
       <rewrite>
         <rules>
           <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
             <match url="^server.js\/debug[\/]?" />
           </rule>
           <rule name="StaticContent">
             <action type="Rewrite" url="public{REQUEST_URI}"/>
           </rule>
           <rule name="DynamicContent">
             <conditions>
               <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
             </conditions>
             <action type="Rewrite" url="server.js"/>
           </rule>
         </rules>
       </rewrite>
       <security>
         <requestFiltering>
           <hiddenSegments>
             <remove segment="bin"/>
           </hiddenSegments>
         </requestFiltering>
       </security>
       <httpErrors existingResponse="PassThrough" />
     </system.webServer>
   </configuration>
   ```

## 性能优化

### 构建优化

1. **包分析和优化**
   ```powershell
   # 安装包分析工具
   pnpm add --dev @next/bundle-analyzer
   
   # 分析构建包
   ANALYZE=true pnpm build
   ```

2. **代码分割配置**
   ```javascript
   // next.config.js
   const nextConfig = {
     experimental: {
       optimizeCss: true,
       optimizePackageImports: [
         'lucide-react',
         '@radix-ui/react-icons',
         'recharts',
         'framer-motion'
       ],
     },
     webpack: (config, { dev, isServer }) => {
       if (!dev && !isServer) {
         config.optimization.splitChunks.chunks = 'all';
       }
       return config;
     }
   }
   ```

3. **图片优化**
   ```javascript
   // next.config.js
   const nextConfig = {
     images: {
       formats: ['image/webp', 'image/avif'],
       deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
       imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
     }
   }
   ```

### 运行时优化

1. **内存管理**
   ```powershell
   # 设置Node.js内存限制
   $env:NODE_OPTIONS = "--max-old-space-size=4096"
   ```

2. **缓存策略**
   ```javascript
   // next.config.js
   const nextConfig = {
     async headers() {
       return [
         {
           source: '/api/:path*',
           headers: [
             { key: 'Cache-Control', value: 'no-cache' },
           ],
         },
         {
           source: '/_next/static/:path*',
           headers: [
             { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
           ],
         },
       ]
     }
   }
   ```

## 监控和日志

### 应用监控

1. **配置日志记录**
   
   创建`lib/logger.ts`：
   ```typescript
   import winston from 'winston';
   
   const logger = winston.createLogger({
     level: 'info',
     format: winston.format.json(),
     defaultMeta: { service: 'frontend' },
     transports: [
       new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
       new winston.transports.File({ filename: 'logs/combined.log' }),
     ],
   });
   
   if (process.env.NODE_ENV !== 'production') {
     logger.add(new winston.transports.Console({
       format: winston.format.simple()
     }));
   }
   
   export default logger;
   ```

2. **性能监控**
   ```typescript
   // lib/analytics.ts
   export function trackPageView(url: string) {
     if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
       // Google Analytics 或其他分析工具
       gtag('config', 'GA_MEASUREMENT_ID', {
         page_title: document.title,
         page_location: url,
       });
     }
   }
   ```

### 健康检查

1. **创建健康检查端点**
   
   在`pages/api/health.ts`：
   ```typescript
   import { NextApiRequest, NextApiResponse } from 'next';
   
   export default function handler(req: NextApiRequest, res: NextApiResponse) {
     const healthCheck = {
       status: 'ok',
       timestamp: new Date().toISOString(),
       uptime: process.uptime(),
       memory: process.memoryUsage(),
       version: process.env.npm_package_version || '1.0.0'
     };
     
     res.status(200).json(healthCheck);
   }
   ```

2. **Windows服务健康监控脚本**
   ```powershell
   # 创建健康检查脚本 health-check.ps1
   $healthCheck = @"
   $response = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -Method GET
   if ($response.status -eq "ok") {
       Write-Host "前端应用运行正常" -ForegroundColor Green
   } else {
       Write-Host "前端应用异常" -ForegroundColor Red
       # 添加告警逻辑
   }
   "@
   
   # 使用任务计划程序每5分钟执行一次
   ```

## 安全配置

### HTTPS配置

1. **生成SSL证书**
   ```powershell
   # 使用OpenSSL生成自签名证书（开发环境）
   openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
   
   # 或使用Let's Encrypt（生产环境）
   # 安装certbot并申请证书
   ```

2. **配置HTTPS服务器**
   ```javascript
   // server.js (自定义服务器)
   const { createServer } = require('https');
   const { parse } = require('url');
   const next = require('next');
   const fs = require('fs');
   
   const dev = process.env.NODE_ENV !== 'production';
   const app = next({ dev });
   const handle = app.getRequestHandler();
   
   const httpsOptions = {
     key: fs.readFileSync('./ssl/key.pem'),
     cert: fs.readFileSync('./ssl/cert.pem')
   };
   
   app.prepare().then(() => {
     createServer(httpsOptions, (req, res) => {
       const parsedUrl = parse(req.url, true);
       handle(req, res, parsedUrl);
     }).listen(3000, (err) => {
       if (err) throw err;
       console.log('> Ready on https://localhost:3000');
     });
   });
   ```

### 安全头配置

在`next.config.js`中添加安全头：

```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { 
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
          }
        ],
      },
    ]
  },
}
```

## 备份和恢复

### 代码备份

```powershell
# 创建备份脚本 backup-frontend.ps1
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\Inspect\backups\frontend_$timestamp"

New-Item -ItemType Directory -Path $backupDir -Force

# 备份源代码
Copy-Item "frontend\*" "$backupDir\source\" -Recurse -Force

# 备份构建产物
if (Test-Path "frontend\.next") {
    Copy-Item "frontend\.next\*" "$backupDir\build\" -Recurse -Force
}

# 备份配置文件
Copy-Item "frontend\.env*" "$backupDir\config\" -Force
Copy-Item "frontend\next.config.js" "$backupDir\config\" -Force
Copy-Item "frontend\package.json" "$backupDir\config\" -Force

# 压缩备份
Compress-Archive -Path $backupDir -DestinationPath "$backupDir.zip"
Remove-Item $backupDir -Recurse

Write-Host "前端备份完成: $backupDir.zip"
```

### 自动化备份

```powershell
# 创建定时备份任务
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\Inspect\scripts\backup-frontend.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "InspectFrontendBackup" -Action $action -Trigger $trigger -Settings $settings -Description "企业级网络设备巡检系统前端自动备份"
```

## 故障排除

### 常见问题

1. **端口被占用**
   ```powershell
   # 查找占用端口3000的进程
   netstat -ano | findstr :3000
   
   # 终止进程
   taskkill /PID <process_id> /F
   ```

2. **内存不足错误**
   ```powershell
   # 增加Node.js内存限制
   $env:NODE_OPTIONS = "--max-old-space-size=8192"
   pnpm build
   ```

3. **依赖安装失败**
   ```powershell
   # 清理依赖缓存
   pnpm store prune
   rm -rf node_modules
   rm pnpm-lock.yaml
   
   # 重新安装
   pnpm install
   ```

4. **构建失败**
   ```powershell
   # 检查TypeScript类型错误
   pnpm type-check
   
   # 检查ESLint错误
   pnpm lint
   
   # 清理.next目录
   rm -rf .next
   pnpm build
   ```

### 调试工具

1. **Next.js调试模式**
   ```powershell
   # 启用调试模式
   $env:NODE_OPTIONS = "--inspect"
   pnpm dev
   ```

2. **性能分析**
   ```powershell
   # 启动性能分析器
   pnpm dev --debug
   ```

3. **日志分析**
   ```powershell
   # 查看实时日志
   Get-Content "logs\frontend.log" -Wait -Tail 50
   
   # 过滤错误日志
   Get-Content "logs\frontend.log" | Select-String "ERROR"
   ```

## Windows服务部署

### 使用NSSM创建Windows服务

1. **安装NSSM**
   ```powershell
   # 下载NSSM从 https://nssm.cc/download
   # 解压到 C:\nssm\
   ```

2. **创建前端服务**
   ```powershell
   # 创建服务
   C:\nssm\nssm.exe install InspectFrontend C:\Program Files\nodejs\node.exe
   C:\nssm\nssm.exe set InspectFrontend Parameters "server.js"
   C:\nssm\nssm.exe set InspectFrontend AppDirectory "C:\Inspect\frontend"
   C:\nssm\nssm.exe set InspectFrontend DisplayName "Inspect系统前端服务"
   C:\nssm\nssm.exe set InspectFrontend Description "企业级网络设备巡检系统前端Web服务"
   
   # 配置环境变量
   C:\nssm\nssm.exe set InspectFrontend AppEnvironmentExtra NODE_ENV=production
   
   # 配置日志
   C:\nssm\nssm.exe set InspectFrontend AppStdout "C:\Inspect\logs\frontend\service.log"
   C:\nssm\nssm.exe set InspectFrontend AppStderr "C:\Inspect\logs\frontend\error.log"
   
   # 启动服务
   net start InspectFrontend
   ```

3. **服务管理**
   ```powershell
   # 查看服务状态
   Get-Service InspectFrontend
   
   # 停止服务
   net stop InspectFrontend
   
   # 重启服务
   net stop InspectFrontend && net start InspectFrontend
   
   # 删除服务
   C:\nssm\nssm.exe remove InspectFrontend confirm
   ```

## 生产环境检查清单

### 部署前检查

- [ ] Node.js版本 >= 20.0.0
- [ ] 所有依赖已安装且无安全漏洞
- [ ] 环境变量正确配置
- [ ] SSL证书已配置
- [ ] 防火墙规则已设置
- [ ] 备份策略已测试

### 部署后检查

- [ ] 应用启动正常
- [ ] 健康检查端点响应正常
- [ ] 前端页面加载正常
- [ ] API连接测试通过
- [ ] WebSocket连接正常
- [ ] 日志记录正常
- [ ] 监控告警已配置
- [ ] 自动备份正常运行
- [ ] 性能指标符合预期

## 维护和更新

### 日常维护任务

1. **每日检查**
   - 检查应用健康状态
   - 监控错误日志
   - 验证备份完成情况

2. **每周任务**
   - 检查性能指标
   - 更新依赖包（安全补丁）
   - 清理临时文件

3. **每月任务**
   - 全面安全检查
   - 日志归档和清理
   - 容量规划评估

### 更新流程

```powershell
# 前端应用更新流程
# 1. 备份当前版本
./scripts/backup-frontend.ps1

# 2. 拉取最新代码
git pull origin main

# 3. 安装依赖
cd frontend
pnpm install

# 4. 运行测试
pnpm test

# 5. 构建新版本
pnpm build

# 6. 更新生产环境
# 如果是服务方式运行
net stop InspectFrontend
net start InspectFrontend

# 7. 验证更新
curl http://localhost:3001/api/health
```

## 支持和资源

- **应用健康检查**: `http://localhost:3001/api/health`
- **开发工具**: React Developer Tools, Next.js 调试工具
- **日志位置**: `C:\Inspect\logs\frontend\`
- **配置文件**: `C:\Inspect\frontend\.env.local`
- **备份位置**: `C:\Inspect\backups\frontend\`
- **项目仓库**: `C:\coder\Inspect\`
- **包管理器**: pnpm (推荐)
- **技术栈**: React 18.3.1 + Next.js 15.5.0 + Tailwind CSS 3.4.17

---

## 当前项目状态

### 已实现功能模块
- ✅ **总览** - 系统dashboard页面
- ✅ **设备管理** - 设备列表和管理功能
- ✅ **监控中心** - 实时监控页面
- ✅ **告警中心** - 告警管理页面
- ✅ **报表分析** - 报表功能页面
- ✅ **系统设置** - 系统配置页面

### 已移除功能模块
- ❌ **网络拓扑** - 已从系统中移除
- ❌ **用户管理** - 已从系统中移除

### 技术架构确认
- **前端版本**: React 18.3.1 + Next.js 15.5.0
- **样式框架**: Tailwind CSS 3.4.17
- **包管理器**: pnpm 10.14.0
- **开发端口**: 3001 (自动分配)
- **PostCSS**: 已正确配置
- **TypeScript**: 严格模式启用

**注意**: 本部署指南适用于生产环境。开发环境部署请使用项目根目录的`/scripts/`目录下的开发脚本。