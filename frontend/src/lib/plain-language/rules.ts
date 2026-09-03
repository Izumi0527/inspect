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
    // 华为 VRP：`ERRDOWN/4/ERRDOWN_DOWNNOTIFY: The interface ... changes to the error-down state`
    // Error-Down 是端口级保护动作，语义与普通链路 Down 不同，必须最先判断。
    id: 'huawei-error-down',
    pattern: /error.?down/i,
    title: '端口因错误被关闭',
    summary: '{device} 的端口触发 Error-Down 保护被自动关闭（常见原因：CRC 错包超限、链路震荡、BPDU 冲突或收发光功率异常）。',
    suggestion: '通过 display error-down recovery 查看恢复状态与触发原因；排除故障后等待自动恢复，或执行 error-down recovery 手动恢复。',
    tone: 'critical',
  },
  {
    // 华为 VRP：`TRUNK/4/ETHTRUNK_DOWN: The Eth-Trunk 1 went down`
    // 必须排在通用接口规则之前：聚合口 Down 的影响面是全部成员链路。
    id: 'huawei-ethtrunk-down',
    pattern: new RegExp(`eth-?trunk[\\s\\S]{0,60}?\\bdown\\b`, 'i'),
    title: '链路聚合口 Down',
    summary: '{device} 的 Eth-Trunk 链路聚合口状态变为 Down，经该聚合口转发的全部流量将切换或中断。',
    suggestion: '通过 display eth-trunk 查看成员口状态；检查各成员链路是否正常、两端聚合模式与负载分担配置是否一致。',
    tone: 'warning',
  },
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
    // 华为 VRP：`LLDP/4/NBRCHGTRAP: OID … Neighbor info changed.`
    id: 'huawei-lldp-neighbor-change',
    pattern: /neighbor(?:\s+info(?:rmation)?)?\s+chang/i,
    title: 'LLDP 邻居变化',
    summary: '{device} 通过 LLDP 感知到直连邻居发生变更（新接入、退出或信息更新），拓扑信息已刷新。',
    suggestion: '确认是否有设备接入或调整；若非计划内变更，核对下联设备身份，防止私接设备接入网络。',
    tone: 'info',
  },
  {
    // 光功率越限必须排在「光模块异常」之前：越限是量化的性能问题，给出具体排查项
    id: 'huawei-optical-power',
    pattern: /\b(?:rx|tx|optical)[\s\S]{0,20}?power[\s\S]{0,30}?(?:exceed|high|low|over|under|越限|过高|过低)/i,
    title: '光功率越限',
    summary: '{device} 的光模块收发功率超出正常门限，轻则误码率升高，重则链路中断。',
    suggestion: '通过 display transceiver 查看收发光功率；检查光纤弯折、接头污染与光模块老化，必要时更换模块或清洁尾纤。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`POE/4/POEPOWERABSENT: … PoE power is absent`
    id: 'huawei-poe-fault',
    pattern: /\bpoe[\s\S]{0,40}?(?:fail|abnormal|power.?off|dying|overload|disconnect|异常)/i,
    title: 'PoE 供电异常',
    summary: '{device} 的 PoE 接口供电出现异常，下联的 AP、摄像头等受电设备可能断电重启。',
    suggestion: '通过 display poe power-state 查看端口供电状态；核对受电设备功率是否超出端口与整机预算，排除线缆接触不良。',
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
    // 华为 VRP logbuffer：`SSH/5/SSH_FAIL: Failed to login. (UserName=admin, IpAddress=10.1.1.1, …)`
    // 必须排在通用「用户认证失败」之前：能提取来源 IP，可操作性更强。
    id: 'huawei-ssh-login-fail',
    pattern: /failed to login[\s\S]{0,120}?IpAddress=([^,)\s]+)/i,
    title: 'SSH 登录失败',
    summary: '{device} 收到来自 {1} 的 SSH 登录请求但认证未通过。',
    suggestion: '核实是否为运维人员误操作；若来源地址异常或短时间内多次出现，应按口令爆破处理，及时更换口令并用 ACL 限制管理接入源。',
    tone: 'warning',
  },
  {
    // 华为 VRP logbuffer：`SSH/5/SSH_USER_LOGIN: The user successfully logs in. (UserName=admin, UserAddress=10.1.1.1)`
    id: 'huawei-ssh-login-success',
    pattern: /successfully logs?\s?in[\s\S]{0,120}?(?:UserAddress|IpAddress)=([^,)\s]+)/i,
    title: 'SSH 登录成功',
    summary: '账号从 {1} 成功登录 {device} 的 SSH 管理界面。',
    suggestion: '核对登录账号与来源地址是否为计划内运维行为；非预期来源应立即核查并考虑修改口令。',
    tone: 'info',
  },
  {
    // 华为 VRP：`AAA/6/AAA_AUTHEN_FAIL: Authen fail. (UserName=xx, AuthenFailReason=…)`
    id: 'huawei-aaa-authen-fail',
    pattern: /authen(?:tication)?\s+fail[\s\S]{0,120}?UserName=([^,)\s]+)/i,
    title: 'AAA 认证失败',
    summary: '{device} 的 AAA 接入认证未通过，账号 {1} 无法完成认证。',
    suggestion: '结合日志中的 AuthenFailReason 确认失败原因（口令错误、账号锁定或服务器不可达）；检查 RADIUS/TACACS 服务器状态与共享密钥配置。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`ARPSPI/4/ARPS_DROP: … ARP speed exceed … discarded`
    id: 'huawei-arp-attack',
    pattern: /\barp[\s\S]{0,40}?(?:attack|flood|speed.?limit|discard|suppr)/i,
    title: 'ARP 攻击防护',
    summary: '{device} 检测到 ARP 报文异常（超速或伪造），已按防攻击策略限速或丢弃。',
    suggestion: '通过 display arp attack 相关命令查看攻击源接口与 MAC；定位发送异常 ARP 的终端，确认是否存在病毒或 ARP 欺骗行为。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`DHCPSNP/4/illegalUser: … discarded the illegal DHCP reply`
    id: 'huawei-dhcp-protect',
    pattern: /dhcp[\s\S]{0,40}?(?:attack|discard|illegal|exceed)/i,
    title: 'DHCP 防护触发',
    summary: '{device} 丢弃了非法 DHCP 报文（可能为私接 DHCP 服务器或超速请求），已按 Snooping 与防攻击策略处理。',
    suggestion: '确认网络内是否存在私接 DHCP 服务器；通过 display dhcp snooping 查看丢弃统计与信任口配置。',
    tone: 'warning',
  },
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
  {
    // 华为 VRP：`MACLIMIT/4/MAC_LIMITADDR_EXCEED: The MAC address learning limit … is reached`
    // 与 MAC 漂移共用 mac 前缀锚点，锚定词不同互不干扰。
    id: 'huawei-mac-limit',
    pattern: /mac[\s\S]{0,60}?(?:limit[\s\S]{0,20}?(?:reached|exceed)|reach[\s\S]{0,20}?limit|exceed[\s\S]{0,20}?limit|table[\s\S]{0,20}?full)/i,
    title: 'MAC 地址学习超限',
    summary: '{device} 的 MAC 地址学习达到配置上限，新终端的 MAC 无法继续学习，其流量将按未知单播处理。',
    suggestion: '通过 display mac-address 查看表项规模；确认是终端规模增长还是 MAC 攻击导致，必要时调整接口 MAC 学习上限。',
    tone: 'warning',
  },

  // ==========================================
  // 硬件与环境
  // ==========================================
  {
    // 华为 VRP：`SRM/4/POWERNORMAL: Power … resumed`、`SRM/4/FANNORMAL: Fan resumed`、
    // `SRM/4/TEMPRECOVERALARM: temperature below resume threshold`
    // 恢复类必须排在所有硬件故障与温度门限规则之前 —— 「below resume threshold」
    // 含 below/threshold 字样，会被温度门限规则抢先读成低温告警。
    id: 'huawei-hardware-recover',
    pattern: /(?:temperature|fan|power|电源|风扇|温度)[\s\S]{0,40}?(?:resume|recover|restore|normal|解除|恢复)/i,
    title: '硬件状态恢复',
    summary: '{device} 的电源/风扇/温度相关告警已解除，硬件状态恢复正常。',
    tone: 'success',
  },
  {
    // 必须排在「单板故障」与「单板已插入」之前：unregister 字面包含 register，
    // 顺序写反会把拔出读成插入。
    id: 'huawei-board-removed',
    pattern: /(?:board|card|单板)[\s\S]{0,50}?(?:pull(?:ed)?\s*out|removed|unregister|deregister|not\s+online)/i,
    title: '单板被拔出',
    summary: '{device} 检测到单板被拔出或离线，该单板承载的端口与业务全部中断。',
    suggestion: '确认是否为计划内操作；若非人为拔出，检查单板插接与固定状态，警惕单板故障自动退出并收集日志定位。',
    tone: 'critical',
  },
  {
    // 华为 VRP：`DEV/4/BOARD_INSERT: Board … has been inserted`、`DEV/4/BOARD_ONLINE`
    id: 'huawei-board-inserted',
    pattern: /(?:board|card|单板)[\s\S]{0,50}?(?:plug(?:ged)?\s*in|insert|registered|上电|注册)/i,
    title: '单板已插入',
    summary: '{device} 检测到新单板插入并注册成功，端口能力发生变化。',
    suggestion: '确认单板型号与配置符合预期；单板注册后相关端口需重新确认配置与连线状态。',
    tone: 'info',
  },
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
    // 华为 VRP：`LICENSE/4/LICENSE_ALARM: … will expire` 等
    id: 'huawei-license-alarm',
    pattern: /license[\s\S]{0,40}?(?:expire|invalid|insufficient|exceed|near|alarm)/i,
    title: 'License 异常',
    summary: '{device} 的 License 出现到期、失效或容量不足告警，受控功能可能随时被停用。',
    suggestion: '通过 display license 查看授权状态与有效期；按需申请新的 License 文件并在维护窗口内激活。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`FIB/6/FIBENTRYSUFFICIENT?`、`RM/4/IPV4_ROUTEMAX` 等表项容量事件
    id: 'huawei-entry-exceed',
    // 锚点词与匹配距离刻意收紧：arp/entry 等子串常见于普通句式，
    // 且 successfully 中含字面 full，必须加词边界防止普通事件被误读为表项超限
    pattern: /\b(?:entr(?:y|ies)|fib|arp|route)\b[\s\S]{0,20}?\b(?:exceed|full|reach)\b/i,
    title: '转发表项超限',
    summary: '{device} 的转发表项（MAC/ARP/路由等）使用达到上限，新表项无法学习或下发，相关业务可能中断。',
    suggestion: '确认表项增长是否为业务扩张所致；排查是否存在扫描或攻击导致表项膨胀，必要时评估设备规格或调整老化时间。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`IC/4/LOGHOST_FAIL: Connect to log host … failed`
    id: 'huawei-loghost-unreachable',
    pattern: /(?:loghost|log host|log server|syslog)[\s\S]{0,40}?(?:fail|unreach|down|cannot|lose|invalid)/i,
    title: '日志服务器不可达',
    summary: '{device} 无法向日志服务器正常发送日志，日志外发链路中断。',
    suggestion: '检查日志服务器地址可达性与路由；确认信息中心通道与源接口配置，恢复后补齐关键时段日志。',
    tone: 'warning',
  },
  {
    // 华为 VRP：`UPDATE/6/PATCH_ACTIVATE`、`PATCH/6/PATCH_RUN` 等
    id: 'huawei-patch-activate',
    pattern: /patch[\s\S]{0,40}?(?:activ|deactiv|load|run|fail)|upgrade[\s\S]{0,40}?(?:start|success|fail|complete)/i,
    title: '系统升级与补丁',
    summary: '{device} 正在执行软件升级或补丁加载操作，期间可能出现短暂的管理中断。',
    suggestion: '确认操作在维护窗口内执行；升级期间避免断电，完成后通过 display version 核对运行版本。',
    tone: 'info',
  },
  {
    // 华为 VRP：`STACKM/4/STACK_MEMBER_CHANGE`、`CSS/4/CSSMASTEREXCHANGED` 等
    id: 'huawei-stack-change',
    pattern: /(?:stack|css)[\s\S]{0,40}?(?:change|switch|master|fail|split|merge|exchang)/i,
    title: '堆叠/集群状态变化',
    summary: '{device} 的堆叠（CSS）状态发生变更（主备切换、成员加入退出或分裂合并），拓扑角色已重新选举。',
    suggestion: '通过 display stack 查看堆叠拓扑与角色；确认切换是否符合预期，排查堆叠线缆与链路状态。',
    tone: 'warning',
  },
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
