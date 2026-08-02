/**
 * 人话翻译层 —— 规则表
 *
 * 覆盖网络设备最常见的日志/告警场景，华为 VRP 与思科 IOS 两种格式并存。
 *
 * ## 顺序即优先级
 * 引擎按数组顺序逐条尝试、先命中先返回，因此**越具体的规则必须排在越前面**。
 * 典型例子：思科 `%LINEPROTO-5-UPDOWN` 的报文同时含「Interface X」和「down」，
 * 若通用的接口断开规则排在前面，就永远轮不到更精确的链路协议规则。
 *
 * ## 模板占位
 * - `{device}` 设备名，缺省回退为「该设备」
 * - `{1}`~`{9}` 捕获组原样填充
 * - `{1:iface}` 捕获组经接口名词典转换（GigabitEthernet0/0/1 → 千兆网口 0/0/1）
 * - `{1:state}` 捕获组经状态词词典转换
 *
 * ## 文案原则
 * - summary 说清「发生了什么」+「对我有什么影响」，不堆术语
 * - suggestion 给普通人能直接执行的动作，不写「请检查配置」这种空话
 */

import type { PlainLanguageRule } from './types'

/** 接口名的通用字符集：字母开头，允许数字、斜杠、点、冒号、连字符 */
const IFACE = '([A-Za-z][\\w\\-/.:]*)'

