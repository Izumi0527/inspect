/**
 * 华为 VRP 真实日志的人话解读覆盖测试
 *
 * 样本全部取自开发库 device_logs 的实际采集结果，按占比从高到低选取，
 * 目的是防止规则表的措辞假设与设备实际上报格式脱节 —— 历史上正是因为
 * 规则按「login success」「Interface <字母开头名>」等书面形式编写，
 * 而华为实际上报「A user login.」「Interface 11 … InterfaceName Gi0/0/6」，
 * 导致九成以上日志退化为兜底文案。
 */
import { translateToPlainLanguage } from '@/lib/plain-language'

const DEVICE = '测试'

/** 真实采集样本（保持原样，勿手工美化） */
const SAMPLES = {
  userLogin:
    'LINE/5/VTYUSERLOGIN: OID 1.3.6.1.4.1.2011.5.25.207.2.2 A user login. (UserIndex=34, UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)',
  userLoginFail:
    'LINE/5/VTYUSERLOGINFAIL: OID 1.3.6.1.4.1.2011.5.25.207.2.3 A user login fail. (UserIndex=34, UserName=VTY, UserIP=192.168.20.2, UserChannel=VTY0)',
  interfaceDown:
    'IFNET/1/IF_PVCDOWN: OID 1.3.6.1.6.3.1.1.5.3 Interface 11 turned into DOWN state.(AdminStatus 1,OperStatus 2,InterfaceName GigabitEthernet0/0/6)',
  interfaceUp:
    'IFNET/6/IF_PVCUP: OID 1.3.6.1.6.3.1.1.5.4 Interface 5 turned into UP state.(AdminStatus 1,OperStatus 1,InterfaceName Vlanif1)',
  alarmBuffer:
    '18/Independent/2026-08-11 21:58:23-08:00/-/0x502001/linkDown/Critical/Start/OID 1.3.6.1.6.3.1.1.5.3 Interface 23 turned into DOWN state.(AdminStatus 1,OperStatus 2,InterfaceName GigabitEthernet0/0/18)',
  portForwarding:
    'MSTP/4/PFWD: OID 1.3.6.1.4.1.2011.5.25.42.4.2.1 The port has been set to forwarding state. (InstanceID=0, PortInstanceID=0, PortID=1, IfIndex=6, PortName=GigabitEthernet0/0/1)',
  fanLoss:
    'SRM/3/ENTITYINVALID: OID 1.3.6.1.4.1.2011.5.25.129.2.1.9 Fan loss.(EntityPhysicalIndex=603979777, BaseTrapSeverity=3, BaseTrapProbableCause=67591, BaseTrapEventType=5)',
  tempFalling:
    'SRM/3/TEMPFALLINGALARM: OID 1.3.6.1.4.1.2011.5.25.129.2.2.3 temperature below minor threshold .(EntityPhysicalIndex=603979777, BaseThresholdEntry_entPhysicalIndex=603979777)',

  // ============================================
  // display logbuffer 结构化解析后的正文形态
  // （后端 collector 已解出 %%01模块/级别/助记符 头，message 只含正文）
  // ============================================
  logbufferSshFail:
    'Failed to login. (UserName=admin, IpAddress=10.1.1.99, VpnName=_public_)',
  logbufferSshSuccess:
    'The user successfully logs in. (UserName=netops, UserAddress=192.168.20.10, VpnName=_public_)',
  logbufferErrorDown:
    'The interface GigabitEthernet0/0/8 changes to the error-down state. (Reason=CRC-ERROR-DOWN)',
  logbufferInterfaceDown:
    'Interface 6 turned into DOWN state.(InterfaceIndex=6, InterfaceName=GigabitEthernet0/0/22)',
  logbufferPowerRecover:
    'Power 1 has resumed. (EntityPhysicalIndex=603979809, BaseTrapSeverity=1)',
  logbufferAaaFail:
    'Authen fail. (UserName=test01, AuthenFailReason=Password has expired)',
  logbufferArpAttack:
    'The ARP packet speed exceed the configured speed limit. (SourceIp=10.1.1.5, DiscardNumber=1024)',

  // ============================================
  // 第二批：按 docs/vendor 华为产品文档告警节点定义扩充的事件
  // ============================================
  errorDownRecover:
    'The interface GigabitEthernet0/0/8 leaves the error-down state. (Reason=CRC-ERROR-DOWN)',
  errorDownRecoverAlt:
    'The interface GigabitEthernet0/0/8 recovers from error-down state. (Reason=LINK-FLAP-DOWN)',
  crcExceed:
    'The number of CRC error packets on the interface exceeds the alarm threshold. (InterfaceName=GigabitEthernet0/0/2)',
  broadcastExceed:
    'Broadcast packets on the interface exceed the suppress threshold. (InterfaceName=GigabitEthernet0/0/4)',
  cpuRising:
    'The CPU utilization has reached the rising alarm threshold. (CpuUsage=85%)',
  halfDuplex:
    'The interface GigabitEthernet0/0/3 works in half duplex mode.',
  dyingGasp:
    'Dying gasp is detected. (EntityPhysicalIndex=603979809)',
  flashInsufficient:
    'The storage space of flash: is insufficient.',
  clockChanged:
    'The system clock changed. (OldTime=2026-09-07 10:00:00, NewTime=2026-09-07 11:00:00)',
  fibOverload:
    'The FIB forwarding entries overload, the forwarding entries are cleared.',
  stackLinkDown:
    'The stack port 1 goes down.',
  boardOnline:
    'Board 1 is online.',
  configSave:
    'Save configuration successfully.',

  // LLDP 邻居三类事件（HUAWEI-LLDP-MIB）：变化/接入/移除
  lldpNeighborChange:
    'LLDP/4/NBRCHGTRAP: OID 1.0.8802.1.1.2.0.0.1 Neighbor info changed.',
  lldpNeighborAdd:
    'LLDP/6/NBRADD: OID 1.0.8802.1.1.2.0.0.1 New neighbor added. (IfIndex=4, PortName=GigabitEthernet0/0/5, SysName=AGG-SW)',
  lldpNeighborDelete:
    'LLDP/6/NBRDELETE: OID 1.0.8802.1.1.2.0.0.1 Neighbor deleted. (IfIndex=4, PortName=GigabitEthernet0/0/5)',

  // 实体告警绑定变量兜底：无专项规则时，兜底文案应还原文档枚举语义
  baseTrapFallback:
    'OID 1.3.6.1.4.1.2011.5.25.129.2.3.88 humidity sensor state changed.(EntityPhysicalIndex=603979777, BaseTrapSeverity=3, BaseTrapProbableCause=70656, EntPhysicalName=MPU Board 0)',
  baseTrapVrpFallback:
    '%%01SRM/4/HW_BASETRAP(l)[5]:Voltage sensor state changed.(EntityPhysicalIndex=603979777, BaseTrapSeverity=6, BaseThresholdEntry_hwBaseThresholdType=3, EntPhysicalName=MPU Board 0)',
} as const

