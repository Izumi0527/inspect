package logs

import (
	"context"
	"fmt"
	"io"
	"net"
	"regexp"
	"strings"
	"time"

	"go.uber.org/zap"
	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
)

// 交互节奏：等 shell 就绪 / 命令发出后到结束标记 / 退出前的停顿，以及单条命令输出的最长读取等待
// （超时后返回已收到的内容）。设为变量以便测试缩短。
var (
	shellReadyDelay    = 1 * time.Second
	commandSettleDelay = 500 * time.Millisecond
	sessionExitDelay   = 200 * time.Millisecond
	commandReadTimeout = 15 * time.Second
)

type logEntry struct {
	DeviceID      int
	Level         string
	Facility      string
	Source        string
	Message       string
	RawMessage    string
	SourceIP      *string
	SourceProcess *string
	LogTimestamp  time.Time
	CollectedAt   time.Time
}

type SSHCollector struct {
	Timeout time.Duration
	// hostKeys 用于主机密钥 TOFU 校验，nil 时退化为不校验（仅测试场景）。
	hostKeys *sshutil.SSHHostKeyStore
	logger   *zap.Logger
}

// NewSSHCollector 构造 SSH 采集器；db 非 nil 时启用主机密钥指纹校验。
func NewSSHCollector(db *gorm.DB, logger *zap.Logger) *SSHCollector {
	collector := &SSHCollector{Timeout: 30 * time.Second}
	if db != nil {
		collector.hostKeys = sshutil.NewSSHHostKeyStore(db, logger)
	}
	if logger != nil {
		collector.logger = logger
	}
	return collector
}

// CollectMany 在一次 SSH 会话内依次执行多个日志类型的命令，按类型返回解析结果。
// 每次登录都会在设备 logbuffer/trapbuffer 留下一条登录记录并在下一轮被采回，
// 会话数直接决定自制噪声的数量，故同一设备的多类采集必须共用一个会话。
func (c *SSHCollector) CollectMany(ctx context.Context, device deviceInfo, requests []logRequest) (map[string][]logEntry, error) {
	// 第 0 条是关分页前导命令，其输出不参与解析
	commands := make([]string, 0, len(requests)+1)
	commands = append(commands, resolveVendorPrelude(device.Vendor))
	for _, req := range requests {
		command := resolveVendorCommand(device.Vendor, req.LogType)
		if strings.TrimSpace(command) == "" {
			return nil, fmt.Errorf("log command not configured for %q", req.LogType)
		}
		commands = append(commands, command)
	}

	client, err := c.connect(ctx, device)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	outputs, err := c.runCommands(ctx, client, commands)
	if err != nil {
		return nil, err
	}

	collectedAt := time.Now().UTC()
	results := make(map[string][]logEntry, len(requests))
	for i, req := range requests {
		maxEntries := req.MaxEntries
		if maxEntries <= 0 {
			maxEntries = 100
		}
		results[req.LogType] = parseLogOutput(outputs[i+1], device.ID, device.Vendor, collectedAt, maxEntries)
	}
	return results, nil
}

func (c *SSHCollector) connect(ctx context.Context, device deviceInfo) (*ssh.Client, error) {
	// 认证方式由已配置凭据决定：私钥优先、密码兜底（见 sshutil.BuildAuthMethods）。
	auth, err := sshutil.BuildAuthMethods(device.SshPassword, device.SshPrivateKey, device.SshKeyPassphrase)
	if err != nil {
		return nil, err
	}
	config := &ssh.ClientConfig{
		// 兼容华为/H3C 等老旧网络设备的密钥交换/加密/MAC 算法（Go 默认禁用部分旧算法）
		Config: sshutil.LegacyAlgorithms(),
		User:   device.SshUsername,
		Auth:   auth,
		// TOFU 主机密钥校验（与连接测试/配置备份/巡检共用同一实现）
		HostKeyCallback: sshutil.HostKeyCallbackFor(c.hostKeys, device.ID, c.logger),
		Timeout:         c.Timeout,
	}

	address := fmt.Sprintf("%s:%d", device.IPAddress, device.SshPort)
	dialer := net.Dialer{Timeout: c.Timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, fmt.Errorf("ssh dial failed: %w", err)
	}

	clientConn, chans, reqs, err := ssh.NewClientConn(conn, address, config)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("ssh handshake failed: %w", err)
	}

	return ssh.NewClient(clientConn, chans, reqs), nil
}

