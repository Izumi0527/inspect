package sshutil_test

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"net"
	"slices"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
)

const (
	stubUser     = "netops"
	stubPassword = "secret"
)

// startStubSSHServer 在 127.0.0.1 随机端口启动最小 SSH 服务端（仅完成握手与密码认证，
// 拒绝所有 channel），算法集与主机密钥由调用方指定，用于模拟不同代际的网络设备。
func startStubSSHServer(t *testing.T, algos ssh.Config, signer ssh.Signer) string {
	t.Helper()

	config := &ssh.ServerConfig{
		Config: algos,
		PasswordCallback: func(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if conn.User() == stubUser && string(password) == stubPassword {
				return &ssh.Permissions{}, nil
			}
			return nil, fmt.Errorf("认证失败")
		},
	}
	config.AddHostKey(signer)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("启动测试 SSH 服务端失败: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				sconn, chans, reqs, err := ssh.NewServerConn(c, config)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				for ch := range chans {
					_ = ch.Reject(ssh.UnknownChannelType, "test server")
				}
				_ = sconn.Close()
			}(conn)
		}
	}()

	return listener.Addr().String()
}

// dialWithSharedConfig 用生产共享配置（LegacyAlgorithms + BuildAuthMethods 密码认证）
// 连接目标地址，返回握手+认证结果。
func dialWithSharedConfig(t *testing.T, addr string) error {
	t.Helper()
	auth, err := sshutil.BuildAuthMethods(stubPassword, "", "")
	if err != nil {
		t.Fatalf("构建认证方法失败: %v", err)
	}
	client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
		Config:          sshutil.LegacyAlgorithms(),
		User:            stubUser,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         5 * time.Second,
	})
	if err == nil {
		_ = client.Close()
	}
	return err
}

func TestLegacyAlgorithms_HandshakeWithLegacyDevice(t *testing.T) {
	// 模拟华为/H3C 老设备：仅支持旧 KEX/CBC/sha1 与 RSA 主机密钥
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("生成 RSA 主机密钥失败: %v", err)
	}
	signer, err := ssh.NewSignerFromKey(rsaKey)
	if err != nil {
		t.Fatalf("构建 RSA signer 失败: %v", err)
	}

	addr := startStubSSHServer(t, ssh.Config{
		KeyExchanges: []string{"diffie-hellman-group1-sha1"},
		Ciphers:      []string{"aes128-cbc"},
		MACs:         []string{"hmac-sha1"},
	}, signer)

	if err := dialWithSharedConfig(t, addr); err != nil {
		t.Fatalf("共享算法配置应能连上仅支持旧算法的设备: %v", err)
	}
}

func TestLegacyAlgorithms_HandshakeWithModernDevice(t *testing.T) {
	// 模拟新款设备：仅支持现代 KEX/AEAD/EtM 与 ed25519 主机密钥
	_, edKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("生成 ed25519 主机密钥失败: %v", err)
	}
	signer, err := ssh.NewSignerFromKey(edKey)
	if err != nil {
		t.Fatalf("构建 ed25519 signer 失败: %v", err)
	}

	addr := startStubSSHServer(t, ssh.Config{
		KeyExchanges: []string{"curve25519-sha256"},
		Ciphers:      []string{"aes256-gcm@openssh.com"},
		MACs:         []string{"hmac-sha2-256-etm@openssh.com"},
	}, signer)

	if err := dialWithSharedConfig(t, addr); err != nil {
		t.Fatalf("共享算法配置应能连上仅支持现代算法的设备: %v", err)
	}
}

func TestLegacyAlgorithms_ShouldNotContainUnimplementedAlgorithms(t *testing.T) {
	// x/crypto 无实现的算法不得出现在清单中：设备恰好协商命中会导致握手失败
	// （历史上曾误列 aes192/256-cbc 与 hmac-md5 系）。
	algos := sshutil.LegacyAlgorithms()
	all := slices.Concat(algos.KeyExchanges, algos.Ciphers, algos.MACs)
	for _, banned := range []string{"aes192-cbc", "aes256-cbc", "hmac-md5", "hmac-md5-96"} {
		if slices.Contains(all, banned) {
			t.Errorf("清单不应包含 x/crypto 无实现的算法 %q", banned)
		}
	}
}

func TestLegacyAlgorithms_ModernAlgorithmsShouldPrecedeLegacy(t *testing.T) {
	// 协商取客户端列表首个共同项，现代算法必须排在旧算法之前，
	// 否则同时支持新旧算法的设备会被降级到旧套件。
	algos := sshutil.LegacyAlgorithms()
	assertBefore := func(list []string, modern, legacy string) {
		t.Helper()
		modernIdx := slices.Index(list, modern)
		legacyIdx := slices.Index(list, legacy)
		if modernIdx < 0 || legacyIdx < 0 {
			t.Fatalf("清单缺少 %q 或 %q", modern, legacy)
		}
		if modernIdx > legacyIdx {
			t.Errorf("%q 应排在 %q 之前（现代优先）", modern, legacy)
		}
	}
	assertBefore(algos.KeyExchanges, "curve25519-sha256", "diffie-hellman-group1-sha1")
	assertBefore(algos.Ciphers, "aes128-gcm@openssh.com", "aes128-cbc")
	assertBefore(algos.MACs, "hmac-sha2-256-etm@openssh.com", "hmac-sha1")
}
