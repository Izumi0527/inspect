package devices

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Scanner struct {
	db     *gorm.DB
	logger *zap.Logger
	probe  *ProbeService
	mu     sync.Mutex
	active map[string]*scanJob
}

type scanJob struct {
	cancel context.CancelFunc
}

func NewScanner(db *gorm.DB, logger *zap.Logger, probe *ProbeService) *Scanner {
	return &Scanner{
		db:     db,
		logger: logger,
		probe:  probe,
		active: make(map[string]*scanJob),
	}
}

func (s *Scanner) StartScan(ctx context.Context, req NetworkScanRequest, createdBy *string) (string, error) {
	if s.db == nil {
		return "", fmt.Errorf("database not initialized")
	}

	target := strings.TrimSpace(req.TargetNetwork)
	if target == "" {
		return "", fmt.Errorf("target_network is required")
	}

	_, ipNet, err := net.ParseCIDR(target)
	if err != nil {
		return "", fmt.Errorf("invalid target_network")
	}

	scanID := uuid.NewString()
	scanType := strings.TrimSpace(req.ScanType)
	if scanType == "" {
		scanType = "ping"
	}

	totalHosts := countHosts(ipNet)
	ports := defaultScanPorts(req.PortScan)
	snmpCommunities := defaultSnmpCommunities(req.SnmpScan)

	portsJSON, _ := json.Marshal(ports)
	communitiesJSON, _ := json.Marshal(snmpCommunities)

	startedAt := time.Now().UTC()
	scan := NetworkScan{
		ID:              scanID,
		Name:            scanID,
		TargetNetwork:   target,
		ScanType:        scanType,
		Status:          "running",
		Progress:        0,
		TotalHosts:      totalHosts,
		ScannedHosts:    0,
		AliveHosts:      0,
		DevicesFound:    0,
		ScanPorts:       datatypes.JSON(portsJSON),
		SnmpCommunities: datatypes.JSON(communitiesJSON),
		StartedAt:       &startedAt,
	}
	if createdBy != nil && strings.TrimSpace(*createdBy) != "" {
		scan.CreatedBy = createdBy
	}

	if err := s.db.WithContext(ctx).Create(&scan).Error; err != nil {
		return "", err
	}

	scanCtx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.active[scanID] = &scanJob{cancel: cancel}
	s.mu.Unlock()

	go s.executeScan(scanCtx, scan, req)
	return scanID, nil
}

func (s *Scanner) StopScan(ctx context.Context, scanID string) bool {
	if s.db == nil {
		return false
	}

	s.mu.Lock()
	job := s.active[scanID]
	if job != nil {
		job.cancel()
		delete(s.active, scanID)
	}
	s.mu.Unlock()

	update := map[string]interface{}{
		"status":       "cancelled",
		"completed_at": time.Now().UTC(),
		"updated_at":   time.Now().UTC(),
	}
	if err := s.db.WithContext(ctx).Table("network_scans").Where("id = ?", scanID).Updates(update).Error; err != nil {
		return false
	}
	return true
}

func (s *Scanner) GetScan(ctx context.Context, scanID string) (*NetworkScan, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var scan NetworkScan
	if err := s.db.WithContext(ctx).Table("network_scans").Where("id = ?", scanID).Take(&scan).Error; err != nil {
		return nil, err
	}
	return &scan, nil
}

func (s *Scanner) ListScans(ctx context.Context, status string, limit int) ([]NetworkScan, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if limit <= 0 {
		limit = 20
	}

	query := s.db.WithContext(ctx).Table("network_scans")
	if strings.TrimSpace(status) != "" {
		query = query.Where("status = ?", status)
	}

	var scans []NetworkScan
	if err := query.Order("started_at desc").Limit(limit).Find(&scans).Error; err != nil {
		return nil, err
	}
	return scans, nil
}