// runCommands 在同一个 shell 会话内顺序执行多条命令，返回与 commands 一一对应的输出段。
// 每条命令后追加一行结束标记，读到第 i 个标记才发送第 i+1 条命令，避免多条命令的输入
// 在设备分页提示下互相吞字；某条命令等待超时则其余命令不再发送，对应输出段为空。
func (c *SSHCollector) runCommands(ctx context.Context, client *ssh.Client, commands []string) ([]string, error) {
	outputs := make([]string, len(commands))
	if len(commands) == 0 {
		return outputs, nil
	}

	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	// 请求 PTY（华为/H3C 等网络设备需要交互式终端才会输出内容）
	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("vt100", 24, 200, modes); err != nil {
		// PTY 不可用，回退到 Output 方式（每条命令独立会话）
		_ = session.Close()
		for i, command := range commands {
			outputs[i], _ = c.outputWithoutPty(client, command)
		}
		return outputs, nil
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := session.Shell(); err != nil {
		return nil, err
	}

	return runShellCommands(ctx, stdin, stdout, commands)
}

// runShellCommands 在已就绪的交互 shell 上顺序执行多条命令，返回与 commands 一一对应的输出段。
// 每条命令后追加一行结束标记（设备会回显输入行，标记正是靠回显被读到），读到第 i 个标记
// 才发送第 i+1 条命令；某条命令等待超时则其余命令不再发送，对应输出段为空。
func runShellCommands(ctx context.Context, stdin io.WriteCloser, stdout io.Reader, commands []string) ([]string, error) {
	outputs := make([]string, len(commands))
	if len(commands) == 0 {
		return outputs, nil
	}

	marker := func(i int) string { return fmt.Sprintf("__CMD_END_7f3a9b2c_%d__", i) }

	// 等待 shell 准备好（华为设备会先显示 VRP 提示符），再发送命令 + 结束标记。
	// 放入后台 goroutine，让主循环立即开始读输出，避免整体多等一个固定间隔。
	// next 由主循环在读到第 i 个标记后写入，写端据此推进到第 i+1 条命令；
	// 全部命令完成后主循环等 writerDone，保证 exit 真正发出、设备记录一次正常登出而非 TCP 断连。
	next := make(chan struct{}, len(commands))
	readDone := make(chan struct{})
	writerDone := make(chan struct{})
	defer close(readDone)
	go func() {
		defer close(writerDone)
		defer stdin.Close()
		time.Sleep(shellReadyDelay)
		for i, command := range commands {
			if i > 0 {
				select {
				case <-next:
				case <-readDone:
					return
				}
			}
			fmt.Fprintf(stdin, "%s\n", command)
			time.Sleep(commandSettleDelay)
			fmt.Fprintf(stdin, "echo %s\n", marker(i))
		}
		select {
		case <-next:
		case <-readDone:
			return
		}
		time.Sleep(sessionExitDelay)
		fmt.Fprintf(stdin, "exit\n")
	}()

	// 带超时读取输出。
	// stdout.Read 是阻塞调用，若与超时/取消判断放在同一个循环里，无数据时
	// Read 会永久挂起导致超时与 ctx 取消都失效，因此把读取移入独立
	// goroutine，数据经 channel 交给主循环统一裁决。
	type readChunk struct {
		data []byte
	}
	readCh := make(chan readChunk)
	go func() {
		buf := make([]byte, 65536)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				select {
				case readCh <- readChunk{data: chunk}:
				case <-readDone:
					return
				}
			}
			if err != nil {
				close(readCh)
				return
			}
		}
	}()

	var output []byte
	cursor := 0
	current := 0
	readTimeout := time.After(commandReadTimeout)
	for {
		select {
		case <-ctx.Done():
			outputs[current] = string(output[cursor:])
			return outputs, ErrCollectionCanceled
		case <-readTimeout:
			outputs[current] = string(output[cursor:])
			return outputs, nil
		case chunk, ok := <-readCh:
			if !ok {
				// 会话输出已结束（命令执行完退出）
				outputs[current] = string(output[cursor:])
				return outputs, nil
			}
			output = append(output, chunk.data...)
		}

		// 检测当前命令的结束标记；每条命令各自享有完整的读取预算
		for current < len(commands) {
			idx := strings.Index(string(output[cursor:]), marker(current))
			if idx < 0 {
				break
			}
			outputs[current] = string(output[cursor : cursor+idx])
			cursor += idx + len(marker(current))
			current++
			next <- struct{}{}
			readTimeout = time.After(commandReadTimeout)
		}
		if current >= len(commands) {
			select {
			case <-writerDone:
			case <-ctx.Done():
			case <-time.After(sessionExitDelay + commandSettleDelay):
			}
			return outputs, nil
		}
	}
}

func (c *SSHCollector) outputWithoutPty(client *ssh.Client, command string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	output, err := session.Output(command)
	return string(output), err
}

// normalizeLogVendor 将设备台账中的厂商别名归一化为日志解析/命令路由使用的规范厂商键。
// 优先复用 snmpmib.DefaultRegistry 的别名映射，确保与 SNMP 采集识别保持单一事实源一致。
func normalizeLogVendor(vendor string) string {
	trimmed := strings.TrimSpace(vendor)
	if trimmed == "" {
		return "huawei"
	}
	if reg, err := snmpmib.DefaultRegistry(); err == nil && reg != nil {
		if resolved := reg.ResolveVendor(trimmed); resolved != "" {
			if resolved == "huawei" || resolved == "h3c" {
				return resolved
			}
		}
	}
	lower := strings.ToLower(trimmed)
	switch lower {
	case "huawei", "huawei_vrp", "huawei-vrp", "huawei_v600", "huawei-v600", "huawei_vrp8", "huawei-vrp8", "cloudengine", "quidway", "huawei_technologies", "华为":
		return "huawei"
	case "h3c", "h3c_comware", "h3c-comware":
		return "h3c"
	default:
		return lower
	}
}

func resolveVendorCommand(vendor string, logType string) string {
	vendor = normalizeLogVendor(vendor)
	logType = normalizeLogType(logType)

	commands := map[string]map[string]string{
		"huawei": {
			"system":    "display logbuffer",
			"interface": "display logbuffer | include IF",
			"security":  "display logbuffer | include SEC",
			"recent":    "display logbuffer reverse",
			"trap":      "display trapbuffer",
			"alarm":     "display alarm active",
		},
		"h3c": {
			"system":    "display logbuffer",
			"interface": "display logbuffer | include Link",
			"security":  "display logbuffer | include SEC",
			"recent":    "display logbuffer reverse",
			"trap":      "display trapbuffer",
			"alarm":     "display alarm active",
		},
	}

	if commands[vendor] == nil {
		vendor = "huawei"
	}

	return commands[vendor][logType]
}

// resolveVendorPrelude 返回会话开头先执行的关分页命令（仅对本会话生效，不改设备配置）。
// 多条命令共用一个 shell 后，分页提示会吞掉后续输入，结束标记永远读不到，
// 第二条命令就永远发不出去；关分页也让缓冲内容不再依赖误触按键翻页才被采全。
func resolveVendorPrelude(vendor string) string {
	switch normalizeLogVendor(vendor) {
	case "h3c":
		return "screen-length disable"
	default:
		return "screen-length 0 temporary"
	}
}

