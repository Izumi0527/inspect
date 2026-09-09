package scheduler_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// alertIdentityFromLog 是调度器把采集到的告警日志转成告警时提取 Trap 标识的纯函数：
// 此前 convertLogsToAlerts 传空 trapOID，同设备同分类的所有 warning 日志被合并成一条告警，
// 标题无 OID，前端词典无法识别是哪条告警。
//
//go:linkname alertIdentityFromLog github.com/your-org/inspect-system/backend-go/internal/scheduler.alertIdentityFromLog
func alertIdentityFromLog(message string, facility string) (string, string)

func TestAlertIdentityFromLog_ShouldExtractOIDAndCatalogFacility(t *testing.T) {
	cases := []struct {
		name         string
		message      string
		facility     string
		wantOID      string
		wantFacility string
	}{
		{
			name:         "SSH trapbuffer 行：OID 命中知识库，设施按知识库（hardware）",
			message:      "SRM/2/BOARDFAIL: OID 1.3.6.1.4.1.2011.5.25.219.2.2.3 Board failed.(EntityPhysicalIndex=67108873)",
			facility:     "system",
			wantOID:      "1.3.6.1.4.1.2011.5.25.219.2.2.3",
			wantFacility: "hardware",
		},
		{
			name:         "SNMP 轮询 Trap：linkDown 保持 interface",
			message:      "SNMP Trap 1.3.6.1.6.3.1.1.5.3 | ifIndex.12=12; ifOperStatus.12=down(2)",
			facility:     "interface",
			wantOID:      "1.3.6.1.6.3.1.1.5.3",
			wantFacility: "interface",
		},
		{
			name:         "活动告警：OID 未收录时保留日志设施",
			message:      "Active alarm 1.3.6.1.4.1.99999.9.9.9.9 | para",
			facility:     "security",
			wantOID:      "1.3.6.1.4.1.99999.9.9.9.9",
			wantFacility: "security",
		},
		{
			name:         "IP 地址不是 OID",
			message:      "Failed to login. (IpAddress=192.168.20.100, UserName=admin)",
			facility:     "security",
			wantOID:      "",
			wantFacility: "security",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			oid, facility := alertIdentityFromLog(tc.message, tc.facility)
			if oid != tc.wantOID || facility != tc.wantFacility {
				t.Fatalf("got (%q,%q), want (%q,%q)", oid, facility, tc.wantOID, tc.wantFacility)
			}
		})
	}
}
