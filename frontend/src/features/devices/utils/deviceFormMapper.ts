import { Device } from '../types'
import { DeviceFormData } from '../components/forms/DeviceForm'

const defaultVendorMap: Record<string, string> = {
  switch: 'huawei',
  router: 'huawei',
  firewall: 'other',
  wireless_ap: 'huawei',
}

const snmpVersionMap: Record<string, string> = {
  v2c: '2c',
  v3: '3',
  '2c': '2c',
  '3': '3',
}

const normalizeSnmpVersion = (value?: string | null): 'v2c' | 'v3' => {
  if (value === '3' || value === 'v3') return 'v3'
  return 'v2c'
}

const pickText = (...values: Array<string | null | undefined>) => {
  for (const item of values) {
    if (typeof item === 'string' && item.trim() !== '') {
      return item.trim()
    }
  }
  return ''
}

const includeSensitiveValue = (
  value: string,
  mode: 'create' | 'update',
): string | undefined => {
  if (value) return value
  if (mode === 'create') return undefined
  return undefined
}

const pickVendor = (vendor?: string | null, deviceType?: string | null) => {
  const explicitVendor = pickText(vendor)
  if (explicitVendor) {
    return explicitVendor
  }
  return defaultVendorMap[deviceType ?? ''] || 'other'
}

const buildCliTags = (formData: DeviceFormData, mode: 'create' | 'update') => {
  const shouldUseSSH = formData.cli_protocol === 'ssh'
  const shouldUseTelnet = formData.cli_protocol === 'telnet'
  const useKeyAuth = !!formData.ssh_config?.use_key_auth

  const sshUsername = shouldUseSSH
    ? pickText(formData.ssh_config?.username, formData.ssh_username)
    : ''
  const sshPassword = shouldUseSSH
    ? pickText(formData.ssh_config?.password, formData.ssh_password)
    : ''
  const sshPrivateKey = shouldUseSSH ? pickText(formData.ssh_config?.private_key) : ''

  const sshConfig = shouldUseSSH
    ? {
        username: sshUsername || undefined,
        port: formData.ssh_config?.port ?? 22,
        use_key_auth: useKeyAuth,
        password: useKeyAuth
          ? undefined
          : includeSensitiveValue(sshPassword, mode),
        private_key: useKeyAuth
          ? includeSensitiveValue(sshPrivateKey, mode)
          : undefined,
      }
    : undefined

  const telnetUsername = shouldUseTelnet ? pickText(formData.telnet_config?.username) : ''
  const telnetPassword = shouldUseTelnet ? pickText(formData.telnet_config?.password) : ''
  const enablePassword = shouldUseTelnet ? pickText(formData.telnet_config?.enable_password) : ''

  const telnetConfig = shouldUseTelnet
    ? {
        username: telnetUsername || undefined,
        port: formData.telnet_config?.port ?? 23,
        password: includeSensitiveValue(telnetPassword, mode),
        enable_password: includeSensitiveValue(enablePassword, mode),
      }
    : undefined

  return {
    cli_protocol: formData.cli_protocol ?? 'none',
    ssh_config: sshConfig,
    telnet_config: telnetConfig,
  }
}

const buildSnmpTags = (formData: DeviceFormData, mode: 'create' | 'update') => {
  const version = formData.snmp_config?.version ?? 'v2c'
  const readCommunity = pickText(
    formData.snmp_config?.v2c_config?.community,
    formData.snmp_community,
  )
  const writeCommunity = pickText(formData.snmp_config?.v2c_config?.write_community)

  return {
    version,
    port: formData.snmp_config?.port ?? 161,
    v2c_config: version !== 'v3'
      ? {
          community: includeSensitiveValue(readCommunity, mode),
          write_community: includeSensitiveValue(writeCommunity, mode),
        }
      : undefined,
    v3_config: version === 'v3'
      ? {
          username: pickText(formData.snmp_config?.v3_config?.username) || undefined,
          security_level: formData.snmp_config?.v3_config?.security_level ?? 'noAuthNoPriv',
          auth_protocol: formData.snmp_config?.v3_config?.auth_protocol,
          auth_password: includeSensitiveValue(
            pickText(formData.snmp_config?.v3_config?.auth_password),
            mode,
          ),
          priv_protocol: formData.snmp_config?.v3_config?.priv_protocol,
          priv_password: includeSensitiveValue(
            pickText(formData.snmp_config?.v3_config?.priv_password),
            mode,
          ),
          context_name: pickText(formData.snmp_config?.v3_config?.context_name) || undefined,
        }
      : undefined,
  }
}