// ParseLogLineForTest 提供可测试的日志行解析入口（内部复用 parseLogLine），
// 返回导出模型以便独立测试模块断言字段；生产路径仍直接使用 parseLogLine。
func ParseLogLineForTest(line string, deviceID int, vendor string, collectedAt time.Time) *DeviceLog {
	entry := parseLogLine(line, deviceID, vendor, collectedAt)
	if entry == nil {
		return nil
	}
	raw := entry.RawMessage
	return &DeviceLog{
		DeviceID:     entry.DeviceID,
		Level:        entry.Level,
		Facility:     entry.Facility,
		Source:       entry.Source,
		Message:      entry.Message,
		RawMessage:   &raw,
		LogTimestamp: entry.LogTimestamp,
		CollectedAt:  entry.CollectedAt,
	}
}

func parseLogOutput(output string, deviceID int, vendor string, collectedAt time.Time, maxEntries int) []logEntry {
	lines := strings.Split(output, "\n")
	entries := make([]logEntry, 0, maxEntries)

	vendorNorm := normalizeLogVendor(vendor)
	if vendorNorm == "huawei" || vendorNorm == "h3c" {
		isTrapBuffer, isAlarmActive := detectHuaweiSpecialOutput(lines)
		if isTrapBuffer {
			return parseTrapBufferOutput(lines, deviceID, vendorNorm, collectedAt, maxEntries)
		}
		if isAlarmActive {
			return parseAlarmActiveOutput(lines, deviceID, vendorNorm, collectedAt, maxEntries)
		}
	}

	for _, line := range lines {
		if len(entries) >= maxEntries {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" || isHeaderLine(line) || isDeviceEchoNoise(line) {
			continue
		}

		if entry := parseLogLine(line, deviceID, vendorNorm, collectedAt); entry != nil {
			entries = append(entries, *entry)
		}
	}

	return entries
}

func detectHuaweiSpecialOutput(lines []string) (isTrapBuffer bool, isAlarmActive bool) {
	hasTimestamp := false
	hasTrapName := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if strings.Contains(lower, "trapping buffer") || strings.Contains(lower, "trapbuffer") || strings.HasPrefix(trimmed, "#") {
			return true, false
		}
		if strings.HasPrefix(lower, "timestamp") && (strings.Contains(trimmed, ":") || strings.Contains(trimmed, "=")) {
			hasTimestamp = true
		}
		if (strings.HasPrefix(lower, "trapname") || strings.HasPrefix(lower, "trap name") || strings.HasPrefix(lower, "trapoid")) &&
			(strings.Contains(trimmed, ":") || strings.Contains(trimmed, "=")) {
			hasTrapName = true
		}
		if hasTimestamp && hasTrapName {
			return true, false
		}
		if strings.Contains(trimmed, "Sequence") && strings.Contains(trimmed, "AlarmID") {
			return false, true
		}
		if strings.HasPrefix(trimmed, "Index") && strings.Contains(trimmed, "Severity") &&
			(strings.Contains(trimmed, "Id") || strings.Contains(trimmed, "Source") || strings.Contains(trimmed, "Name")) {
			return false, true
		}
		if strings.Contains(trimmed, "Total active alarms") {
			return false, true
		}
	}
	return false, false
}

