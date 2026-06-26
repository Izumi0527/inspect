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

import "golang.org/x/crypto/ssh"

// LegacyAlgorithms 返回兼容老旧网络设备的 SSH 算法配置（仅算法白名单，
// 不含 User/Auth/HostKeyCallback/Timeout，这些由各调用方按自身语义设置）。
//
// 每次调用返回独立切片，避免调用方意外共享/修改同一底层数组。
func LegacyAlgorithms() ssh.Config {
	return ssh.Config{
		// 密钥交换算法：保留现代算法的同时，放开 group-exchange/group14/group1 等旧算法
		KeyExchanges: []string{
			"diffie-hellman-group-exchange-sha256",
			"diffie-hellman-group-exchange-sha1",
			"diffie-hellman-group14-sha256",
			"diffie-hellman-group14-sha1",
			"diffie-hellman-group1-sha1",
			"curve25519-sha256",
			"curve25519-sha256@libssh.org",
			"ecdh-sha2-nistp256",
			"ecdh-sha2-nistp384",
			"ecdh-sha2-nistp521",
		},
		// 加密算法：放开 CBC / 3DES / arcfour 等旧设备常用算法
		Ciphers: []string{
			"aes128-ctr", "aes192-ctr", "aes256-ctr",
			"aes128-cbc", "aes192-cbc", "aes256-cbc",
			"3des-cbc", "arcfour256", "arcfour128",
		},
		// MAC 算法：放开 sha1 / md5 系列
		MACs: []string{
			"hmac-sha2-256", "hmac-sha2-512",
			"hmac-sha1", "hmac-sha1-96",
			"hmac-md5", "hmac-md5-96",
		},
	}
}
