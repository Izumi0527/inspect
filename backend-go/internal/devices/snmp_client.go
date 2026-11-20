package devices

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
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

// defaultSNMPMaxRepetitions 限制单次 GETBULK 返回行数，避免部分华为交换机大批量响应触发超时或分片丢失。
const defaultSNMPMaxRepetitions = 10

type resilientSNMPClient struct {
	ctx    context.Context
	target *gosnmp.GoSNMP
}

func newResilientSNMPClient(target *gosnmp.GoSNMP) snmpClient {
	return newResilientSNMPClientWithContext(nil, target)
}

func newResilientSNMPClientWithContext(ctx context.Context, target *gosnmp.GoSNMP) snmpClient {
	if target != nil && ctx != nil {
		target.Context = ctx
	}
	return &resilientSNMPClient{ctx: ctx, target: target}
}

func (c *resilientSNMPClient) Get(oids []string) (*gosnmp.SnmpPacket, error) {
	if c == nil || c.target == nil {
		return nil, fmt.Errorf("snmp target is nil")
	}
	if c.ctx != nil && c.ctx.Err() != nil {
		return nil, c.ctx.Err()
	}
	return c.target.Get(oids)
}

func (c *resilientSNMPClient) BulkWalkAll(oid string) ([]gosnmp.SnmpPDU, error) {
	if c == nil || c.target == nil {
		return nil, fmt.Errorf("snmp target is nil")
	}
	if c.ctx != nil && c.ctx.Err() != nil {
		return nil, c.ctx.Err()
	}
	if c.target.Version == gosnmp.Version1 {
		return c.target.WalkAll(oid)
	}
	pdus, err := c.target.BulkWalkAll(oid)
	if err == nil {
		return pdus, nil
	}
	if c.ctx != nil && c.ctx.Err() != nil {
		return nil, c.ctx.Err()
	}
	// 仅对协议/GETBULK 兼容错误降级 WalkAll；网络超时或 USM 鉴权失败直接返回，避免 2x 超时放大。
	if !shouldFallbackToWalkAll(err) {
		return nil, err
	}
	return c.target.WalkAll(oid)
}

func shouldFallbackToWalkAll(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return false
	}
	lower := strings.ToLower(err.Error())
	nonFallbackSignals := []string{
		"timeout",
		"timed out",
		"connection refused",
		"network is unreachable",
		"no route to host",
		"context canceled",
		"deadline exceeded",
		"authentication",
		"unknown user",
		"usm",
		"decryption",
		"wrong digest",
		"authorization",
	}
	for _, signal := range nonFallbackSignals {
		if strings.Contains(lower, signal) {
			return false
		}
	}
	return true
}

// newSNMPTarget 由已解析的配置构造客户端。
// 超时/重试与 probe.go 的探测保持一致：二者面对同一批设备，参数不一致会出现
// 「探测失败而采集成功」的矛盾表现。
func newSNMPTarget(ipAddress string, config snmpConfig) *gosnmp.GoSNMP {
	target := &gosnmp.GoSNMP{
		Target:         ipAddress,
		Port:           config.port,
		Timeout:        5 * time.Second,
		Retries:        2,
		MaxRepetitions: defaultSNMPMaxRepetitions,
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