const translate = (message: string, level: string, facility: string) =>
  translateToPlainLanguage({ message, level, facility, deviceName: DEVICE })

describe('华为 VRP 日志人话解读覆盖', () => {
  describe('用户接入', () => {
    it('用户登录应识别出账号与来源地址', () => {
      const result = translate(SAMPLES.userLogin, 'info', 'security')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('admin')
      expect(result.summary).toContain('192.168.20.2')
    })

    it('登录失败应判为告警并给出处置建议', () => {
      const result = translate(SAMPLES.userLoginFail, 'info', 'security')

      expect(result.matched).toBe(true)
      expect(result.tone).toBe('warning')
      expect(result.summary).toContain('192.168.20.2')
      expect(result.suggestion).toBeTruthy()
    })

    it('登录失败不得被登录成功规则抢先命中', () => {
      // VTYUSERLOGINFAIL 字面上包含 VTYUSERLOGIN，顺序写反会把失败读成成功
      const failed = translate(SAMPLES.userLoginFail, 'info', 'security')
      const success = translate(SAMPLES.userLogin, 'info', 'security')

      expect(failed.ruleId).not.toBe(success.ruleId)
      expect(failed.tone).toBe('warning')
      expect(success.tone).toBe('info')
    })
  })

  describe('接口链路', () => {
    it('接口 Down 应给出真实接口名而非索引号', () => {
      const result = translate(SAMPLES.interfaceDown, 'critical', 'interface')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('GigabitEthernet0/0/6')
      expect(result.tone).toBe('warning')
      expect(result.suggestion).toBeTruthy()
    })

    it('接口 Up 应给出真实接口名并判为恢复', () => {
      const result = translate(SAMPLES.interfaceUp, 'info', 'interface')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('Vlanif1')
      expect(result.tone).toBe('success')
    })

    it('告警缓冲区格式应复用接口规则', () => {
      const result = translate(SAMPLES.alarmBuffer, 'critical', 'interface')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('GigabitEthernet0/0/18')
    })
  })

  describe('生成树', () => {
    it('端口进入转发状态应说明端口名，且标题不得是词典错位的「修复建议」', () => {
      const result = translate(SAMPLES.portForwarding, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.title).not.toBe('修复建议')
      expect(result.summary).toContain('GigabitEthernet0/0/1')
    })
  })

  describe('LLDP 邻居（HUAWEI-LLDP-MIB）', () => {
    it('邻居信息变化应命中既有变化规则', () => {
      const result = translate(SAMPLES.lldpNeighborChange, 'info', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-lldp-neighbor-change')
      expect(result.tone).toBe('info')
    })

    it('新邻居接入应有专项规则，不再退化为兜底', () => {
      const result = translate(SAMPLES.lldpNeighborAdd, 'info', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-lldp-neighbor-add')
      expect(result.summary).toContain('新')
      expect(result.suggestion).toBeTruthy()
    })

    it('邻居移除应有专项规则并提示核查对端', () => {
      const result = translate(SAMPLES.lldpNeighborDelete, 'info', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-lldp-neighbor-delete')
      expect(result.summary).toContain('移除')
      expect(result.suggestion).toBeTruthy()
    })
  })

  describe('硬件与环境', () => {
    it('风扇丢失应识别为风扇故障', () => {
      const result = translate(SAMPLES.fanLoss, 'error', 'system')

      expect(result.matched).toBe(true)
      // 标题会被 OID 词典的官方术语「实体发生故障」覆盖（见 translate.ts 的 preferVendorTitle）——
      // hwEntityInvalid 是涵盖风扇/电源/单板的通用告警，具体是哪类实体只能由 summary 说明。
      expect(result.summary).toContain('风扇')
      expect(result.tone).toBe('critical')
    })

    it('温度低于门限不得被解读为温度过高', () => {
      const result = translate(SAMPLES.tempFalling, 'error', 'system')
      const text = `${result.title}${result.summary}`

      expect(result.matched).toBe(true)
      expect(text).not.toContain('过高')
      expect(text).not.toContain('越限')
      expect(text).toContain('低于')
    })
  })

  describe('logbuffer 正文（后端结构化解析后）', () => {
    it('SSH 登录失败应提取来源地址', () => {
      const result = translate(SAMPLES.logbufferSshFail, 'warning', 'ssh')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-ssh-login-fail')
      expect(result.summary).toContain('10.1.1.99')
      expect(result.tone).toBe('warning')
      expect(result.suggestion).toBeTruthy()
    })

    it('SSH 登录成功应识别来源并保持信息语气', () => {
      const result = translate(SAMPLES.logbufferSshSuccess, 'info', 'ssh')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('192.168.20.10')
      expect(result.tone).toBe('info')
    })

    it('Error-Down 应识别为端口保护关闭而非普通链路 Down', () => {
      const result = translate(SAMPLES.logbufferErrorDown, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-error-down')
      expect(result.tone).toBe('critical')
      expect(result.summary).toContain('Error-Down')
    })

    it('接口 Down 正文应给出真实接口名', () => {
      const result = translate(SAMPLES.logbufferInterfaceDown, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('GigabitEthernet0/0/22')
    })

    it('电源恢复应判为恢复而非故障', () => {
      const result = translate(SAMPLES.logbufferPowerRecover, 'info', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-hardware-recover')
      expect(result.tone).toBe('success')
    })

    it('AAA 认证失败应给出账号与失败原因指引', () => {
      const result = translate(SAMPLES.logbufferAaaFail, 'warning', 'security')

      expect(result.matched).toBe(true)
      expect(result.summary).toContain('test01')
      expect(result.tone).toBe('warning')
    })

    it('ARP 攻击防护应识别为告警', () => {
      const result = translate(SAMPLES.logbufferArpAttack, 'warning', 'security')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-arp-attack')
      expect(result.tone).toBe('warning')
    })
  })

  describe('Error-Down 恢复（文档 hwERRORDOWN 节点）', () => {
    it('恢复报文不得被误读为端口保护关闭', () => {
      const result = translate(SAMPLES.errorDownRecover, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-error-down-recover')
      expect(result.tone).toBe('success')
      expect(result.summary).toContain('恢复')
    })

    it('recover 在前、error-down 在后的语序同样应识别为恢复', () => {
      const result = translate(SAMPLES.errorDownRecoverAlt, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-error-down-recover')
      expect(result.tone).toBe('success')
    })
  })

  describe('性能门限类（文档 hwBaseThresholdTable 枚举）', () => {
    it('CRC 错包越限应给出物理层排查建议', () => {
      const result = translate(SAMPLES.crcExceed, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-crc-exceed')
      expect(result.tone).toBe('warning')
    })

    it('广播报文超阈值应识别风暴抑制场景', () => {
      const result = translate(SAMPLES.broadcastExceed, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-broadcast-exceed')
      expect(result.tone).toBe('warning')
    })

    it('CPU 利用率 rising 告警应命中 CPU 超阈值规则', () => {
      const result = translate(SAMPLES.cpuRising, 'warning', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('cpu-high')
      expect(result.tone).toBe('warning')
    })

    it('转发表超限保护应区别于普通表项超限', () => {
      const result = translate(SAMPLES.fibOverload, 'warning', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-fib-overload')
      expect(result.tone).toBe('warning')
    })
  })

  describe('硬件与环境扩充（文档 HUAWEI-ENTITY-TRAP-MIB 告警节点）', () => {
    it('半双工模式应识别为双工不匹配', () => {
      const result = translate(SAMPLES.halfDuplex, 'warning', 'interface')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-duplex-mismatch')
      expect(result.tone).toBe('warning')
    })

    it('Dying Gasp 应判为最高优先级掉电告急', () => {
      const result = translate(SAMPLES.dyingGasp, 'critical', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-dying-gasp')
      expect(result.tone).toBe('critical')
    })

    it('单板上线应判为恢复而非故障', () => {
      const result = translate(SAMPLES.boardOnline, 'info', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-board-online')
      expect(result.tone).toBe('success')
    })
  })

  describe('系统运行扩充', () => {
    it('存储空间不足应给出清理建议', () => {
      const result = translate(SAMPLES.flashInsufficient, 'warning', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-flash-full')
      expect(result.tone).toBe('warning')
    })

    it('系统时钟变更应为信息级别并提示日志时序影响', () => {
      const result = translate(SAMPLES.clockChanged, 'info', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-clock-change')
      expect(result.tone).toBe('info')
    })

    it('堆叠口 Down 应命中堆叠状态规则', () => {
      const result = translate(SAMPLES.stackLinkDown, 'warning', 'switching')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('huawei-stack-change')
      expect(result.tone).toBe('warning')
    })

    it('保存配置应命中配置变更规则', () => {
      const result = translate(SAMPLES.configSave, 'info', 'system')

      expect(result.matched).toBe(true)
      expect(result.ruleId).toBe('config-changed')
      expect(result.tone).toBe('info')
    })
  })

  describe('实体告警绑定变量兜底（文档 hwBaseTrapSeverity 等枚举）', () => {
    it('无专项规则时兜底应还原厂商告警级别与关联器件', () => {
      const result = translate(SAMPLES.baseTrapFallback, 'error', 'system')

      expect(result.matched).toBe(false)
      expect(result.summary).toContain('厂商告警级别：严重（3）')
      expect(result.summary).toContain('关联器件：MPU Board 0')
    })

    it('带 VRP 结构化头的兜底应同时还原监控对象枚举', () => {
      const result = translate(SAMPLES.baseTrapVrpFallback, 'warning', 'system')

      expect(result.matched).toBe(false)
      expect(result.title).toContain('系统资源管理')
      expect(result.summary).toContain('厂商告警级别：警告（6）')
      expect(result.summary).toContain('监控对象：电压传感器')
      expect(result.summary).toContain('HW_BASETRAP')
    })
  })
})
