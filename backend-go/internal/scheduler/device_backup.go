package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/ssh"
)

type deviceBackupTarget struct {
	ID          int
	Name        string
	IPAddress   string
	Vendor      string
	DeviceType  string
	SshUsername string
	SshPassword string
	SshPort     int
}

type deviceBackupItem struct {
	DeviceID     int    `json:"device_id"`
	Name         string `json:"name,omitempty"`
	IPAddress    string `json:"ip_address"`
	Vendor       string `json:"vendor,omitempty"`
	DeviceType   string `json:"device_type,omitempty"`
	Command      string `json:"command,omitempty"`
	Status       string `json:"status"`
	FilePath     string `json:"file_path,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
	ErrorMessage string `json:"error,omitempty"`
}

type deviceBackupManifest struct {
	GeneratedAt     string             `json:"generated_at"`
	RetentionDays   int                `json:"retention_days"`
	TotalDevices    int                `json:"total_devices"`
	EligibleDevices int                `json:"eligible_devices"`
	BackedUpDevices int                `json:"backed_up_devices"`
	FailedDevices   int                `json:"failed_devices"`
	BackupDir       string             `json:"backup_dir"`
	Items           []deviceBackupItem `json:"items"`
}

type deviceBackupStats struct {
	Success   int
	Failed    int
	TotalSize int64
}

func (s *Service) performDeviceBackups(
	ctx context.Context,
	taskID string,
	targets []deviceBackupTarget,
	backupDir string,
	timeout time.Duration,
) ([]deviceBackupItem, deviceBackupStats, error) {
	items := make([]deviceBackupItem, 0, len(targets))
	stats := deviceBackupStats{}
	if len(targets) == 0 {
		return items, stats, nil
	}

	workers := s.maxConcurrent
	if workers <= 0 {
		workers = 5
	}
	if workers > len(targets) {
		workers = len(targets)
	}

	jobs := make(chan deviceBackupTarget, len(targets))
	var wg sync.WaitGroup
	var mu sync.Mutex
	var completed int64

	worker := func() {
		defer wg.Done()
		for target := range jobs {
			if ctx.Err() != nil {
				return
			}
			item, size, err := s.backupSingleDevice(ctx, target, backupDir, timeout)
			if err != nil {
				item.Status = "failed"
				if strings.TrimSpace(item.ErrorMessage) == "" {
					item.ErrorMessage = err.Error()
				}
			}

			mu.Lock()
			items = append(items, item)
			if err != nil {
				stats.Failed++
			} else {
				stats.Success++
				stats.TotalSize += size
			}
			mu.Unlock()

			done := atomic.AddInt64(&completed, 1)
			if taskID != "" {
				progress := float64(done) / float64(len(targets)) * 100
				s.updateTaskProgress(ctx, taskID, progress)
			}
		}
	}

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go worker()
	}

	for _, target := range targets {
		if ctx.Err() != nil {
			break
		}
		jobs <- target
	}
	close(jobs)
	wg.Wait()

	if ctx.Err() != nil {
		return items, stats, ctx.Err()
	}
	return items, stats, nil
}

func (s *Service) backupSingleDevice(
	ctx context.Context,
	target deviceBackupTarget,
	backupDir string,
	timeout time.Duration,
) (deviceBackupItem, int64, error) {
	command := resolveBackupCommand(target.Vendor, target.DeviceType)
	item := deviceBackupItem{
		DeviceID:   target.ID,
		Name:       target.Name,
		IPAddress:  target.IPAddress,
		Vendor:     target.Vendor,
		DeviceType: target.DeviceType,
		Command:    command,
		Status:     "success",
	}

	if strings.TrimSpace(command) == "" {
		err := fmt.Errorf("backup command not configured")
		item.Status = "failed"
		item.ErrorMessage = err.Error()
		return item, 0, err
	}

	output, err := executeSSHCommand(ctx, target, command, timeout)
	if err != nil {
		item.Status = "failed"
		item.ErrorMessage = err.Error()
		return item, 0, err
	}
	output = strings.TrimSpace(output)
	if output == "" {
		err := fmt.Errorf("empty config output")
		item.Status = "failed"
		item.ErrorMessage = err.Error()
		return item, 0, err
	}

	filename := fmt.Sprintf("%d_%s.cfg", target.ID, sanitizeFilenameSegment(target.IPAddress))
	filePath := filepath.Join(backupDir, filename)
	if err := os.WriteFile(filePath, []byte(output), 0o644); err != nil {
		item.Status = "failed"
		item.ErrorMessage = err.Error()
		return item, 0, err
	}

	size := int64(len(output))
	if info, statErr := os.Stat(filePath); statErr == nil {
		size = info.Size()
	}

	item.FilePath = filePath
	item.FileSize = size
	return item, size, nil
}

func resolveBackupCommand(vendor string, deviceType string) string {
	normalizedVendor := strings.ToLower(strings.TrimSpace(vendor))
	_ = deviceType

	switch normalizedVendor {
	case "huawei", "h3c":
		return "display current-configuration"
	case "juniper":
		return "show configuration"
	default:
		return "show running-config"
	}
}

func executeSSHCommand(ctx context.Context, target deviceBackupTarget, command string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	config := &ssh.ClientConfig{
		User:            target.SshUsername,
		Auth:            []ssh.AuthMethod{ssh.Password(target.SshPassword)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         timeout,
	}

	address := fmt.Sprintf("%s:%d", target.IPAddress, target.SshPort)
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return "", fmt.Errorf("ssh dial failed: %w", err)
	}

	clientConn, chans, reqs, err := ssh.NewClientConn(conn, address, config)
	if err != nil {
		_ = conn.Close()
		return "", fmt.Errorf("ssh handshake failed: %w", err)
	}

	client := ssh.NewClient(clientConn, chans, reqs)
	defer client.Close()

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
		return "", ctx.Err()
	case err := <-done:
		if err != nil {
			return "", fmt.Errorf("ssh command failed: %w", err)
		}
		return string(output), nil
	}
}

func writeDeviceBackupManifest(dir string, manifest deviceBackupManifest) (string, error) {
	path := filepath.Join(dir, "manifest.json")
	payload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func cleanupOldDeviceBackups(root string, retentionDays int) (int, error) {
	if retentionDays <= 0 {
		return 0, nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	threshold := time.Now().UTC().AddDate(0, 0, -retentionDays)
	deleted := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(threshold) {
			if err := os.RemoveAll(filepath.Join(root, entry.Name())); err == nil {
				deleted++
			}
		}
	}
	return deleted, nil
}

func sanitizeFilenameSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "unknown"
	}
	value = strings.ReplaceAll(value, ":", "_")
	value = strings.ReplaceAll(value, "/", "_")
	value = strings.ReplaceAll(value, "\\", "_")
	return value
}

func extractFailedDeviceBackups(items []deviceBackupItem) []map[string]interface{} {
	failed := make([]map[string]interface{}, 0)
	for _, item := range items {
		if strings.EqualFold(item.Status, "success") {
			continue
		}
		failed = append(failed, map[string]interface{}{
			"device_id": item.DeviceID,
			"ip_address": item.IPAddress,
			"error":      item.ErrorMessage,
		})
	}
	return failed
}
