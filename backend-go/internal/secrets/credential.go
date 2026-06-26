// Package secrets 提供设备敏感凭据（SSH/Telnet 密码等）的对称加解密能力。
//
// 背景：设备 CLI 凭据此前以明文存入数据库，可被直接 SELECT 读出，属安全隐患。
// 本包用 AES-256-GCM 对凭据加密，密文带 "enc:v1:" 版本前缀，便于：
//   - 读取时区分存量明文与密文，实现平滑兼容（无需一次性危险地批量改数据）；
//   - 未来算法/密钥升级时通过版本号演进。
//
// 密钥由主密钥（CREDENTIAL_ENC_KEY，回退 SECRET_KEY）经 HKDF-SHA256 派生独立子密钥，
// 通过 info 上下文与 JWT 等其它用途隔离。
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"strings"

	"golang.org/x/crypto/hkdf"
)

const (
	// credentialPrefix 标记密文格式版本：区分明文（存量）与密文，并支持算法升级。
	credentialPrefix = "enc:v1:"
	// hkdfInfo 将派生密钥与“设备凭据加密”用途绑定，避免与 JWT 等共享同一派生结果。
	hkdfInfo = "inspect-device-credential-encryption-v1"
	// keySize 为 AES-256 密钥长度。
	keySize = 32
)

// Cipher 提供设备凭据的 AES-256-GCM 加解密。零值不可用，须经 NewCipher 构造。
type Cipher struct {
	aead cipher.AEAD
}

// NewCipher 从主密钥派生 AES-256 子密钥并构造 GCM。master 须非空（调用方负责回退与校验）。
func NewCipher(master string) (*Cipher, error) {
	master = strings.TrimSpace(master)
	if master == "" {
		return nil, fmt.Errorf("credential master key is empty")
	}

	key := make([]byte, keySize)
	kdf := hkdf.New(sha256.New, []byte(master), nil, []byte(hkdfInfo))
	if _, err := io.ReadFull(kdf, key); err != nil {
		return nil, fmt.Errorf("derive credential key failed: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("init aes cipher failed: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("init gcm failed: %w", err)
	}

	return &Cipher{aead: aead}, nil
}

// IsEncrypted 判断字符串是否为本模块产出的密文（带版本前缀）。
func IsEncrypted(value string) bool {
	return strings.HasPrefix(value, credentialPrefix)
}

// Encrypt 加密明文，返回 "enc:v1:<base64(nonce|ciphertext|tag)>"。
//   - 空串原样返回（不加密）；
//   - 已是密文则原样返回（幂等，避免二次加密）；
//   - nil receiver 原样返回（未配置密钥时退化为明文，兼容开发裸跑）。
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	if c == nil || plaintext == "" || IsEncrypted(plaintext) {
		return plaintext, nil
	}

	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce failed: %w", err)
	}

	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return credentialPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt 解密密文；非密文（存量明文）原样返回，实现平滑兼容。
//   - nil receiver 原样返回（未配置密钥时退化为明文）。
func (c *Cipher) Decrypt(stored string) (string, error) {
	if c == nil || !IsEncrypted(stored) {
		return stored, nil
	}

	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, credentialPrefix))
	if err != nil {
		return "", fmt.Errorf("decode credential failed: %w", err)
	}

	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize {
		return "", fmt.Errorf("credential ciphertext too short")
	}

	nonce, ciphertext := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt credential failed: %w", err)
	}

	return string(plaintext), nil
}