/** 发送给后端的设备创建/更新 payload（与后端 DeviceCreateRequest snake_case 字段名对齐） */
interface DevicePayloadBody {
  name: string
  ip: string
  ip_address: string
  device_type: string
  vendor: string
  location: string
  description: string
  snmp_version: string
  snmp_port: number
  cli_protocol: string
  tags: {
    cli_config: ReturnType<typeof buildCliTags>
    snmp_config: ReturnType<typeof buildSnmpTags>
  }
  ssh_username?: string | null
  ssh_port?: number | null
  ssh_password?: string
  telnet_username?: string | null
  telnet_port?: number | null
  telnet_password?: string
  enable_password?: string
  snmp_community?: string
}

const buildCommonPayload = (formData: DeviceFormData, mode: 'create' | 'update'): DevicePayloadBody => {
  const shouldUseSSH = formData.cli_protocol === 'ssh'
  const shouldUseTelnet = formData.cli_protocol === 'telnet'
  const sshUsername = shouldUseSSH
    ? pickText(formData.ssh_config?.username, formData.ssh_username)
    : ''
  const sshPassword = shouldUseSSH
    ? pickText(formData.ssh_config?.password, formData.ssh_password)
    : ''
  const telnetUsername = shouldUseTelnet ? pickText(formData.telnet_config?.username) : ''
  const telnetPassword = shouldUseTelnet ? pickText(formData.telnet_config?.password) : ''
  const enablePassword = shouldUseTelnet ? pickText(formData.telnet_config?.enable_password) : ''
  const readCommunity = pickText(
    formData.snmp_config?.v2c_config?.community,
    formData.snmp_community,
  )

  const payload: DevicePayloadBody = {
    name: formData.name,
    ip: formData.ip,
    ip_address: formData.ip,
    device_type: formData.device_type,
    vendor: pickVendor(formData.vendor, formData.device_type),
    location: formData.location || '',
    description: formData.description || '',
    snmp_version: snmpVersionMap[formData.snmp_config?.version ?? 'v2c'] ?? '2c',
    snmp_port: formData.snmp_config?.port ?? 161,
    cli_protocol: formData.cli_protocol ?? 'none',
    tags: {
      cli_config: buildCliTags(formData, mode),
      snmp_config: buildSnmpTags(formData, mode),
    },
  }

  if (shouldUseSSH) {
    payload.ssh_username = sshUsername || null
    payload.ssh_port = formData.ssh_config?.port ?? 22
    if (sshPassword) {
      payload.ssh_password = sshPassword
    }
  } else {
    payload.ssh_username = null
    payload.ssh_port = null
  }

  if (shouldUseTelnet) {
    payload.telnet_username = telnetUsername || null
    payload.telnet_port = formData.telnet_config?.port ?? 23
    if (telnetPassword) {
      payload.telnet_password = telnetPassword
    }
    if (enablePassword) {
      payload.enable_password = enablePassword
    }
  } else {
    payload.telnet_username = null
    payload.telnet_port = null
  }

  if (formData.snmp_config?.version !== 'v3') {
    if (mode === 'create') {
      payload.snmp_community = readCommunity || 'public'
    } else if (readCommunity) {
      payload.snmp_community = readCommunity
    }
  }

  return payload
}

// 兼容原调用方：默认用于新增场景
export const mapFormDataToApiPayload = (formData: DeviceFormData) => mapFormDataToCreatePayload(formData)

