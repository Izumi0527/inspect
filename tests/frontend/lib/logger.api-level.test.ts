/**
 * logApiCall 日志分级回归测试
 *
 * 背景：未登录访问落地页时，AuthProvider 会主动探测登录态
 * （/auth/profile → 失败后 /auth/refresh），两个请求必然返回 401，
 * 且 auth-context 用空 catch 明确将其视为预期结果。
 *
 * 但 logApiCall 曾把所有 status>=400 一律记为 ERROR，经 console.error 输出后
 * 被 Next.js dev overlay 捕获，在开发环境首页持续显示误导性的 "1 Issue" 红色徽章。
 *
 * 正确语义（与 httpInterceptor.logRequestComplete 的分级保持一致）：
 *   5xx 服务端故障 → ERROR；4xx 请求侧预期内结果 → WARN；2xx/3xx → DEBUG。
 */
import { LogLevel, clearLogs, getLogs, logApiCall, setLogLevel } from '@/lib/logger'

describe('logApiCall 按 HTTP 语义分级', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    // 测试环境下 logger 默认级别为 ERROR，会过滤掉 WARN/DEBUG，需放开才能观察分级结果
    setLogLevel(LogLevel.DEBUG)
    clearLogs()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'debug').mockImplementation(() => {})
  })

  const lastLevel = (): LogLevel => {
    const logs = getLogs()
    return logs[logs.length - 1].level
  }

  it('401 未登录探测不得写入 console.error（否则 Next.js dev overlay 会误报 Issue）', () => {
    logApiCall('POST', 'http://localhost:18080/api/v1/auth/refresh', 401, 13)

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    expect(lastLevel()).toBe(LogLevel.WARN)
  })

  it('403/404 等 4xx 记为 WARN', () => {
    logApiCall('GET', 'http://localhost:18080/api/v1/devices/999', 404, 8)
    expect(lastLevel()).toBe(LogLevel.WARN)

    logApiCall('POST', 'http://localhost:18080/api/v1/devices', 403, 8)
    expect(lastLevel()).toBe(LogLevel.WARN)

    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('5xx 服务端故障仍记为 ERROR', () => {
    logApiCall('GET', 'http://localhost:18080/api/v1/monitoring/overview', 500, 20)

    expect(lastLevel()).toBe(LogLevel.ERROR)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('2xx 成功响应记为 DEBUG', () => {
    logApiCall('GET', 'http://localhost:18080/api/v1/auth/profile', 200, 5)

    expect(lastLevel()).toBe(LogLevel.DEBUG)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