export const PLAIN_LANGUAGE_RULES: ReadonlyArray<PlainLanguageRule> = [
  // ==========================================
  // 接口类
  // ==========================================
  {
    // 必须排在「接口断开」之前：其报文同样含 Interface X + down
    id: 'line-protocol-down',
    pattern: new RegExp(`line protocol[\\s\\S]{0,40}?interface\\s+${IFACE}[\\s\\S]{0,60}?\\bdown\\b`, 'i'),
    title: '线路不通',
    summary: '{device} 的 {1:iface} 网线插着，但数据传不过去，通常是两端设置不一致或线路本身有问题。',
    suggestion: '请联系网络管理员核对线路两端的设置；若是自行更换过网线，建议换一根测试。',
    tone: 'warning',
  },
  {
    id: 'interface-down',
    pattern: new RegExp(`interface\\s+${IFACE}[\\s\\S]{0,60}?\\bdown\\b`, 'i'),
    title: '网络接口断开',
    summary: '{device} 的 {1:iface} 已断开连接，接在这个口上的设备将无法上网。',
    suggestion: '请检查该端口的网线是否松动或脱落，以及对端的电脑、摄像头等设备是否已关机。',
    tone: 'warning',
  },
  {
    id: 'interface-up',
    pattern: new RegExp(`interface\\s+${IFACE}[\\s\\S]{0,60}?\\bup\\b`, 'i'),
    title: '网络接口已恢复',
    summary: '{device} 的 {1:iface} 已重新连接，网络恢复正常。',
    tone: 'success',
  },
  {
    id: 'interface-flapping',
    pattern: /(?:flap|flapping)/i,
    title: '网络接口不稳定',
    summary: '{device} 的某个网口在短时间内反复断开又连上，网络会时好时坏。',
    suggestion: '这种情况多半是网线接触不良或水晶头氧化，建议重新插拔网线，必要时更换网线。',
    tone: 'warning',
  },
  {
    id: 'transceiver-fault',
    pattern: /(?:transceiver|sfp|optical|光模块)[\s\S]{0,40}?(?:fail|error|absent|abnormal|invalid|不在位|异常)/i,
    title: '光模块异常',
    summary: '{device} 的光纤模块出现异常，可能未插好、型号不兼容或已损坏。',
    suggestion: '请确认光模块是否插紧；若刚更换过模块，请核对型号是否与设备匹配。',
    tone: 'warning',
  },

  // ==========================================
  // 安全类
  // ==========================================
  {
    id: 'login-failed',
    pattern: /(?:failed to login|login failed|authentication (?:failed|failure)|auth fail|authorization failed|登录失败)/i,
    title: '有人登录设备失败',
    summary: '有人尝试登录 {device} 但密码不正确。',
    suggestion: '如果不是自己或同事在操作，可能有人在猜测密码，建议尽快修改设备密码并限制可登录的来源地址。',
    tone: 'warning',
  },
  {
    id: 'login-success',
    pattern: /(?:login success|logged in|login successfully|登录成功)/i,
    title: '有人登录了设备',
    summary: '有人成功登录了 {device}。',
    tone: 'info',
  },
  {
    id: 'user-logout',
    pattern: /(?:logout|logged out|log out|disconnect(?:ed)? from|退出登录)/i,
    title: '用户已退出设备',
    summary: '有人结束了对 {device} 的操作并退出登录。',
    tone: 'info',
  },
  {
    id: 'acl-deny',
    pattern: /(?:acl|access.?list|firewall)[\s\S]{0,40}?(?:deny|denied|drop|blocked)/i,
    title: '访问被安全策略拦截',
    summary: '{device} 按照既定的安全规则，拦截了一次网络访问。',
    suggestion: '若是正常业务被拦截，请联系网络管理员调整放行规则。',
    tone: 'info',
  },
  {
    id: 'port-security-violation',
    pattern: /port.?security[\s\S]{0,40}?violat/i,
    title: '有未授权设备接入',
    summary: '{device} 上有未经许可的设备试图接入网络，已被阻止。',
    suggestion: '请确认是否有同事私自接入了交换机或路由器；若是新设备需要接入，请联系管理员登记。',
    tone: 'warning',
  },

  // ==========================================
  // 路由类
  // ==========================================
  {
    id: 'ospf-neighbor-down',
    pattern: /ospf[\s\S]{0,60}?(?:down|loading|init|nbr_chg)/i,
    title: '路由邻居中断',
    summary: '{device} 与相邻的网络设备失去了路由联系，部分网络可能绕路或不通。',
    suggestion: '请检查两台设备之间的链路是否正常；若链路正常仍不恢复，需联系网络管理员排查。',
    tone: 'warning',
  },
  {
    id: 'ospf-neighbor-up',
    pattern: /ospf[\s\S]{0,60}?(?:full|adjacency.{0,20}up)/i,
    title: '路由邻居已恢复',
    summary: '{device} 与相邻网络设备的路由联系已恢复正常。',
    tone: 'success',
  },
  {
    id: 'bgp-neighbor-down',
    pattern: /bgp[\s\S]{0,60}?(?:down|idle|closed|连接断开)/i,
    title: '外部路由连接中断',
    summary: '{device} 与外部网络的路由连接已断开，访问外网或分支机构可能受影响。',
    suggestion: '若涉及专线或互联网出口，建议同时联系线路运营商确认线路状态。',
    tone: 'critical',
  },
  {
    id: 'route-flap',
    pattern: /route[\s\S]{0,30}?flap/i,
    title: '路由不稳定',
    summary: '{device} 的网络路径在频繁变化，访问可能时快时慢或偶尔中断。',
    suggestion: '通常由线路不稳定引起，建议联系网络管理员检查上游线路质量。',
    tone: 'warning',
  },

  // ==========================================
  // 交换类
  // ==========================================
  {
    id: 'stp-topology-change',
    pattern: /(?:stp|spanning.?tree|mstp|rstp)[\s\S]{0,40}?(?:topo|topology|change)/i,
    title: '网络结构发生变化',
    summary: '{device} 检测到网络连接结构改变，通常是有设备接入、移除或重启导致，期间可能短暂断网。',
    suggestion: '若无人变动设备却频繁出现，建议排查是否有网线接错形成回路。',
    tone: 'info',
  },
  {
    id: 'loop-detected',
    pattern: /loop(?:back)?[\s\S]{0,30}?(?:detect|found|发现|检测)/i,
    title: '检测到网络回路',
    summary: '{device} 发现网线被接成了环状回路，这会导致整个网络变慢甚至瘫痪。',
    suggestion: '请检查是否有网线两端插在了同一台交换机上，或两台交换机之间接了多根网线。',
    tone: 'critical',
  },
  {
    id: 'mac-move',
    pattern: /mac[\s\S]{0,40}?(?:move|moved|flapping|drift|漂移)/i,
    title: '设备接入位置异常变动',
    summary: '{device} 发现同一台设备在不同网口之间反复出现，通常是网络存在回路或有人频繁换插网线。',
    suggestion: '请检查近期是否有网线改动；若无人操作，需排查是否存在回路。',
    tone: 'warning',
  },

  // ==========================================
  // 硬件与环境
  // ==========================================
  {
    id: 'temperature-high',
    pattern: /(?:temperature|temp|overtemp|温度)[\s\S]{0,40}?(?:alarm|high|exceed|over|too high|过高|告警)/i,
    title: '设备温度过高',
    summary: '{device} 的温度已超过安全范围，长时间高温会导致设备损坏或自动关机。',
    suggestion: '请检查机房或机柜的空调是否正常、设备散热口是否被遮挡、周围是否堆放了杂物。',
    tone: 'critical',
  },
  {
    id: 'fan-fault',
    pattern: /fan[\s\S]{0,40}?(?:fail|absent|abnormal|stop|error|故障)/i,
    title: '散热风扇故障',
    summary: '{device} 的散热风扇停转或已被拔出，设备可能因过热而损坏。',
    suggestion: '请尽快检查风扇模块是否插好；若风扇确已损坏，需联系供应商更换。',
    tone: 'critical',
  },
  {
    id: 'power-fault',
    pattern: /power[\s\S]{0,40}?(?:fail|absent|down|abnormal|off|故障)/i,
    title: '电源模块故障',
    summary: '{device} 的一路电源出现故障或被断开，若剩余电源也失效，设备将直接关机。',
    suggestion: '请检查电源线是否插紧、机柜插排是否有电；双电源设备建议尽快恢复另一路供电。',
    tone: 'critical',
  },
  {
    id: 'board-fault',
    pattern: /(?:board|card|slot|单板)[\s\S]{0,40}?(?:fail|offline|abnormal|remove|error|故障)/i,
    title: '板卡异常',
    summary: '{device} 上的某块业务板卡离线或工作异常，该板卡上的所有网口都会失效。',
    suggestion: '请确认板卡是否被人拔出；若未动过硬件，建议联系供应商进一步检测。',
    tone: 'critical',
  },

  // ==========================================
  // 性能类
  // ==========================================
  {
    id: 'cpu-high',
    pattern: /cpu[\s\S]{0,40}?(?:high|usage|threshold|exceed|overload|过高|使用率)/i,
    title: '设备运算负载过高',
    summary: '{device} 的处理器长时间处于繁忙状态，可能导致网络变慢或管理界面卡顿。',
    suggestion: '常见原因是网络中有异常流量或病毒，建议联系网络管理员查看是哪台设备在大量发包。',
    tone: 'warning',
  },
  {
    id: 'memory-high',
    pattern: /(?:memory|mem)[\s\S]{0,40}?(?:high|usage|threshold|exceed|low|insufficient|不足|过高)/i,
    title: '设备内存不足',
    summary: '{device} 的可用内存偏低，若继续下降可能导致设备重启或部分功能失效。',
    suggestion: '建议择期重启设备释放内存；若频繁出现，需联系供应商确认是否需要升级设备。',
    tone: 'warning',
  },
  {
    id: 'traffic-threshold',
    pattern: /(?:bandwidth|traffic|utilization|流量|带宽)[\s\S]{0,40}?(?:threshold|exceed|high|超过|超限)/i,
    title: '网络流量超出阈值',
    summary: '{device} 的网络流量已超过设定的警戒线，上网速度可能明显变慢。',
    suggestion: '请确认当前是否有大文件传输、视频会议或备份任务；若属日常业务量增长，建议评估扩容。',
    tone: 'warning',
  },

  // ==========================================
  // 系统类
  // ==========================================
  {
    id: 'device-reboot',
    pattern: /(?:reboot|restart|system.{0,10}start|startup|power.?on|重启|启动)/i,
    title: '设备已重启',
    summary: '{device} 完成了一次重启，重启期间经过该设备的网络会中断。',
    suggestion: '若无人手动重启，可能是断电或设备故障导致，建议检查供电是否稳定。',
    tone: 'warning',
  },
  {
    id: 'config-changed',
    pattern: /(?:config_i|cmdrecord|configured from|configuration.{0,20}(?:change|save|modif)|配置(?:变更|保存|修改))/i,
    title: '设备配置被修改',
    summary: '有人修改了 {device} 的设置。',
    suggestion: '如果不是计划内的变更，建议确认操作人及改动内容，必要时恢复到之前的配置。',
    tone: 'info',
  },
  {
    id: 'ntp-fault',
    pattern: /ntp[\s\S]{0,40}?(?:fail|lost|unsync|not synchronized|失步|不同步)/i,
    title: '设备时间不准',
    summary: '{device} 无法与时间服务器同步，设备上记录的时间可能不准确，会影响日志排查。',
    suggestion: '请联系网络管理员检查时间服务器地址是否可达。',
    tone: 'info',
  },

  // ==========================================
  // 告警特有（由本系统自身产生，非设备原文）
  // ==========================================
  {
    id: 'alert-storm',
    pattern: /(?:告警风暴|触发限流保护|alert storm|rate.?limit)/i,
    title: '告警数量异常激增',
    summary: '{device} 在短时间内产生了大量告警，系统已自动限流以免刷屏。',
    suggestion: '这通常意味着设备出现了较严重的问题，建议优先排查该设备，或直接联系网络管理员。',
    tone: 'critical',
  },
  {
    id: 'device-offline',
    pattern: /(?:device.{0,20}(?:offline|unreachable)|设备(?:离线|失联|无响应)|response_time|no response|ping.{0,20}(?:fail|timeout))/i,
    title: '设备失去联系',
    summary: '系统已经联系不上 {device}，它可能已断电、断网或发生故障。',
    suggestion: '请到现场确认设备电源指示灯是否亮起、网线是否插好；若设备正常，请检查到该设备的链路。',
    tone: 'critical',
  },
]
