package logs

import (
	"net"
	"regexp"
	"strings"
)

// 本系统自身活动识别。
//
// SSH 轮询设备日志时，本系统的每次登录都被设备记成 VTYUSERLOGIN / SHELL LOGIN 之类的会话日志，
// 再被下一轮采回入库（实测占全部 SSH 来源日志的 38%、"安全"设施的 100%）。
// 判定依据是"消息里出现本机 IP（整词匹配）且含会话类关键词"：只按 IP 会把
// "loghost 不可达"这类必须让运维看到的事件一起藏掉；只按关键词又会藏掉其他主机的真实登录。
// 命中的记录不丢弃，只打 self_generated 标记，由查询层默认排除。

// selfActivityKeywords 锚定各厂商会话日志的模块/事件名（小写比较）：
// 华为 VTYUSERLOGIN/LOGOUT/LOGINFAIL、SHELL/LOGIN/LOGOUT/CMDRECORD、SSHS；
// H3C SHELL_LOGIN/LOGOUT/SHELL_CMD、SSHS_LOG/CONNECT、TELNETD、LOGIN_FAILED。
var selfActivityKeywords = []string{
	"login", "logout", "logged", "cmdrecord", "shell_cmd", "ssh", "telnet", "vty", "user",
}

// SelfActivityMatcher 判断一条设备日志是否由本系统自身的登录/采集活动触发。
type SelfActivityMatcher struct {
	patterns []*regexp.Regexp
}

// NewSelfActivityMatcher 以本系统在设备眼中的 IP 集合构造判定器；空白项忽略。
func NewSelfActivityMatcher(localIPs []string) *SelfActivityMatcher {
	matcher := &SelfActivityMatcher{}
	for _, raw := range localIPs {
		ip := strings.TrimSpace(raw)
		if ip == "" {
			continue
		}
		// IPv4 前后不能紧邻数字或点（避免 192.168.20.2 命中 192.168.20.20），但允许句尾的句号；
		// 冒号视为端口分隔。IPv6 自身含冒号与十六进制，边界相应放宽。
		adjacent := "0-9."
		if strings.Contains(ip, ":") {
			adjacent = "0-9A-Fa-f:."
		}
		matcher.patterns = append(matcher.patterns, regexp.MustCompile(
			`(?:^|[^`+adjacent+`])`+regexp.QuoteMeta(ip)+`(?:[^`+adjacent+`]|\.(?:[^0-9]|$)|$)`))
	}
	return matcher
}

// Match 报告消息是否为本系统自身活动触发的会话日志。
func (m *SelfActivityMatcher) Match(message string) bool {
	if m == nil || len(m.patterns) == 0 {
		return false
	}
	lower := strings.ToLower(message)
	hasKeyword := false
	for _, keyword := range selfActivityKeywords {
		if strings.Contains(lower, keyword) {
			hasKeyword = true
			break
		}
	}
	if !hasKeyword {
		return false
	}
	for _, pattern := range m.patterns {
		if pattern.MatchString(message) {
			return true
		}
	}
	return false
}

// markSelfGenerated 在入库前给命中的记录打标；四条采集通道（SSH/SNMP/Syslog/Trap）共用此处。
func markSelfGenerated(records []DeviceLog, matcher *SelfActivityMatcher) {
	if matcher == nil {
		return
	}
	for i := range records {
		if matcher.Match(records[i].Message) {
			records[i].SelfGenerated = true
		}
	}
}

// detectLocalIPs 枚举本机接口的全局单播地址（跳过回环与链路本地）。
// 容器 bridge 网络下探测到的是容器 IP 而非设备看到的宿主机 IP，须由 LOCAL_IP_ADDRESSES 补充。
func detectLocalIPs() []string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	ips := make([]string, 0, len(addrs))
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP == nil {
			continue
		}
		if !ipNet.IP.IsGlobalUnicast() {
			continue
		}
		ips = append(ips, ipNet.IP.String())
	}
	return ips
}
