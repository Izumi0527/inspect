import { ApiClientError, getApiOrigin } from '@/lib/api-client'

export type MonitoringErrorAction = {
  label: string
  href: string
}

export type MonitoringErrorView = {
  title: string
  message: string
  primaryAction?: MonitoringErrorAction
  secondaryAction?: MonitoringErrorAction
  details?: string
}

export function resolveMonitoringErrorView(error: Error): MonitoringErrorView {
  const apiBaseUrl = getApiOrigin()
  const details = formatMonitoringErrorDetails(error)

  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return {
        title: '登录已过期',
        message: '登录已过期或令牌无效，请重新登录后再试。',
        primaryAction: {
          label: '去登录',
          href: `/login?redirect=${encodeURIComponent('/monitoring')}`,
        },
        details,
      }
    }

    if (error.status === 403) {
      return {
        title: '权限不足',
        message: '当前账号无权查看监控中心数据。请联系管理员开通权限后重试。',
        secondaryAction: {
          label: '查看系统设置',
          href: '/settings',
        },
        details,
      }
    }

    if (error.status === 404) {
      return {
        title: '接口未找到',
        message: '监控接口未找到，可能是后端版本未升级或路由未启用。',
        details,
      }
    }

    if (error.status >= 500) {
      return {
        title: '服务暂时不可用',
        message: '监控服务异常或正在维护，请稍后重试。',
        details,
      }
    }

    return {
      title: '请求失败',
      message: '监控数据请求未通过校验，请重试或联系管理员。',
      details,
    }
  }

  if (isAbortLikeError(error)) {
    return {
      title: '请求超时',
      message: '监控服务响应超时，请稍后重试。',
      details,
    }
  }

  if (isNetworkLikeError(error)) {
    return {
      title: '无法连接服务',
      message: `无法连接后端服务（${apiBaseUrl}）。请确认后端已启动且网络可达。`,
      details,
    }
  }

  return {
    title: '数据加载失败',
    message: '暂时无法加载监控数据，请稍后重试。',
    details,
  }
}

function isAbortLikeError(error: Error): boolean {
  if (error.name === 'AbortError') return true
  const message = error.message.toLowerCase()
  return message.includes('aborted') || message.includes('aborterror') || message.includes('timeout')
}

function isNetworkLikeError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('connection refused') ||
    message.includes('net::err')
  )
}

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatMonitoringErrorDetails(error: Error): string {
  if (error instanceof ApiClientError) {
    const detail =
      error.detail !== undefined ? safeStringify(error.detail).slice(0, 2000) : ''

    return [
      `name=${error.name}`,
      `status=${error.status}`,
      `type=${error.type}`,
      `message=${error.message}`,
      detail ? `detail=${detail}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [`name=${error.name}`, `message=${error.message}`].filter(Boolean).join('\n')
}