func (s *Scanner) GetDiscoveredDevices(ctx context.Context, scanID string) ([]DiscoveredDevice, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var rows []DiscoveredDevice
	if err := s.db.WithContext(ctx).Table("discovered_devices").Where("scan_id = ?", scanID).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Scanner) MarkDiscoveredImported(ctx context.Context, scanID string, ip string, deviceID int) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	updates := map[string]interface{}{
		"is_imported":        true,
		"imported_device_id": deviceID,
	}

	return s.db.WithContext(ctx).
		Table("discovered_devices").
		Where("scan_id = ? AND ip_address = ?", scanID, ip).
		Updates(updates).Error
}

func (s *Scanner) executeScan(ctx context.Context, scan NetworkScan, req NetworkScanRequest) {
	startedAt := time.Now().UTC()
	if scan.StartedAt != nil {
		startedAt = *scan.StartedAt
	}
	var scannedCount int64
	var aliveCount int64
	var foundCount int64
	var stopOnce sync.Once

	done := make(chan struct{})
	defer close(done)

	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				s.updateScanProgress(ctx, scan.ID, scan.TotalHosts, &scannedCount, &aliveCount, &foundCount)
			case <-done:
				return
			}
		}
	}()

	workerCount := 50
	if req.DeepScan && workerCount > 30 {
		workerCount = 30
	}

	ports := defaultScanPorts(req.PortScan)
	communities := defaultSnmpCommunities(req.SnmpScan)
	scanType := strings.TrimSpace(req.ScanType)
	if scanType == "" {
		scanType = "ping"
	}

	hosts := make(chan string)
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ip := range hosts {
				if ctx.Err() != nil {
					return
				}

				reachable := true
				var responseTime *float64
				if scanType == "ping" || scanType == "full" {
					reachable, responseTime, _ = probeICMP(ctx, ip)
				}

				atomic.AddInt64(&scannedCount, 1)
				if !reachable && (scanType == "ping" || scanType == "full") {
					continue
				}

				atomic.AddInt64(&aliveCount, 1)

				device := DiscoveredDevice{
					ScanID:       scan.ID,
					IPAddress:    ip,
					ResponseTime: responseTime,
					DiscoveredAt: ptrTime(time.Now().UTC()),
				}

				if req.PortScan {
					openPorts, services := scanPorts(ctx, ip, ports)
					portsJSON, _ := json.Marshal(openPorts)
					servicesJSON, _ := json.Marshal(services)
					device.OpenPorts = datatypes.JSON(portsJSON)
					device.Services = datatypes.JSON(servicesJSON)
					device.DeviceType = inferDeviceType(openPorts, services)
				}

				if req.SnmpScan {
					if info, ok := scanSnmpInfo(ctx, ip, communities); ok {
						raw, _ := json.Marshal(info)
						device.SnmpInfo = datatypes.JSON(raw)
					}
				}

				if req.DeepScan {
					if device.Hostname == nil {
						if hostname := lookupHostname(ip); hostname != "" {
							device.Hostname = &hostname
						}
					}
					if device.MacAddress == nil {
						if mac := lookupMacAddress(ip); mac != "" {
							device.MacAddress = &mac
						}
					}
				}

				if err := s.upsertDiscoveredDevice(ctx, device); err != nil {
					if s.logger != nil {
						s.logger.Warn("store discovered device failed", zap.Error(err), zap.String("scan_id", scan.ID))
					}
				} else {
					atomic.AddInt64(&foundCount, 1)
				}
			}
		}()
	}

	go func() {
		defer close(hosts)
		for _, ip := range hostsFromCIDR(scan.TargetNetwork) {
			select {
			case <-ctx.Done():
				return
			case hosts <- ip:
			}
		}
	}()

	wg.Wait()
	stopOnce.Do(func() {
		s.finalizeScan(ctx, scan.ID, startedAt, scan.TotalHosts, &scannedCount, &aliveCount, &foundCount, ctx.Err())
	})

	s.mu.Lock()
	delete(s.active, scan.ID)
	s.mu.Unlock()
}