var (
	huaweiPattern        = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]:\s*(.+)$`)
	facilityLevelPattern = regexp.MustCompile(`[/-](\d+)[/-]`)
)

// huaweiLogbufferPattern 匹配华为 VRP V200/V600 display logbuffer 的标准行结构（RE2 线性正则）：
//
//	V200: 2025-03-10 08:12:33+08:00 HUAWEI-S5720 %%01IFNET/4/IF_STATE(l)[231]:Interface 6 turned into DOWN state.(...)
//	V600: 2026-11-20 10:15:20.123 +08:00 Switch-S5755 %%01IFM/4/IF_STATE(l):CID=0x807a040b;Interface 25GE1/0/1 has turned into DOWN state.
//	V600 表格化: 2026-06-06 11:20:10  842   Informational  %%01IFM/4/LINK_STATE(l):The physical status...
//	英文月名: Mar 10 2025 08:12:33 HUAWEI %%01SSH/5/SSH_FAIL(l):Failed to login. (...)
var huaweiLogbufferPattern = regexp.MustCompile(
	`^((?:[A-Za-z]{3}\s+\d{1,2}\s+\d{4}|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*[+-]\d{2}:?\d{2}|DST|UTC)?)\s+(\d+\s+[A-Za-z]+|\S+)\s+%%\s*\d{2}\s*([A-Za-z0-9_-]+)/(\d)/([A-Za-z0-9_-]+)(?:\([A-Za-z]\))?(?:\[\d+\])?:\s*(?:CID=[^;\s]+;\s*)?(.+)$`)

// huaweiLegacyLogbufferPattern 匹配华为 VRP 日志行去掉 %%01 版本头后的变体（undo info-center logbuf version）。
var huaweiLegacyLogbufferPattern = regexp.MustCompile(
	`^((?:[A-Za-z]{3}\s+\d{1,2}\s+\d{4}|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*[+-]\d{2}:?\d{2}|DST|UTC)?)\s+(\d+\s+[A-Za-z]+|\S+)\s+([A-Za-z0-9_-]+)/(\d)/([A-Za-z0-9_-]+)(?:\([A-Za-z]\))?(?:\[\d+\])?:\s*(?:CID=[^;\s]+;\s*)?(.+)$`)

// vrpModuleFacilities 华为 VRP V200/V600 全量日志模块（130+）→ 本系统 facility 值域映射。
// 映射结果必须落在 normalizeFacility 认可的值域内
// （system/interface/security/routing/switching/snmp/ssh/other），
// 与 docs/vendor/huawei/campus-switch-log-reference.md 保持单一事实源对齐。
var vrpModuleFacilities = map[string]string{
	// 接口、物理层与链路（interface）
	"ifnet": "interface", "ifm": "interface", "if_pdt": "interface", "ifpdt": "interface",
	"errdown": "interface", "mstp": "interface", "l2if": "interface", "l2ifpdt": "interface",
	"l3if": "interface", "trunk": "interface", "ethtrunk": "interface", "eth-trunk": "interface",
	"etrunk": "interface", "e-trunk": "interface", "lacp": "interface", "lldp": "interface",
	"poe": "interface", "poepdt": "interface", "ethport": "interface", "eth": "interface",
	"dldp": "interface", "ethoam": "interface", "efm": "interface", "cfm": "interface",
	"y1731": "interface", "optical": "interface", "transceiver": "interface", "sfp": "interface",
	"phy": "interface", "port": "interface", "subif": "interface", "vbdif": "interface",
	"nve": "interface", "udld": "interface", "l2vpn": "interface", "ifmcomm": "interface",

	// 二层交换、堆叠与叠加网络（switching）
	"vlan": "switching", "l2": "switching", "stack": "switching", "stackm": "switching",
	"istack": "switching", "css": "switching", "mlag": "switching", "m-lag": "switching",
	"m_lag": "switching", "vxlan": "switching", "evpn": "switching", "igsp": "switching",
	"maclimit": "switching", "erps": "switching", "rrpp": "switching", "vbst": "switching",
	"mflp": "switching", "smartlink": "switching", "stp": "switching", "rstp": "switching",
	"sep": "switching", "gvrp": "switching", "mvrp": "switching", "muxvlan": "switching",
	"qinq": "switching", "mac": "switching", "arp": "switching", "storm": "switching",
	"stormcon": "switching", "fdb": "switching", "bd": "switching", "bridge": "switching",
	"svf": "switching", "trill": "switching", "l2mc": "switching",

	// 三层路由、组播与检测（routing）
	"rm": "routing", "ipv6rm": "routing", "ospf": "routing", "ospfv3": "routing",
	"bgp": "routing", "bgp4plus": "routing", "rip": "routing", "ripng": "routing",
	"isis": "routing", "nd": "routing", "pim": "routing", "igmp": "routing",
	"mld": "routing", "mrib": "routing", "msvc": "routing", "bfd": "routing",
	"vrrp": "routing", "vrrp6": "routing", "msdp": "routing", "mvpn": "routing",
	"mpls": "routing", "ldp": "routing", "rsvp": "routing", "srv6": "routing",
	"pbr": "routing", "nat": "routing", "tunnel": "routing", "gre": "routing",
	"urpf": "routing", "route-policy": "routing", "rpolicy": "routing", "fib6": "routing",

	// 安全、接入认证与控制平面防护（security）
	"aaa": "security", "am": "security", "line": "security", "arpspi": "security",
	"dhcp": "security", "dhcpsnp": "security", "ipsg": "security", "portsec": "security",
	"pki": "security", "ssl": "security", "sec": "security", "secl": "security",
	"8021x": "security", "dot1x": "security", "nac": "security", "authen": "security",
	"radius": "security", "hwtacacs": "security", "portal": "security", "macauth": "security",
	"usa": "security", "savi": "security", "macsec": "security", "cpu_defend": "security",
	"cpudefend": "security", "cpu-defend": "security", "acl": "security", "rbac": "security",
	"cmd": "security", "sacg": "security", "eap": "security", "ipsec": "security",
	"ike": "security", "arpsec": "security", "dai": "security", "ndsec": "security",
	"dhcpv6": "security", "localuser": "security", "security": "security",

	// 远程登录、可编程网管通道与文件传输（ssh）
	"ssh": "ssh", "sshs": "ssh", "sshc": "ssh", "stelnet": "ssh",
	"sftp": "ssh", "scp": "ssh", "telnet": "ssh", "ftp": "ssh",
	"tftp": "ssh", "netconf": "ssh", "restconf": "ssh", "yang": "ssh",
	"http": "ssh", "https": "ssh", "vty": "ssh", "webm": "ssh",

	// 网管监控与遥测（snmp）
	"snmp": "snmp", "snmpd": "snmp", "trap": "snmp", "rmon": "snmp",
	"telemetry": "snmp", "grpc": "snmp",

	// 系统运行、硬件、环境与运维支撑（system）
	"system": "system", "shell": "system", "configuration": "system", "config": "system",
	"cfg": "system", "cli": "system", "vfs": "system", "ops": "system",
	"license": "system", "lic": "system", "update": "system", "patch": "system",
	"issu": "system", "restart": "system", "ic": "system", "srm": "system",
	"dev": "system", "devm": "system", "devmgr": "system", "dev-mgr": "system",
	"env": "system", "environment": "system", "ntp": "system", "cpu": "system",
	"memory": "system", "mem": "system", "fib": "system", "fwm": "system",
	"kpi": "system", "flash": "system", "gtl": "system", "infocenter": "system",
	"syslog": "system", "sysman": "system", "energymngt": "system", "netstream": "system",
	"ptp": "system", "dns": "system", "nqa": "system", "dad": "system",
	"datasync": "system", "autodiagnose": "system", "easyoperation": "system", "trng": "system",
	"configman": "system", "wlan": "system", "capwap": "system", "clock": "system",
	"ha": "system", "diagnose": "system", "diag": "system", "monitor": "system",
	"health": "system", "power": "system", "fan": "system", "temp": "system",
	"temperature": "system", "board": "system", "slot": "system", "entity": "system",
	"sem": "system", "mirror": "system", "sflow": "system", "erspan": "system",
	"twamp": "system", "ztp": "system", "pnp": "system", "rollback": "system",
	"upgrade": "system", "boot": "system", "reset": "system",
	"cloudmng": "system", "sysmng": "system",
}

// vrpModuleToFacility 按 VRP 模块名精确映射设施；未收录的模块退回
// detectLogFacility 对消息正文做启发式判断。
func vrpModuleToFacility(module string, message string) string {
	key := strings.ToLower(strings.TrimSpace(module))
	if facility, ok := vrpModuleFacilities[key]; ok {
		return facility
	}
	if facility, ok := vrpOfficialModuleFacilities[key]; ok {
		return facility
	}
	return detectLogFacility(message)
}

func parseLogLine(line string, deviceID int, vendor string, collectedAt time.Time) *logEntry {
	vendor = normalizeLogVendor(vendor)

	switch vendor {
	case "huawei", "h3c":
		// 华为 VRP logbuffer 结构化头优先：%%01模块/级别/助记符(l)[序号]:
		// 组：1=时间戳 2=主机名 3=模块 4=级别数字 5=助记符 6=消息正文
		if match := huaweiLogbufferPattern.FindStringSubmatch(line); len(match) == 7 {
			logTimestamp := parseTrapTimestamp(match[1], collectedAt)
			return &logEntry{
				DeviceID:     deviceID,
				Level:        mapVRPSeverity(match[4]),
				Facility:     vrpModuleToFacility(match[3], match[6]),
				Source:       "ssh",
				Message:      strings.TrimSpace(match[6]),
				RawMessage:   line,
				LogTimestamp: logTimestamp,
				CollectedAt:  collectedAt,
			}
		}
		// 无版本头变体（undo info-center logbuf version 后）：
		// `2025-03-10 08:12:33+08:00 HUAWEI SSH/5/SSH_FAIL(l):Failed to login.`
		// 组序与标准模式一致。主机名位置被 \S+ 消化，正文从模块头之后截取。
		if match := huaweiLegacyLogbufferPattern.FindStringSubmatch(line); len(match) == 7 {
			logTimestamp := parseTrapTimestamp(match[1], collectedAt)
			return &logEntry{
				DeviceID:     deviceID,
				Level:        mapVRPSeverity(match[4]),
				Facility:     vrpModuleToFacility(match[3], match[6]),
				Source:       "ssh",
				Message:      strings.TrimSpace(match[6]),
				RawMessage:   line,
				LogTimestamp: logTimestamp,
				CollectedAt:  collectedAt,
			}
		}
		if match := huaweiPattern.FindStringSubmatch(line); len(match) == 4 {
			timestamp, facilityInfo, message := match[1], match[2], match[3]
			logTimestamp := parseTimestamp(timestamp, "huawei", collectedAt)
			level, facility := parseFacilityInfo(facilityInfo)
			return &logEntry{
				DeviceID:     deviceID,
				Level:        level,
				Facility:     facility,
				Source:       "ssh",
				Message:      strings.TrimSpace(message),
				RawMessage:   line,
				LogTimestamp: logTimestamp,
				CollectedAt:  collectedAt,
			}
		}
	}

	level := detectLogLevel(line)
	facility := detectLogFacility(line)
	return &logEntry{
		DeviceID:     deviceID,
		Level:        level,
		Facility:     facility,
		Source:       "ssh",
		Message:      strings.TrimSpace(line),
		RawMessage:   line,
		LogTimestamp: collectedAt,
		CollectedAt:  collectedAt,
	}
}

// huaweiTrapPattern matches Huawei V200/V600 single-line trapbuffer output:
// #Sep 17 2012 17:09:47+00:00 HUAWEI LLDP/4/NBRCHGTRAP:OID: 1.0.8802.1.1.2.0.0.1 Neighbor info changed.
var huaweiTrapPattern = regexp.MustCompile(`(?i)^#?\s*((?:[A-Za-z]{3}\s+\d{1,2}\s+\d{4}|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*[+-]\d{2}:?\d{2}|DST|UTC)?)\s+\S+\s+(?:%%\s*\d+\s*)?([A-Za-z0-9_-]+)/(\d+)/([A-Za-z0-9_-]+)(?:\([A-Za-z]\))?[:\s]+(?:CID=[^;\s]+;\s*)?(.+)`)

