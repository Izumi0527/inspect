package logs

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

// ErrSyslogDeviceNotFound 表示源 IP 未匹配到设备（按约定：丢弃并计数，不落库）。
var ErrSyslogDeviceNotFound = errors.New("syslog device not found")

// SyslogDeviceResolver 用于根据源 IP 解析出设备 ID。
type SyslogDeviceResolver interface {
	ResolveDeviceIDByIP(ctx context.Context, ip string) (int, error)
}

// SyslogStoreEntry 表示一条待写入的 Syslog 日志记录（由接收器生成，写入器落库）。
type SyslogStoreEntry struct {
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

// SyslogLogWriter 用于将日志写入持久化层（通常为 device_logs）。
type SyslogLogWriter interface {
	WriteSyslogEntries(ctx context.Context, entries []SyslogStoreEntry) (int, error)
}

// SyslogAlertCreator 用于将 Syslog 日志转换为告警的回调接口。
type SyslogAlertCreator interface {
	CreateSyslogAlert(ctx context.Context, input SyslogAlertInput) (SyslogAlertOutcome, error)
}

type noopSyslogAlertCreator struct{}

func (noopSyslogAlertCreator) CreateSyslogAlert(context.Context, SyslogAlertInput) (SyslogAlertOutcome, error) {
	return SyslogAlertOutcomeNone, nil
}

// syslogAlertCreatorBox 用于包装接口值，保证 atomic.Value 存储的具体类型始终一致。
// 否则在 SetAlertCreator 时从 noop 实现切换到真实实现会触发 “store of inconsistently typed value” panic。
type syslogAlertCreatorBox struct {
	creator SyslogAlertCreator
}

type SyslogAlertInput struct {
	DeviceID        int
	Level           string
	Facility        string
	Process         string
	Message         string
	SourceIP        string
	MaxNewPerMinute int
}

type SyslogAlertOutcome string

const (
	SyslogAlertOutcomeNone        SyslogAlertOutcome = "none"
	SyslogAlertOutcomeCreated     SyslogAlertOutcome = "created"
	SyslogAlertOutcomeUpdated     SyslogAlertOutcome = "updated"
	SyslogAlertOutcomeRateLimited SyslogAlertOutcome = "rate_limited"
)

// SyslogReceiver 提供 UDP/TCP Syslog 接收能力，并将日志落库到 device_logs。
type SyslogReceiver struct {
	resolver SyslogDeviceResolver
	writer   SyslogLogWriter
	logger   *zap.Logger

	alertCreator atomic.Value // syslogAlertCreatorBox

	mu         sync.Mutex
	running    bool
	config     SyslogConfig
	cancel     context.CancelFunc
	udpConn    *net.UDPConn
	tcpLn      net.Listener
	activeConn map[net.Conn]struct{}
	wg         sync.WaitGroup

	received          atomic.Uint64
	stored            atomic.Uint64
	droppedUnmatched  atomic.Uint64
	droppedParse      atomic.Uint64
	alertsCreated     atomic.Uint64
	alertsUpdated     atomic.Uint64
	alertsRateLimited atomic.Uint64

	lastError atomic.Value // string
	updatedAt atomic.Value // time.Time
}

func NewSyslogReceiver(service *Service, logger *zap.Logger) *SyslogReceiver {
	adapter := syslogServiceAdapter{service: service}
	return NewSyslogReceiverWithDeps(adapter, adapter, logger)
}

// NewSyslogReceiverWithDeps 允许在测试中注入 resolver/writer，以避免依赖真实数据库。
func NewSyslogReceiverWithDeps(resolver SyslogDeviceResolver, writer SyslogLogWriter, logger *zap.Logger) *SyslogReceiver {
	r := &SyslogReceiver{
		resolver:   resolver,
		writer:     writer,
		logger:     logger,
		activeConn: map[net.Conn]struct{}{},
		config:     defaultSyslogConfig(),
	}
	r.lastError.Store("")
	r.updatedAt.Store(time.Now().UTC())
	r.alertCreator.Store(syslogAlertCreatorBox{creator: noopSyslogAlertCreator{}})
	return r
}

func (r *SyslogReceiver) SetAlertCreator(creator SyslogAlertCreator) {
	if r == nil {
		return
	}
	if creator == nil {
		r.alertCreator.Store(syslogAlertCreatorBox{creator: noopSyslogAlertCreator{}})
		return
	}
	r.alertCreator.Store(syslogAlertCreatorBox{creator: creator})
}

func (r *SyslogReceiver) Status() SyslogStatus {
	if r == nil {
		return SyslogStatus{}
	}

	r.mu.Lock()
	running := r.running
	cfg := r.config
	r.mu.Unlock()

	lastErr, _ := r.lastError.Load().(string)
	updated, _ := r.updatedAt.Load().(time.Time)

	return SyslogStatus{
		Running:           running,
		Config:            cfg,
		Received:          r.received.Load(),
		Stored:            r.stored.Load(),
		DroppedUnmatched:  r.droppedUnmatched.Load(),
		DroppedParse:      r.droppedParse.Load(),
		AlertsCreated:     r.alertsCreated.Load(),
		AlertsUpdated:     r.alertsUpdated.Load(),
		AlertsRateLimited: r.alertsRateLimited.Load(),
		LastError:         strings.TrimSpace(lastErr),
		UpdatedAt:         updated,
	}
}

func (r *SyslogReceiver) Apply(ctx context.Context, cfg SyslogConfig) (SyslogStatus, error) {
	if r == nil {
		return SyslogStatus{}, fmt.Errorf("syslog receiver not initialized")
	}
	cfg = normalizeSyslogConfig(cfg)

	r.mu.Lock()
	oldCfg := r.config
	wasRunning := r.running
	r.mu.Unlock()

	// 停用：直接停止
	if !cfg.Enabled {
		_ = r.Stop(ctx)
		r.mu.Lock()
		r.config = cfg
		r.running = false
		r.mu.Unlock()
		r.touch()
		return r.Status(), nil
	}

	// 启用：若当前在运行则重启
	if wasRunning {
		_ = r.Stop(ctx)
	}

	if err := r.startWithConfig(cfg); err != nil {
		r.setError(err)
		// 失败回滚：尽力恢复旧配置
		if wasRunning && oldCfg.Enabled {
			_ = r.startWithConfig(oldCfg)
		}
		return r.Status(), err
	}

	return r.Status(), nil
}

func (r *SyslogReceiver) Stop(ctx context.Context) error {
	if r == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	r.mu.Lock()
	cancel := r.cancel
	udpConn := r.udpConn
	tcpLn := r.tcpLn
	conns := make([]net.Conn, 0, len(r.activeConn))
	for conn := range r.activeConn {
		conns = append(conns, conn)
	}
	r.cancel = nil
	r.udpConn = nil
	r.tcpLn = nil
	r.running = false
	r.activeConn = map[net.Conn]struct{}{}
	r.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if udpConn != nil {
		_ = udpConn.Close()
	}
	if tcpLn != nil {
		_ = tcpLn.Close()
	}
	for _, conn := range conns {
		_ = conn.Close()
	}

	done := make(chan struct{})
	go func() {
		r.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		r.touch()
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *SyslogReceiver) startWithConfig(cfg SyslogConfig) error {
	if r.resolver == nil || r.writer == nil {
		return fmt.Errorf("syslog receiver deps not configured")
	}

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	runCtx, cancel := context.WithCancel(context.Background())

	var udpConn *net.UDPConn
	var tcpLn net.Listener

	if cfg.Protocol == "tcp" || cfg.Protocol == "both" {
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			cancel()
			return err
		}
		tcpLn = ln

		// 支持 port=0：让操作系统分配一个可用端口（用于测试与高级用法）。
		if cfg.Port == 0 {
			if ta, ok := ln.Addr().(*net.TCPAddr); ok && ta.Port > 0 {
				cfg.Port = ta.Port
				addr = net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
			}
		}
	}

	if cfg.Protocol == "udp" || cfg.Protocol == "both" {
		udpAddr, err := net.ResolveUDPAddr("udp", addr)
		if err != nil {
			if tcpLn != nil {
				_ = tcpLn.Close()
			}
			cancel()
			return err
		}
		conn, err := net.ListenUDP("udp", udpAddr)
		if err != nil {
			if tcpLn != nil {
				_ = tcpLn.Close()
			}
			cancel()
			return err
		}
		udpConn = conn

		if cfg.Port == 0 {
			if ua, ok := conn.LocalAddr().(*net.UDPAddr); ok && ua.Port > 0 {
				cfg.Port = ua.Port
				addr = net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
			}
		}
	}

	r.mu.Lock()
	// 防止外部并发 start
	if r.running {
		r.mu.Unlock()
		if udpConn != nil {
			_ = udpConn.Close()
		}
		if tcpLn != nil {
			_ = tcpLn.Close()
		}
		cancel()
		return nil
	}
	r.config = cfg
	r.cancel = cancel
	r.udpConn = udpConn
	r.tcpLn = tcpLn
	r.activeConn = map[net.Conn]struct{}{}
	r.running = true
	r.mu.Unlock()

	r.setError(nil)
	r.touch()

	if udpConn != nil {
		r.wg.Add(1)
		go r.udpLoop(runCtx, udpConn, cfg.MaxMessageBytes)
	}
	if tcpLn != nil {
		r.wg.Add(1)
		go r.tcpAcceptLoop(runCtx, tcpLn, cfg.MaxMessageBytes)
	}

	if r.logger != nil {
		r.logger.Info("Syslog接收器已启动",
			zap.String("protocol", cfg.Protocol),
			zap.String("addr", addr))
	}

	return nil
}

func (r *SyslogReceiver) udpLoop(ctx context.Context, conn *net.UDPConn, maxBytes int) {
	defer r.wg.Done()
	if conn == nil {
		return
	}

	if maxBytes <= 0 {
		maxBytes = 8192
	}
	buf := make([]byte, maxBytes)

	for {
		n, addr, err := conn.ReadFromUDP(buf)
		if err != nil {
			if ctx.Err() != nil || isNetClosedErr(err) {
				return
			}
			r.setError(err)
			continue
		}
		if n <= 0 {
			continue
		}

		remoteIP := ""
		if addr != nil && addr.IP != nil {
			remoteIP = addr.IP.String()
		}
		payload := strings.TrimSpace(string(buf[:n]))
		if payload == "" {
			continue
		}
		receivedAt := time.Now().UTC()

		// 一些实现可能带多行，逐行处理
		lines := strings.Split(payload, "\n")
		for _, line := range lines {
			text := strings.TrimSpace(strings.TrimRight(line, "\r"))
			if text == "" {
				continue
			}
			r.handleMessage(ctx, remoteIP, text, receivedAt)
		}
	}
}

func (r *SyslogReceiver) tcpAcceptLoop(ctx context.Context, ln net.Listener, maxBytes int) {
	defer r.wg.Done()
	if ln == nil {
		return
	}

	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil || isNetClosedErr(err) {
				return
			}
			r.setError(err)
			time.Sleep(100 * time.Millisecond)
			continue
		}

		r.mu.Lock()
		if r.activeConn != nil {
			r.activeConn[conn] = struct{}{}
		}
		r.mu.Unlock()

		r.wg.Add(1)
		go r.tcpConnLoop(ctx, conn, maxBytes)
	}
}

