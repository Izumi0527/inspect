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
	ID             int
	Name           string
	IPAddress      string
	Vendor         string
	DeviceType     string
	CliProtocol    string
	SshUsername    string
	SshPassword    string
	SshPort        int
	TelnetUsername string
	TelnetPassword string
	TelnetPort     int
	EnablePassword string
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

	var output string
	var err error
	if strings.EqualFold(target.CliProtocol, "telnet") {
		output, err = executeTelnetCommand(ctx, target, command, timeout)
	} else {
		output, err = executeSSHCommand(ctx, target, command, timeout)
	}
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

func executeTelnetCommand(ctx context.Context, target deviceBackupTarget, command string, timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	address := fmt.Sprintf("%s:%d", target.IPAddress, target.TelnetPort)
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return "", fmt.Errorf("telnet dial failed: %w", err)
	}
	defer conn.Close()

	type result struct {
		output string
		err    error
	}
	done := make(chan result, 1)

	go func() {
		out, e := telnetSession(conn, target, command, timeout)
		done <- result{out, e}
	}()

	select {
	case <-ctx.Done():
		_ = conn.Close()
		return "", ctx.Err()
	case r := <-done:
		return r.output, r.err
	}
}

// telnetSession 处理 Telnet 交互式会话：登录、进入特权模式、执行命令、收集输出
func telnetSession(conn net.Conn, target deviceBackupTarget, command string, timeout time.Duration) (string, error) {
	readTimeout := 5 * time.Second
	if timeout < readTimeout {
		readTimeout = timeout
	}

	buf := make([]byte, 4096)

	// readUntil 读取直到遇到指定的提示符之一
	readUntil := func(prompts ...string) (string, string, error) {
		var accumulated strings.Builder
		deadline := time.Now().Add(timeout)
		for {
			_ = conn.SetReadDeadline(time.Now().Add(readTimeout))
			n, err := conn.Read(buf)
			if n > 0 {
				chunk := telnetStripIAC(buf[:n])
				accumulated.Write(chunk)
				current := accumulated.String()
				for _, prompt := range prompts {
					if strings.Contains(strings.ToLower(current), strings.ToLower(prompt)) {
						return current, prompt, nil
					}
				}
			}
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					if time.Now().After(deadline) {
						return accumulated.String(), "", fmt.Errorf("telnet read timeout waiting for prompt")
					}
					continue
				}
				return accumulated.String(), "", fmt.Errorf("telnet read error: %w", err)
			}
		}
	}

	writeLine := func(text string) error {
		_, err := conn.Write([]byte(text + "\r\n"))
		return err
	}

	// 等待登录提示
	_, matchedPrompt, err := readUntil("username:", "login:", "password:")
	if err != nil {
		return "", fmt.Errorf("telnet: waiting for login prompt failed: %w", err)
	}

	// 如果先出现用户名提示，发送用户名后等待密码提示
	if strings.Contains(strings.ToLower(matchedPrompt), "username") || strings.Contains(strings.ToLower(matchedPrompt), "login") {
		if err := writeLine(target.TelnetUsername); err != nil {
			return "", fmt.Errorf("telnet: send username failed: %w", err)
		}
		_, _, err = readUntil("password:")
		if err != nil {
			return "", fmt.Errorf("telnet: waiting for password prompt failed: %w", err)
		}
	}

	// 发送密码
	if err := writeLine(target.TelnetPassword); err != nil {
		return "", fmt.Errorf("telnet: send password failed: %w", err)
	}

	// 等待命令提示符（> 或 #）
	loginOutput, _, err := readUntil(">", "#", "denied", "failed", "invalid")
	if err != nil {
		return "", fmt.Errorf("telnet: login failed: %w", err)
	}
	loginLower := strings.ToLower(loginOutput)
	if strings.Contains(loginLower, "denied") || strings.Contains(loginLower, "failed") || strings.Contains(loginLower, "invalid") {
		return "", fmt.Errorf("telnet: authentication failed")
	}

	// 如果当前在用户模式（>），尝试进入特权模式
	if strings.HasSuffix(strings.TrimSpace(loginOutput), ">") {
		if err := writeLine("enable"); err != nil {
			return "", fmt.Errorf("telnet: send enable failed: %w", err)
		}
		enableOutput, _, err := readUntil("#", "password:")
		if err != nil {
			return "", fmt.Errorf("telnet: enable mode failed: %w", err)
		}
		if strings.Contains(strings.ToLower(enableOutput), "password") {
			enablePwd := target.EnablePassword
			if strings.TrimSpace(enablePwd) == "" {
				enablePwd = target.TelnetPassword
			}
			if err := writeLine(enablePwd); err != nil {
				return "", fmt.Errorf("telnet: send enable password failed: %w", err)
			}
			_, _, err = readUntil("#")
			if err != nil {
				return "", fmt.Errorf("telnet: enter privileged mode failed: %w", err)
			}
		}
	}

	// 禁用分页（适配主流厂商）
	noPagerCommands := []string{
		"terminal length 0",          // Cisco
		"screen-length 0 temporary",  // Huawei
		"set cli screen-length 0",    // Juniper
	}
	for _, cmd := range noPagerCommands {
		_ = writeLine(cmd)
		time.Sleep(300 * time.Millisecond)
	}
	// 清空缓冲区
	_ = conn.SetReadDeadline(time.Now().Add(1 * time.Second))
	for {
		n, err := conn.Read(buf)
		if n == 0 || err != nil {
			break
		}
	}

	// 执行目标命令
	if err := writeLine(command); err != nil {
		return "", fmt.Errorf("telnet: send command failed: %w", err)
	}

	// 收集命令输出直到出现提示符
	output, _, err := readUntil("#", ">")
	if err != nil {
		// 即使超时也返回已收集的输出
		if strings.TrimSpace(output) != "" {
			return telnetCleanOutput(output, command), nil
		}
		return "", fmt.Errorf("telnet: command execution failed: %w", err)
	}

	return telnetCleanOutput(output, command), nil
}

// telnetStripIAC 去除 Telnet IAC 协议控制序列
func telnetStripIAC(data []byte) []byte {
	result := make([]byte, 0, len(data))
	i := 0
	for i < len(data) {
		if data[i] == 0xFF && i+1 < len(data) {
			cmd := data[i+1]
			switch cmd {
			case 0xFB, 0xFC, 0xFD, 0xFE: // WILL, WONT, DO, DONT
				if i+2 < len(data) {
					i += 3
				} else {
					i += 2
				}
			case 0xFA: // SB (subnegotiation)
				j := i + 2
				for j < len(data)-1 {
					if data[j] == 0xFF && data[j+1] == 0xF0 {
						j += 2
						break
					}
					j++
				}
				i = j
			default:
				i += 2
			}
		} else {
			result = append(result, data[i])
			i++
		}
	}
	return result
}

// telnetCleanOutput 清理命令输出：去除命令回显和尾部提示符
func telnetCleanOutput(raw string, command string) string {
	lines := strings.Split(raw, "\n")
	var cleaned []string
	commandSent := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// 跳过命令回显行
		if !commandSent && strings.Contains(trimmed, strings.TrimSpace(command)) {
			commandSent = true
			continue
		}
		// 跳过尾部提示符行
		if commandSent && (strings.HasSuffix(trimmed, "#") || strings.HasSuffix(trimmed, ">")) && len(trimmed) < 80 {
			// 可能是提示符行，检查是否是最后几行
			continue
		}
		cleaned = append(cleaned, line)
	}
	return strings.TrimSpace(strings.Join(cleaned, "\n"))
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