// huaweiAlarmActivePattern matches Huawei V200 "display alarm active" output lines:
// 1  0x08d40001  hwBoardFail  Critical  ...  Board failed.
var huaweiAlarmActivePattern = regexp.MustCompile(`(?i)^\s*(\d+)\s+0x[0-9a-fA-F]+\s+(\S+)\s+(Critical|Major|Minor|Warning)\s+(.+)`)

// huaweiV600AlarmActivePattern matches Huawei V600 "display alarm active" table lines:
// Index Severity Id Source Time Name
// 1     Major    0x85020001 Slot:1 2026-06-06 10:14:22 Power supply failed
var huaweiV600AlarmActivePattern = regexp.MustCompile(`(?i)^\s*(\d+)\s+(Critical|Major|Minor|Warning)\s+(0x[0-9a-fA-F]+)\s+(\S+(?:\s+\S+){0,3}?)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s*[+-]\d{2}:?\d{2})?)\s+(.+)$`)

var trapBlockHeaderPattern = regexp.MustCompile(`(?i)^#\s*trap\b.*$`)
var vrpEmbeddedHeaderPattern = regexp.MustCompile(`(?:%%\s*\d{2}\s*)?([A-Za-z0-9_-]+)/([0-7])/([A-Za-z0-9_-]+)(?:\([A-Za-z]\))?`)

