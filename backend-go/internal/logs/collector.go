package logs

import (
	"context"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
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
	config := &ssh.ClientConfig{
		User:            device.SshUsername,
		Auth:            []ssh.AuthMethod{ssh.Password(device.SshPassword)},
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

	var output []byte
	done := make(chan error, 1)
	go func() {
		output, err = session.CombinedOutput(command)
		done <- err
	}()

	select {
	case <-ctx.Done():
		_ = session.Close()
		return "", ErrCollectionCanceled
	case err := <-done:
		if err != nil {
			return "", fmt.Errorf("ssh command failed: %w", err)
		}
		return string(output), nil
	}
}

func resolveVendorCommand(vendor string, logType string) string {
	vendor = strings.ToLower(strings.TrimSpace(vendor))
	logType = normalizeLogType(logType)

	commands := map[string]map[string]string{
		"cisco": {
			"system":    "show logging",
			"interface": "show logging | include %LINK",
			"security":  "show logging | include %SEC",
			"recent":    "show logging last 100",
			"trap":      "show logging | include %",
			"alarm":     "show logging | include %",
		},
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
		"juniper": {
			"system":    "show log messages",
			"interface": "show log messages | match interface",
			"security":  "show log messages | match security",
			"recent":    "show log messages | last 100",
			"trap":      "show log messages | match SNMP_TRAP",
			"alarm":     "show chassis alarms",
		},
	}

	if commands[vendor] == nil {
		vendor = "cisco"
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
		if line == "" || isHeaderLine(line) {
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
	ciscoPattern   = regexp.MustCompile(`^\*?(\w+\s+\d+\s+\d+:\d+:\d+(?:\.\d+)?):?\s*%?([^:]+):\s*(.+)$`)
	huaweiPattern  = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]:\s*(.+)$`)
	juniperPattern = regexp.MustCompile(`^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s*(.+)$`)
	facilityLevelPattern = regexp.MustCompile(`[/-](\d+)[/-]`)
)

func parseLogLine(line string, deviceID int, vendor string, collectedAt time.Time) *logEntry {
	vendor = strings.ToLower(strings.TrimSpace(vendor))

	switch vendor {
	case "cisco":
		if match := ciscoPattern.FindStringSubmatch(line); len(match) == 4 {
			timestamp, facilityInfo, message := match[1], match[2], match[3]
			logTimestamp := parseTimestamp(timestamp, "cisco", collectedAt)
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
	case "juniper":
		if match := juniperPattern.FindStringSubmatch(line); len(match) == 5 {
			timestamp := match[1]
			processInfo := match[3]
			message := match[4]
			logTimestamp := parseTimestamp(timestamp, "juniper", collectedAt)
			level := detectLogLevel(message)
			facility := detectLogFacility(message)
			process := strings.TrimSpace(processInfo)
			return &logEntry{
				DeviceID:      deviceID,
				Level:         level,
				Facility:      facility,
				Source:        "ssh",
				Message:       strings.TrimSpace(message),
				RawMessage:    line,
				SourceProcess: &process,
				LogTimestamp:  logTimestamp,
				CollectedAt:   collectedAt,
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
		DeviceID:    deviceID,
		Level:       level,
		Facility:    facility,
		Source:      "ssh",
		Message:     message,
		RawMessage:  line,
		LogTimestamp: logTimestamp,
		CollectedAt: collectedAt,
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
		DeviceID:    deviceID,
		Level:       level,
		Facility:    facility,
		Source:      "ssh",
		Message:     message,
		RawMessage:  line,
		LogTimestamp: collectedAt,
		CollectedAt: collectedAt,
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

	currentYear := time.Now().Year()
	layouts := []string{}
	switch vendor {
	case "cisco", "juniper":
		if strings.Contains(value, ".") {
			layouts = append(layouts, "2006 Jan 2 15:04:05.000")
		}
		layouts = append(layouts, "2006 Jan 2 15:04:05")
		value = fmt.Sprintf("%d %s", currentYear, value)
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