func (r *SyslogReceiver) tcpConnLoop(ctx context.Context, conn net.Conn, maxBytes int) {
	defer r.wg.Done()
	defer func() {
		if conn != nil {
			_ = conn.Close()
		}
		r.mu.Lock()
		if r.activeConn != nil {
			delete(r.activeConn, conn)
		}
		r.mu.Unlock()
	}()

	if conn == nil {
		return
	}
	if maxBytes <= 0 {
		maxBytes = 8192
	}

	remoteIP := extractRemoteIP(conn.RemoteAddr())
	reader := bufio.NewReaderSize(conn, 4096)

	for {
		if ctx.Err() != nil {
			return
		}
		msg, err := readSyslogFrame(reader, maxBytes)
		if err != nil {
			// EOF 时仍可能带有最后一条未以换行结束的消息（例如发送端写完后直接关闭连接）。
			if errors.Is(err, io.EOF) {
				text := strings.TrimSpace(msg)
				if text != "" {
					r.handleMessage(ctx, remoteIP, text, time.Now().UTC())
				}
				return
			}
			if isNetClosedErr(err) || ctx.Err() != nil {
				return
			}
			r.setError(err)
			return
		}
		text := strings.TrimSpace(msg)
		if text == "" {
			continue
		}
		r.handleMessage(ctx, remoteIP, text, time.Now().UTC())
	}
}

