package devices

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
	"go.uber.org/zap"
	"gorm.io/datatypes"
)

type ProbeResult struct {
	DeviceID         int
	IPAddress        string
	IcmpReachable    bool
	IcmpResponseTime *float64
	IcmpError        *string
	SnmpReachable    bool
	SnmpResponseTime *float64
	SnmpError        *string
	SnmpSystemInfo   *string
	ProbedAt         time.Time
}

type ProbeTarget struct {
	ID            int
	IPAddress     string
	SnmpCommunity *string
	SnmpVersion   *string
	SnmpPort      *int
	Tags          interface{}
}

type ICMPProber func(ctx context.Context, ipAddress string) (bool, *float64, *string)

type SNMPProber func(
	ctx context.Context,
	ipAddress string,
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
) (bool, *float64, *string, *string)

type ProbeService struct {
	logger   *zap.Logger
	cache    map[int]ProbeResult
	cacheTTL time.Duration
	mu       sync.RWMutex
	icmp     ICMPProber
	snmp     SNMPProber
}

func NewProbeService(logger *zap.Logger) *ProbeService {
	return NewProbeServiceWithProbers(logger, nil, nil)
}

// NewProbeServiceWithProbers 用于测试或特殊环境注入探测函数，避免直接依赖系统 ping/SNMP。
// 若传入 nil，则回落使用默认实现。
func NewProbeServiceWithProbers(logger *zap.Logger, icmpProber ICMPProber, snmpProber SNMPProber) *ProbeService {
	if icmpProber == nil {
		icmpProber = probeICMP
	}
	if snmpProber == nil {
		snmpProber = probeSNMP
	}
	ps := &ProbeService{
		logger:   logger,
		cache:    make(map[int]ProbeResult),
		cacheTTL: 30 * time.Second,
		icmp:     icmpProber,
		snmp:     snmpProber,
	}
	go ps.evictExpiredCache()
	return ps
}

func (s *ProbeService) ProbeDevice(
	ctx context.Context,
	deviceID int,
	ipAddress string,
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
	useCache bool,
) (ProbeResult, error) {
	if strings.TrimSpace(ipAddress) == "" {
		return ProbeResult{}, fmt.Errorf("ip_address is required")
	}

	if useCache {
		if cached, ok := s.getCached(deviceID); ok {
			return cached, nil
		}
	}

	icmpCh := make(chan probeResultPayload, 1)
	snmpCh := make(chan probeResultPayload, 1)

	go func() {
		icmpProber := s.icmp
		if icmpProber == nil {
			icmpProber = probeICMP
		}
		reachable, response, errMsg := icmpProber(ctx, ipAddress)
		icmpCh <- probeResultPayload{reachable: reachable, responseTime: response, errorMessage: errMsg}
	}()
	go func() {
		snmpProber := s.snmp
		if snmpProber == nil {
			snmpProber = probeSNMP
		}
		reachable, response, info, errMsg := snmpProber(ctx, ipAddress, snmpCommunity, snmpVersion, snmpPort, tags)
		snmpCh <- probeResultPayload{reachable: reachable, responseTime: response, errorMessage: errMsg, systemInfo: info}
	}()

	icmpResult := <-icmpCh
	snmpResult := <-snmpCh

	result := ProbeResult{
		DeviceID:         deviceID,
		IPAddress:        ipAddress,
		IcmpReachable:    icmpResult.reachable,
		IcmpResponseTime: icmpResult.responseTime,
		IcmpError:        icmpResult.errorMessage,
		SnmpReachable:    snmpResult.reachable,
		SnmpResponseTime: snmpResult.responseTime,
		SnmpError:        snmpResult.errorMessage,
		SnmpSystemInfo:   snmpResult.systemInfo,
		ProbedAt:         time.Now().UTC(),
	}

	s.setCache(deviceID, result)
	return result, nil
}

func (s *ProbeService) BatchProbeDevices(ctx context.Context, targets []ProbeTarget, maxConcurrent int) map[int]ProbeResult {
	if maxConcurrent <= 0 {
		maxConcurrent = 20
	}
	limit := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	mu := sync.Mutex{}
	results := make(map[int]ProbeResult)

	for _, target := range targets {
		target := target
		wg.Add(1)
		go func() {
			defer wg.Done()
			limit <- struct{}{}
			defer func() { <-limit }()

			result, err := s.ProbeDevice(
				ctx,
				target.ID,
				target.IPAddress,
				target.SnmpCommunity,
				target.SnmpVersion,
				target.SnmpPort,
				target.Tags,
				false,
			)
			if err != nil {
				if s.logger != nil {
					s.logger.Warn("batch probe failed", zap.Error(err), zap.Int("device_id", target.ID))
				}
				return
			}

			mu.Lock()
			results[target.ID] = result
			mu.Unlock()
		}()
	}

	wg.Wait()
	return results
}

