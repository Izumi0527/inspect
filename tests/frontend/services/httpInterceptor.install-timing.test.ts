/**
 * HTTP 拦截器安装时机回归测试
 *
 * 背景：拦截器 patch 的是全局 window.fetch，属于不隶属任何组件生命周期的全局副作用。
 * 此前它在 Providers 组件的 useEffect 中安装，而 React 的 effect 执行顺序是「子先于父」，
 * 导致子组件 AuthProvider 在自己 effect 中发出的首个请求（/auth/profile）早于拦截器安装，
 * 绕过了 X-Request-ID 注入与请求日志——表现为该请求在控制台完全没有 [api] 日志，
 * 且随后 refresh 请求的 requestId 计数器仍从 1 开始。
 *
 * 本文件不渲染任何组件：断言能在「零渲染」前提下成立，本身就证明了安装不依赖组件 effect。
 */
import httpInterceptor from '@/services/httpInterceptor'

describe('HTTP 拦截器安装时机', () => {
  it('模块加载完成时即应就绪，不依赖任何组件 effect', () => {
    const stats = httpInterceptor.getStats()

    expect(stats.isInitialized).toBe(true)
    expect(stats.isActive).toBe(true)
  })

  it('重复调用 initialize 应幂等，不得二次包装 window.fetch', () => {
    const patched = window.fetch

    httpInterceptor.initialize()

    // 若非幂等，window.fetch 会被再包一层，且新实例会把「已包装的 fetch」误存为 originalFetch
    expect(window.fetch).toBe(patched)
    expect(httpInterceptor.getStats().isActive).toBe(true)
  })
})
