package devices

import (
	"fmt"
	"strings"
	"time"

	"github.com/gosnmp/gosnmp"
)

// NewSNMPClient 按设备档案（列字段 + tags.snmp_config）构造未连接的 gosnmp 客户端，
// 供 logs 等包对设备做 SNMP 读取时复用同一套凭据解析，而不是各自再解析一遍 tags。
// v1/v2c 缺 community 直接报错；v3 的用户名与口令来自 tags。调用方负责 Connect/Close。
func NewSNMPClient(
	ipAddress string,
	snmpCommunity *string,
	snmpVersion *string,
	snmpPort *int,
	tags interface{},
) (*gosnmp.GoSNMP, error) {
	ip := strings.TrimSpace(ipAddress)
	if ip == "" {
		return nil, fmt.Errorf("device ip required")
	}
	config := resolveSNMPConfig(snmpCommunity, snmpVersion, snmpPort, tags)
	if config.version == "1" || config.version == "2c" {
		if strings.TrimSpace(config.community) == "" {
			return nil, fmt.Errorf("SNMP community not configured")
		}
	}
	return newSNMPTarget(ip, config), nil
}

// SNMPWalkAll 遍历子树。SNMPv1 没有 GETBULK（gosnmp 会直接报错），退回逐条 GETNEXT。
func SNMPWalkAll(client *gosnmp.GoSNMP, rootOID string) ([]gosnmp.SnmpPDU, error) {
	if client == nil {
		return nil, fmt.Errorf("snmp client is nil")
	}
	if client.Version == gosnmp.Version1 {
		return client.WalkAll(rootOID)
	}
	return client.BulkWalkAll(rootOID)
}

// newSNMPTarget 由已解析的配置构造客户端。
// 超时/重试与 probe.go 的探测保持一致：二者面对同一批设备，参数不一致会出现
// 「探测失败而采集成功」的矛盾表现。
func newSNMPTarget(ipAddress string, config snmpConfig) *gosnmp.GoSNMP {
	target := &gosnmp.GoSNMP{
		Target:  ipAddress,
		Port:    config.port,
		Timeout: 5 * time.Second,
		Retries: 2,
	}

	switch config.version {
	case "1":
		target.Version = gosnmp.Version1
		target.Community = config.community
	case "2c":
		target.Version = gosnmp.Version2c
		target.Community = config.community
	case "3":
		target.Version = gosnmp.Version3
		target.SecurityModel = gosnmp.UserSecurityModel
		target.MsgFlags = config.securityLevel
		target.SecurityParameters = &gosnmp.UsmSecurityParameters{
			UserName:                 config.username,
			AuthenticationProtocol:   config.authProtocol,
			AuthenticationPassphrase: config.authKey,
			PrivacyProtocol:          config.privProtocol,
			PrivacyPassphrase:        config.privKey,
		}
	}

	return target
}