func readSyslogFrame(reader *bufio.Reader, maxBytes int) (string, error) {
	if reader == nil {
		return "", io.EOF
	}
	if maxBytes <= 0 {
		maxBytes = 8192
	}

	// RFC6587 octet-counting framing: "<len> <msg>"
	peek, _ := reader.Peek(32)
	if len(peek) > 0 && peek[0] >= '0' && peek[0] <= '9' {
		if space := bytes.IndexByte(peek, ' '); space > 0 {
			prefix := peek[:space]
			allDigits := true
			for _, b := range prefix {
				if b < '0' || b > '9' {
					allDigits = false
					break
				}
			}
			if allDigits {
				n, err := strconv.Atoi(string(prefix))
				if err == nil && n > 0 {
					_, _ = reader.Discard(space + 1)
					if n > maxBytes {
						_, _ = io.CopyN(io.Discard, reader, int64(n))
						return "", nil
					}
					buf := make([]byte, n)
					if _, err := io.ReadFull(reader, buf); err != nil {
						return "", err
					}
					return string(buf), nil
				}
			}
		}
	}

	// newline delimited
	line, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	if len(line) > maxBytes {
		return "", nil
	}
	return line, err
}

func (r *SyslogReceiver) handleMessage(ctx context.Context, remoteIP string, raw string, receivedAt time.Time) {
	r.received.Add(1)
	r.updatedAt.Store(time.Now().UTC())

	text := strings.TrimSpace(raw)
	if text == "" {
		r.droppedParse.Add(1)
		return
	}

	storeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	deviceID, err := r.resolver.ResolveDeviceIDByIP(storeCtx, remoteIP)
	if err != nil {
		if errors.Is(err, ErrSyslogDeviceNotFound) {
			r.droppedUnmatched.Add(1)
			return
		}
		r.setError(err)
		return
	}

	parsed := ParseSyslogMessage(text, receivedAt)

	entry := SyslogStoreEntry{
		DeviceID:     deviceID,
		Level:        parsed.Level,
		Facility:     parsed.Facility,
		Source:       "syslog",
		Message:      parsed.Message,
		RawMessage:   parsed.Raw,
		LogTimestamp: parsed.Timestamp,
		CollectedAt:  receivedAt,
	}
	if strings.TrimSpace(remoteIP) != "" {
		ip := strings.TrimSpace(remoteIP)
		entry.SourceIP = &ip
	}
	if strings.TrimSpace(parsed.Process) != "" {
		p := strings.TrimSpace(parsed.Process)
		entry.SourceProcess = &p
	}

	if _, err := r.writer.WriteSyslogEntries(storeCtx, []SyslogStoreEntry{entry}); err != nil {
		r.setError(err)
		return
	}
	r.stored.Add(1)

	r.maybeCreateAlert(storeCtx, deviceID, parsed, strings.TrimSpace(remoteIP))
}

