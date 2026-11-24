package common

// LogPlainRule 将前端人话翻译规则（rules.ts）映射为后端可执行的 PostgreSQL POSIX ARE 正则。
// SQLPattern 与 ExcludePattern 严禁出现 \b 与 (?<!，确保 PostgreSQL ~* 与 Go RE2 同时兼容。
type LogPlainRule struct {
	ID                string
	ChineseText       string // 仅拼接前端 rules.ts 对应规则的 title + " " + summary，严禁包含 suggestion
	SQLPattern        string
	ExcludePattern    string
	HigherPriorityIDs []string
}

var logPlainRules = buildLogPlainRules()

// LogPlainRules 返回全部日志人话映射规则的副本，供编译与回归校验使用。
func LogPlainRules() []LogPlainRule {
	out := make([]LogPlainRule, len(logPlainRules))
	for i, r := range logPlainRules {
		if len(r.HigherPriorityIDs) > 0 {
			r.HigherPriorityIDs = append([]string(nil), r.HigherPriorityIDs...)
		}
		out[i] = r
	}
	return out
}

func buildLogPlainRules() []LogPlainRule {
	rules := make([]LogPlainRule, 0, len(logPlainRulesInterfaceAndSecurity)+len(logPlainRulesRoutingAndSystem))
	rules = append(rules, logPlainRulesInterfaceAndSecurity...)
	rules = append(rules, logPlainRulesRoutingAndSystem...)
	return rules
}