func (s *ProbeService) getCached(deviceID int) (ProbeResult, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cached, ok := s.cache[deviceID]
	if !ok {
		return ProbeResult{}, false
	}
	if time.Since(cached.ProbedAt) > s.cacheTTL {
		return ProbeResult{}, false
	}
	return cached, true
}

func (s *ProbeService) setCache(deviceID int, result ProbeResult) {
	if deviceID <= 0 {
		return
	}
	s.mu.Lock()
	s.cache[deviceID] = result
	s.mu.Unlock()
}

// evictExpiredCache 定期清理过期缓存条目，防止 map 无限膨胀
func (s *ProbeService) evictExpiredCache() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		for id, cached := range s.cache {
			if time.Since(cached.ProbedAt) > s.cacheTTL*2 {
				delete(s.cache, id)
			}
		}
		s.mu.Unlock()
	}
}

type probeResultPayload struct {
	reachable    bool
	responseTime *float64
	errorMessage *string
	systemInfo   *string
}

func probeICMP(ctx context.Context, ipAddress string) (bool, *float64, *string) {
	start := time.Now()
	args := pingArgs(ipAddress)
	cmd := exec.CommandContext(ctx, "ping", args...)
	output, err := cmd.CombinedOutput()
	elapsedMs := float64(time.Since(start).Milliseconds())

	if err != nil {
		msg := strings.TrimSpace(string(output))
		if msg == "" {
			msg = err.Error()
		}
		return false, nil, &msg
	}

	responseTime := parsePingTime(string(output))
	if responseTime == nil {
		responseTime = &elapsedMs
	}
	return true, responseTime, nil
}

func pingArgs(ipAddress string) []string {
	if runtime.GOOS == "windows" {
		return []string{"-n", "1", "-w", "3000", ipAddress}
	}
	return []string{"-c", "1", "-W", "3", ipAddress}
}

func parsePingTime(output string) *float64 {
	re := regexp.MustCompile(`time[=<]\s*([0-9.]+)\s*ms`)
	matches := re.FindStringSubmatch(output)
	if len(matches) < 2 {
		return nil
	}
	value := strings.TrimSpace(matches[1])
	if value == "" {
		return nil
	}
	parsed, err := strconvParseFloat(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func probeSNMP(
	ctx context.Context,
	ipAddress string,
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
) (bool, *float64, *string, *string) {
	config := resolveSNMPConfig(snmpCommunity, snmpVersion, snmpPort, tags)

	if config.version == "1" || config.version == "2c" {
		if strings.TrimSpace(config.community) == "" {
			msg := "SNMP community not configured"
			return false, nil, nil, &msg
		}
	} else if config.version == "3" {
		if strings.TrimSpace(config.username) == "" {
			msg := "SNMP v3 username not configured"
			return false, nil, nil, &msg
		}
		if config.securityLevel != gosnmp.NoAuthNoPriv && strings.TrimSpace(config.authKey) == "" {
			msg := "SNMP v3 auth password not configured"
			return false, nil, nil, &msg
		}
		if config.securityLevel == gosnmp.AuthPriv && strings.TrimSpace(config.privKey) == "" {
			msg := "SNMP v3 priv password not configured"
			return false, nil, nil, &msg
		}
	} else {
		msg := "unsupported SNMP version"
		return false, nil, nil, &msg
	}

	start := time.Now()
	target := &gosnmp.GoSNMP{
		Target:  ipAddress,
		Port:    config.port,
		Timeout: 3 * time.Second,
		Retries: 1,
	}

	switch config.version {
	case "1":
		target.Version = gosnmp.Version1
		target.Community = config.community
	case "2c":
		target.Version = gosnmp.Version2c
		target.Community = config.community
	case "3":
		target.Version = gosnmp.Version3
		target.SecurityModel = gosnmp.UserSecurityModel
		target.MsgFlags = config.securityLevel
		target.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 config.username,
			AuthenticationProtocol:   config.authProtocol,
			AuthenticationPassphrase: config.authKey,
			PrivacyProtocol:          config.privProtocol,
			PrivacyPassphrase:        config.privKey,
		}
	}

	if err := target.Connect(); err != nil {
		msg := err.Error()
		return false, nil, nil, &msg
	}
	defer target.Conn.Close()

	if ctx.Err() != nil {
		msg := ctx.Err().Error()
		return false, nil, nil, &msg
	}

	sysDescrOID, err := probeSystemDescrOID()
	if err != nil {
		msg := err.Error()
		return false, nil, nil, &msg
	}

	packet, err := target.Get([]string{sysDescrOID})
	elapsed := float64(time.Since(start).Milliseconds())
	if err != nil {
		msg := err.Error()
		return false, &elapsed, nil, &msg
	}

	if packet == nil || packet.Error != gosnmp.NoError || len(packet.Variables) == 0 {
		msg := "SNMP get failed"
		return false, &elapsed, nil, &msg
	}

	value := packet.Variables[0].Value
	info := formatSNMPValue(value)
	if len(info) > 100 {
		info = info[:100]
	}

	return true, &elapsed, &info, nil
}

func probeSystemDescrOID() (string, error) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		return "", fmt.Errorf("load SNMP MIB registry failed: %w", err)
	}

	oid := strings.TrimSpace(registry.Common.Probe.SysDescr.OID)
	if oid == "" {
		return "", fmt.Errorf("common.probe.sys_descr.oid is empty")
	}

	return oid, nil
}

