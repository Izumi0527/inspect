package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

const (
	MaxHTTPCollectTimeout   = 5 * time.Second
	MaxHTTPResponseBodySize = 64 * 1024
)

var (
	ErrForbiddenTargetIP = errors.New("目标 IP 属于禁止采集的本地/链路本地/保留网段")
	ErrInvalidTargetIP   = errors.New("目标设备 IP 非法，必须为合法 IPv4/IPv6 字面量（禁止 DNS 解析）")
)

var forbiddenCIDRs = func() []*net.IPNet {
	cidrs := []string{
		"127.0.0.0/8",
		"::1/128",
		"169.254.0.0/16",
		"fe80::/10",
		"0.0.0.0/8",
	}
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, raw := range cidrs {
		_, ipNet, err := net.ParseCIDR(raw)
		if err == nil && ipNet != nil {
			nets = append(nets, ipNet)
		}
	}
	return nets
}()

// ValidateCollectTargetIP 校验设备 IP 是否为合法字面量 IP 且不在 SSRF 禁用网段内。
// 严格禁止任何域名/DNS 解析，防止 DNS Rebinding 与内网元数据探测。
func ValidateCollectTargetIP(ipStr string) (net.IP, error) {
	trimmed := strings.TrimSpace(ipStr)
	ip := net.ParseIP(trimmed)
	if ip == nil {
		return nil, ErrInvalidTargetIP
	}
	if err := validateTargetNetIP(ip); err != nil {
		return nil, err
	}
	return ip, nil
}

func validateTargetNetIP(ip net.IP) error {
	if ip == nil || ip.IsUnspecified() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return ErrForbiddenTargetIP
	}
	for _, cidr := range forbiddenCIDRs {
		if cidr.Contains(ip) {
			return ErrForbiddenTargetIP
		}
	}
	return nil
}

// NewSafeHTTPClient 构造 SSRF 硬化 HTTP 客户端：
// 1) 自定义 DialContext 仅直连校验后的 targetIP，彻底绕过 DNS 解析；
// 2) CheckRedirect 恒返回 http.ErrUseLastResponse 禁止任何 3xx 跳转；
// 3) 强制超时 <= 5s。
func NewSafeHTTPClient(targetIP net.IP, timeout time.Duration) (*http.Client, error) {
	if err := validateTargetNetIP(targetIP); err != nil {
		return nil, err
	}
	if timeout <= 0 || timeout > MaxHTTPCollectTimeout {
		timeout = MaxHTTPCollectTimeout
	}

	dialer := &net.Dialer{
		Timeout: timeout,
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			if err := validateTargetNetIP(targetIP); err != nil {
				return nil, err
			}
			_, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid target port: %w", err)
			}
			pinnedAddr := net.JoinHostPort(targetIP.String(), port)
			return dialer.DialContext(ctx, network, pinnedAddr)
		},
		DisableKeepAlives: true,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, nil
}

// CustomCollectResult 记录单次自定义指标采集与预处理追踪结果。
type CustomCollectResult struct {
	RawValue    string                `json:"raw_value"`
	Steps       []PreprocessStepTrace `json:"steps"`
	FinalValue  string                `json:"final_value"`
	DisplayText string                `json:"display_text"`
	NumericVal  *float64              `json:"numeric_value,omitempty"`
	DurationMS  int64                 `json:"duration_ms"`
}

// CustomCollector 执行受限自定义监控项采集（snmp_oid / icmp / tcp_port / http）。
type CustomCollector struct {
	ProbeService *devices.ProbeService
	HTTPClientFn func(targetIP net.IP, timeout time.Duration) (*http.Client, error)
	SNMPGetFn    func(ctx context.Context, creds devices.SNMPTargetCredentials, oid string) (string, error)
}

func NewCustomCollector(probe *devices.ProbeService) *CustomCollector {
	return &CustomCollector{
		ProbeService: probe,
		HTTPClientFn: NewSafeHTTPClient,
		SNMPGetFn:    defaultSNMPGet,
	}
}

// CollectItem 对指定设备执行单次自定义采集与预处理。
func (c *CustomCollector) CollectItem(ctx context.Context, device devices.Device, item MonitorItem, prev *PrevSample) (CustomCollectResult, error) {
	if c == nil {
		c = NewCustomCollector(nil)
	}
	start := time.Now()

	var raw string
	var err error
	switch strings.ToLower(strings.TrimSpace(item.Protocol)) {
	case "http":
		raw, err = c.collectHTTP(ctx, device, item)
	case "tcp_port":
		raw, err = c.collectTCPPort(ctx, device, item)
	case "icmp":
		raw, err = c.collectICMP(ctx, device)
	case "snmp_oid":
		raw, err = c.collectSNMPOID(ctx, device, item)
	default:
		return CustomCollectResult{}, fmt.Errorf("unsupported custom collect protocol: %s", item.Protocol)
	}
	if err != nil {
		return CustomCollectResult{DurationMS: time.Since(start).Milliseconds()}, err
	}

	var steps []PreprocessStep
	if len(item.PreprocessingJSON) > 0 {
		if err := json.Unmarshal(item.PreprocessingJSON, &steps); err != nil {
			return CustomCollectResult{}, fmt.Errorf("invalid preprocessing_json: %w", err)
		}
	}
	var valueMap map[string]string
	if len(item.ValueMapJSON) > 0 {
		_ = json.Unmarshal(item.ValueMapJSON, &valueMap)
	}

	trace, err := ApplyPreprocessing(raw, prev, steps, valueMap)
	if err != nil {
		return CustomCollectResult{
			RawValue:   raw,
			Steps:      trace.Steps,
			DurationMS: time.Since(start).Milliseconds(),
		}, err
	}

	return CustomCollectResult{
		RawValue:    trace.RawValue,
		Steps:       trace.Steps,
		FinalValue:  trace.FinalValue,
		DisplayText: trace.DisplayText,
		NumericVal:  trace.NumericValue,
		DurationMS:  time.Since(start).Milliseconds(),
	}, nil
}