func (r *SyslogReceiver) maybeCreateAlert(ctx context.Context, deviceID int, parsed SyslogParsedMessage, sourceIP string) {
	r.mu.Lock()
	cfg := r.config
	r.mu.Unlock()

	if !cfg.AlertsEnabled {
		return
	}

	level := normalizeLevel(parsed.Level)
	if level != "warning" && level != "error" && level != "critical" {
		return
	}

	box, ok := r.alertCreator.Load().(syslogAlertCreatorBox)
	if !ok || box.creator == nil {
		return
	}

	outcome, err := box.creator.CreateSyslogAlert(ctx, SyslogAlertInput{
		DeviceID:        deviceID,
		Level:           level,
		Facility:        normalizeFacility(parsed.Facility),
		Process:         strings.TrimSpace(parsed.Process),
		Message:         parsed.Message,
		SourceIP:        sourceIP,
		MaxNewPerMinute: cfg.AlertsMaxNewPerMinute,
	})
	if err != nil {
		r.setError(err)
		return
	}
	switch outcome {
	case SyslogAlertOutcomeCreated:
		r.alertsCreated.Add(1)
	case SyslogAlertOutcomeUpdated:
		r.alertsUpdated.Add(1)
	case SyslogAlertOutcomeRateLimited:
		r.alertsRateLimited.Add(1)
	default:
	}
}