// formatSNMPValue 将 SNMP 返回值转换为可读字符串
func formatSNMPValue(value interface{}) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case []byte:
		// 将字节数组转换为字符串
		// 过滤掉不可打印字符
		result := make([]byte, 0, len(v))
		for _, b := range v {
			if b >= 32 && b < 127 {
				result = append(result, b)
			} else if b == '\n' || b == '\r' || b == '\t' {
				result = append(result, ' ')
			}
		}
		return strings.TrimSpace(string(result))
	case string:
		// 检查字符串是否是字节数组格式 [83 53 55 50...]
		if strings.HasPrefix(v, "[") && len(v) > 2 {
			// 尝试解析字节数组格式
			trimmed := strings.TrimPrefix(strings.TrimSuffix(v, "]"), "[")
			parts := strings.Fields(trimmed)
			if len(parts) > 0 {
				result := make([]byte, 0, len(parts))
				allValid := true
				for _, part := range parts {
					if num, err := strconv.Atoi(part); err == nil && num >= 0 && num <= 255 {
						if num >= 32 && num < 127 {
							result = append(result, byte(num))
						} else if num == 10 || num == 13 || num == 9 {
							result = append(result, ' ')
						}
					} else {
						allValid = false
						break
					}
				}
				if allValid && len(result) > 0 {
					return strings.TrimSpace(string(result))
				}
			}
		}
		return strings.TrimSpace(v)
	default:
		// 对于其他类型，先转换为字符串，然后检查是否需要处理
		str := fmt.Sprintf("%v", value)
		// 检查是否是字节数组格式
		if strings.HasPrefix(str, "[") && len(str) > 2 {
			trimmed := strings.TrimPrefix(strings.TrimSuffix(str, "]"), "[")
			parts := strings.Fields(trimmed)
			if len(parts) > 0 {
				result := make([]byte, 0, len(parts))
				allValid := true
				for _, part := range parts {
					if num, err := strconv.Atoi(part); err == nil && num >= 0 && num <= 255 {
						if num >= 32 && num < 127 {
							result = append(result, byte(num))
						} else if num == 10 || num == 13 || num == 9 {
							result = append(result, ' ')
						}
					} else {
						allValid = false
						break
					}
				}
				if allValid && len(result) > 0 {
					return strings.TrimSpace(string(result))
				}
			}
		}
		return str
	}
}

type snmpConfig struct {
	version       string
	community     string
	port          uint16
	username      string
	securityLevel gosnmp.SnmpV3MsgFlags
	authProtocol  gosnmp.SnmpV3AuthProtocol
	privProtocol  gosnmp.SnmpV3PrivProtocol
	authKey       string
	privKey       string
}