func (c *CustomCollector) collectHTTP(ctx context.Context, device devices.Device, item MonitorItem) (string, error) {
	if err := ValidateHTTPItemFields(item.HTTPScheme, item.HTTPPort, item.HTTPPath); err != nil {
		return "", err
	}
	ip, err := ValidateCollectTargetIP(device.IPAddress)
	if err != nil {
		return "", err
	}
	clientFn := c.HTTPClientFn
	if clientFn == nil {
		clientFn = NewSafeHTTPClient
	}
	client, err := clientFn(ip, MaxHTTPCollectTimeout)
	if err != nil {
		return "", err
	}

	pathPart, queryPart, _ := strings.Cut(item.HTTPPath, "?")
	targetURL := url.URL{
		Scheme:   strings.ToLower(strings.TrimSpace(item.HTTPScheme)),
		Host:     net.JoinHostPort(ip.String(), strconv.Itoa(item.HTTPPort)),
		Path:     pathPart,
		RawQuery: queryPart,
	}

	reqCtx, cancel := context.WithTimeout(ctx, MaxHTTPCollectTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, targetURL.String(), nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	// 严格拦截 3xx 重定向：ErrUseLastResponse 会让 client.Do 返回 3xx 响应，此处直接拒绝重定向结果。
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return "", fmt.Errorf("HTTP redirect blocked (status=%d)", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, MaxHTTPResponseBodySize))
	if err != nil {
		return "", err
	}
	return string(bodyBytes), nil
}

func (c *CustomCollector) collectTCPPort(ctx context.Context, device devices.Device, item MonitorItem) (string, error) {
	ip, err := ValidateCollectTargetIP(device.IPAddress)
	if err != nil {
		return "", err
	}
	port, err := strconv.Atoi(strings.TrimSpace(item.TargetExpr))
	if err != nil || port < 1 || port > 65535 {
		return "", fmt.Errorf("invalid tcp port: %q", item.TargetExpr)
	}
	dialer := &net.Dialer{Timeout: MaxHTTPCollectTimeout}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(ip.String(), strconv.Itoa(port)))
	if err != nil {
		return "0", nil
	}
	_ = conn.Close()
	return "1", nil
}

func (c *CustomCollector) collectICMP(ctx context.Context, device devices.Device) (string, error) {
	ip, err := ValidateCollectTargetIP(device.IPAddress)
	if err != nil {
		return "", err
	}
	// (*devices.ProbeService).ProbeICMP 原生支持 nil 接收者，严禁在此临时 NewProbeService 泄漏后台 Ticker 协程。
	reachable, rtt, errMsg := c.ProbeService.ProbeICMP(ctx, ip.String())
	if !reachable {
		if errMsg != nil {
			return "", fmt.Errorf("icmp unreachable: %s", *errMsg)
		}
		return "", fmt.Errorf("icmp unreachable")
	}
	if rtt == nil {
		return "0", nil
	}
	return formatFloatClean(*rtt), nil
}

func (c *CustomCollector) collectSNMPOID(ctx context.Context, device devices.Device, item MonitorItem) (string, error) {
	if err := ValidateSNMPOID(item.TargetExpr); err != nil {
		return "", err
	}
	if _, err := ValidateCollectTargetIP(device.IPAddress); err != nil {
		return "", err
	}
	creds := device.BuildSNMPTargetCredentials()
	fn := c.SNMPGetFn
	if fn == nil {
		fn = defaultSNMPGet
	}
	return fn(ctx, creds, strings.TrimSpace(item.TargetExpr))
}

