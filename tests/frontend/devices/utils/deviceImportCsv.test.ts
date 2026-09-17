import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util'
import {
  detectImportField,
  decodeCsvBytes,
  parseCsv,
  buildImportDevice,
  IMPORT_FIELD_DEFINITIONS,
  IMPORT_TEMPLATE_HEADERS,
} from '@/features/devices/utils/deviceImportCsv'

// jsdom 不带 TextEncoder/TextDecoder，浏览器里原生存在
beforeAll(() => {
  Object.assign(globalThis, { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder })
})

describe('deviceImportCsv', () => {
  describe('detectImportField', () => {
    it('模板全部列头都能被识别到对应字段', () => {
      const detected = IMPORT_TEMPLATE_HEADERS.map(detectImportField)
      expect(detected).toEqual(IMPORT_FIELD_DEFINITIONS.map((field) => field.key))
    })

    it('英文 description 不应因包含 "ip" 而误判为 IP 地址', () => {
      expect(detectImportField('description')).toBe('description')
      expect(detectImportField('Description')).toBe('description')
    })

    it('SNMP 版本/端口 与 SNMP 团体字符串 不互相串扰', () => {
      expect(detectImportField('SNMP版本')).toBe('snmp_version')
      expect(detectImportField('SNMP端口')).toBe('snmp_port')
      expect(detectImportField('SNMP团体字符串')).toBe('snmp_community')
      expect(detectImportField('snmp_community')).toBe('snmp_community')
    })

    it('SSH 用户名/密码/端口与 Telnet 字段各自独立', () => {
      expect(detectImportField('SSH用户名')).toBe('ssh_username')
      expect(detectImportField('SSH密码')).toBe('ssh_password')
      expect(detectImportField('SSH端口')).toBe('ssh_port')
      expect(detectImportField('Telnet用户名')).toBe('telnet_username')
      expect(detectImportField('Telnet密码')).toBe('telnet_password')
      expect(detectImportField('Enable密码')).toBe('enable_password')
    })

    it('无法识别的列返回空串', () => {
      expect(detectImportField('备注列')).toBe('')
    })
  })

  describe('decodeCsvBytes', () => {
    it('带 BOM 的 UTF-8 正常解码并去掉 BOM', () => {
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('设备名称,IP地址')])
      expect(decodeCsvBytes(bytes)).toBe('设备名称,IP地址')
    })

    it('Excel 另存为 ANSI(GBK) 的 CSV 也能正确解码中文列头', () => {
      // "设备名称" 的 GBK 编码
      const gbk = new Uint8Array([0xc9, 0xe8, 0xb1, 0xb8, 0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0x49, 0x50])
      expect(decodeCsvBytes(gbk)).toBe('设备名称,IP')
    })
  })

  describe('parseCsv', () => {
    it('支持带引号字段内的逗号与转义引号', () => {
      const parsed = parseCsv('name,pwd\r\n"核心,交换机","p@ss""word"\r\n')
      expect(parsed.headers).toEqual(['name', 'pwd'])
      expect(parsed.rows).toEqual([['核心,交换机', 'p@ss"word']])
    })

    it('空文件或只有表头时报错', () => {
      expect(() => parseCsv('name,ip\n')).toThrow()
    })
  })

  describe('buildImportDevice', () => {
    it('中文设备类型/厂商别名归一化，并按 SSH 凭据推断 CLI 协议', () => {
      const device = buildImportDevice({
        name: ' 核心 ',
        ip: '10.0.0.1 ',
        device_type: '无线AP',
        vendor: '华为',
        ssh_username: 'admin',
        ssh_password: 'secret',
      })
      expect(device.name).toBe('核心')
      expect(device.ip).toBe('10.0.0.1')
      expect(device.device_type).toBe('wireless_ap')
      expect(device.vendor).toBe('huawei')
      expect(device.cli_protocol).toBe('ssh')
    })

    it('显式 CLI 协议与端口/SNMP 版本被保留', () => {
      const device = buildImportDevice({
        name: 'a',
        ip: '10.0.0.2',
        device_type: 'router',
        vendor: 'H3C',
        cli_protocol: 'Telnet',
        telnet_username: 'ops',
        telnet_port: '2323',
        snmp_version: 'v3',
        snmp_port: '1161',
      })
      expect(device.vendor).toBe('h3c')
      expect(device.cli_protocol).toBe('telnet')
      expect(device.telnet_port).toBe(2323)
      expect(device.snmp_version).toBe('v3')
      expect(device.snmp_port).toBe(1161)
    })

    it('未知厂商落 other，非法端口忽略，无凭据时协议为 none', () => {
      const device = buildImportDevice({ name: 'a', ip: '1.1.1.1', device_type: 'switch', vendor: 'Cisco', ssh_port: 'abc' })
      expect(device.vendor).toBe('other')
      expect(device.ssh_port).toBeUndefined()
      expect(device.cli_protocol).toBe('none')
    })
  })
})
