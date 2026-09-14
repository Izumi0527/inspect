package devices

import (
	"regexp"
	"strings"
)

// 设备类型识别只产出台账已有的四个取值（与 normalizeDeviceType 对齐），
// 识别不出返回空串，由消费方退回用户填写的 device_type。
const (
	detectedTypeSwitch   = "switch"
	detectedTypeRouter   = "router"
	detectedTypeFirewall = "firewall"
	detectedTypeAP       = "ap"
)

// LLDP-MIB LldpSystemCapabilitiesMap 是 BITS 类型，bit0 在最高位：
// other(0)=0x80 repeater(1)=0x40 bridge(2)=0x20 wlanAccessPoint(3)=0x10 router(4)=0x08。
const (
	lldpCapBridge = 0x20
	lldpCapWLANAP = 0x10
	lldpCapRouter = 0x08
)

// sysServices(RFC 1213) 位图：bit1=数据链路层、bit2=网络层。
const (
	sysServicesL2 = 0x02
	sysServicesL3 = 0x04
)

// 防火墙没有标准能力位，只能靠产品线；按「token 前缀」匹配而非整段子串搜索，
// 避免 "pa-"、"asa" 这类短关键字在 sysDescr 长文本里误命中。
var firewallTokenPrefixes = []string{
	"usg", "eudemon", "secpath", "asa", "firepower", "fpr",
	"fortigate", "pa-", "srx", "ngfw", "firewall",
}

// 产品线关键字只匹配「型号首 token」（型号优先，缺失时取 sysDescr 首个空白分隔词）。
// 不能在整段 sysDescr 里搜 "Routing"：华为交换机 sysDescr 含 "Versatile Routing Platform"。
var (
	routerHeadPattern = regexp.MustCompile(`^(ar|ne|msr|sr|isr|asr)\d|^netengine`)
	switchHeadPattern = regexp.MustCompile(`^(s|ce|c9|c2|c3|ex|n9k)\d|^ws-c|^catalyst`)
	apHeadPattern     = regexp.MustCompile(`^(ap|wa)\d|^airengine`)
)

// classifyDeviceType 根据 SNMP 信号推断设备类型，信号优先级：
//  1. 防火墙产品线关键字（sysDescr / 型号）
//  2. LLDP 本地能力位（bridge / wlanAccessPoint / router）
//  3. 路由 / 交换 / AP 产品线关键字（型号首 token）
//  4. sysServices 位图（L2 → 交换机，仅 L3 → 路由器）
//
// 全部未命中返回空串，表示「不确定」；调用方不得把空串当作某种类型写库。
func classifyDeviceType(sysDescr string, model string, sysServices int, lldpCaps []byte) string {
	if matchesFirewallToken(sysDescr) || matchesFirewallToken(model) {
		return detectedTypeFirewall
	}

	if len(lldpCaps) > 0 {
		caps := lldpCaps[0]
		switch {
		case caps&lldpCapWLANAP != 0:
			return detectedTypeAP
		case caps&lldpCapBridge != 0:
			return detectedTypeSwitch
		case caps&lldpCapRouter != 0:
			return detectedTypeRouter
		}
	}

	head := modelHeadToken(sysDescr, model)
	switch {
	case head == "":
	case apHeadPattern.MatchString(head):
		return detectedTypeAP
	case routerHeadPattern.MatchString(head):
		return detectedTypeRouter
	case switchHeadPattern.MatchString(head):
		return detectedTypeSwitch
	}

	switch {
	case sysServices&sysServicesL2 != 0:
		return detectedTypeSwitch
	case sysServices&sysServicesL3 != 0:
		return detectedTypeRouter
	}
	return ""
}

func matchesFirewallToken(text string) bool {
	for _, token := range strings.Fields(strings.ToLower(text)) {
		for _, prefix := range firewallTokenPrefixes {
			if strings.HasPrefix(token, prefix) {
				return true
			}
		}
	}
	return false
}

// modelHeadToken 返回型号的首个空白分隔词（小写）；型号为空时退回 sysDescr 首词。
func modelHeadToken(sysDescr string, model string) string {
	if fields := strings.Fields(model); len(fields) > 0 {
		return strings.ToLower(fields[0])
	}
	if fields := strings.Fields(sysDescr); len(fields) > 0 {
		return strings.ToLower(fields[0])
	}
	return ""
}
