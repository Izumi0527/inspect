import { isNetworkConnectionError } from '@/lib/contexts/auth-context'

describe('isNetworkConnectionError', () => {
  it('应识别浏览器 fetch 连接失败错误', () => {
    expect(isNetworkConnectionError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkConnectionError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(true)
    expect(isNetworkConnectionError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
  })

  it('不应把普通业务错误识别为网络连接错误', () => {
    expect(isNetworkConnectionError(new Error('用户名或密码错误'))).toBe(false)
    expect(isNetworkConnectionError(null)).toBe(false)
  })
})
