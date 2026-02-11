package logs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/gosnmp/gosnmp"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultTrapListenTimeout = 3 * time.Second
	defaultTrapStoreTimeout  = 5 * time.Second
	maxTrapSummaryVars       = 6
)

const (
	oidSnmpTrapOID       = "1.3.6.1.6.3.1.1.4.1.0"
	oidSysUpTime         = "1.3.6.1.2.1.1.3.0"
	oidTrapCommunity     = "1.3.6.1.6.3.18.1.4.0"
	oidTrapEnterprise    = "1.3.6.1.6.3.18.1.5.0"
	oidTrapAgentAddress  = "1.3.6.1.6.3.18.1.3.0"
)

var trapLevelOverrides = map[string]string{
	"1.3.6.1.6.3.1.1.5.1": "info",
	"1.3.6.1.6.3.1.1.5.2": "info",
	"1.3.6.1.6.3.1.1.5.3": "warning",
	"1.3.6.1.6.3.1.1.5.4": "info",
	"1.3.6.1.6.3.1.1.5.5": "warning",
	"1.3.6.1.6.3.1.1.5.6": "info",
}

var trapFacilityOverrides = map[string]string{
	"1.3.6.1.6.3.1.1.5.3": "interface",
	"1.3.6.1.6.3.1.1.5.4": "interface",
	"1.3.6.1.6.3.1.1.5.5": "security",
	"1.3.6.1.6.3.1.1.5.1": "system",
	"1.3.6.1.6.3.1.1.5.2": "system",
}

type SNMPTrapListener struct {
	service      *Service
	logger       *zap.Logger
	addr         string
	enabled      bool
	listener     *gosnmp.TrapListener
	running      bool
	mu           sync.Mutex
	alertCreator TrapAlertCreator
}

// TrapAlertCreator 用于将 SNMP Trap 转换为告警的回调接口
type TrapAlertCreator interface {
	CreateTrapAlert(ctx context.Context, deviceID int, level string, facility string, message string, trapOID string, sourceIP string) error
}

type trapSnapshot struct {
	SourceIP   string
	TrapOID    string
	Enterprise string
	Version    string
	PDUType    string
	Variables  []trapVar
	ReceivedAt time.Time
}

