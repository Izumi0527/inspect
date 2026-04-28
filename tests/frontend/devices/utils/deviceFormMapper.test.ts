import {
  buildFormInitialData,
  mapFormDataToApiPayload,
  mapFormDataToUpdatePayload,
} from '@/features/devices/utils/deviceFormMapper'

describe('deviceFormMapper', () => {
  it('编辑场景不应回填敏感凭据，并保留端口与已配置状态', () => {
    const initialData = buildFormInitialData({
      id: 1,
      name: 'edge-01',
      ip: '10.0.0.7',
      device_type: 'router',
      status: 'online',
      location: '机房-A',
      last_seen: '',
      uptime: '',
      cli_protocol: 'ssh',
      ssh_config: {
        username: 'netops',
        port: 2222,
        password_configured: true,
        private_key_configured: true,
      },
      snmp_config: {
        version: 'v2c',
        port: 1161,
        v2c_config: {
          community: '',
          write_community: '',
          community_configured: true,
          write_community_configured: true,
        },
      },
    })

    expect(initialData?.ssh_config?.password).toBe('')
    expect(initialData?.snmp_config?.v2c_config?.community).toBe('')
    expect(initialData?.ssh_config?.port).toBe(2222)
    expect(initialData?.snmp_config?.port).toBe(1161)
    expect(initialData?.ssh_config?.password_configured).toBe(true)
    expect(initialData?.snmp_config?.v2c_config?.community_configured).toBe(true)
  })

  it('新增场景应提交连接端口和显式输入的凭据', () => {
    const payload = mapFormDataToApiPayload({
      name: 'core-switch',
      ip: '192.168.1.1',
      device_type: 'switch',
      location: '机房-A',
      description: '',
      cli_protocol: 'ssh',
      ssh_config: {
        username: 'admin',
        password: 'secret',
        port: 2222,
        use_key_auth: false,
        private_key: '',
      },
      telnet_config: {
        username: '',
        password: '',
        port: 23,
        enable_password: '',
      },
      snmp_config: {
        version: 'v2c',
        port: 1161,
        v2c_config: {
          community: 'private',
          write_community: 'write-private',
        },
        v3_config: {
          username: '',
          security_level: 'noAuthNoPriv',
          auth_protocol: 'SHA',
          auth_password: '',
          priv_protocol: 'AES128',
          priv_password: '',
          context_name: '',
        },
      },
      advanced_config: {
        timeout: 30,
        retry: 3,
      },
      snmp_community: 'private',
      ssh_username: '',
      ssh_password: '',
    })

    expect(payload.snmp_port).toBe(1161)
    expect(payload.snmp_community).toBe('private')
    expect(payload.tags.snmp_config.port).toBe(1161)
    expect(payload.tags.snmp_config.v2c_config.write_community).toBe('write-private')
  })

  it('编辑场景留空凭据时不应覆盖已有敏感字段，但应提交非敏感更新', () => {
    const payload = mapFormDataToUpdatePayload({
      name: 'edge-01',
      ip: '10.0.0.7',
      device_type: 'router',
      location: '机房-B',
      description: 'updated',
      cli_protocol: 'ssh',
      ssh_config: {
        username: 'netops',
        password: '',
        port: 2222,
        use_key_auth: false,
        private_key: '',
      },
      telnet_config: {
        username: '',
        password: '',
        port: 23,
        enable_password: '',
      },
      snmp_config: {
        version: 'v2c',
        port: 1161,
        v2c_config: {
          community: '',
          write_community: '',
        },
        v3_config: {
          username: '',
          security_level: 'noAuthNoPriv',
          auth_protocol: 'SHA',
          auth_password: '',
          priv_protocol: 'AES128',
          priv_password: '',
          context_name: '',
        },
      },
      advanced_config: {
        timeout: 30,
        retry: 3,
      },
      snmp_community: '',
      ssh_username: '',
      ssh_password: '',
    })

    expect(payload.location).toBe('机房-B')
    expect(payload.description).toBe('updated')
    expect(payload.snmp_port).toBe(1161)
    expect(payload).not.toHaveProperty('snmp_community')
    expect(payload).not.toHaveProperty('ssh_password')
    expect(payload).not.toHaveProperty('telnet_password')
    expect(payload.tags.cli_config.ssh_config.password).toBeUndefined()
    expect(payload.tags.snmp_config.v2c_config.community).toBeUndefined()
  })

  it('应保留用户显式选择的 vendor，而不是总按 device_type 自动覆盖', () => {
    const payload = mapFormDataToApiPayload({
      name: 'agg-01',
      ip: '10.0.0.8',
      device_type: 'switch',
      vendor: 'huawei',
      location: '',
      description: '',
      cli_protocol: 'none',
      ssh_config: {
        username: '',
        password: '',
        port: 22,
        use_key_auth: false,
        private_key: '',
      },
      telnet_config: {
        username: '',
        password: '',
        port: 23,
        enable_password: '',
      },
      snmp_config: {
        version: 'v2c',
        port: 161,
        v2c_config: {
          community: 'public',
          write_community: '',
        },
        v3_config: {
          username: '',
          security_level: 'noAuthNoPriv',
          auth_protocol: 'SHA',
          auth_password: '',
          priv_protocol: 'AES128',
          priv_password: '',
          context_name: '',
        },
      },
      advanced_config: {
        timeout: 30,
        retry: 3,
      },
      snmp_community: 'public',
      ssh_username: '',
      ssh_password: '',
    } as any)

    expect(payload.vendor).toBe('huawei')
  })
})
