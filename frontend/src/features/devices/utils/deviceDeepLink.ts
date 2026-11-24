export type DeviceDeepLinkAction = 'view' | 'edit'

export type DeviceDeepLinkSection = 'credentials'

export type DeviceDeepLinkSource = 'monitoring'

export interface DeviceDeepLinkIntent {
  deviceId: number
  action: DeviceDeepLinkAction
  section?: DeviceDeepLinkSection
  source?: DeviceDeepLinkSource
  key: string
}

const DEEP_LINK_PARAM_KEYS = ['deviceId', 'action', 'section', 'from'] as const

const isPositiveSafeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0

const parsePositiveDeviceId = (raw: string | null): number | null => {
  const normalized = raw?.trim() ?? ''
  if (!/^\d+$/.test(normalized)) {
    return null
  }
  const parsed = Number(normalized)
  return isPositiveSafeInteger(parsed) ? parsed : null
}

/**
 * 解析设备管理页 URL 深链参数，仅放行白名单枚举值。
 */
export function parseDeviceDeepLink(
  searchParams: Pick<URLSearchParams, 'get'>,
): DeviceDeepLinkIntent | null {
  const deviceId = parsePositiveDeviceId(searchParams.get('deviceId'))
  if (deviceId === null) {
    return null
  }

  const action: DeviceDeepLinkAction =
    searchParams.get('action')?.trim() === 'edit' ? 'edit' : 'view'
  const section: DeviceDeepLinkSection | undefined =
    searchParams.get('section')?.trim() === 'credentials'
      ? 'credentials'
      : undefined
  // 严格白名单校验来源参数，拒绝任意 URL 以防范 Open Redirect
  const source: DeviceDeepLinkSource | undefined =
    searchParams.get('from')?.trim() === 'monitoring'
      ? 'monitoring'
      : undefined

  return {
    deviceId,
    action,
    section,
    source,
    key: `${deviceId}:${action}:${section ?? ''}:${source ?? ''}`,
  }
}

/**
 * 生成从监控抽屉跳转到设备管理页的深链地址。
 */
export function buildDeviceCredentialsEditHref(
  deviceId: number,
  options?: { canUpdate?: boolean },
): string {
  if (!isPositiveSafeInteger(deviceId)) {
    return '/devices'
  }
  if (options?.canUpdate !== false) {
    return `/devices?deviceId=${deviceId}&action=edit&section=credentials&from=monitoring`
  }
  return `/devices?deviceId=${deviceId}&from=monitoring`
}

/**
 * 生成返回监控中心单机抽屉的站内白名单地址。
 */
export function buildMonitoringHostDrawerHref(deviceId: number): string {
  if (isPositiveSafeInteger(deviceId)) {
    return `/monitoring?tab=hosts&hostId=${deviceId}`
  }
  return '/monitoring?tab=hosts'
}

/**
 * 清理设备深链参数并保留无关查询参数（如 search），未命中深链参数时返回 null。
 */
export function stripDeviceDeepLinkParams(
  searchParams: URLSearchParams,
  pathname: string,
): string | null {
  const next = new URLSearchParams(searchParams.toString())
  let changed = false

  for (const key of DEEP_LINK_PARAM_KEYS) {
    if (next.has(key)) {
      next.delete(key)
      changed = true
    }
  }

  if (!changed) {
    return null
  }

  const qs = next.toString()
  return `${pathname}${qs ? `?${qs}` : ''}`
}