type trapVar struct {
	OID   string `json:"oid"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

type trapPayload struct {
	SourceIP   string    `json:"source_ip"`
	TrapOID    string    `json:"trap_oid,omitempty"`
	Enterprise string    `json:"enterprise,omitempty"`
	Version    string    `json:"version"`
	PDUType    string    `json:"pdu_type"`
	Variables  []trapVar `json:"variables"`
	ReceivedAt time.Time `json:"received_at"`
}

func NewSNMPTrapListener(service *Service, logger *zap.Logger, addr string, enabled bool) *SNMPTrapListener {
	return &SNMPTrapListener{
		service: service,
		logger:  logger,
		addr:    strings.TrimSpace(addr),
		enabled: enabled,
	}
}

// SetAlertCreator 设置告警创建回调
func (l *SNMPTrapListener) SetAlertCreator(creator TrapAlertCreator) {
	if l != nil {
		l.alertCreator = creator
	}
}

func (l *SNMPTrapListener) Start() error {
	if l == nil || !l.enabled {
		return nil
	}
	if l.service == nil || l.service.db == nil {
		return fmt.Errorf("log service not configured")
	}
	if strings.TrimSpace(l.addr) == "" {
		return fmt.Errorf("snmp trap listen address is empty")
	}

	l.mu.Lock()
	if l.running {
		l.mu.Unlock()
		return nil
	}
	l.mu.Unlock()

	listener := gosnmp.NewTrapListener()
	listener.OnNewTrap = l.handleTrap

	errCh := make(chan error, 1)
	go func() {
		errCh <- listener.Listen(l.addr)
	}()

	select {
	case <-listener.Listening():
		l.mu.Lock()
		l.listener = listener
		l.running = true
		l.mu.Unlock()
		if l.logger != nil {
			l.logger.Info("SNMP Trap监听已启动", zap.String("addr", l.addr))
		}
		return nil
	case err := <-errCh:
		return err
	case <-time.After(defaultTrapListenTimeout):
		l.mu.Lock()
		l.listener = listener
		l.running = true
		l.mu.Unlock()
		if l.logger != nil {
			l.logger.Info("SNMP Trap监听启动超时，继续等待", zap.String("addr", l.addr))
		}
		return nil
	}
}

func (l *SNMPTrapListener) Stop(ctx context.Context) error {
	if l == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	l.mu.Lock()
	listener := l.listener
	running := l.running
	l.listener = nil
	l.running = false
	l.mu.Unlock()

	if !running || listener == nil {
		return nil
	}

	done := make(chan struct{})
	go func() {
		listener.Close()
		close(done)
	}()

	select {
	case <-done:
		if l.logger != nil {
			l.logger.Info("SNMP Trap监听已停止")
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (l *SNMPTrapListener) handleTrap(packet *gosnmp.SnmpPacket, addr *net.UDPAddr) {
	snapshot := buildTrapSnapshot(packet, addr)
	if snapshot.SourceIP == "" || snapshot.ReceivedAt.IsZero() {
		return
	}

	go l.persistTrap(snapshot)
}

func (l *SNMPTrapListener) persistTrap(snapshot trapSnapshot) {
	if l == nil || l.service == nil || l.service.db == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTrapStoreTimeout)
	defer cancel()

	deviceID, err := l.findDeviceIDByIP(ctx, snapshot.SourceIP)
	if err != nil {
		if l.logger != nil && errors.Is(err, gorm.ErrRecordNotFound) {
			l.logger.Warn("SNMP Trap来源设备未匹配", zap.String("source_ip", snapshot.SourceIP))
		} else if l.logger != nil {
			l.logger.Error("SNMP Trap查询设备失败", zap.Error(err))
		}
		return
	}

	message, level, facility, raw := buildTrapLog(snapshot)
	sourceIP := snapshot.SourceIP
	entry := logEntry{
		DeviceID:     deviceID,
		Level:        level,
		Facility:     facility,
		Source:       "snmp_trap",
		Message:      message,
		RawMessage:   raw,
		SourceIP:     &sourceIP,
		LogTimestamp: snapshot.ReceivedAt,
		CollectedAt:  snapshot.ReceivedAt,
	}

	if _, err := l.service.storeLogEntries(ctx, []logEntry{entry}); err != nil && l.logger != nil {
		l.logger.Error("SNMP Trap写入日志失败", zap.Error(err))
	}

	// 对 warning/critical/error 级别的 Trap 自动创建告警
	if l.alertCreator != nil && (level == "warning" || level == "critical" || level == "error") {
		alertCtx, alertCancel := context.WithTimeout(context.Background(), defaultTrapStoreTimeout)
		defer alertCancel()
		if alertErr := l.alertCreator.CreateTrapAlert(alertCtx, deviceID, level, facility, message, snapshot.TrapOID, snapshot.SourceIP); alertErr != nil {
			if l.logger != nil {
				l.logger.Warn("SNMP Trap创建告警失败", zap.Error(alertErr), zap.Int("device_id", deviceID))
			}
		} else if l.logger != nil {
			l.logger.Info("SNMP Trap告警已创建",
				zap.Int("device_id", deviceID),
				zap.String("level", level),
				zap.String("trap_oid", snapshot.TrapOID))
		}
	}
}

func (l *SNMPTrapListener) findDeviceIDByIP(ctx context.Context, ip string) (int, error) {
	type row struct {
		ID int `gorm:"column:id"`
	}

	var item row
	err := l.service.db.WithContext(ctx).
		Table("devices").
		Select("id").
		Where("ip_address = ?", strings.TrimSpace(ip)).
		Take(&item).Error
	if err != nil {
		return 0, err
	}
	if item.ID <= 0 {
		return 0, gorm.ErrRecordNotFound
	}
	return item.ID, nil
}

func buildTrapSnapshot(packet *gosnmp.SnmpPacket, addr *net.UDPAddr) trapSnapshot {
	snapshot := trapSnapshot{
		ReceivedAt: time.Now().UTC(),
	}
	if addr != nil {
		snapshot.SourceIP = addr.IP.String()
	}
	if packet == nil {
		return snapshot
	}

	snapshot.Enterprise = strings.TrimSpace(packet.Enterprise)
	snapshot.Version = fmt.Sprintf("%v", packet.Version)
	snapshot.PDUType = fmt.Sprintf("%v", packet.PDUType)
	snapshot.TrapOID = extractTrapOID(packet)
	snapshot.Variables = buildTrapVars(packet.Variables)
	return snapshot
}

func extractTrapOID(packet *gosnmp.SnmpPacket) string {
	if packet == nil {
		return ""
	}
	for _, variable := range packet.Variables {
		if variable.Name != oidSnmpTrapOID {
			continue
		}
		return normalizeTrapValue(variable.Value)
	}
	enterprise := strings.TrimSpace(packet.Enterprise)
	if enterprise != "" {
		if packet.PDUType == gosnmp.Trap {
			return fmt.Sprintf("%s (generic=%d specific=%d)", enterprise, packet.GenericTrap, packet.SpecificTrap)
		}
		return enterprise
	}
	return ""
}

func buildTrapVars(vars []gosnmp.SnmpPDU) []trapVar {
	result := make([]trapVar, 0, len(vars))
	for _, variable := range vars {
		value := normalizeTrapValue(variable.Value)
		if isSensitiveTrapOID(variable.Name) {
			value = "***"
		}
		result = append(result, trapVar{
			OID:   variable.Name,
			Type:  fmt.Sprintf("%v", variable.Type),
			Value: value,
		})
	}
	return result
}

func buildTrapLog(snapshot trapSnapshot) (string, string, string, string) {
	message := buildTrapMessage(snapshot)
	level := "info"
	facility := "snmp"
	if snapshot.TrapOID != "" {
		if value, ok := trapLevelOverrides[snapshot.TrapOID]; ok {
			level = value
		}
		if value, ok := trapFacilityOverrides[snapshot.TrapOID]; ok {
			facility = value
		}
	}
	if level == "info" {
		level = detectLogLevel(message)
	}
	if facility == "snmp" {
		if detected := detectLogFacility(message); detected != "system" {
			facility = detected
		}
	}

	raw := buildTrapRaw(snapshot)
	return message, level, facility, raw
}

func buildTrapMessage(snapshot trapSnapshot) string {
	builder := strings.Builder{}
	builder.WriteString("SNMP Trap")
	if snapshot.TrapOID != "" {
		builder.WriteString(" ")
		builder.WriteString(snapshot.TrapOID)
	}

	summary := buildTrapSummary(snapshot)
	if summary != "" {
		builder.WriteString(" | ")
		builder.WriteString(summary)
	}

	return builder.String()
}

func buildTrapSummary(snapshot trapSnapshot) string {
	if len(snapshot.Variables) == 0 {
		return ""
	}

	ignored := map[string]struct{}{
		oidSnmpTrapOID:    {},
		oidSysUpTime:      {},
		oidTrapCommunity:  {},
		oidTrapEnterprise: {},
		oidTrapAgentAddress: {},
	}

	parts := make([]string, 0, maxTrapSummaryVars)
	for _, variable := range snapshot.Variables {
		if _, ok := ignored[variable.OID]; ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%s", variable.OID, variable.Value))
		if len(parts) >= maxTrapSummaryVars {
			break
		}
	}
	return strings.Join(parts, "; ")
}

func buildTrapRaw(snapshot trapSnapshot) string {
	payload := trapPayload{
		SourceIP:   snapshot.SourceIP,
		TrapOID:    snapshot.TrapOID,
		Enterprise: snapshot.Enterprise,
		Version:    snapshot.Version,
		PDUType:    snapshot.PDUType,
		Variables:  snapshot.Variables,
		ReceivedAt: snapshot.ReceivedAt,
	}
	if data, err := json.Marshal(payload); err == nil {
		return string(data)
	}
	return ""
}

func normalizeTrapValue(value interface{}) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []byte:
		if isPrintableASCII(v) {
			return strings.TrimSpace(string(v))
		}
		return fmt.Sprintf("0x%x", v)
	case fmt.Stringer:
		return v.String()
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
}

func isPrintableASCII(value []byte) bool {
	if len(value) == 0 {
		return false
	}
	for _, b := range value {
		if b < 32 || b > 126 {
			return false
		}
	}
	return true
}

func isSensitiveTrapOID(oid string) bool {
	switch oid {
	case oidTrapCommunity:
		return true
	default:
		return false
	}
}
