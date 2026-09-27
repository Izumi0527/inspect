/**
 * 设备类型的中文名、选项与巡检模板匹配规则——全前端唯一来源。
 *
 * 口径与后端 inspection/device_types.go 一致：中文名对应 DeviceTypeLabel，
 * deviceMatchesTemplate 对应 DeviceTypeAllowed。台账、筛选、报表、巡检模板与
 * 策略弹窗都从这里取，不再各自维护一份映射。
 */

/** 台账可录入的设备类型，顺序即下拉顺序 */
export const DEVICE_TYPES = ['switch', 'router', 'firewall', 'server', 'wireless_ap'] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

/**
 * 可巡检的设备类型，每个内置模板恰好对应其中一种。
 * 无线 AP 刻意不在其中：AP 多由 AC 统一管理，不单独巡检。
 */
export const INSPECTABLE_DEVICE_TYPES = ['switch', 'router', 'firewall', 'server'] as const
export type InspectableDeviceType = (typeof INSPECTABLE_DEVICE_TYPES)[number]

const DEVICE_TYPE_LABELS: Record<string, string> = {
  switch: '交换机',
  router: '路由器',
  firewall: '防火墙',
  server: '服务器',
  ap: '无线AP',
  wireless_ap: '无线AP',
}

export const normalizeDeviceType = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase()

/** 设备类型中文名：空值为「未分类」，未识别的取值原样返回，不瞎翻 */
export const getDeviceTypeLabel = (value: string | null | undefined): string => {
  const normalized = normalizeDeviceType(value)
  if (!normalized) return '未分类'
  return DEVICE_TYPE_LABELS[normalized] ?? (value ?? '').trim()
}

export const isDeviceType = (value: unknown): value is DeviceType =>
  typeof value === 'string' && (DEVICE_TYPES as readonly string[]).includes(value)

export const isInspectableDeviceType = (value: string | null | undefined): value is InspectableDeviceType =>
  (INSPECTABLE_DEVICE_TYPES as readonly string[]).includes(normalizeDeviceType(value))

export const DEVICE_TYPE_OPTIONS: ReadonlyArray<{ value: DeviceType; label: string }> =
  DEVICE_TYPES.map(value => ({ value, label: DEVICE_TYPE_LABELS[value] }))

export const INSPECTABLE_DEVICE_TYPE_OPTIONS: ReadonlyArray<{ value: InspectableDeviceType; label: string }> =
  INSPECTABLE_DEVICE_TYPES.map(value => ({ value, label: DEVICE_TYPE_LABELS[value] }))

/**
 * 模板能否巡检该设备：模板声明了设备类型时，设备类型必须命中其一；
 * 未声明（仅存量数据）不限制。与后端执行入口的兜底守卫同一口径。
 */
export const deviceMatchesTemplate = (
  templateTypes: readonly string[] | null | undefined,
  deviceType: string | null | undefined
): boolean => {
  const types = (templateTypes ?? []).map(normalizeDeviceType).filter(Boolean)
  if (types.length === 0) return true
  const normalized = normalizeDeviceType(deviceType)
  return normalized !== '' && types.includes(normalized)
}
