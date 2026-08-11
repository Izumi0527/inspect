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
 * - `{1:iface}` 捕获组附加接口类型注解（GigabitEthernet0/0/1 → 同名 +（千兆以太口））
 * - `{1:state}` 捕获组经状态词词典转换
 *
 * ## 文案原则
 * - **title**：行业标准术语 + 状态词，控制在 10 字内，与设备侧用词保持一致
 * - **summary**：先陈述技术事实（协议层、状态迁移、越限项），再说明业务影响
 * - **suggestion**：动词开头的排查动作，能给出具体命令的直接给出
 *
 * 措辞面向网络运维人员，采用规范术语（链路、协议、门限、收敛、表项等），
 * 不使用「网线插着」「上网变慢」这类生活化表述。
 */

import type { PlainLanguageRule } from './types'

/** 接口名的通用字符集：字母开头，允许数字、斜杠、点、冒号、连字符 */
const IFACE = '([A-Za-z][\\w\\-/.:]*)'

export const PLAIN_LANGUAGE_RULES: ReadonlyArray<PlainLanguageRule> = [
  // ==========================================
  // 接口与链路
  // ==========================================
  {
    // 华为 VRP 格式：`Interface 11 turned into DOWN state.(…InterfaceName GigabitEthernet0/0/6)`
    // 必须排在下方通用接口规则之前 —— 通用规则的接口名模式要求字母开头，
    // 而华为在 Interface 后跟的是接口索引号，真正的接口名在括号内的 InterfaceName 字段。
    // 该格式同样出现在告警缓冲区行（`…/0x502001/linkDown/Critical/Start/OID … turned into DOWN state…`），
    // 故这一条规则同时覆盖两种来源。
    id: 'huawei-interface-down',
    pattern: /turned into DOWN state[\s\S]{0,160}?InterfaceName[=\s]+([\w\-/.:]+)/i,
    title: '接口链路 Down',
    summary: '{device} 的 {1:iface} 链路状态变为 Down，该端口下联设备将失去网络连通性。',
    suggestion: '检查端口物理连接与光/电模块状态，确认对端设备运行正常；通过 display interface 查看端口统计与错包情况。',
    tone: 'warning',
  },
  {
    id: 'huawei-interface-up',
    pattern: /turned into UP state[\s\S]{0,160}?InterfaceName[=\s]+([\w\-/.:]+)/i,
    title: '接口链路 Up',
    summary: '{device} 的 {1:iface} 链路状态恢复为 Up，端口转发功能已恢复。',
    tone: 'success',
  },
  {
    // 必须排在「接口链路 Down」之前：其报文同样含 Interface X + down
    id: 'line-protocol-down',
    pattern: new RegExp(`line protocol[\\s\\S]{0,40}?interface\\s+${IFACE}[\\s\\S]{0,60}?\\bdown\\b`, 'i'),
    title: '链路协议 Down',
    summary: '{device} 的 {1:iface} 物理层为 Up 但数据链路层协议为 Down，报文无法转发，多因两端封装类型、VLAN 或双工模式不匹配。',
    suggestion: '核对链路两端的封装与 VLAN 配置是否一致；通过 display interface 查看 CRC 与错包统计，排除线缆质量问题。',
    tone: 'warning',
  },
  {
    id: 'interface-down',
    pattern: new RegExp(`interface\\s+${IFACE}[\\s\\S]{0,60}?\\bdown\\b`, 'i'),
    title: '接口链路 Down',
    summary: '{device} 的 {1:iface} 链路状态变为 Down，该端口下联设备将失去网络连通性。',
    suggestion: '检查端口物理连接与光/电模块状态，确认对端设备运行正常；通过 display interface 查看端口统计与错包情况。',
    tone: 'warning',
  },
  {
    id: 'interface-up',
    pattern: new RegExp(`interface\\s+${IFACE}[\\s\\S]{0,60}?\\bup\\b`, 'i'),
    title: '接口链路 Up',
    summary: '{device} 的 {1:iface} 链路状态恢复为 Up，端口转发功能已恢复。',
    tone: 'success',
  },
  {
    id: 'interface-flapping',
    pattern: /(?:flap|flapping)/i,
    title: '接口链路震荡',
    summary: '{device} 存在端口在短时间内反复 Up/Down，链路不稳定将引发转发表频繁刷新与业务抖动。',
    suggestion: '检查线缆接头接触状态与光模块收发功率是否越限；必要时配置端口 Damping 抑制震荡。',
    tone: 'warning',
  },
  {
    id: 'transceiver-fault',
    pattern: /(?:transceiver|sfp|optical|光模块)[\s\S]{0,40}?(?:fail|error|absent|abnormal|invalid|不在位|异常)/i,
    title: '光模块异常',
    summary: '{device} 的光模块状态异常，可能为未在位、型号不兼容或器件失效。',
    suggestion: '确认模块在位且与设备型号匹配；通过 display transceiver 核对收发功率是否处于告警门限内。',
    tone: 'warning',
  },

  // ==========================================
  // 安全与接入
  // ==========================================
  {
    // 华为 VRP：`A user login fail. (UserIndex=34, UserName=VTY, UserIP=192.168.20.2, …)`
    // 必须排在「用户登录成功」之前 —— 设备标识 VTYUSERLOGINFAIL 字面包含 VTYUSERLOGIN，
    // 顺序写反会把认证失败读成登录成功，属于安全事件的方向性误判。
    id: 'huawei-user-login-fail',
    pattern: /user login fail[\s\S]{0,80}?UserName=([^,)\s]+)[\s\S]{0,60}?UserIP=([^,)\s]+)/i,
    title: '用户认证失败',
    summary: '{device} 收到来自 {2} 的管理登录请求，账号 {1} 认证未通过。',
    suggestion: '核实是否为运维人员误操作；若来源地址异常或短时间内多次出现，应按口令爆破处理，及时更换口令并用 ACL 限制管理接入源。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`A user login. (UserIndex=34, UserName=admin, UserIP=192.168.20.2, …)`
    id: 'huawei-user-login',
    pattern: /user login\.[\s\S]{0,80}?UserName=([^,)\s]+)[\s\S]{0,60}?UserIP=([^,)\s]+)/i,
    title: '用户登录成功',
    summary: '账号 {1} 从 {2} 成功登录 {device} 的管理界面。',
    tone: 'info',
  },
  {
    id: 'login-failed',
    pattern: /(?:failed to login|login fail(?:ed|ure)?|authentication (?:failed|failure)|auth fail|authorization failed|登录失败)/i,
    title: '用户认证失败',
    summary: '{device} 收到管理登录请求但认证未通过。',
    suggestion: '核实是否为运维人员误操作；若来源地址异常或短时间内多次出现，应按口令爆破处理，及时更换口令并用 ACL 限制管理接入源。',
    tone: 'warning',
  },
  {
    id: 'login-success',
    pattern: /(?:login success|logged in|login successfully|登录成功)/i,
    title: '用户登录成功',
    summary: '有用户成功登录 {device} 的管理界面。',
    tone: 'info',
  },
  {
    id: 'user-logout',
    pattern: /(?:logout|logged out|log out|disconnect(?:ed)? from|退出登录)/i,
    title: '用户登出',
    summary: '用户已断开与 {device} 的管理连接。',
    tone: 'info',
  },
  {
    id: 'acl-deny',
    pattern: /(?:acl|access.?list|firewall)[\s\S]{0,40}?(?:deny|denied|drop|blocked)/i,
    title: 'ACL 策略拦截',
    summary: '{device} 依据已配置的访问控制策略丢弃了报文。',
    suggestion: '若为正常业务被拦截，核对 ACL 规则内容与匹配顺序，按需调整放行策略。',
    tone: 'info',
  },
  {
    id: 'port-security-violation',
    pattern: /port.?security[\s\S]{0,40}?violat/i,
    title: '端口安全违规',
    summary: '{device} 检测到未授权 MAC 接入，已按端口安全策略阻断该端口或丢弃报文。',
    suggestion: '核实该 MAC 是否为合法终端；如需接入，将其加入端口安全允许列表或调整 MAC 学习上限。',
    tone: 'warning',
  },

  // ==========================================
  // 路由
  // ==========================================
  {
    id: 'ospf-neighbor-down',
    pattern: /ospf[\s\S]{0,60}?(?:down|loading|init|nbr_chg)/i,
    title: 'OSPF 邻居 Down',
    summary: '{device} 与邻居路由器的 OSPF 邻接关系中断，相关网段路由将被撤销，流量可能绕行或不可达。',
    suggestion: '检查互联链路状态与接口 OSPF 配置（区域号、认证方式、Hello/Dead 定时器）；通过 display ospf peer 确认邻居状态机停留阶段。',
    tone: 'warning',
  },
  {
    id: 'ospf-neighbor-up',
    pattern: /ospf[\s\S]{0,60}?(?:full|adjacency.{0,20}up)/i,
    title: 'OSPF 邻居建立',
    summary: '{device} 与邻居路由器的 OSPF 邻接关系已达成 Full 状态，路由收敛完成。',
    tone: 'success',
  },
  {
    id: 'bgp-neighbor-down',
    pattern: /bgp[\s\S]{0,60}?(?:down|idle|closed|连接断开)/i,
    title: 'BGP 邻居 Down',
    summary: '{device} 的 BGP 对等体会话中断，经该邻居学习的路由将被撤销，跨域互联或出口流量受影响。',
    suggestion: '检查互联链路与 BGP 配置（AS 号、对等体地址、MD5 认证）；若涉及运营商专线，同步联系承建方核查线路状态。',
    tone: 'critical',
  },
  {
    id: 'route-flap',
    pattern: /route[\s\S]{0,30}?flap/i,
    title: '路由震荡',
    summary: '{device} 的路由表项频繁变更，将引发反复收敛，造成转发路径不稳定与瞬时丢包。',
    suggestion: '定位震荡源接口或邻居并检查其链路质量；必要时启用路由抑制（Damping）降低震荡扩散。',
    tone: 'warning',
  },

  // ==========================================
  // 二层交换
  // ==========================================
  {
    // 华为 VRP：`The port has been set to forwarding state. (…PortName=GigabitEthernet0/0/1)`
    // 排在「STP 拓扑变更」之前：两者同属 MSTP 报文，此条更具体且能给出端口名。
    id: 'mstp-port-forwarding',
    pattern: /set to forwarding state[\s\S]{0,160}?PortName=([\w\-/.:]+)/i,
    title: '端口进入转发状态',
    summary: '{device} 的 {1:iface} 在生成树重新计算后进入 Forwarding 状态，该端口恢复转发业务报文。',
    suggestion: '单次出现属拓扑收敛的正常结果；若同一端口反复切换，应排查链路震荡与生成树参数配置。',
    tone: 'info',
  },
  {
    id: 'stp-topology-change',
    pattern: /(?:stp|spanning.?tree|mstp|rstp)[\s\S]{0,40}?(?:topo|topology|change)/i,
    title: 'STP 拓扑变更',
    summary: '{device} 检测到生成树拓扑发生变化，将触发 MAC 表刷新，期间可能出现短暂转发中断。',
    suggestion: '确认是否有设备接入、退出或重启；若无变更却频繁触发，排查链路震荡与非法环路。',
    tone: 'info',
  },
  {
    id: 'loop-detected',
    pattern: /loop(?:back)?[\s\S]{0,30}?(?:detect|found|发现|检测)/i,
    title: '二层环路',
    summary: '{device} 检测到二层环路，广播报文将被无限复制，可迅速耗尽链路带宽与设备转发资源。',
    suggestion: '立即定位并断开成环链路；核查是否存在交换机级联成环或用户私接设备，确认生成树协议已正常启用。',
    tone: 'critical',
  },
  {
    id: 'mac-move',
    pattern: /mac[\s\S]{0,40}?(?:move|moved|flapping|drift|漂移)/i,
    title: 'MAC 地址漂移',
    summary: '{device} 发现同一 MAC 地址在不同端口间反复迁移，通常由二层环路或终端频繁改接引起。',
    suggestion: '核对该 MAC 对应终端的实际接入位置；若无接线变更，优先排查环路与生成树配置。',
    tone: 'warning',
  },

  // ==========================================
  // 硬件与环境
  // ==========================================
  {
    // 必须排在「温度越限」之前 —— 华为 SRM/3/TEMPFALLINGALARM 报文中 TEMP 与 ALARM
    // 仅相隔 7 个字符，会被下方高温规则抢先命中，把「低于门限」读成「持续高温」，
    // 得到与事实完全相反的结论。
    id: 'temperature-below-threshold',
    pattern: /(?:TEMPFALLING|temp(?:erature)?[\s\S]{0,40}?below[\s\S]{0,30}?threshold|温度[\s\S]{0,10}?(?:低于|过低))/i,
    title: '温度低于门限',
    summary: '{device} 的温度传感器读数低于设定门限，多因机房制冷过量或传感器读数异常引起。',
    suggestion: '核对机房空调设定温度与送风量；若设备所处环境温度正常，通过 display temperature 确认该传感器读数是否可信。',
    tone: 'warning',
  },
  {
    id: 'temperature-high',
    pattern: /(?:temperature|temp|overtemp|温度)[\s\S]{0,40}?(?:alarm|high|exceed|over|too high|过高|告警)/i,
    title: '温度越限',
    summary: '{device} 的温度传感器读数超过告警门限，持续高温将触发降频保护甚至整机下电。',
    suggestion: '检查机房空调与机柜风道，确认进出风口无遮挡、防尘网无积尘；同时核查风扇模块运行状态。',
    tone: 'critical',
  },
  {
    id: 'fan-fault',
    // loss/lost 覆盖华为 SRM/3/ENTITYINVALID 的 `Fan loss.` 表述
    pattern: /fan[\s\S]{0,40}?(?:fail|absent|abnormal|stop|error|loss|lost|故障|丢失)/i,
    title: '风扇故障',
    summary: '{device} 的风扇模块停转或不在位，散热能力下降，存在因过温导致器件损坏的风险。',
    suggestion: '确认风扇模块在位且供电正常；确属硬件失效需尽快更换，更换前持续关注设备温度。',
    tone: 'critical',
  },
  {
    id: 'power-fault',
    pattern: /power[\s\S]{0,40}?(?:fail|absent|down|abnormal|off|故障)/i,
    title: '电源模块故障',
    summary: '{device} 的一路电源模块失效或输入中断，冗余能力已丧失，剩余电源再故障将导致整机下电。',
    suggestion: '检查该路电源的输入线缆与 PDU 供电状态；冗余电源设备应尽快恢复另一路，避免形成单点。',
    tone: 'critical',
  },
  {
    id: 'board-fault',
    pattern: /(?:board|card|slot|单板)[\s\S]{0,40}?(?:fail|offline|abnormal|remove|error|故障)/i,
    title: '单板故障',
    summary: '{device} 的业务单板离线或功能异常，该单板承载的所有端口与业务将中断。',
    suggestion: '确认单板在位且插接到位；若无硬件操作记录，收集单板日志并联系厂商定位。',
    tone: 'critical',
  },

  // ==========================================
  // 性能与容量
  // ==========================================
  {
    id: 'cpu-high',
    pattern: /cpu[\s\S]{0,40}?(?:high|usage|threshold|exceed|overload|过高|使用率)/i,
    title: 'CPU 利用率超阈值',
    summary: '{device} 的 CPU 占用率持续超过告警门限，可能导致协议报文处理延迟、路由收敛变慢与管理通道响应迟滞。',
    suggestion: '定位高占用任务，排查是否存在广播风暴、攻击流量或异常协议报文上送；必要时配置 CPCAR 限速保护控制平面。',
    tone: 'warning',
  },
  {
    id: 'memory-high',
    pattern: /(?:memory|mem)[\s\S]{0,40}?(?:high|usage|threshold|exceed|low|insufficient|不足|过高)/i,
    title: '内存利用率超阈值',
    summary: '{device} 的内存占用超过告警门限，可用内存不足将影响表项容量与新业务建立。',
    suggestion: '核查路由表、MAC 表、ARP 表规模是否异常增长；排除攻击导致的表项膨胀，必要时评估设备容量规格。',
    tone: 'warning',
  },
  {
    id: 'traffic-threshold',
    pattern: /(?:bandwidth|traffic|utilization|流量|带宽)[\s\S]{0,40}?(?:threshold|exceed|high|超过|超限)/i,
    title: '接口流量超阈值',
    summary: '{device} 的接口流量超过设定门限，链路接近饱和时将出现排队时延与丢包。',
    suggestion: '确认是否为备份、视频会议等突发业务；若属常态增长，考虑链路扩容或部署链路聚合分担流量。',
    tone: 'warning',
  },

  // ==========================================
  // 系统运行
  // ==========================================
  {
    id: 'device-reboot',
    pattern: /(?:reboot|restart|system.{0,10}start|startup|power.?on|重启|启动)/i,
    title: '设备重启',
    summary: '{device} 发生重启，重启期间流经该设备的业务全部中断。',
    suggestion: '核对是否为计划内操作；若非人为触发，检查供电稳定性并收集重启前日志定位复位原因。',
    tone: 'warning',
  },
  {
    id: 'config-changed',
    pattern: /(?:config_i|cmdrecord|configured from|configuration.{0,20}(?:change|save|modif)|配置(?:变更|保存|修改))/i,
    title: '配置变更',
    summary: '{device} 的运行配置被修改。',
    suggestion: '核对该变更是否在维护窗口内且经过审批；若为非计划变更，比对配置差异并按需回退。',
    tone: 'info',
  },
  {
    id: 'ntp-fault',
    pattern: /ntp[\s\S]{0,40}?(?:fail|lost|unsync|not synchronized|失步|不同步)/i,
    title: 'NTP 时钟失步',
    summary: '{device} 与 NTP 服务器失去同步，本地时间可能产生偏差，将影响日志时序与跨设备故障关联分析。',
    suggestion: '检查 NTP 服务器地址可达性与认证配置；确认中间设备未拦截 NTP 报文。',
    tone: 'info',
  },

  // ==========================================
  // 本系统自身产生（非设备原文）
  // ==========================================
  {
    id: 'alert-storm',
    pattern: /(?:告警风暴|触发限流保护|alert storm|rate.?limit)/i,
    title: '告警风暴',
    summary: '{device} 在短时间内产生大量告警，已触发限流保护，后续同类告警将被抑制。',
    suggestion: '告警密集通常指向严重故障，应优先排查该设备的硬件状态与链路情况，而非逐条处理单点告警。',
    tone: 'critical',
  },
  {
    id: 'device-offline',
    pattern: /(?:device.{0,20}(?:offline|unreachable)|设备(?:离线|失联|无响应)|response_time|no response|ping.{0,20}(?:fail|timeout))/i,
    title: '设备失联',
    summary: '系统已无法与 {device} 建立管理连接，设备可能已下电、上行链路中断或系统异常。',
    suggestion: '现场确认设备供电与指示灯状态；若设备运行正常，排查管理链路与网管通道的连通性。',
    tone: 'critical',
  },
]