var logPlainRulesInterfaceAndSecurity = []LogPlainRule{
	{
		ID:          "huawei-error-down-recover",
		ChineseText: "端口错误关闭恢复 {device} 的端口已从 Error-Down 保护状态自动恢复，转发功能重新可用。",
		SQLPattern:  `leaves the error.?down state|recover(?:s|ed)?.{0,60}?error.?down|error.?down.{0,60}?(?:recover|resume|解除|恢复)`,
	},
	{
		ID:                "huawei-error-down",
		ChineseText:       "端口因错误被关闭 {device} 的端口触发 Error-Down 保护被自动关闭（常见原因：CRC 错包超限、链路震荡、BPDU 冲突或收发光功率异常）。",
		SQLPattern:        `error.?down`,
		HigherPriorityIDs: []string{"huawei-error-down-recover"},
	},
	{
		ID:          "huawei-mlag-split-brain",
		ChineseText: "M-LAG 双主分裂告警 {device} 检测到 M-LAG 双主分裂（Dual-Active），两端同时作为主设备转发可能导致全网流量环路或丢包。",
		SQLPattern:  `m-?lag.{0,60}?(?:split.?brain|dual.?active|双主|分裂)|dad.{0,40}?(?:conflict|dual|detect|冲突)`,
	},
	{
		ID:          "huawei-mlag-peer-link-up",
		ChineseText: "M-LAG Peer-Link 恢复 {device} 的 M-LAG Peer-Link 链路已恢复正常，跨设备链路聚合主备同步重新建立。",
		SQLPattern:  `peer-?link.{0,40}?(?:(?:^|[^a-zA-Z0-9_])up(?:[^a-zA-Z0-9_]|$)|recover|resume|restore|恢复)`,
	},
	{
		ID:          "huawei-mlag-peer-link-down",
		ChineseText: "M-LAG Peer-Link 断开 {device} 的 M-LAG Peer-Link 链路断开，备设备侧单归属端口可能进入 Error-Down 保护或引发流量中断。",
		SQLPattern:  `(?:m-?lag|dfs).{0,60}?peer-?link.{0,40}?(?:down|fail|fault|disconnect|断开)|peer-?link.{0,40}?(?:^|[^a-zA-Z0-9_])down(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:                "huawei-ethtrunk-down",
		ChineseText:       "链路聚合口 Down {device} 的 Eth-Trunk 链路聚合口状态变为 Down，经该聚合口转发的全部流量将切换或中断。",
		SQLPattern:        `eth-?trunk.{0,60}?(?:^|[^a-zA-Z0-9_])down(?:[^a-zA-Z0-9_]|$)`,
		HigherPriorityIDs: []string{"huawei-mlag-peer-link-up", "huawei-mlag-peer-link-down"},
	},
	{
		ID:                "huawei-interface-down",
		ChineseText:       "接口链路 Down {device} 的 {1:iface} 链路状态变为 Down，该端口下联设备将失去网络连通性。",
		SQLPattern:        `turned into DOWN state.{0,160}?InterfaceName[=\s]+([\w\-/.:]+)`,
		HigherPriorityIDs: []string{"huawei-ethtrunk-down"},
	},
	{
		ID:          "huawei-interface-up",
		ChineseText: "接口链路 Up {device} 的 {1:iface} 链路状态恢复为 Up，端口转发功能已恢复。",
		SQLPattern:  `turned into UP state.{0,160}?InterfaceName[=\s]+([\w\-/.:]+)`,
	},
	{
		ID:          "line-protocol-down",
		ChineseText: "链路协议 Down {device} 的 {1:iface} 物理层为 Up 但数据链路层协议为 Down，报文无法转发，多因两端封装类型、VLAN 或双工模式不匹配。",
		SQLPattern:  `line protocol.{0,40}?interface\s+([A-Za-z][\w\-/.:]*).{0,60}?(?:^|[^a-zA-Z0-9_])down(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:                "interface-down",
		ChineseText:       "接口链路 Down {device} 的 {1:iface} 链路状态变为 Down，该端口下联设备将失去网络连通性。",
		SQLPattern:        `interface\s+([A-Za-z][\w\-/.:]*).{0,60}?(?:^|[^a-zA-Z0-9_])down(?:[^a-zA-Z0-9_]|$)`,
		HigherPriorityIDs: []string{"line-protocol-down", "huawei-ethtrunk-down"},
	},
	{
		ID:          "interface-up",
		ChineseText: "接口链路 Up {device} 的 {1:iface} 链路状态恢复为 Up，端口转发功能已恢复。",
		SQLPattern:  `interface\s+([A-Za-z][\w\-/.:]*).{0,60}?(?:^|[^a-zA-Z0-9_])up(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:          "interface-flapping",
		ChineseText: "接口链路震荡 {device} 存在端口在短时间内反复 Up/Down，链路不稳定将引发转发表频繁刷新与业务抖动。",
		SQLPattern:  `(?:flap|flapping)`,
	},
	{
		ID:          "huawei-lldp-neighbor-change",
		ChineseText: "LLDP 邻居变化 {device} 通过 LLDP 感知到直连邻居发生变更（新接入、退出或信息更新），拓扑信息已刷新。",
		SQLPattern:  `neighbor(?:\s+info(?:rmation)?)?\s+chang`,
	},
	{
		ID:          "huawei-lldp-neighbor-add",
		ChineseText: "LLDP 新邻居接入 {device} 通过 LLDP 发现新的直连邻居并完成信息学习，拓扑已更新。",
		SQLPattern:  `new neighbor added|neighbor.{0,30}?(?:^|[^a-zA-Z0-9_])added(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:          "huawei-lldp-neighbor-delete",
		ChineseText: "LLDP 邻居移除 {device} 的直连邻居信息被移除，对应端口已感知不到原邻居设备。",
		SQLPattern:  `neighbor.{0,30}?(?:^|[^a-zA-Z0-9_])deleted(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:          "huawei-optical-power",
		ChineseText: "光功率越限 {device} 的光模块收发功率超出正常门限，轻则误码率升高，重则链路中断。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])(?:rx|tx|optical).{0,20}?power.{0,30}?(?:exceed|high|low|over|under|abnormal|越限|过高|过低)`,
	},
	{
		ID:          "huawei-poe-overload",
		ChineseText: "PoE 供电超载 {device} 的 PoE/PoE++ 供电负载超过端口或整机电源预算，低优先级受电终端可能被强制断电。",
		SQLPattern:  `(?:(?:^|[^a-zA-Z0-9_])poe(?:\+\+)?|(?:^|[^a-zA-Z0-9_])pse(?:[^a-zA-Z0-9_]|$)).{0,50}?(?:overload|over.?budget|budget.{0,20}?exceed|power.{0,20}?denied|insufficient|超载|过载|功率不足)`,
	},
	{
		ID:                "huawei-poe-fault",
		ChineseText:       "PoE 供电异常 {device} 的 PoE 接口供电出现异常，下联的 AP、摄像头等受电设备可能断电重启。",
		SQLPattern:        `(?:^|[^a-zA-Z0-9_])poe.{0,40}?(?:fail|abnormal|power.?off|dying|overload|disconnect|异常)`,
		HigherPriorityIDs: []string{"huawei-poe-overload"},
	},
	{
		ID:             "huawei-transceiver-inserted",
		ChineseText:    "光模块已插入 {device} 检测到光模块插入并识别，端口物理通道已就绪。",
		SQLPattern:     `(?:transceiver|sfp|qsfp\d*|optical.{0,15}?module|光模块).{0,40}?(?:plug(?:ged)?\s*in|insert(?:ed)?|(?:^|[^a-zA-Z0-9_])(?:online|present)(?:[^a-zA-Z0-9_]|$)|插入|上电)`,
		ExcludePattern: `not\s+(?:online|present)`,
	},
	{
		ID:          "huawei-transceiver-removed",
		ChineseText: "光模块被拔出 {device} 检测到光模块被拔出或离线，对应端口的物理连接已中断。",
		SQLPattern:  `(?:transceiver|sfp|qsfp\d*|optical.{0,15}?module|光模块).{0,40}?(?:pull(?:ed)?\s*out|remov(?:ed|e)|plug(?:ged)?\s*out|offline|拔出|离线)`,
	},
	{
		ID:                "transceiver-fault",
		ChineseText:       "光模块异常 {device} 的光模块状态异常，可能为未在位、型号不兼容或器件失效。",
		SQLPattern:        `(?:transceiver|sfp|optical|光模块).{0,40}?(?:fail|error|absent|not\s+(?:present|online)|abnormal|invalid|不在位|异常)`,
		HigherPriorityIDs: []string{"huawei-transceiver-inserted", "huawei-transceiver-removed", "huawei-optical-power"},
	},
	{
		ID:          "huawei-duplex-mismatch",
		ChineseText: "接口双工不匹配 {device} 的端口工作在半双工模式，与对端全双工不匹配将导致冲突、错包与性能劣化。",
		SQLPattern:  `half.?duplex|双工不匹配`,
	},
	{
		ID:          "huawei-ssh-login-fail",
		ChineseText: "SSH 登录失败 {device} 收到来自 {1} 的 SSH 登录请求但认证未通过。",
		SQLPattern:  `failed to login.{0,120}?IpAddress=([^,)\s]+)`,
	},
	{
		ID:          "huawei-ssh-login-success",
		ChineseText: "SSH 登录成功 账号从 {1} 成功登录 {device} 的 SSH 管理界面。",
		SQLPattern:  `successfully logs?\s?in.{0,120}?(?:UserAddress|IpAddress)=([^,)\s]+)`,
	},
	{
		ID:          "huawei-aaa-authen-fail",
		ChineseText: "AAA 认证失败 {device} 的 AAA 接入认证未通过，账号 {1} 无法完成认证。",
		SQLPattern:  `authen(?:tication)?\s+fail.{0,120}?UserName=([^,)\s]+)`,
	},
	{
		ID:          "huawei-arp-attack",
		ChineseText: "ARP 攻击防护 {device} 检测到 ARP 报文异常（超速或伪造），已按防攻击策略限速或丢弃。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])arp.{0,40}?(?:attack|flood|speed.?limit|discard|suppr)`,
	},
	{
		ID:          "huawei-dhcp-protect",
		ChineseText: "DHCP 防护触发 {device} 丢弃了非法 DHCP 报文（可能为私接 DHCP 服务器或超速请求），已按 Snooping 与防攻击策略处理。",
		SQLPattern:  `dhcp.{0,40}?(?:attack|discard|illegal|exceed)`,
	},
	{
		ID:          "huawei-user-login-fail",
		ChineseText: "用户认证失败 {device} 收到来自 {2} 的管理登录请求，账号 {1} 认证未通过。",
		SQLPattern:  `user login fail.{0,80}?UserName=([^,)\s]+).{0,60}?UserIP=([^,)\s]+)`,
	},
	{
		ID:                "huawei-user-login",
		ChineseText:       "用户登录成功 账号 {1} 从 {2} 成功登录 {device} 的管理界面。",
		SQLPattern:        `user login\..{0,80}?UserName=([^,)\s]+).{0,60}?UserIP=([^,)\s]+)`,
		HigherPriorityIDs: []string{"huawei-user-login-fail"},
	},
	{
		ID:          "login-failed",
		ChineseText: "用户认证失败 {device} 收到管理登录请求但认证未通过。",
		SQLPattern:  `(?:failed to login|login fail(?:ed|ure)?|authentication (?:failed|failure)|auth fail|authorization failed|登录失败)`,
	},
	{
		ID:                "login-success",
		ChineseText:       "用户登录成功 有用户成功登录 {device} 的管理界面。",
		SQLPattern:        `(?:login success|logged in|login successfully|登录成功)`,
		HigherPriorityIDs: []string{"login-failed"},
	},
	{
		ID:          "user-logout",
		ChineseText: "用户登出 用户已断开与 {device} 的管理连接。",
		SQLPattern:  `(?:logout|logged out|log out|disconnect(?:ed)? from|退出登录)`,
	},
	{
		ID:          "acl-deny",
		ChineseText: "ACL 策略拦截 {device} 依据已配置的访问控制策略丢弃了报文。",
		SQLPattern:  `(?:acl|access.?list|firewall).{0,40}?(?:deny|denied|drop|blocked)`,
	},
	{
		ID:          "huawei-macsec-fault",
		ChineseText: "MACsec 协商异常 {device} 的 MACsec/MKA 链路加密会话协商失败或密钥失效，链路层加密保护可能中断。",
		SQLPattern:  `(?:macsec|mka).{0,50}?(?:(?:^|[^a-zA-Z0-9_])(?:fail\w*|expire\w*|(?:error|timeout|mismatch|invalid|down)(?:[^a-zA-Z0-9_]|$))|异常|失败)`,
	},
	{
		ID:          "port-security-violation",
		ChineseText: "端口安全违规 {device} 检测到未授权 MAC 接入，已按端口安全策略阻断该端口或丢弃报文。",
		SQLPattern:  `port.?security.{0,40}?violat`,
	},
}