func (s *Scanner) updateScanProgress(ctx context.Context, scanID string, totalHosts int, scanned *int64, alive *int64, found *int64) {
	if totalHosts <= 0 || s.db == nil {
		return
	}
	scannedCount := atomic.LoadInt64(scanned)
	aliveCount := atomic.LoadInt64(alive)
	foundCount := atomic.LoadInt64(found)
	progress := int(float64(scannedCount) / float64(totalHosts) * 100)
	if progress > 100 {
		progress = 100
	}

	updates := map[string]interface{}{
		"scanned_hosts": scannedCount,
		"alive_hosts":   aliveCount,
		"devices_found": foundCount,
		"progress":      progress,
		"updated_at":    time.Now().UTC(),
	}
	_ = s.db.WithContext(ctx).Table("network_scans").Where("id = ?", scanID).Updates(updates).Error
}

func (s *Scanner) finalizeScan(ctx context.Context, scanID string, startedAt time.Time, totalHosts int, scanned *int64, alive *int64, found *int64, cause error) {
	status := "completed"
	if cause != nil {
		if errors.Is(cause, context.Canceled) {
			status = "cancelled"
		} else {
			status = "failed"
		}
	}

	scannedCount := atomic.LoadInt64(scanned)
	aliveCount := atomic.LoadInt64(alive)
	foundCount := atomic.LoadInt64(found)
	completedAt := time.Now().UTC()
	duration := int(completedAt.Sub(startedAt).Seconds())

	progress := 100
	if status != "completed" {
		if totalHosts > 0 {
			progress = int(float64(scannedCount) / float64(totalHosts) * 100)
		} else {
			progress = 0
		}
	}

	updates := map[string]interface{}{
		"status":       status,
		"scanned_hosts": scannedCount,
		"alive_hosts":  aliveCount,
		"devices_found": foundCount,
		"progress":     progress,
		"completed_at": completedAt,
		"duration":     duration,
		"updated_at":   completedAt,
	}
	_ = s.db.WithContext(ctx).Table("network_scans").Where("id = ?", scanID).Updates(updates).Error
}

func defaultScanPorts(enabled bool) []int {
	if !enabled {
		return []int{}
	}
	return []int{21, 22, 23, 25, 53, 80, 110, 143, 161, 443, 993, 995, 3389, 5432, 3306, 1521, 27017, 6379}
}

func defaultSnmpCommunities(enabled bool) []string {
	if !enabled {
		return []string{}
	}
	return []string{"public", "private", "community"}
}

func scanPorts(ctx context.Context, ip string, ports []int) ([]int, map[string]string) {
	openPorts := make([]int, 0)
	services := map[string]string{}
	for _, port := range ports {
		if ctx.Err() != nil {
			break
		}
		address := fmt.Sprintf("%s:%d", ip, port)
		conn, err := net.DialTimeout("tcp", address, 2*time.Second)
		if err == nil {
			_ = conn.Close()
			openPorts = append(openPorts, port)
			services[fmt.Sprintf("%d", port)] = defaultServiceName(port)
		}
	}
	return openPorts, services
}

func defaultServiceName(port int) string {
	switch port {
	case 21:
		return "FTP"
	case 22:
		return "SSH"
	case 23:
		return "Telnet"
	case 25:
		return "SMTP"
	case 53:
		return "DNS"
	case 80:
		return "HTTP"
	case 110:
		return "POP3"
	case 143:
		return "IMAP"
	case 161:
		return "SNMP"
	case 443:
		return "HTTPS"
	case 993:
		return "IMAPS"
	case 995:
		return "POP3S"
	case 3389:
		return "RDP"
	case 5432:
		return "PostgreSQL"
	case 3306:
		return "MySQL"
	case 1521:
		return "Oracle"
	case 27017:
		return "MongoDB"
	case 6379:
		return "Redis"
	default:
		return fmt.Sprintf("Port %d", port)
	}
}

