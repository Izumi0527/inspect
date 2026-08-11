package logs

import (
	"context"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
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
}

func NewSSHCollector() *SSHCollector {
	return &SSHCollector{Timeout: 30 * time.Second}
}

func (c *SSHCollector) Collect(ctx context.Context, device deviceInfo, logType string, maxEntries int) ([]logEntry, error) {
	if maxEntries <= 0 {
		maxEntries = 100
	}

	command := resolveVendorCommand(device.Vendor, logType)
	if strings.TrimSpace(command) == "" {
		return nil, fmt.Errorf("log command not configured")
	}

	client, err := c.connect(ctx, device)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	output, err := c.runCommand(ctx, client, command)
	if err != nil {
		return nil, err
	}

	collectedAt := time.Now().UTC()
	return parseLogOutput(output, device.ID, device.Vendor, collectedAt, maxEntries), nil
}

func (c *SSHCollector) connect(ctx context.Context, device deviceInfo) (*ssh.Client, error) {
	// 认证方式由已配置凭据决定：私钥优先、密码兜底（见 sshutil.BuildAuthMethods）。
	auth, err := sshutil.BuildAuthMethods(device.SshPassword, device.SshPrivateKey, device.SshKeyPassphrase)
	if err != nil {
		return nil, err
	}
	config := &ssh.ClientConfig{
		// 兼容华为/H3C 等老旧网络设备的密钥交换/加密/MAC 算法（Go 默认禁用部分旧算法）
		Config:          sshutil.LegacyAlgorithms(),
		User:            device.SshUsername,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
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

func (c *SSHCollector) runCommand(ctx context.Context, client *ssh.Client, command string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	// 请求 PTY（华为/H3C 等网络设备需要交互式终端才会输出内容）
	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("vt100", 24, 200, modes); err != nil {
		// PTY 不可用，回退到 Output 方式
		output, _ := session.Output(command)
		return string(output), nil
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return "", err
	}

	if err := session.Shell(); err != nil {
		return "", err
	}

	// 等待 shell 准备好（华为设备会先显示 VRP 提示符）
	time.Sleep(1 * time.Second)

	// 发送命令 + 退出标记
	endMarker := "__CMD_END_7f3a9b2c__"
	go func() {
		defer stdin.Close()
		time.Sleep(200 * time.Millisecond)
		fmt.Fprintf(stdin, "%s\n", command)
		time.Sleep(500 * time.Millisecond)
		fmt.Fprintf(stdin, "echo %s\n", endMarker)
		time.Sleep(200 * time.Millisecond)
		fmt.Fprintf(stdin, "exit\n")
	}()

	// 带超时读取输出
	var output []byte
	buf := make([]byte, 65536)
	readTimeout := time.After(15 * time.Second)

	for {
		select {
		case <-ctx.Done():
			return string(output), ErrCollectionCanceled
		case <-readTimeout:
			return string(output), nil
		default:
		}

		// 非阻塞检测：如果 stdout 没数据就短睡再试
		n, err := stdout.Read(buf)
		if n > 0 {
			output = append(output, buf[:n]...)
		}
		if err != nil {
			return string(output), nil
		}

		// 检测结束标记
		outputStr := string(output)
		if strings.Contains(outputStr, endMarker) {
			idx := strings.Index(outputStr, endMarker)
			return string(output[:idx]), nil
		}
	}
}

func resolveVendorCommand(vendor string, logType string) string {
	vendor = strings.ToLower(strings.TrimSpace(vendor))
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

func parseLogOutput(output string, deviceID int, vendor string, collectedAt time.Time, maxEntries int) []logEntry {
	lines := strings.Split(output, "\n")
	entries := make([]logEntry, 0, maxEntries)

	// 检测是否为 trapbuffer 或 alarm active 输出（通过内容特征判断）
	isTrapBuffer := false
	isAlarmActive := false
	vendorLower := strings.ToLower(strings.TrimSpace(vendor))
	if vendorLower == "huawei" || vendorLower == "h3c" {
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.Contains(trimmed, "Trapping buffer") || strings.Contains(trimmed, "trapbuffer") || strings.HasPrefix(trimmed, "#") {
				isTrapBuffer = true
				break
			}
			if strings.Contains(trimmed, "Sequence") && strings.Contains(trimmed, "AlarmID") {
				isAlarmActive = true
				break
			}
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

		var entry *logEntry
		if isTrapBuffer {
			entry = parseTrapBufferLine(line, deviceID, collectedAt)
		} else if isAlarmActive {
			entry = parseAlarmActiveLine(line, deviceID, collectedAt)
		}
		if entry == nil {
			entry = parseLogLine(line, deviceID, vendor, collectedAt)
		}
		if entry != nil {
			entries = append(entries, *entry)
		}
	}

	return entries
}

var (
	huaweiPattern        = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]:\s*(.+)$`)
	facilityLevelPattern = regexp.MustCompile(`[/-](\d+)[/-]`)
)

func parseLogLine(line string, deviceID int, vendor string, collectedAt time.Time) *logEntry {
	vendor = strings.ToLower(strings.TrimSpace(vendor))

	switch vendor {
	case "huawei", "h3c":
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

// huaweiTrapPattern matches Huawei trapbuffer output lines:
// #Sep 17 2012 17:09:47+00:00 HUAWEI LLDP/4/NBRCHGTRAP:OID: 1.0.8802.1.1.2.0.0.1 Neighbor info changed.
var huaweiTrapPattern = regexp.MustCompile(`(?i)^#?\s*(\w+\s+\d+\s+\d{4}\s+\d{2}:\d{2}:\d{2}[^\s]*|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[^\s]*)\s+\S+\s+(?:%%\d+)?(\w+)/(\d+)/(\w+)(?:\([a-z]\))?[:\s]+(.+)`)

// huaweiAlarmActivePattern matches Huawei "display alarm active" output lines:
// 1  0x08d40001  hwBoardFail  Critical  ...  Board failed.
var huaweiAlarmActivePattern = regexp.MustCompile(`(?i)^\s*(\d+)\s+0x[0-9a-fA-F]+\s+(\S+)\s+(Critical|Major|Minor|Warning)\s+(.+)`)

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
	facility := detectLogFacility(module + " " + trapName + " " + description)

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

// parseAlarmActiveLine parses a single line from Huawei "display alarm active" output
func parseAlarmActiveLine(line string, deviceID int, collectedAt time.Time) *logEntry {
	match := huaweiAlarmActivePattern.FindStringSubmatch(line)
	if len(match) < 5 {
		return nil
	}

	alarmName := match[2]
	severity := strings.ToLower(strings.TrimSpace(match[3]))
	description := strings.TrimSpace(match[4])

	level := "warning"
	switch severity {
	case "critical":
		level = "critical"
	case "major":
		level = "error"
	case "minor":
		level = "warning"
	case "warning":
		level = "warning"
	}

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

// parseTrapTimestamp parses timestamps from Huawei trapbuffer
// Formats: "Sep 17 2012 17:09:47+00:00" or "2024-01-15 10:30:22+08:00"
func parseTrapTimestamp(raw string, fallback time.Time) time.Time {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}

	// Remove timezone offset suffix for simpler parsing
	// "Sep 17 2012 17:09:47+00:00" -> "Sep 17 2012 17:09:47"
	if idx := strings.LastIndex(value, "+"); idx > 10 {
		value = value[:idx]
	} else if idx := strings.LastIndex(value, "-"); idx > 10 {
		// Be careful not to strip date hyphens
		suffix := value[idx:]
		if len(suffix) <= 6 && strings.Contains(suffix, ":") {
			value = value[:idx]
		}
	}

	layouts := []string{
		"Jan 2 2006 15:04:05",
		"Jan 02 2006 15:04:05",
		"2006-01-02 15:04:05",
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
