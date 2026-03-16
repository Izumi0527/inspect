import { ApiClientError } from '@/lib/api-client'
import { resolveMonitoringErrorView } from '@/features/monitoring/utils/monitoring-error'

describe('resolveMonitoringErrorView', () => {
  it('401：应提示登录过期，并给出去登录入口', () => {
    const error = new ApiClientError({
      status: 401,
      type: 'unauthorized',
      message: 'Unauthorized',
    })

    const view = resolveMonitoringErrorView(error)
    expect(view.title).toBe('登录已过期')
    expect(view.primaryAction?.href).toContain('/login')
    expect(view.message).toContain('重新登录')
  })

  it('403：应提示权限不足，并给出系统设置入口', () => {
    const error = new ApiClientError({
      status: 403,
      type: 'forbidden',
      message: 'Forbidden',
    })

    const view = resolveMonitoringErrorView(error)
    expect(view.title).toBe('权限不足')
    expect(view.secondaryAction?.href).toBe('/settings')
  })

  it('网络错误：应提示无法连接服务', () => {
    const error = new TypeError('Failed to fetch')
    const view = resolveMonitoringErrorView(error)
    expect(view.title).toBe('无法连接服务')
  })
})