func resolveSNMPConfig(
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
) snmpConfig {
	config := snmpConfig{
		version:       defaultSnmpVersion,
		community:     "",
		port:          uint16(defaultSnmpPort),
		securityLevel: gosnmp.NoAuthNoPriv,
		authProtocol:  gosnmp.MD5,
		privProtocol:  gosnmp.DES,
	}

	if snmpVersion != nil && strings.TrimSpace(*snmpVersion) != "" {
		config.version = sanitizeSnmpVersion(*snmpVersion)
	}
	if snmpCommunity != nil {
		config.community = strings.TrimSpace(*snmpCommunity)
	}
	if snmpPort != nil && *snmpPort > 0 {
		config.port = uint16(*snmpPort)
	}

	snmpCfg := extractSNMPConfig(tags)
	if value, ok := snmpCfg["version"].(string); ok && strings.TrimSpace(value) != "" {
		config.version = sanitizeSnmpVersion(value)
	}
	if value, ok := snmpCfg["port"].(float64); ok && value > 0 {
		config.port = uint16(value)
	}

	if v2, ok := snmpCfg["v2c_config"].(map[string]interface{}); ok {
		if community, ok := v2["community"].(string); ok && strings.TrimSpace(community) != "" {
			config.community = strings.TrimSpace(community)
		}
	}

	if v3, ok := snmpCfg["v3_config"].(map[string]interface{}); ok {
		if username, ok := v3["username"].(string); ok {
			config.username = strings.TrimSpace(username)
		}
		if level, ok := v3["security_level"].(string); ok {
			config.securityLevel = normalizeSecurityLevel(level)
		}
		if authProto, ok := v3["auth_protocol"].(string); ok {
			config.authProtocol = normalizeAuthProtocol(authProto)
		}
		if privProto, ok := v3["priv_protocol"].(string); ok {
			config.privProtocol = normalizePrivProtocol(privProto)
		}
		if authKey, ok := v3["auth_password"].(string); ok {
			config.authKey = strings.TrimSpace(authKey)
		}
		if config.authKey == "" {
			if authKey, ok := v3["auth_key"].(string); ok {
				config.authKey = strings.TrimSpace(authKey)
			}
		}
		if privKey, ok := v3["priv_password"].(string); ok {
			config.privKey = strings.TrimSpace(privKey)
		}
		if config.privKey == "" {
			if privKey, ok := v3["priv_key"].(string); ok {
				config.privKey = strings.TrimSpace(privKey)
			}
		}
	}

	return config
}

func extractSNMPConfig(tags interface{}) map[string]interface{} {
	parsed := parseTags(tags)
	if value, ok := parsed["snmp_config"].(map[string]interface{}); ok {
		return value
	}
	return map[string]interface{}{}
}

func parseTags(tags interface{}) map[string]interface{} {
	if tags == nil {
		return map[string]interface{}{}
	}

	switch value := tags.(type) {
	case map[string]interface{}:
		return value
	case []byte:
		return parseTagsJSON(value)
	case datatypes.JSON:
		return parseTagsJSON(value)
	case string:
		return parseTagsJSON([]byte(value))
	default:
		raw, err := json.Marshal(value)
		if err != nil {
			return map[string]interface{}{}
		}
		return parseTagsJSON(raw)
	}
}

func parseTagsJSON(raw []byte) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return map[string]interface{}{}
	}
	return parsed
}

func normalizeSecurityLevel(value string) gosnmp.SnmpV3MsgFlags {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(value, "_", ""), "-", ""))
	switch normalized {
	case "authnopriv":
		return gosnmp.AuthNoPriv
	case "authpriv":
		return gosnmp.AuthPriv
	default:
		return gosnmp.NoAuthNoPriv
	}
}

func normalizeAuthProtocol(value string) gosnmp.SnmpV3AuthProtocol {
	normalized := strings.ToUpper(strings.ReplaceAll(value, "-", ""))
	switch normalized {
	case "SHA", "SHA1":
		return gosnmp.SHA
	case "SHA224":
		return gosnmp.SHA224
	case "SHA256":
		return gosnmp.SHA256
	case "SHA384":
		return gosnmp.SHA384
	case "SHA512":
		return gosnmp.SHA512
	case "MD5":
		return gosnmp.MD5
	default:
		return gosnmp.MD5
	}
}

func normalizePrivProtocol(value string) gosnmp.SnmpV3PrivProtocol {
	normalized := strings.ToUpper(strings.ReplaceAll(value, "-", ""))
	switch normalized {
	case "AES", "AES128":
		return gosnmp.AES
	case "AES192":
		return gosnmp.AES192
	case "AES256":
		return gosnmp.AES256
	case "3DES":
		return gosnmp.DES
	case "DES":
		return gosnmp.DES
	default:
		return gosnmp.DES
	}
}

func strconvParseFloat(value string) (float64, error) {
	return strconv.ParseFloat(value, 64)
}