func scanSnmpInfo(ctx context.Context, ip string, communities []string) (map[string]interface{}, bool) {
	if len(communities) == 0 {
		return nil, false
	}
	for _, community := range communities {
		community := community
		reachable, response, info, errMsg := probeSNMP(ctx, ip, &community, ptrString(defaultSnmpVersion), ptrInt(defaultSnmpPort), nil)
		if reachable && info != nil {
			result := map[string]interface{}{
				"system_info": *info,
			}
			if response != nil {
				result["response_time_ms"] = *response
			}
			return result, true
		}
		if errMsg != nil && strings.Contains(strings.ToLower(*errMsg), "timeout") {
			continue
		}
	}
	return nil, false
}

func lookupHostname(ip string) string {
	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	return strings.TrimSuffix(names[0], ".")
}

func lookupMacAddress(ip string) string {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("arp", "-a", ip)
	} else {
		cmd = exec.Command("arp", "-n", ip)
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	re := regexp.MustCompile(`([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}`)
	match := re.FindString(string(output))
	if match == "" {
		return ""
	}
	return strings.ToUpper(strings.ReplaceAll(match, "-", ":"))
}

func inferDeviceType(openPorts []int, services map[string]string) *string {
	if containsPort(openPorts, 161) && (containsPort(openPorts, 22) || containsPort(openPorts, 23)) {
		value := "network_device"
		return &value
	}
	if (containsPort(openPorts, 80) || containsPort(openPorts, 443)) && containsPort(openPorts, 22) {
		value := "server"
		return &value
	}
	if containsPort(openPorts, 3389) {
		value := "windows_server"
		return &value
	}
	if containsPort(openPorts, 3306) || containsPort(openPorts, 5432) || containsPort(openPorts, 1521) {
		value := "database_server"
		return &value
	}
	if containsPort(openPorts, 25) || containsPort(openPorts, 110) || containsPort(openPorts, 143) {
		value := "mail_server"
		return &value
	}
	if containsPort(openPorts, 22) {
		value := "linux_server"
		return &value
	}
	if containsPort(openPorts, 23) {
		value := "network_device"
		return &value
	}
	if containsPort(openPorts, 80) || containsPort(openPorts, 443) {
		value := "web_server"
		return &value
	}
	return nil
}

func containsPort(ports []int, port int) bool {
	for _, item := range ports {
		if item == port {
			return true
		}
	}
	return false
}

func hostsFromCIDR(cidr string) []string {
	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil || ipNet == nil {
		return []string{}
	}
	ip := ipNet.IP.To4()
	if ip == nil {
		return []string{}
	}

	total := countHosts(ipNet)
	if total <= 0 {
		return []string{}
	}

	hosts := make([]string, 0, total)
	for i := 0; i < total; i++ {
		current := make(net.IP, len(ip))
		copy(current, ip)
		addToIP(current, i+hostStartOffset(ipNet))
		hosts = append(hosts, current.String())
	}
	return hosts
}

func countHosts(ipNet *net.IPNet) int {
	ones, bits := ipNet.Mask.Size()
	if bits != 32 {
		return 0
	}
	total := 1 << (bits - ones)
	if total <= 2 {
		return total
	}
	return total - 2
}

func hostStartOffset(ipNet *net.IPNet) int {
	ones, bits := ipNet.Mask.Size()
	if bits != 32 {
		return 0
	}
	total := 1 << (bits - ones)
	if total <= 2 {
		return 0
	}
	return 1
}

func addToIP(ip net.IP, increment int) {
	for i := len(ip) - 1; i >= 0 && increment > 0; i-- {
		value := int(ip[i]) + increment
		ip[i] = byte(value % 256)
		increment = value / 256
	}
}

func ptrString(value string) *string {
	return &value
}

func ptrInt(value int) *int {
	return &value
}

func ptrTime(value time.Time) *time.Time {
	return &value
}

func (s *Scanner) upsertDiscoveredDevice(ctx context.Context, device DiscoveredDevice) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	return s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "scan_id"}, {Name: "ip_address"}},
			DoUpdates: clause.AssignmentColumns([]string{"hostname", "mac_address", "vendor", "device_type", "os_info", "open_ports", "services", "snmp_info", "response_time", "discovered_at"}),
		}).
		Create(&device).Error
}
