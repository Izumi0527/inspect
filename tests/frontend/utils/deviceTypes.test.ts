import {
  DEVICE_TYPE_OPTIONS,
  INSPECTABLE_DEVICE_TYPES,
  INSPECTABLE_DEVICE_TYPE_OPTIONS,
  deviceMatchesTemplate,
  getDeviceTypeLabel,
  isDeviceType,
  isInspectableDeviceType,
} from '@/utils/deviceTypes'

// 设备类型的中文名与模板匹配规则是全前端唯一来源，口径与后端
// inspection/device_types.go（DeviceTypeLabel / DeviceTypeAllowed）一致。
describe('deviceTypes', () => {
  it('中文标签覆盖台账全部类型，空值为未分类，未知值原样返回', () => {
    expect(getDeviceTypeLabel('switch')).toBe('交换机')
    expect(getDeviceTypeLabel(' Router ')).toBe('路由器')
    expect(getDeviceTypeLabel('firewall')).toBe('防火墙')
    expect(getDeviceTypeLabel('server')).toBe('服务器')
    expect(getDeviceTypeLabel('wireless_ap')).toBe('无线AP')
    expect(getDeviceTypeLabel('ap')).toBe('无线AP')
    expect(getDeviceTypeLabel('')).toBe('未分类')
    expect(getDeviceTypeLabel(undefined)).toBe('未分类')
    expect(getDeviceTypeLabel('storage')).toBe('storage')
  })

  it('可巡检类型恰为四类，顺序即界面顺序，无线 AP 不在其中', () => {
    expect(INSPECTABLE_DEVICE_TYPES).toEqual(['switch', 'router', 'firewall', 'server'])
    expect(INSPECTABLE_DEVICE_TYPE_OPTIONS.map(o => o.label)).toEqual(['交换机', '路由器', '防火墙', '服务器'])
    expect(isInspectableDeviceType('Server')).toBe(true)
    expect(isInspectableDeviceType('wireless_ap')).toBe(false)
  })

  it('台账选项包含服务器与无线AP', () => {
    expect(DEVICE_TYPE_OPTIONS.map(o => o.value)).toEqual(['switch', 'router', 'firewall', 'server', 'wireless_ap'])
    expect(isDeviceType('server')).toBe(true)
    expect(isDeviceType('storage')).toBe(false)
  })

  it('模板匹配：声明了类型就必须命中，未声明（存量）不限制', () => {
    expect(deviceMatchesTemplate(['switch'], 'switch')).toBe(true)
    expect(deviceMatchesTemplate(['switch'], ' SWITCH ')).toBe(true)
    expect(deviceMatchesTemplate(['switch'], 'router')).toBe(false)
    expect(deviceMatchesTemplate(['switch', 'router'], 'router')).toBe(true)
    expect(deviceMatchesTemplate([], 'router')).toBe(true)
    expect(deviceMatchesTemplate(undefined, 'router')).toBe(true)
    expect(deviceMatchesTemplate(['switch'], '')).toBe(false)
    expect(deviceMatchesTemplate(['switch', 'router', 'firewall', 'server'], 'wireless_ap')).toBe(false)
  })
})
