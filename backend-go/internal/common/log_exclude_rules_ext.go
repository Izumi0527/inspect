package common

var logPlainRulesRoutingAndSystem = []LogPlainRule{
	{
		ID:          "ospf-neighbor-down",
		ChineseText: "OSPF 邻居 Down {device} 与邻居路由器的 OSPF 邻接关系中断，相关网段路由将被撤销，流量可能绕行或不可达。",
		SQLPattern:  `ospf.{0,60}?(?:down|loading|init|nbr_chg)`,
	},
	{
		ID:          "ospf-neighbor-up",
		ChineseText: "OSPF 邻居建立 {device} 与邻居路由器的 OSPF 邻接关系已达成 Full 状态，路由收敛完成。",
		SQLPattern:  `ospf.{0,60}?(?:full|adjacency.{0,20}up)`,
	},
	{
		ID:          "huawei-evpn-peer-down",
		ChineseText: "EVPN 邻居中断 {device} 的 BGP EVPN 对等体或控制面会话中断，叠加网络 MAC/主机路由学习与隧道同步将受影响。",
		SQLPattern:  `evpn.{0,50}?(?:peer|neighbor|bgp|route).{0,40}?(?:down|idle|fail|withdraw|断开)`,
	},
	{
		ID:          "huawei-vxlan-tunnel-down",
		ChineseText: "VXLAN 隧道断开 {device} 的 VXLAN 隧道或 NVE 源目的 VTEP 状态变为 Down，跨节点大二层或三层 Overlay 业务流量将中断。",
		SQLPattern:  `(?:vxlan|nve).{0,50}?(?:tunnel|vtep|vni).{0,40}?(?:down|fail|unreachable|delete|断开)|vtep.{0,30}?(?:^|[^a-zA-Z0-9_])down(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:                "bgp-neighbor-down",
		ChineseText:       "BGP 邻居 Down {device} 的 BGP 对等体会话中断，经该邻居学习的路由将被撤销，跨域互联或出口流量受影响。",
		SQLPattern:        `bgp.{0,60}?(?:down|idle|closed|连接断开)`,
		HigherPriorityIDs: []string{"huawei-evpn-peer-down"},
	},
	{
		ID:          "route-flap",
		ChineseText: "路由震荡 {device} 的路由表项频繁变更，将引发反复收敛，造成转发路径不稳定与瞬时丢包。",
		SQLPattern:  `route.{0,30}?flap`,
	},
	{
		ID:          "mstp-port-forwarding",
		ChineseText: "端口进入转发状态 {device} 的 {1:iface} 在生成树重新计算后进入 Forwarding 状态，该端口恢复转发业务报文。",
		SQLPattern:  `set to forwarding state.{0,160}?PortName=([\w\-/.:]+)`,
	},
	{
		ID:          "stp-topology-change",
		ChineseText: "STP 拓扑变更 {device} 检测到生成树拓扑发生变化，将触发 MAC 表刷新，期间可能出现短暂转发中断。",
		SQLPattern:  `(?:stp|spanning.?tree|mstp|rstp).{0,40}?(?:topo|topology|change)`,
	},
	{
		ID:          "loop-detected",
		ChineseText: "二层环路 {device} 检测到二层环路，广播报文将被无限复制，可迅速耗尽链路带宽与设备转发资源。",
		SQLPattern:  `loop(?:back)?.{0,30}?(?:detect|found|发现|检测)`,
	},
	{
		ID:          "mac-move",
		ChineseText: "MAC 地址漂移 {device} 发现同一 MAC 地址在不同端口间反复迁移，通常由二层环路或终端频繁改接引起。",
		SQLPattern:  `mac.{0,40}?(?:move|moved|flapping|drift|漂移)`,
	},
	{
		ID:          "huawei-mac-limit",
		ChineseText: "MAC 地址学习超限 {device} 的 MAC 地址学习达到配置上限，新终端的 MAC 无法继续学习，其流量将按未知单播处理。",
		SQLPattern:  `mac.{0,60}?(?:limit.{0,20}?(?:reached|exceed)|reach.{0,20}?limit|exceed.{0,20}?limit|table.{0,20}?full)`,
	},
	{
		ID:          "huawei-dying-gasp",
		ChineseText: "设备掉电告急 {device} 检测到输入电源中断并上报 Dying Gasp 告急，设备即将断电下电。",
		SQLPattern:  `dying.?gasp|掉电告急`,
	},
	{
		ID:          "huawei-hardware-recover-power",
		ChineseText: "硬件状态恢复 {device} 的电源相关告警已解除，硬件状态恢复正常。",
		SQLPattern:  `(?:power|电源).{0,40}?(?:(?:^|[^a-zA-Z0-9_])(?:resume\w*|recover\w*|restore\w*|normal)(?:[^a-zA-Z0-9_]|$)|powernormal|解除|恢复)`,
	},
	{
		ID:          "huawei-hardware-recover-fan",
		ChineseText: "硬件状态恢复 {device} 的风扇相关告警已解除，硬件状态恢复正常。",
		SQLPattern:  `(?:fan|风扇).{0,40}?(?:(?:^|[^a-zA-Z0-9_])(?:resume\w*|recover\w*|restore\w*|normal)(?:[^a-zA-Z0-9_]|$)|fannormal|解除|恢复)`,
	},
	{
		ID:          "huawei-hardware-recover-temperature",
		ChineseText: "硬件状态恢复 {device} 的温度相关告警已解除，硬件状态恢复正常。",
		SQLPattern:  `(?:temperature|温度).{0,40}?(?:(?:^|[^a-zA-Z0-9_])(?:resume\w*|recover\w*|restore\w*|normal)(?:[^a-zA-Z0-9_]|$)|temp(?:erature)?normal|解除|恢复)`,
	},
	{
		ID:          "huawei-hardware-recover-voltage",
		ChineseText: "硬件状态恢复 {device} 的电压相关告警已解除，硬件状态恢复正常。",
		SQLPattern:  `(?:voltage|电压).{0,40}?(?:(?:^|[^a-zA-Z0-9_])(?:resume\w*|recover\w*|restore\w*|normal)(?:[^a-zA-Z0-9_]|$)|voltagenormal|解除|恢复)`,
	},
	{
		ID:          "huawei-hardware-recover-humidity",
		ChineseText: "硬件状态恢复 {device} 的湿度相关告警已解除，硬件状态恢复正常。",
		SQLPattern:  `(?:humidity|湿度).{0,40}?(?:(?:^|[^a-zA-Z0-9_])(?:resume\w*|recover\w*|restore\w*|normal)(?:[^a-zA-Z0-9_]|$)|humiditynormal|解除|恢复)`,
	},
	{
		ID:          "huawei-board-removed",
		ChineseText: "单板被拔出 {device} 检测到单板被拔出或离线，该单板承载的端口与业务全部中断。",
		SQLPattern:  `(?:board|card|单板).{0,50}?(?:pull(?:ed)?\s*out|removed|unregister|deregister|not\s+online)`,
	},
	{
		ID:                "huawei-board-inserted",
		ChineseText:       "单板已插入 {device} 检测到新单板插入并注册成功，端口能力发生变化。",
		SQLPattern:        `(?:board|card|单板).{0,50}?(?:plug(?:ged)?\s*in|insert|registered|上电|注册)`,
		HigherPriorityIDs: []string{"huawei-board-removed"},
	},
	{
		ID:          "huawei-board-online",
		ChineseText: "单板已上线 {device} 的单板已重新注册上线，其承载端口与业务恢复正常。",
		SQLPattern:  `board.{0,40}?(?:^|[^a-zA-Z0-9_])is online(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:                "temperature-below-threshold",
		ChineseText:       "温度低于门限 {device} 的温度传感器读数低于设定门限，多因机房制冷过量或传感器读数异常引起。",
		SQLPattern:        `(?:TEMPFALLING|temp(?:erature)?.{0,40}?below.{0,30}?threshold|温度.{0,10}?(?:低于|过低))`,
		HigherPriorityIDs: []string{"huawei-hardware-recover-temperature"},
	},
	{
		ID:                "temperature-high",
		ChineseText:       "温度越限 {device} 的温度传感器读数超过告警门限，持续高温将触发降频保护甚至整机下电。",
		SQLPattern:        `(?:temperature|temp|overtemp|温度).{0,40}?(?:alarm|high|exceed|over|too high|过高|告警)`,
		HigherPriorityIDs: []string{"huawei-hardware-recover-temperature", "temperature-below-threshold"},
	},
	{
		ID:                "huawei-env-sensor",
		ChineseText:       "环境传感器越限 {device} 的电压/湿度环境传感器读数超出正常门限，可能影响设备供电或器件寿命。",
		SQLPattern:        `(?:voltage|humidity|电压|湿度).{0,40}?(?:alarm|exceed|abnormal|high|low|过高|过低|越限)`,
		HigherPriorityIDs: []string{"huawei-hardware-recover-voltage", "huawei-hardware-recover-humidity"},
	},
	{
		ID:                "fan-fault",
		ChineseText:       "风扇故障 {device} 的风扇模块停转或不在位，散热能力下降，存在因过温导致器件损坏的风险。",
		SQLPattern:        `fan.{0,40}?(?:fail|absent|abnormal|stop|error|loss|lost|故障|丢失)`,
		HigherPriorityIDs: []string{"huawei-hardware-recover-fan"},
	},
	{
		ID:                "power-fault",
		ChineseText:       "电源模块故障 {device} 的一路电源模块失效或输入中断，冗余能力已丧失，剩余电源再故障将导致整机下电。",
		SQLPattern:        `power.{0,40}?(?:fail|absent|down|abnormal|off|故障)`,
		HigherPriorityIDs: []string{"huawei-hardware-recover-power"},
	},
	{
		ID:                "board-fault",
		ChineseText:       "单板故障 {device} 的业务单板离线或功能异常，该单板承载的所有端口与业务将中断。",
		SQLPattern:        `(?:board|card|slot|单板).{0,40}?(?:fail|offline|abnormal|remove|error|故障)`,
		HigherPriorityIDs: []string{"huawei-board-removed", "huawei-board-inserted", "huawei-board-online"},
	},
	{
		ID:          "cpu-high",
		ChineseText: "CPU 利用率超阈值 {device} 的 CPU 占用率持续超过告警门限，可能导致协议报文处理延迟、路由收敛变慢与管理通道响应迟滞。",
		SQLPattern:  `cpu.{0,40}?(?:high|usage|threshold|exceed|overload|rising|reached|过高|使用率)`,
	},
	{
		ID:          "memory-high",
		ChineseText: "内存利用率超阈值 {device} 的内存占用超过告警门限，可用内存不足将影响表项容量与新业务建立。",
		SQLPattern:  `(?:memory|mem).{0,40}?(?:high|usage|threshold|exceed|low|insufficient|不足|过高)`,
	},
	{
		ID:          "traffic-threshold",
		ChineseText: "接口流量超阈值 {device} 的接口流量超过设定门限，链路接近饱和时将出现排队时延与丢包。",
		SQLPattern:  `(?:bandwidth|traffic|utilization|流量|带宽).{0,40}?(?:threshold|exceed|high|超过|超限)`,
	},
	{
		ID:          "huawei-crc-exceed",
		ChineseText: "端口 CRC 错包越限 {device} 的端口 CRC 错包数超过门限，链路物理层质量劣化，将造成重传与业务丢包。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])crc(?:[^a-zA-Z0-9_]|$).{0,60}?(?:exceed|threshold|alarm|越限|告警)`,
	},
	{
		ID:          "huawei-broadcast-exceed",
		ChineseText: "广播报文超阈值 {device} 的端口广播报文比例超过设定门限，已触发风暴抑制；广播过量将挤占业务带宽。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])broadcast.{0,60}?(?:exceed|threshold|alarm|suppress|风暴)`,
	},
	{
		ID:          "huawei-fib-overload",
		ChineseText: "转发表超限保护 {device} 的转发表项容量超限触发保护：相关单板停止学习新表项或清空转发表，端口转发受影响。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])fib(?:[^a-zA-Z0-9_]|$).{0,40}?(?:overload|超限)|overload.{0,40}?(?:suspend|forward)`,
	},
	{
		ID:          "huawei-srm-resource-alarm",
		ChineseText: "硬件表项资源告警 {device} 的转发芯片硬件表项（TCAM/LPM/MAC/ACL 资源）占用接近或超过门限，新策略或转发表下发可能失败。",
		SQLPattern:  `(?:(?:^|[^a-zA-Z0-9_])(?:tcam|lem|lpm)(?:[^a-zA-Z0-9_]|$)|acl.{0,15}?resource|hardware.{0,20}?(?:resource|table|entry)|表项资源|硬件资源).{0,50}?(?:exceed|full|overload|insufficient|threshold|limit|exhaust|usage|告警|超限|不足)`,
	},
	{
		ID:          "huawei-license-alarm",
		ChineseText: "License 异常 {device} 的 License 出现到期、失效或容量不足告警，受控功能可能随时被停用。",
		SQLPattern:  `license.{0,40}?(?:expire|invalid|insufficient|exceed|near|alarm)`,
	},
	{
		ID:          "huawei-entry-exceed",
		ChineseText: "转发表项超限 {device} 的转发表项（MAC/ARP/路由等）使用达到上限，新表项无法学习或下发，相关业务可能中断。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])(?:entr(?:y|ies)|fib|arp|route)(?:[^a-zA-Z0-9_]{1,20}|[^a-zA-Z0-9_].{0,18}?[^a-zA-Z0-9_])(?:exceed|full|reach)(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:          "huawei-loghost-unreachable",
		ChineseText: "日志服务器不可达 {device} 无法向日志服务器正常发送日志，日志外发链路中断。",
		SQLPattern:  `(?:loghost|log host|log server|syslog).{0,40}?(?:fail|unreach|down|cannot|lose|invalid)`,
	},
	{
		ID:          "huawei-patch-activate",
		ChineseText: "系统升级与补丁 {device} 正在执行软件升级或补丁加载操作，期间可能出现短暂的管理中断。",
		SQLPattern:  `patch.{0,40}?(?:activ|deactiv|load|run|fail)|upgrade.{0,40}?(?:start|success|fail|complete)`,
	},
	{
		ID:          "huawei-telemetry-netconf-fault",
		ChineseText: "Telemetry/NETCONF 异常 {device} 与采集器或控制器的 Telemetry/NETCONF 管理连接异常中断，实时遥测采样或配置下发可能受阻。",
		SQLPattern:  `(?:telemetry|grpc|netconf).{0,50}?(?:fail|error|disconnect|down|unreach|timeout|close|reject|abort|异常|断开|失败)`,
	},
	{
		ID:          "huawei-css-cluster",
		ChineseText: "CSS 集群状态异常 {device} 的框式交换机 CSS 集群出现心跳异常、集群链路变化或主备倒换，请核查双框协同状态。",
		SQLPattern:  `(?:(?:^|[^a-zA-Z0-9_])css(?:[^a-zA-Z0-9_]|$)|cluster.{0,20}?switch).{0,50}?(?:heartbeat|link|switchover|master|standby|split|fail|down|loss|timeout|心跳|主备|分裂)`,
	},
	{
		ID:                "huawei-stack-change",
		ChineseText:       "堆叠/集群状态变化 {device} 的堆叠（CSS）状态发生变更（主备切换、成员加入退出或分裂合并），拓扑角色已重新选举。",
		SQLPattern:        `(?:stack|css).{0,40}?(?:change|switch|master|fail|split|merge|exchang|down)`,
		HigherPriorityIDs: []string{"huawei-css-cluster"},
	},
	{
		ID:          "huawei-flash-full",
		ChineseText: "存储空间不足 {device} 的存储介质（Flash/磁盘）可用空间不足，日志、补丁与配置文件可能无法继续写入。",
		SQLPattern:  `(?:^|[^a-zA-Z0-9_])(?:disk|flash|storage)(?:[^a-zA-Z0-9_]{1,40}|[^a-zA-Z0-9_].{0,38}?[^a-zA-Z0-9_])(?:full|insufficient|low)(?:[^a-zA-Z0-9_]|$)`,
	},
	{
		ID:          "huawei-clock-change",
		ChineseText: "系统时钟变更 {device} 的系统时钟被修改，该时间点前后的日志时序与时间关联分析可能受影响。",
		SQLPattern:  `clock.{0,30}?(?:chang|adjust|set|改变|调整)`,
	},
	{
		ID:          "device-reboot",
		ChineseText: "设备重启 {device} 发生重启，重启期间流经该设备的业务全部中断。",
		SQLPattern:  `(?:reboot|restart|system.{0,10}start|startup|power.?on|重启|启动)`,
	},
	{
		ID:          "config-changed",
		ChineseText: "配置变更 {device} 的运行配置被修改。",
		SQLPattern:  `(?:config_i|cmdrecord|configured from|configuration.{0,20}(?:change|save|modif)|save.{0,15}configuration|配置(?:变更|保存|修改))`,
	},
	{
		ID:          "ntp-fault",
		ChineseText: "NTP 时钟失步 {device} 与 NTP 服务器失去同步，本地时间可能产生偏差，将影响日志时序与跨设备故障关联分析。",
		SQLPattern:  `ntp.{0,40}?(?:fail|lost|unsync|not synchronized|失步|不同步)`,
	},
	{
		ID:          "alert-storm",
		ChineseText: "告警风暴 {device} 在短时间内产生大量告警，已触发限流保护，后续同类告警将被抑制。",
		SQLPattern:  `(?:告警风暴|触发限流保护|alert storm|rate.?limit)`,
	},
	{
		ID:          "device-offline",
		ChineseText: "设备失联 系统已无法与 {device} 建立管理连接，设备可能已下电、上行链路中断或系统异常。",
		SQLPattern:  `(?:device.{0,20}(?:offline|unreachable)|设备(?:离线|失联|无响应)|response_time|no response|ping.{0,20}(?:fail|timeout))`,
	},
}
