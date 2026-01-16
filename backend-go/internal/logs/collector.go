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
		},
		"huawei": {
			"system":    "display logbuffer",
			"interface": "display logbuffer | include IF",
			"security":  "display logbuffer | include SEC",
			"recent":    "display logbuffer reverse",
		},
		"h3c": {
			"system":    "display logbuffer",
			"interface": "display logbuffer | include Link",
			"security":  "display logbuffer | include SEC",
			"recent":    "display logbuffer reverse",
		},
		"juniper": {
			"system":    "show log messages",
			"interface": "show log messages | match interface",
			"security":  "show log messages | match security",
			"recent":    "show log messages | last 100",
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

	for _, line := range lines {
		if len(entries) >= maxEntries {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" || isHeaderLine(line) {
			continue
		}
		entry := parseLogLine(line, deviceID, vendor, collectedAt)
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