// parseTrapBufferLine parses a single line from Huawei "display trapbuffer" output
func parseTrapBufferLine(line string, deviceID int, collectedAt time.Time) *logEntry {
	match := huaweiTrapPattern.FindStringSubmatch(line)
	if len(match) < 6 {
		return nil
	}

	timestamp := match[1]
	module := match[2]
	severityNum := match[3]
	trapName := match[4]
	description := strings.TrimSpace(match[5])

	logTimestamp := parseTrapTimestamp(timestamp, collectedAt)
	level := mapVRPSeverity(severityNum)
	facility := vrpModuleToFacility(module, module+" "+trapName+" "+description)

	message := fmt.Sprintf("%s/%s/%s: %s", module, severityNum, trapName, description)

	return &logEntry{
		DeviceID:     deviceID,
		Level:        level,
		Facility:     facility,
		Source:       "ssh",
		Message:      message,
		RawMessage:   line,
		LogTimestamp: logTimestamp,
		CollectedAt:  collectedAt,
	}
}

type trapKVBlock struct {
	fields   map[string]string
	rawLines []string
}

func (b *trapKVBlock) isEmpty() bool {
	return b == nil || len(b.fields) == 0
}

func (b *trapKVBlock) toLogEntry(deviceID int, collectedAt time.Time) *logEntry {
	if b.isEmpty() {
		return nil
	}
	trapName := strings.TrimSpace(b.fields["trapname"])
	desc := strings.TrimSpace(b.fields["description"])
	if trapName == "" && desc == "" {
		return nil
	}

	ts := parseTrapTimestamp(b.fields["timestamp"], collectedAt)
	module := strings.TrimSpace(b.fields["module"])
	level := ""

	if hdr := vrpEmbeddedHeaderPattern.FindStringSubmatch(trapName); len(hdr) == 4 {
		if module == "" {
			module = hdr[1]
		}
		level = mapVRPSeverity(hdr[2])
	}
	if sev := strings.TrimSpace(b.fields["severity"]); sev != "" {
		level = mapAlarmOrTrapSeverityText(sev)
	}
	if level == "" {
		level = detectLogLevel(trapName + " " + desc)
	}

	facility := vrpModuleToFacility(module, module+" "+trapName+" "+desc)

	oid := strings.TrimSpace(b.fields["trapoid"])
	var message string
	switch {
	case trapName != "" && desc != "" && oid != "" && !strings.Contains(desc, oid):
		message = fmt.Sprintf("%s (OID %s): %s", trapName, oid, desc)
	case trapName != "" && desc != "":
		message = fmt.Sprintf("%s: %s", trapName, desc)
	case trapName != "":
		message = trapName
	default:
		message = desc
	}

	return &logEntry{
		DeviceID:     deviceID,
		Level:        level,
		Facility:     facility,
		Source:       "ssh",
		Message:      message,
		RawMessage:   strings.Join(b.rawLines, "\n"),
		LogTimestamp: ts,
		CollectedAt:  collectedAt,
	}
}

func normalizeTrapKVKey(rawKey string) string {
	key := strings.ToLower(strings.TrimSpace(rawKey))
	key = strings.ReplaceAll(key, " ", "")
	key = strings.ReplaceAll(key, "_", "")
	switch key {
	case "timestamp", "time":
		return "timestamp"
	case "sequence", "seq":
		return "sequence"
	case "trapname":
		return "trapname"
	case "trapoid", "oid":
		return "trapoid"
	case "severity", "level":
		return "severity"
	case "module", "source":
		return "module"
	case "description", "desc", "message", "content":
		return "description"
	default:
		return ""
	}
}

func parseTrapKVLine(line string) (string, string, bool) {
	sepIdx := strings.IndexAny(line, ":=")
	if sepIdx <= 0 {
		return "", "", false
	}
	canonicalKey := normalizeTrapKVKey(line[:sepIdx])
	if canonicalKey == "" {
		return "", "", false
	}
	return canonicalKey, strings.TrimSpace(line[sepIdx+1:]), true
}

// parseTrapBufferOutput 解析 V200 单行与 V600 多行键值块格式的 display trapbuffer 输出。
func parseTrapBufferOutput(lines []string, deviceID int, vendor string, collectedAt time.Time, maxEntries int) []logEntry {
	entries := make([]logEntry, 0, maxEntries)
	block := &trapKVBlock{fields: map[string]string{}}

	flushBlock := func() {
		if len(entries) >= maxEntries {
			block = &trapKVBlock{fields: map[string]string{}}
			return
		}
		if entry := block.toLogEntry(deviceID, collectedAt); entry != nil {
			entries = append(entries, *entry)
		}
		block = &trapKVBlock{fields: map[string]string{}}
	}

	for _, raw := range lines {
		if len(entries) >= maxEntries {
			break
		}
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || isLineSeparator(trimmed, '-') || isLineSeparator(trimmed, '=') || trapBlockHeaderPattern.MatchString(trimmed) {
			flushBlock()
			continue
		}
		if isHeaderLine(trimmed) || isDeviceEchoNoise(trimmed) {
			continue
		}
		if single := parseTrapBufferLine(trimmed, deviceID, collectedAt); single != nil {
			flushBlock()
			if len(entries) < maxEntries {
				entries = append(entries, *single)
			}
			continue
		}
		if key, val, ok := parseTrapKVLine(trimmed); ok {
			if _, exists := block.fields[key]; exists {
				flushBlock()
			}
			block.fields[key] = val
			block.rawLines = append(block.rawLines, trimmed)
			continue
		}
		flushBlock()
		if len(entries) < maxEntries {
			if entry := parseLogLine(trimmed, deviceID, vendor, collectedAt); entry != nil {
				entries = append(entries, *entry)
			}
		}
	}
	flushBlock()
	return entries
}

