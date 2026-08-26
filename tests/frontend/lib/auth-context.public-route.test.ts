import { isPublicRoute } from '@/lib/contexts/auth-context'

// 公开路由白名单决定 AuthProvider 是否跳过认证探测，属安全边界：
// 误判受保护路由为公开会导致该页不做登录态探测。
describe('isPublicRoute', () => {
  it('应把落地页判为公开', () => {
    expect(isPublicRoute('/')).toBe(true)
  })

  it('应把文档与健康检查页及其子路径判为公开', () => {
    expect(isPublicRoute('/docs')).toBe(true)
    expect(isPublicRoute('/docs/PROJECT_ARCHITECTURE.md')).toBe(true)
    expect(isPublicRoute('/health')).toBe(true)
  })

  it('不应把前缀相近的其他路径误判为公开', () => {
    expect(isPublicRoute('/docsomething')).toBe(false)
    expect(isPublicRoute('/healthcheck-admin')).toBe(false)
  })

  it('/login 不属于公开页：withGuest 依赖探测结果做已登录重定向', () => {
    expect(isPublicRoute('/login')).toBe(false)
  })

  it('受保护业务页均不属于公开页', () => {
    for (const p of ['/dashboard', '/devices', '/monitoring', '/settings', '/change-password']) {
      expect(isPublicRoute(p)).toBe(false)
    }
  })

  it('pathname 缺失时按非公开处理，宁可多探测一次也不跳过认证', () => {
    expect(isPublicRoute(null)).toBe(false)
  })
})
