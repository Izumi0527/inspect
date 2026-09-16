package logs_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 日志来源值域 = 实际存在的写入通道（ssh / snmp / snmp_trap / syslog）。
// manual 没有任何写入点，不应再被当作合法来源保留在值域里。

//go:linkname normalizeSource github.com/your-org/inspect-system/backend-go/internal/logs.normalizeSource
func normalizeSource(value string) string

func TestNormalizeSource_ShouldOnlyAcceptRealChannels(t *testing.T) {
	for _, source := range []string{"ssh", "syslog", "snmp", "snmp_trap"} {
		if got := normalizeSource(source); got != source {
			t.Fatalf("normalizeSource(%q) = %q, want unchanged", source, got)
		}
	}
	if got := normalizeSource("manual"); got != "ssh" {
		t.Fatalf("manual 已无写入通道，应与未知值一样回落到默认 ssh，got %q", got)
	}
}