// parseAlarmActiveOutput 解析 V200 与 V600 表格化 display alarm active 输出。
func parseAlarmActiveOutput(lines []string, deviceID int, vendor string, collectedAt time.Time, maxEntries int) []logEntry {
	entries := make([]logEntry, 0, maxEntries)
	for _, raw := range lines {
		if len(entries) >= maxEntries {
			break
		}
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || isHeaderLine(trimmed) || isDeviceEchoNoise(trimmed) {
			continue
		}
		entry := parseAlarmActiveLine(trimmed, deviceID, collectedAt)
		if entry == nil {
			entry = parseLogLine(trimmed, deviceID, vendor, collectedAt)
		}
		if entry != nil {
			entries = append(entries, *entry)
		}
	}
	return entries
}

func mapAlarmOrTrapSeverityText(severity string) string {
	switch strings.ToLower(strings.TrimSpace(severity)) {
	case "critical", "emergency", "alert":
		return "critical"
	case "major", "error", "err":
		return "error"
	case "minor", "warning", "warn":
		return "warning"
	case "debug":
		return "debug"
	default:
		return "info"
	}
}

// parseAlarmActiveLine parses a single line from Huawei V200/V600 "display alarm active" output
func parseAlarmActiveLine(line string, deviceID int, collectedAt time.Time) *logEntry {
	if match := huaweiAlarmActivePattern.FindStringSubmatch(line); len(match) >= 5 {
		alarmName := match[2]
		severity := strings.ToLower(strings.TrimSpace(match[3]))
		description := strings.TrimSpace(match[4])

		level := mapAlarmOrTrapSeverityText(severity)
		facility := detectLogFacility(alarmName + " " + description)
		message := fmt.Sprintf("[%s] %s: %s", strings.ToUpper(severity), alarmName, description)

		return &logEntry{
			DeviceID:     deviceID,
			Level:        level,
			Facility:     facility,
			Source:       "ssh",
			Message:      message,
			RawMessage:   line,
			LogTimestamp: collectedAt,
			CollectedAt:  collectedAt,
		}
	}

	if match := huaweiV600AlarmActivePattern.FindStringSubmatch(line); len(match) >= 7 {
		severity := strings.ToLower(strings.TrimSpace(match[2]))
		alarmID := strings.TrimSpace(match[3])
		source := strings.TrimSpace(match[4])
		tsRaw := strings.TrimSpace(match[5])
		name := strings.TrimSpace(match[6])

		level := mapAlarmOrTrapSeverityText(severity)
		facility := detectLogFacility(source + " " + name)
		message := fmt.Sprintf("[%s] %s (%s): %s", strings.ToUpper(severity), alarmID, source, name)

		return &logEntry{
			DeviceID:     deviceID,
			Level:        level,
			Facility:     facility,
			Source:       "ssh",
			Message:      message,
			RawMessage:   line,
			LogTimestamp: parseTrapTimestamp(tsRaw, collectedAt),
			CollectedAt:  collectedAt,
		}
	}

	return nil
}

// mapVRPSeverity maps Huawei VRP severity number (0-7) to our level
// VRP: 0=Emergency, 1=Alert, 2=Critical, 3=Error, 4=Warning, 5=Notification, 6=Informational, 7=Debug
func mapVRPSeverity(num string) string {
	switch num {
	case "0", "1", "2":
		return "critical"
	case "3":
		return "error"
	case "4":
		return "warning"
	case "5", "6":
		return "info"
	default:
		return "debug"
	}
}

// parseTrapTimestamp parses timestamps from Huawei V200/V600 logbuffer and trapbuffer.
// Formats:
//   - "Sep 17 2012 17:09:47+00:00"
//   - "2024-01-15 10:30:22+08:00"
//   - "2026-11-20 10:15:20.123 +08:00"
//   - "2026-11-20 10:15:20.123456 +08:00"
func parseTrapTimestamp(raw string, fallback time.Time) time.Time {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}

	tzLayouts := []string{
		"2006-01-02 15:04:05.999999999 -07:00",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05 -07:00",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05.999999999 -0700",
		"2006-01-02 15:04:05.999999999-0700",
		"2006-01-02 15:04:05 -0700",
		"2006-01-02 15:04:05-0700",
		"Jan 2 2006 15:04:05.999999999 -07:00",
		"Jan 2 2006 15:04:05.999999999-07:00",
		"Jan 2 2006 15:04:05 -07:00",
		"Jan 2 2006 15:04:05-07:00",
		"Jan _2 2006 15:04:05 -07:00",
		"Jan _2 2006 15:04:05-07:00",
	}
	for _, layout := range tzLayouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC()
		}
	}

	// Remove non-standard trailing DST/UTC or offset suffix if any
	value = strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(value, "DST"), "UTC"))
	if idx := strings.LastIndex(value, "+"); idx > 10 {
		value = strings.TrimSpace(value[:idx])
	} else if idx := strings.LastIndex(value, "-"); idx > 10 {
		suffix := value[idx:]
		if len(suffix) <= 6 && strings.Contains(suffix, ":") {
			value = strings.TrimSpace(value[:idx])
		}
	}

	layouts := []string{
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"Jan 2 2006 15:04:05.999999999",
		"Jan _2 2006 15:04:05.999999999",
		"Jan 2 2006 15:04:05",
		"Jan _2 2006 15:04:05",
	}

	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			return parsed.UTC()
		}
	}

	return fallback
}

func parseTimestamp(raw string, vendor string, fallback time.Time) time.Time {
	value := strings.TrimSpace(strings.TrimPrefix(raw, "*"))
	if value == "" {
		return fallback
	}

	layouts := []string{}
	switch vendor {
	case "huawei", "h3c":
		if strings.Contains(value, ".") {
			layouts = append(layouts, "2006-01-02 15:04:05.000")
		}
		layouts = append(layouts, "2006-01-02 15:04:05")
	default:
		layouts = append(layouts, time.RFC3339)
	}

	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, value, time.Local); err == nil {
			return parsed.UTC()
		}
	}

	return fallback
}

