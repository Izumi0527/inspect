// Package sshutil 提供跨模块共享的 SSH 客户端配置。
//
// 华为 VRP / H3C Comware 等老旧网络设备只支持较旧的密钥交换/加密/MAC 算法，
// 而 Go 的 golang.org/x/crypto/ssh 默认禁用了其中一部分。若不显式放开，
// 连接这些设备会报 "handshake failed: no common algorithm for ..."。
//
// 历史上 cliconn(连接测试)、logs/collector(日志采集)、scheduler/device_backup(配置备份)
// 各自维护了一份相同的算法白名单，且 device_backup 曾遗漏，导致配置备份连不上华为/H3C。
// 此处抽出单一可信来源，三处统一引用，避免再次出现遗漏与漂移。
package sshutil

import (
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/ssh"
)

// LegacyAlgorithms 返回新旧网络设备全兼容的 SSH 算法协商清单（仅算法白名单，
// 不含 User/Auth/HostKeyCallback/Timeout，这些由各调用方按自身语义设置）。
//
// 协商规则为“客户端列表中第一个服务器也支持的算法”（RFC 4253 §7.1），故清单
// 采用现代算法置前、旧算法殿后：新设备（VRP8/Comware V7、OpenSSH ≥ 6.x）自动
// 协商到 AEAD/EtM/强 KEX，老设备不认识前面的新算法名、自然滑落到列表后部的
// 旧算法兜底。清单仅收录 x/crypto 实际有实现的算法（曾误列 aes192/256-cbc 与
// hmac-md5 系——x/crypto 无实现，设备恰好命中会握手失败）。
//
// 每次调用返回独立切片，避免调用方意外共享/修改同一底层数组。
func LegacyAlgorithms() ssh.Config {
	return ssh.Config{
		// 密钥交换算法：curve25519/ecdh/group16/group14-sha256 现代算法优先，
		// group-exchange/group14-sha1/group1 等旧设备算法兜底
		KeyExchanges: []string{
			"curve25519-sha256",
			"curve25519-sha256@libssh.org",
			"ecdh-sha2-nistp256",
			"ecdh-sha2-nistp384",
			"ecdh-sha2-nistp521",
			"diffie-hellman-group16-sha512",
			"diffie-hellman-group14-sha256",
			"diffie-hellman-group-exchange-sha256",
			"diffie-hellman-group14-sha1",
			"diffie-hellman-group-exchange-sha1",
			"diffie-hellman-group1-sha1",
		},
		// 加密算法：AEAD（GCM/ChaCha20-Poly1305）优先（协商成功时无需 MAC），
		// CTR 居中，CBC/3DES/arcfour 等旧设备算法兜底
		Ciphers: []string{
			"aes128-gcm@openssh.com", "aes256-gcm@openssh.com",
			"chacha20-poly1305@openssh.com",
			"aes128-ctr", "aes192-ctr", "aes256-ctr",
			"aes128-cbc", "3des-cbc", "arcfour256", "arcfour128",
		},
		// MAC 算法：Encrypt-then-MAC 优先，sha2 居中，sha1 系兜底
		MACs: []string{
			"hmac-sha2-256-etm@openssh.com", "hmac-sha2-512-etm@openssh.com",
			"hmac-sha2-256", "hmac-sha2-512",
			"hmac-sha1", "hmac-sha1-96",
		},
	}
}

// BuildAuthMethods 按已配置的凭据构建 SSH 认证方法列表，供 cliconn(连接测试/巡检命令)、
// logs/collector(日志采集)、scheduler/device_backup(配置备份) 等连接点统一引用，
// 与 LegacyAlgorithms 同理作为单一可信来源，避免各处认证逻辑漂移。
//
// 组合规则（列表顺序即客户端尝试顺序）：
//   - privateKey 非空：解析为签名器，publickey 认证放最前（keyPassphrase 用于解密受保护私钥）。
//   - password 非空：追加 password 认证，并附带 keyboard-interactive 自动应答——
//     华为 VRP / H3C Comware 常将用户认证方式配置为 interactive，纯 password 会被服务端拒绝。
//   - 两者皆空：返回错误，让调用方在拨号前就得到"未配置凭据"的明确提示。
func BuildAuthMethods(password, privateKey, keyPassphrase string) ([]ssh.AuthMethod, error) {
	methods := make([]ssh.AuthMethod, 0, 3)

	if strings.TrimSpace(privateKey) != "" {
		signer, err := parsePrivateKey(privateKey, keyPassphrase)
		if err != nil {
			return nil, err
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if password != "" {
		methods = append(methods,
			ssh.Password(password),
			ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = password
				}
				return answers, nil
			}),
		)
	}

	if len(methods) == 0 {
		return nil, errors.New("未配置 SSH 认证凭据（密码与私钥均为空）")
	}
	return methods, nil
}

// parsePrivateKey 解析 PEM/OpenSSH 格式私钥文本为签名器，兼容前端文本框粘贴的
// 首尾空白与缺失结尾换行；受口令保护的私钥未提供口令时给出明确提示。
func parsePrivateKey(privateKey, passphrase string) (ssh.Signer, error) {
	keyBytes := []byte(strings.TrimSpace(privateKey) + "\n")

	if passphrase != "" {
		signer, err := ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(passphrase))
		if err != nil {
			return nil, fmt.Errorf("SSH 私钥解析失败（请检查私钥内容与口令）: %w", err)
		}
		return signer, nil
	}

	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			return nil, errors.New("SSH 私钥受口令保护，请填写私钥口令")
		}
		return nil, fmt.Errorf("SSH 私钥解析失败（支持 OpenSSH/PEM 格式）: %w", err)
	}
	return signer, nil
}