func normalizeSyslogConfig(cfg SyslogConfig) SyslogConfig {
	out := cfg

	out.Protocol = strings.ToLower(strings.TrimSpace(out.Protocol))
	if out.Protocol != "udp" && out.Protocol != "tcp" && out.Protocol != "both" {
		out.Protocol = "both"
	}

	if strings.TrimSpace(out.Host) == "" {
		out.Host = "0.0.0.0"
	}
	// port=0 允许操作系统自动分配端口（主要用于测试）；小于 0 或非法值才回退默认端口。
	if out.Port < 0 || out.Port > 65535 {
		out.Port = 5514
	}
	if out.MaxMessageBytes <= 0 {
		out.MaxMessageBytes = 8192
	}
	if out.MaxMessageBytes < 256 {
		out.MaxMessageBytes = 256
	}
	if out.MaxMessageBytes > 1024*1024 {
		out.MaxMessageBytes = 1024 * 1024
	}

	if out.AlertsMaxNewPerMinute < 0 {
		out.AlertsMaxNewPerMinute = 0
	}

	return out
}

func defaultSyslogConfig() SyslogConfig {
	return SyslogConfig{
		Enabled:               false,
		Protocol:              "both",
		Host:                  "0.0.0.0",
		Port:                  5514,
		MaxMessageBytes:       8192,
		AlertsEnabled:         true,
		AlertsMaxNewPerMinute: 30,
	}
}

func (r *SyslogReceiver) setError(err error) {
	if r == nil {
		return
	}
	if err == nil {
		r.lastError.Store("")
		return
	}
	r.lastError.Store(err.Error())
	r.updatedAt.Store(time.Now().UTC())
	if r.logger != nil {
		r.logger.Warn("Syslog接收器错误", zap.Error(err))
	}
}

func (r *SyslogReceiver) touch() {
	if r == nil {
		return
	}
	r.updatedAt.Store(time.Now().UTC())
}

func extractRemoteIP(addr net.Addr) string {
	if addr == nil {
		return ""
	}
	host, _, err := net.SplitHostPort(addr.String())
	if err == nil && strings.TrimSpace(host) != "" {
		return strings.TrimSpace(host)
	}
	return strings.TrimSpace(addr.String())
}

func isNetClosedErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, net.ErrClosed) {
		return true
	}
	// Windows 下部分关闭错误不会匹配 net.ErrClosed，做一层保守判断。
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "use of closed network connection")
}

// syslogServiceAdapter 将 logs.Service 适配为 resolver/writer，便于接收器与数据库实现解耦。
type syslogServiceAdapter struct {
	service *Service
}

func (a syslogServiceAdapter) ResolveDeviceIDByIP(ctx context.Context, ip string) (int, error) {
	if a.service == nil || a.service.db == nil {
		return 0, fmt.Errorf("log service not configured")
	}

	type row struct {
		ID int `gorm:"column:id"`
	}

	value := strings.TrimSpace(ip)
	if value == "" {
		return 0, ErrSyslogDeviceNotFound
	}

	var item row
	err := a.service.db.WithContext(ctx).
		Table("devices").
		Select("id").
		Where("ip_address = ?", value).
		Take(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, ErrSyslogDeviceNotFound
		}
		return 0, err
	}
	if item.ID <= 0 {
		return 0, ErrSyslogDeviceNotFound
	}
	return item.ID, nil
}

func (a syslogServiceAdapter) WriteSyslogEntries(ctx context.Context, entries []SyslogStoreEntry) (int, error) {
	if a.service == nil || a.service.db == nil {
		return 0, fmt.Errorf("log service not configured")
	}
	if len(entries) == 0 {
		return 0, nil
	}

	records := make([]logEntry, 0, len(entries))
	for _, e := range entries {
		records = append(records, logEntry{
			DeviceID:      e.DeviceID,
			Level:         e.Level,
			Facility:      e.Facility,
			Source:        e.Source,
			Message:       e.Message,
			RawMessage:    e.RawMessage,
			SourceIP:      e.SourceIP,
			SourceProcess: e.SourceProcess,
			LogTimestamp:  e.LogTimestamp,
			CollectedAt:   e.CollectedAt,
		})
	}

	n, err := a.service.storeLogEntries(ctx, records)
	return n, err
}