var levelTokens = []struct {
	level  string
	tokens []string
}{
	{level: "critical", tokens: []string{"%CRIT", "%FATAL", "%EMERG", "CRITICAL", "FATAL"}},
	{level: "error", tokens: []string{"%ERR", "%ERROR", "ERROR", "ERR"}},
	{level: "warning", tokens: []string{"%WARN", "%WARNING", "WARNING", "WARN"}},
	{level: "info", tokens: []string{"%INFO", "%NOTICE", "INFO", "NOTICE"}},
	{level: "debug", tokens: []string{"%DEBUG", "DEBUG"}},
}

var facilityTokens = []struct {
	facility string
	tokens   []string
}{
	{facility: "interface", tokens: []string{"%LINK", "%IF", "INTERFACE", "PORT", "LINK"}},
	{facility: "security", tokens: []string{"%SEC", "%AUTH", "SECURITY", "AUTH", "LOGIN"}},
	{facility: "routing", tokens: []string{"%OSPF", "%BGP", "%RIP", "ROUTING", "ROUTE"}},
	{facility: "switching", tokens: []string{"%STP", "%VLAN", "SWITCHING", "BRIDGE"}},
	{facility: "snmp", tokens: []string{"%SNMP", "SNMP"}},
	{facility: "ssh", tokens: []string{"%SSH", "SSH", "TELNET"}},
}

func parseFacilityInfo(text string) (string, string) {
	level := "info"
	facility := detectLogFacility(text)

	if match := facilityLevelPattern.FindStringSubmatch(text); len(match) == 2 {
		switch match[1] {
		case "0", "1", "2":
			level = "critical"
		case "3":
			level = "error"
		case "4":
			level = "warning"
		case "5", "6":
			level = "info"
		default:
			level = "debug"
		}
	}

	return level, facility
}

func detectLogLevel(text string) string {
	upper := strings.ToUpper(text)
	for _, item := range levelTokens {
		for _, token := range item.tokens {
			if strings.Contains(upper, token) {
				return item.level
			}
		}
	}
	return "info"
}

func detectLogFacility(text string) string {
	upper := strings.ToUpper(text)
	for _, item := range facilityTokens {
		for _, token := range item.tokens {
			if strings.Contains(upper, token) {
				return item.facility
			}
		}
	}
	return "system"
}

func isHeaderLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return true
	}

	prefixes := []string{
		"Syslog logging:",
		"Console logging:",
		"Monitor logging:",
		"Buffer logging:",
		"Logging to",
		"Log Buffer",
		"Trapping buffer",
		"Allowed max buffer",
		"Actual buffer size",
		"Channel number",
		"Channel name",
		"Dropped messages",
		"Overwritten messages",
		"Current messages",
		"Sequence",
		"Total active alarms",
	}

	for _, prefix := range prefixes {
		if strings.HasPrefix(trimmed, prefix) {
			return true
		}
	}

	if strings.HasPrefix(trimmed, "Index") && strings.Contains(trimmed, "Severity") {
		return true
	}

	if isLineSeparator(trimmed, '-') || isLineSeparator(trimmed, '=') {
		return true
	}

	return false
}

var (
	// ansiEscapePattern 匹配 ANSI CSI 控制序列，如 \x1b[42D（光标左移 42 列）。
	// 华为设备在分页提示后用它擦除提示符，采集到的原始回显中会残留。
	ansiEscapePattern = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]`)

	// devicePromptPattern 匹配 CLI 提示符连同其后的命令回显，如 `<SW>display alarm active`。
	// 要求 `<` 后紧跟字母 —— 否则会误吃 syslog 的优先级前缀 `<34>`。
	devicePromptPattern = regexp.MustCompile(`^<[A-Za-z][^>]{0,31}>`)

	// alarmLegendPattern 匹配 `display alarm active` 输出顶部的字段图例，
	// 形如 `E=ID, F=Name, G=Level, H=State` 与 `A/B/C/D/E/F/G/H/I/J`。
	alarmLegendPattern = regexp.MustCompile(`^[A-Z]=|^[A-Z](?:/[A-Z])+$`)
)

// isDeviceEchoNoise 判定该行是否为设备交互回显或命令输出装饰，而非日志正文。
//
// SSH 采集的流程是「登录设备 → 执行命令 → 抓取回显」，设备在命令输出之外
// 还会回显登录横幅、命令提示符、分页提示与表格图例。它们不携带任何设备运行信息，
// 却因 parseLogLine 对任意非空行都会兜底建条而被逐条入库 ——
// 治理前占入库量的四分之一以上，既抬高统计卡数字，也让日志列表充斥无意义条目。
//
// 判定刻意保持收敛，只识别已在真实采集数据中确认存在的固定回显：
// 真实日志被静默丢弃，比残留噪声更难被发现。
func isDeviceEchoNoise(line string) bool {
	stripped := strings.TrimSpace(ansiEscapePattern.ReplaceAllString(line, ""))

	// 整行只有光标控制序列，剥离后不剩任何内容
	if stripped == "" {
		return true
	}
	// 分页提示符：`---- More ----`
	if strings.Contains(stripped, "---- More ----") {
		return true
	}
	// 登录横幅：`The current login time is 2026-08-10 23:39:16.`
	if strings.HasPrefix(stripped, "The current login time is") {
		return true
	}
	// VTY 用户数横幅：设备按终端宽度折行，故首行与续行都要认
	if strings.HasPrefix(stripped, "Info: The max number of VTY users is") ||
		strings.HasPrefix(stripped, "of current VTY users on line is") {
		return true
	}
	// 命令提示符回显与告警表图例
	if devicePromptPattern.MatchString(stripped) || alarmLegendPattern.MatchString(stripped) {
		return true
	}

	return false
}

func isLineSeparator(line string, ch rune) bool {
	if line == "" {
		return false
	}
	for _, r := range line {
		if r != ch {
			return false
		}
	}
	return true
}
