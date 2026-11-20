package devices

import (
	"fmt"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// SNMPTargetCredentials 保存脱敏隔离的只读 SNMP 连接凭据。
// 所有敏感字段均标记 json:"-"，防止在日志、审计或 HTTP 响应中被意外序列化泄露。
type SNMPTargetCredentials struct {
	Target        string                    `json:"-"`
	Port          uint16                    `json:"-"`
	Version       string                    `json:"-"`
	Community     string                    `json:"-"`
	Username      string                    `json:"-"`
	SecurityLevel gosnmp.SnmpV3MsgFlags     `json:"-"`
	AuthProtocol  gosnmp.SnmpV3AuthProtocol `json:"-"`
	PrivProtocol  gosnmp.SnmpV3PrivProtocol `json:"-"`
	AuthKey       string                    `json:"-"`
	PrivKey       string                    `json:"-"`
}

// BuildSNMPTargetCredentials 从已解密的 Device 记录中提取只读 SNMP 凭据，
// 供 monitoring 等外部包安全复用，而不暴露内部 tags 解析逻辑或引入跨包依赖。
func (d *Device) BuildSNMPTargetCredentials() SNMPTargetCredentials {
	if d == nil {
		return SNMPTargetCredentials{}
	}
	cfg := resolveSNMPConfig(d.SnmpCommunity, d.SnmpVersion, d.SnmpPort, d.Tags)
	return SNMPTargetCredentials{
		Target:        strings.TrimSpace(d.IPAddress),
		Port:          cfg.port,
		Version:       cfg.version,
		Community:     cfg.community,
		Username:      cfg.username,
		SecurityLevel: cfg.securityLevel,
		AuthProtocol:  cfg.authProtocol,
		PrivProtocol:  cfg.privProtocol,
		AuthKey:       cfg.authKey,
		PrivKey:       cfg.privKey,
	}
}

// CredentialError 校验凭据是否完整，完整时返回空串。
func (c SNMPTargetCredentials) CredentialError() string {
	return snmpCredentialError(snmpConfig{
		version:       c.Version,
		community:     c.Community,
		port:          c.Port,
		username:      c.Username,
		securityLevel: c.SecurityLevel,
		authProtocol:  c.AuthProtocol,
		privProtocol:  c.PrivProtocol,
		authKey:       c.AuthKey,
		privKey:       c.PrivKey,
	})
}

// NewGoSNMPClient 基于已提取的只读凭据构造未连接的 gosnmp 客户端（5s 超时、1 次重试）。
func (c SNMPTargetCredentials) NewGoSNMPClient(timeout time.Duration) (*gosnmp.GoSNMP, error) {
	if strings.TrimSpace(c.Target) == "" {
		return nil, fmt.Errorf("device ip required")
	}
	if errMsg := c.CredentialError(); errMsg != "" {
		return nil, fmt.Errorf("%s", errMsg)
	}
	if timeout <= 0 || timeout > 5*time.Second {
		timeout = 5 * time.Second
	}
	target := newSNMPTarget(c.Target, snmpConfig{
		version:       c.Version,
		community:     c.Community,
		port:          c.Port,
		username:      c.Username,
		securityLevel: c.SecurityLevel,
		authProtocol:  c.AuthProtocol,
		privProtocol:  c.PrivProtocol,
		authKey:       c.AuthKey,
		privKey:       c.PrivKey,
	})
	target.Timeout = timeout
	target.Retries = 1
	return target, nil
}
