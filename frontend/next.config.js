/** @type {import('next').NextConfig} */
// 默认关闭 Next Telemetry，避免构建时通过 git 子进程探测项目 ID（在部分受限环境会触发 spawn EPERM）。
process.env.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED || '1'

// 版本号权威源是仓库根 VERSION 文件（安装包构建经 NEXT_PUBLIC_APP_VERSION 注入同一来源）；
// dev 下直接读 VERSION，仓库外构建（无该文件）回退 package.json version。
function resolveAppVersion() {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION
  try {
    const version = require('fs').readFileSync(require('path').join(__dirname, '..', 'VERSION'), 'utf8').trim()
    if (version) return version
  } catch {
    // VERSION 文件不存在（独立构建前端）时走 package.json
  }
  return require('./package.json').version
}

const nextConfig = {
  // React Strict Mode for better development experience
  reactStrictMode: true,

  // 应用版本号（构建时由 NEXT_PUBLIC_APP_VERSION 注入，未注入时回退 VERSION 文件 / package.json）
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
  
  // Experimental features for React 19
  experimental: {
    // Enable React Compiler if available
    reactCompiler: false,
    // Optimize package imports
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'framer-motion'],
    // 注意：不要开启 workerThreads。Next 在静态页面生成阶段会把 nextConfig 传入 worker_threads，
    // 其中包含默认配置函数（例如 generateBuildId），会触发 DataCloneError（函数无法结构化克隆）。
    workerThreads: false,
    // 避免使用独立的 webpack 编译 worker（jest-worker 子进程），否则在受限环境下可能触发 spawn EPERM。
    webpackBuildWorker: false,
  },

  // Performance optimizations
  poweredByHeader: false,
  compress: true,

  // Image optimization
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  // TypeScript and ESLint configuration
  typescript: {
    // 说明：我们在 CI/开发中通过 `pnpm run type-check` 统一做类型检查；
    // Next 内置的构建期类型校验在部分 Windows 环境下可能因子进程创建失败（spawn EPERM）导致构建中断。
    // 因此这里关闭 Next 构建期类型校验，避免部署链路被环境差异阻断。
    ignoreBuildErrors: true,
  },
  eslint: {
    // Next lint 已在脚本中单独执行（pnpm run lint），构建阶段不再重复执行。
    ignoreDuringBuilds: true,
  },

  // PWA 配置（保留 rewrite 与缓存头，避免 sw/manifest 被错误缓存）
  async rewrites() {
    return [
      {
        source: '/sw.js',
        destination: '/sw.js',
      },
      {
        source: '/manifest.json',
        destination: '/manifest.json',
      },
    ]
  },

  // Bundle analyzer configuration (conditionally loaded)
  webpack: (config, { dev, isServer }) => {
    // Bundle analysis
    if (process.env.ANALYZE === 'true' && !isServer) {
      const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: false,
          reportFilename: '../bundle-analysis.html',
        }),
      )
    }

    // Optimize for production builds
    if (!dev && !isServer) {
      // Next 默认已配置 splitChunks，这里在不破坏默认行为的前提下补充 cacheGroups。
      const optimization = config.optimization ?? {}
      const splitChunksRaw = optimization.splitChunks
      const splitChunks =
        splitChunksRaw && typeof splitChunksRaw === 'object' ? splitChunksRaw : {}

      splitChunks.cacheGroups = {
        ...(splitChunks.cacheGroups ?? {}),
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10,
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5,
        },
      }

      config.optimization = {
        ...optimization,
        splitChunks,
      }
    }

    return config
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400', // 24 hours
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