export const mapFormDataToCreatePayload = (formData: DeviceFormData) => {
  return buildCommonPayload(formData, 'create')
}

export const mapFormDataToUpdatePayload = (formData: DeviceFormData) => {
  return buildCommonPayload(formData, 'update')
}

export type CreateDevicePayload = ReturnType<typeof mapFormDataToCreatePayload>
export type DevicePayload = ReturnType<typeof mapFormDataToUpdatePayload>

// 根据已有设备数据推导表单初始值，兼容旧字段
export const buildFormInitialData = (device?: Device | null): Partial<Device> | undefined => {
  if (!device) return undefined

  const cliProtocol: Device['cli_protocol'] =
    device.cli_protocol ||
    (device.telnet_config?.username
      ? 'telnet'
      : (device.ssh_username || device.ssh_config?.username ? 'ssh' : 'none'))

  const snmpVersion = normalizeSnmpVersion(device.snmp_config?.version ?? device.snmp_version)

  const sshConfig: Device['ssh_config'] = {
    username: device.ssh_config?.username ?? device.ssh_username ?? '',
    password: '',
    port: device.ssh_config?.port ?? device.ssh_port ?? 22,
    use_key_auth: device.ssh_config?.use_key_auth ?? false,
    private_key: '',
    password_configured: device.ssh_config?.password_configured ?? false,
    private_key_configured: device.ssh_config?.private_key_configured ?? false,
  }

  const telnetConfig: Device['telnet_config'] = {
    username: device.telnet_config?.username ?? '',
    password: '',
    port: device.telnet_config?.port ?? 23,
    enable_password: '',
    password_configured: device.telnet_config?.password_configured ?? false,
    enable_password_configured: device.telnet_config?.enable_password_configured ?? false,
  }

  const snmpConfig: Device['snmp_config'] = device.snmp_config
    ? {
        ...device.snmp_config,
        version: snmpVersion,
        port: device.snmp_config.port ?? 161,
        v2c_config: snmpVersion !== 'v3'
          ? {
              community: '',
              write_community: '',
              community_configured: device.snmp_config.v2c_config?.community_configured ?? false,
              write_community_configured: device.snmp_config.v2c_config?.write_community_configured ?? false,
            }
          : device.snmp_config.v2c_config,
        v3_config: snmpVersion === 'v3'
          ? {
              username: device.snmp_config.v3_config?.username ?? '',
              security_level: device.snmp_config.v3_config?.security_level ?? 'noAuthNoPriv',
              auth_protocol: device.snmp_config.v3_config?.auth_protocol ?? 'SHA',
              auth_password: '',
              priv_protocol: device.snmp_config.v3_config?.priv_protocol ?? 'AES128',
              priv_password: '',
              context_name: device.snmp_config.v3_config?.context_name ?? '',
              auth_password_configured: device.snmp_config.v3_config?.auth_password_configured ?? false,
              priv_password_configured: device.snmp_config.v3_config?.priv_password_configured ?? false,
            }
          : device.snmp_config.v3_config,
      }
    : {
        version: snmpVersion,
        port: 161,
        v2c_config: {
          community: '',
          write_community: '',
          community_configured: false,
          write_community_configured: false,
        },
        v3_config: {
          username: '',
          security_level: 'noAuthNoPriv',
          auth_protocol: 'SHA',
          auth_password: '',
          priv_protocol: 'AES128',
          priv_password: '',
          context_name: '',
          auth_password_configured: false,
          priv_password_configured: false,
        },
      }

  return {
    ...device,
    vendor: pickVendor(device.vendor, device.device_type),
    cli_protocol: cliProtocol,
    ssh_config: sshConfig,
    telnet_config: telnetConfig,
    snmp_config: snmpConfig,
    snmp_community: '',
    ssh_password: '',
    advanced_config: device.advanced_config || {
      timeout: 30,
      retry: 3,
    },
  }
}