func defaultSNMPGet(ctx context.Context, creds devices.SNMPTargetCredentials, oid string) (string, error) {
	client, err := creds.NewGoSNMPClient(MaxHTTPCollectTimeout)
	if err != nil {
		return "", err
	}
	client.Context = ctx
	if err := client.Connect(); err != nil {
		return "", err
	}
	defer client.Conn.Close()

	pkt, err := client.Get([]string{oid})
	if err != nil {
		return "", err
	}
	if pkt == nil || pkt.Error != gosnmp.NoError || len(pkt.Variables) == 0 {
		return "", fmt.Errorf("SNMP get returned no variables")
	}
	v := pkt.Variables[0]
	switch v.Type {
	case gosnmp.NoSuchObject, gosnmp.NoSuchInstance, gosnmp.EndOfMibView:
		return "", fmt.Errorf("%s: target device does not expose OID %s", CollectionErrorUnsupportedOID, oid)
	}
	switch val := v.Value.(type) {
	case []byte:
		return strings.TrimSpace(string(val)), nil
	default:
		return fmt.Sprintf("%v", gosnmp.ToBigInt(v.Value)), nil
	}
}

// TestCustomMonitorItem 校验目标设备存在性与监控项合法性后，执行单次受限采集与预处理追踪。
func (w *MetricsWriter) TestCustomMonitorItem(ctx context.Context, deviceID int, input MonitorItemInput, prev *PrevSample) (CustomCollectResult, error) {
	if w == nil || w.db == nil {
		return CustomCollectResult{}, fmt.Errorf("database not initialized")
	}
	if err := validateMonitorItemInput(&input); err != nil {
		return CustomCollectResult{}, err
	}
	var dev devices.Device
	if err := w.db.WithContext(ctx).Table("devices").Where("id = ?", deviceID).Take(&dev).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CustomCollectResult{}, ErrDeviceNotFound
		}
		return CustomCollectResult{}, err
	}
	item := MonitorItem{
		ItemKey:           input.ItemKey,
		Name:              input.Name,
		ApplicationTag:    strings.TrimSpace(input.ApplicationTag),
		Protocol:          input.Protocol,
		TargetExpr:        strings.TrimSpace(input.TargetExpr),
		HTTPScheme:        strings.ToLower(strings.TrimSpace(input.HTTPScheme)),
		HTTPPort:          input.HTTPPort,
		HTTPPath:          input.HTTPPath,
		ValueType:         input.ValueType,
		Unit:              strings.TrimSpace(input.Unit),
		IntervalSec:       input.IntervalSec,
		PreprocessingJSON: mustJSONBytes(input.Preprocessing),
		ValueMapJSON:      mustJSONBytes(input.ValueMap),
		Enabled:           true,
	}
	collector := NewCustomCollector(nil)
	return collector.CollectItem(ctx, dev, item, prev)
}

// CustomItemDue 判断自定义采集项在本轮调度是否已到达采集周期。
func CustomItemDue(item MonitorItem, lastCollectedAt *time.Time, now time.Time) bool {
	if !item.Enabled || strings.EqualFold(strings.TrimSpace(item.Protocol), "builtin") {
		return false
	}
	if lastCollectedAt == nil || lastCollectedAt.IsZero() {
		return true
	}
	interval := time.Duration(item.IntervalSec) * time.Second
	if interval < time.Duration(MinMonitorIntervalSec)*time.Second {
		interval = time.Duration(MinMonitorIntervalSec) * time.Second
	}
	return now.Sub(*lastCollectedAt) >= interval
}

// ApplyLLDInterfaceFilter 根据设备生效的 interface 类 LLD 规则，更新 device_interfaces 的 lld_monitored 与 lld_lost_since。
func ApplyLLDInterfaceFilter(ctx context.Context, db *gorm.DB, deviceID int, rules []MonitorLLDRule, now time.Time) error {
	if db == nil || deviceID <= 0 || len(rules) == 0 {
		return nil
	}
	var matchers []*LLDMatcher
	for _, rule := range rules {
		if !rule.Enabled || !strings.EqualFold(strings.TrimSpace(rule.EntityType), "interface") {
			continue
		}
		m, err := CompileLLDMatcher(rule)
		if err != nil {
			continue
		}
		matchers = append(matchers, m)
	}
	if len(matchers) == 0 {
		return nil
	}

	var rows []struct {
		ID           int64      `gorm:"column:id"`
		Name         string     `gorm:"column:name"`
		LLDMonitored bool       `gorm:"column:lld_monitored"`
		LLDLostSince *time.Time `gorm:"column:lld_lost_since"`
	}
	if err := db.WithContext(ctx).Table("device_interfaces").
		Select("id, name, lld_monitored, lld_lost_since").
		Where("device_id = ?", deviceID).
		Find(&rows).Error; err != nil {
		return err
	}

	for _, row := range rows {
		monitored := true
		for _, m := range matchers {
			if !m.Match(row.Name) {
				monitored = false
				break
			}
		}
		if monitored == row.LLDMonitored {
			continue
		}
		updates := map[string]interface{}{
			"lld_monitored": monitored,
			"updated_at":    now,
		}
		if !monitored {
			if row.LLDLostSince == nil {
				updates["lld_lost_since"] = now
			}
		} else {
			updates["lld_lost_since"] = nil
		}
		if err := db.WithContext(ctx).Table("device_interfaces").Where("id = ?", row.ID).Updates(updates).Error; err != nil {
			return err
		}
	}
	return nil
}
