// Package cliconn 提供设备 CLI（SSH/Telnet）连接测试能力。
// 仅验证"能连上并完成登录认证"，不执行任何业务命令，供编辑设备弹窗的"测试连接"使用。
package cliconn

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
)

// Target CLI 连接测试目标参数（取自编辑弹窗当前填写值，不依赖已保存设备）。
type Target struct {
	Protocol       string // "ssh" | "telnet"
	Host           string
	Port           int
	Username       string
	Password       string
	EnablePassword string // telnet 特权密码（可选）
}

// Result 连接测试结果。
type Result struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	LatencyMs int64  `json:"latency_ms"`
}

// TestConnection 按协议验证 SSH/Telnet 登录连通性（仅建立连接并完成认证，不执行业务命令）。
func TestConnection(ctx context.Context, target Target, timeout time.Duration) Result {
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	start := time.Now()

	var err error
	switch strings.ToLower(strings.TrimSpace(target.Protocol)) {
	case "ssh":
		err = testSSH(ctx, target, timeout)
	case "telnet":
		err = testTelnet(ctx, target, timeout)
	default:
		return Result{Success: false, Message: fmt.Sprintf("不支持的协议: %q", target.Protocol)}
	}

	latency := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Success: false, Message: err.Error(), LatencyMs: latency}
	}
	return Result{Success: true, Message: "连接成功", LatencyMs: latency}
}

func testSSH(ctx context.Context, target Target, timeout time.Duration) error {
	config := &ssh.ClientConfig{
		// 兼容华为/H3C 等老旧网络设备的密钥交换/加密/MAC 算法（Go 默认禁用部分旧算法）
		Config:          sshutil.LegacyAlgorithms(),
		User:            target.Username,
		Auth:            []ssh.AuthMethod{ssh.Password(target.Password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 网络设备无 CA 主机证书，连接测试不做主机校验
		Timeout:         timeout,
	}
	address := fmt.Sprintf("%s:%d", target.Host, target.Port)

	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("TCP 连接失败: %v", err)
	}
	defer conn.Close()

	clientConn, chans, reqs, err := ssh.NewClientConn(conn, address, config)
	if err != nil {
		return fmt.Errorf("SSH 认证失败: %v", err)
	}
	client := ssh.NewClient(clientConn, chans, reqs)
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("SSH 会话建立失败: %v", err)
	}
	_ = session.Close()
	return nil
}

func testTelnet(ctx context.Context, target Target, timeout time.Duration) error {
	address := fmt.Sprintf("%s:%d", target.Host, target.Port)
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return fmt.Errorf("TCP 连接失败: %v", err)
	}
	defer conn.Close()

	done := make(chan error, 1)
	go func() { done <- telnetLogin(conn, target, timeout) }()

	select {
	case <-ctx.Done():
		return fmt.Errorf("连接超时")
	case e := <-done:
		return e
	}
}

// telnetLogin 完成 telnet 登录验证（用户名/密码 → 提示符），不执行业务命令。
func telnetLogin(conn net.Conn, target Target, timeout time.Duration) error {
	readTimeout := min(5*time.Second, timeout)
	buf := make([]byte, 4096)
	deadline := time.Now().Add(timeout)

	readUntil := func(prompts ...string) (string, string, error) {
		var acc strings.Builder
		for {
			if time.Now().After(deadline) {
				return acc.String(), "", fmt.Errorf("等待提示符超时")
			}
			_ = conn.SetReadDeadline(time.Now().Add(readTimeout))
			n, err := conn.Read(buf)
			if n > 0 {
				acc.Write(stripIAC(buf[:n]))
				cur := strings.ToLower(acc.String())
				for _, p := range prompts {
					if strings.Contains(cur, strings.ToLower(p)) {
						return acc.String(), p, nil
					}
				}
			}
			if err != nil {
				if ne, ok := err.(net.Error); ok && ne.Timeout() {
					if time.Now().After(deadline) {
						return acc.String(), "", fmt.Errorf("等待提示符超时")
					}
					continue
				}
				return acc.String(), "", fmt.Errorf("读取失败: %v", err)
			}
		}
	}
	writeLine := func(s string) error {
		_, err := conn.Write([]byte(s + "\r\n"))
		return err
	}

	// 等待登录提示
	_, matched, err := readUntil("username:", "login:", "password:")
	if err != nil {
		return fmt.Errorf("未收到登录提示: %v", err)
	}
	// 先出现用户名提示则发送用户名，再等密码提示
	if strings.Contains(strings.ToLower(matched), "username") || strings.Contains(strings.ToLower(matched), "login") {
		if err := writeLine(target.Username); err != nil {
			return fmt.Errorf("发送用户名失败: %v", err)
		}
		if _, _, err := readUntil("password:"); err != nil {
			return fmt.Errorf("未收到密码提示: %v", err)
		}
	}
	// 发送密码并判断登录结果
	if err := writeLine(target.Password); err != nil {
		return fmt.Errorf("发送密码失败: %v", err)
	}
	out, _, err := readUntil(">", "#", "denied", "failed", "invalid", "incorrect")
	if err != nil {
		return fmt.Errorf("登录验证失败: %v", err)
	}
	low := strings.ToLower(out)
	if strings.Contains(low, "denied") || strings.Contains(low, "failed") ||
		strings.Contains(low, "invalid") || strings.Contains(low, "incorrect") {
		return fmt.Errorf("认证失败：用户名或密码错误")
	}
	return nil
}

// stripIAC 去除 telnet IAC 协议控制序列，避免污染提示符匹配。
func stripIAC(data []byte) []byte {
	out := make([]byte, 0, len(data))
	i := 0
	for i < len(data) {
		if data[i] == 0xFF && i+1 < len(data) {
			switch data[i+1] {
			case 0xFB, 0xFC, 0xFD, 0xFE: // WILL/WONT/DO/DONT
				if i+2 < len(data) {
					i += 3
				} else {
					i += 2
				}
			case 0xFA: // SB 子协商，跳到 SE(0xF0)
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
			out = append(out, data[i])
			i++
		}
	}
	return out
}
