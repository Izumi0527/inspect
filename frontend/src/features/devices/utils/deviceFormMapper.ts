import { Device } from '../types'
import { DeviceFormData } from '../components/DeviceForm'

// 将表单数据转换为后端 API 需要的字段格式
export const mapFormDataToApiPayload = (formData: DeviceFormData) => {
  const vendorMap: Record<string, string> = {
    switch: 'cisco',
    router: 'cisco',
    firewall: 'fortinet',
    wireless_ap: 'cisco'
  }

  const snmpVersionMap: Record<string, string> = {
    v2c: '2c',
    v3: '3',
    '2c': '2c',
    '3': '3'
  }

  const shouldUseTelnet = formData.cli_protocol === 'telnet'
  const shouldUseSSH = formData.cli_protocol === 'ssh'
  const sshUsername = shouldUseSSH
    ? (formData.ssh_config?.username || formData.ssh_username || '')
    : ''
  const sshPassword = shouldUseSSH
    ? (formData.ssh_config?.password || formData.ssh_password || '')
    : ''

  const tags = {
    cli_config: {
      cli_protocol: formData.cli_protocol ?? 'none',
      ssh_config: shouldUseSSH
        ? {
            username: sshUsername || '',
            password: sshPassword || '',
            port: formData.ssh_config?.port || 22
          }
        : undefined,
      telnet_config: shouldUseTelnet
        ? {
            username: formData.telnet_config?.username || '',
            password: formData.telnet_config?.password || '',
            port: formData.telnet_config?.port || 23,
            enable_password: formData.telnet_config?.enable_password || ''
          }
        : undefined
    },
    snmp_config: {
      version: formData.snmp_config?.version ?? 'v2c',
      port: formData.snmp_config?.port ?? 161,
      v2c_config: formData.snmp_config?.version !== 'v3'
        ? {
            community: formData.snmp_config?.v2c_config?.community || formData.snmp_community || 'public',
            write_community: formData.snmp_config?.v2c_config?.write_community || ''
          }
        : undefined,
      v3_config: formData.snmp_config?.version === 'v3'
        ? formData.snmp_config?.v3_config
        : undefined
    }
  }

  return {
    name: formData.name,
    ip: formData.ip,
    ip_address: formData.ip,
    device_type: formData.device_type === 'wireless_ap' ? 'ap' : formData.device_type,
    vendor: vendorMap[formData.device_type] || 'other',
    location: formData.location || '',
    description: formData.description || '',
    snmp_community: formData.snmp_config?.v2c_config?.community || 'public',
    snmp_version: snmpVersionMap[formData.snmp_config?.version ?? 'v2c'] ?? '2c',
    cli_protocol: formData.cli_protocol ?? 'none',
    ssh_username: shouldUseSSH ? sshUsername || null : null,
    ssh_password: shouldUseSSH ? sshPassword || null : null,
    ssh_port: shouldUseSSH ? (formData.ssh_config?.port || 22) : null,
    telnet_username: shouldUseTelnet ? (formData.telnet_config?.username || null) : null,
    telnet_password: shouldUseTelnet ? (formData.telnet_config?.password || null) : null,
    telnet_port: shouldUseTelnet ? (formData.telnet_config?.port || 23) : null,
    enable_password: shouldUseTelnet ? (formData.telnet_config?.enable_password || null) : null,
    tags
  }
}

export type DevicePayload = ReturnType<typeof mapFormDataToApiPayload>

// 根据已有设备数据推导表单初始值，兼容旧字段
export const buildFormInitialData = (device?: Device | null): Partial<Device> | undefined => {
  if (!device) return undefined

  const cliProtocol: Device['cli_protocol'] =
    device.cli_protocol ||
    (device.telnet_config?.username ? 'telnet' :
    (device.ssh_username || device.ssh_password ? 'ssh' : 'none'))

  const normalizeVersion = (version?: string | null) => {
    if (!version) return 'v2c'
    if (version === '2c' || version === 'v2c') return 'v2c'
    if (version === '3' || version === 'v3') return 'v3'
    return 'v2c'
  }

  const normalizedSnmpVersion = normalizeVersion(device.snmp_config?.version ?? device.snmp_version)

  return {
    ...device,
    cli_protocol: cliProtocol,
    ssh_config: device.ssh_config || {
      username: device.ssh_username || '',
      password: device.ssh_password || '',
      port: device.ssh_port || 22,
      use_key_auth: false,
      private_key: ''
    },
    telnet_config: device.telnet_config || {
      username: '',
      password: '',
      port: 23,
      enable_password: ''
    },
    snmp_config: device.snmp_config
      ? {
          ...device.snmp_config,
          version: normalizedSnmpVersion
        }
      : {
      version: normalizedSnmpVersion,
      port: 161,
      v2c_config: {
        community: device.snmp_community || 'public',
        write_community: ''
      },
      v3_config: {
        username: '',
        security_level: 'noAuthNoPriv'
      }
    },
    advanced_config: device.advanced_config || {
      timeout: 30,
      retry: 3
    }
  }
}
