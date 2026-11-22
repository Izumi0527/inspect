package logs

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	// vrpSyslogHeaderPattern 匹配内嵌在 Syslog 报文中的华为 VRP/V600 结构化头：
	// %%01MLAG/3/PEER_LINK_DOWN(l):CID=0x807a040b;...
	vrpSyslogHeaderPattern = regexp.MustCompile(`%%\s*\d{2}\s*([A-Za-z0-9_-]+)/([0-7])/([A-Za-z0-9_-]+)(?:\([A-Za-z]\))?(?:\[\d+\])?`)
	vrpSyslogCIDPrefix     = regexp.MustCompile(`^CID=[^;\s]+;\s*`)
)

// SyslogParsedMessage 表示从 Syslog 原始报文中提取出的关键字段（用于日志落库与告警联动）。
type SyslogParsedMessage struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Facility  string    `json:"facility"`
	Process   string    `json:"process"`
	Message   string    `json:"message"`
	Raw       string    `json:"raw"`
}

// ParseSyslogMessage 解析常见 Syslog 格式（RFC3164/RFC5424）的原始报文。
// 解析失败时会尽量回退到 receivedAt，并基于消息内容推断 level/facility。
func ParseSyslogMessage(raw string, receivedAt time.Time) SyslogParsedMessage {
	text := strings.TrimSpace(raw)
	if text == "" {
		return SyslogParsedMessage{
			Timestamp: receivedAt.UTC(),
			Level:     "info",
			Facility:  "system",
			Process:   "",
			Message:   "",
			Raw:       raw,
		}
	}

	priority, rest, ok := parseSyslogPriority(text)
	severity := -1
	facilityCode := -1
	if ok && priority >= 0 {
		facilityCode = priority / 8
		severity = priority % 8
	}

	level := mapSyslogSeverityToLevel(severity)
	facility := mapSyslogFacilityToFacility(facilityCode)

	timestamp, host, process, message := parseSyslogBody(rest, receivedAt)
	if strings.TrimSpace(message) == "" {
		// 解析失败时至少保留原始内容，避免丢失信息。
		message = rest
	}

	// 如果 PRI 不存在/不可解析，使用内容推断兜底。
	if !ok {
		level = detectLogLevel(rest)
		facility = detectLogFacility(rest)
	}

	// 若正文内嵌华为 VRP/V600 结构化头（%%01MODULE/SEV/MNEMONIC(l):CID=...），
	// 精准提取 VRP 严重级别与模块设施：
	// - VRP 严重级别优先于通用或转发覆盖的 PRI 级别；
	// - 明确的 VRP 模块设施优先于无 PRI 或通用 local0-local7/system/other 设施；
	// - 剥离消息体前导 CID=0x...; 并补齐干净的模块进程名。
	if vrpMatch := vrpSyslogHeaderPattern.FindStringSubmatch(rest); len(vrpMatch) == 4 {
		module := vrpMatch[1]
		vrpSev := vrpMatch[2]
		level = mapVRPSeverity(vrpSev)

		cleanMsg := vrpSyslogCIDPrefix.ReplaceAllString(strings.TrimSpace(message), "")
		message = cleanMsg

		if mapped, exists := vrpModuleFacilities[strings.ToLower(strings.TrimSpace(module))]; exists {
			if !ok || facility == "system" || facility == "other" {
				facility = mapped
			}
		} else if !ok || facility == "system" || facility == "other" {
			facility = detectLogFacility(cleanMsg)
		}

		if process == "" || strings.HasPrefix(process, "%%") {
			process = module
		}
	}

	// 如果解析出 process 为空，尝试从内容推断（保守：不强行猜）。
	_ = host

	return SyslogParsedMessage{
		Timestamp: timestamp,
		Level:     level,
		Facility:  facility,
		Process:   process,
		Message:   strings.TrimSpace(message),
		Raw:       raw,
	}
}

func parseSyslogPriority(raw string) (int, string, bool) {
	if !strings.HasPrefix(raw, "<") {
		return -1, raw, false
	}
	end := strings.Index(raw, ">")
	if end <= 1 {
		return -1, raw, false
	}
	num := raw[1:end]
	pri, err := strconv.Atoi(num)
	if err != nil || pri < 0 {
		return -1, raw, false
	}
	return pri, strings.TrimSpace(raw[end+1:]), true
}

func mapSyslogSeverityToLevel(severity int) string {
	switch severity {
	case 0, 1, 2:
		return "critical"
	case 3:
		return "error"
	case 4:
		return "warning"
	case 7:
		return "debug"
	case 5, 6:
		return "info"
	default:
		return "info"
	}
}

func mapSyslogFacilityToFacility(code int) string {
	// 常见映射：auth/authpriv -> security；其余默认 system/other。
	switch code {
	case 4, 10: // auth/authpriv
		return "security"
	case 0, 1, 3, 5, 9, 11, 12, 13, 14, 15:
		return "system"
	default:
		// local0-local7（16-23）很多设备用作通用日志；默认归到 system。
		if code >= 16 && code <= 23 {
			return "system"
		}
		return "other"
	}
}

func parseSyslogBody(rest string, receivedAt time.Time) (time.Time, string, string, string) {
	trimmed := strings.TrimSpace(rest)
	if trimmed == "" {
		return receivedAt.UTC(), "", "", ""
	}

	// RFC5424: VERSION TIMESTAMP HOST APP PROCID MSGID [SD] MSG
	fields := strings.Fields(trimmed)
	if len(fields) >= 6 {
		if _, err := strconv.Atoi(fields[0]); err == nil {
			if ts, ok := parseSyslogTimestamp(fields[1], receivedAt); ok {
				host := fields[2]
				app := fields[3]
				// RFC5424 固定字段长度为 7（含 STRUCTURED-DATA），MSG 从第 8 个字段开始（索引 7）。
				msg := ""
				if len(fields) >= 8 {
					msg = strings.Join(fields[7:], " ")
				}
				return ts, host, app, msg
			}
		}
	}

	// RFC3164: MMM dd hh:mm:ss HOST TAG: MSG
	if len(fields) >= 5 {
		tsCandidate := strings.Join(fields[0:3], " ")
		if ts, ok := parseSyslogTimestampRFC3164(tsCandidate, receivedAt); ok {
			host := fields[3]
			afterHost := stripLeadingFields(trimmed, 4)

			process, msg := parseRFC3164TagAndMessage(afterHost)
			return ts, host, process, msg
		}
	}

	// 华为 VRP/V600 带 4 位年份的 Syslog 格式：MMM dd yyyy hh:mm:ss HOST TAG: MSG
	if len(fields) >= 6 {
		tsCandidate := strings.Join(fields[0:4], " ")
		if ts, ok := parseSyslogTimestampWithYear(tsCandidate); ok {
			host := fields[4]
			afterHost := stripLeadingFields(trimmed, 5)

			process, msg := parseRFC3164TagAndMessage(afterHost)
			return ts, host, process, msg
		}
	}

	// 兜底：不解析，使用接收时间。
	return receivedAt.UTC(), "", "", trimmed
}

// stripLeadingFields 按空白分隔跳过前 n 个词元并返回剩余正文，兼容 RFC3164 单数日双空格（如 "Nov  2 2026"）。
func stripLeadingFields(text string, n int) string {
	rest := strings.TrimSpace(text)
	for i := 0; i < n && rest != ""; i++ {
		idx := strings.IndexAny(rest, " \t")
		if idx < 0 {
			return ""
		}
		rest = strings.TrimSpace(rest[idx:])
	}
	return rest
}

func parseSyslogTimestampWithYear(value string) (time.Time, bool) {
	text := strings.TrimSpace(value)
	if text == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{"Jan 2 2006 15:04:05", "Jan _2 2006 15:04:05"} {
		if ts, err := time.Parse(layout, text); err == nil {
			return ts.UTC(), true
		}
	}
	return time.Time{}, false
}

func parseSyslogTimestamp(value string, receivedAt time.Time) (time.Time, bool) {
	text := strings.TrimSpace(value)
	if text == "" || text == "-" {
		return receivedAt.UTC(), false
	}
	// RFC3339 / RFC3339Nano
	if ts, err := time.Parse(time.RFC3339Nano, text); err == nil {
		return ts.UTC(), true
	}
	if ts, err := time.Parse(time.RFC3339, text); err == nil {
		return ts.UTC(), true
	}
	return receivedAt.UTC(), false
}

func parseSyslogTimestampRFC3164(value string, receivedAt time.Time) (time.Time, bool) {
	text := strings.TrimSpace(value)
	if text == "" {
		return receivedAt.UTC(), false
	}

	// RFC3164 没有年份，使用 receivedAt 的年份（UTC）补齐。
	year := receivedAt.UTC().Year()
	withYear := strconv.Itoa(year) + " " + text

	// Jan 2 15:04:05
	if ts, err := time.Parse("2006 Jan 2 15:04:05", withYear); err == nil {
		return ts.UTC(), true
	}
	// Jan _2 15:04:05（兼容单数日期）
	if ts, err := time.Parse("2006 Jan _2 15:04:05", withYear); err == nil {
		return ts.UTC(), true
	}

	return receivedAt.UTC(), false
}

func parseRFC3164TagAndMessage(value string) (string, string) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", ""
	}
	// TAG 通常形如 "sshd[123]:" 或 "sshd:"，TAG 后是消息。
	colon := strings.Index(text, ":")
	if colon < 0 {
		return "", text
	}

	tag := strings.TrimSpace(text[:colon])
	msg := strings.TrimSpace(text[colon+1:])

	// 去掉 [pid]
	if idx := strings.Index(tag, "["); idx >= 0 {
		tag = strings.TrimSpace(tag[:idx])
	}
	return tag, msg
}
