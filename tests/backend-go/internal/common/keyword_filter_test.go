package common_test

import (
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/common"
)

// 告警与日志共用同一套屏蔽关键字切分与 LIKE 转义规则，前端 utils/excludeKeywords.ts 必须与此逐条对齐。

func TestEscapeLikePattern(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"无特殊字符原样返回", "link up", "link up"},
		{"百分号转义", "100% up", `100\% up`},
		{"下划线转义", "port_1", `port\_1`},
		{"反斜杠转义", `a\b`, `a\\b`},
		{"混合转义", `100%_of_\link`, `100\%\_of\_\\link`},
		{"空字符串", "", ""},
		{"中文原样保留", "端口故障", "端口故障"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := common.EscapeLikePattern(tc.in); got != tc.want {
				t.Fatalf("EscapeLikePattern(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// 输出中除反斜杠对之外不应存在裸通配符：每个 % 与 _ 前面必须是反斜杠。
func TestEscapeLikePattern_EscapesAllMetacharacters(t *testing.T) {
	got := common.EscapeLikePattern(`%_%\\%`)
	for _, reserved := range []string{`%`, `_`} {
		for i := 0; i < len(got); i++ {
			if got[i] != reserved[0] {
				continue
			}
			if i == 0 || got[i-1] != '\\' {
				t.Fatalf("输出 %q 中存在未转义的通配符 %q", got, reserved)
			}
		}
	}
}

func TestSplitExcludeKeywords(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "支持中英文逗号与分号混合切分、去空与按小写去重",
			in:   " NTP , lldp，GigabitEthernet; ntp ； LLDP ; ; ",
			want: []string{"NTP", "lldp", "GigabitEthernet"},
		},
		{name: "空白字符串返回 nil", in: "   ", want: nil},
		{name: "只有分隔符返回 nil", in: "，，；", want: nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := common.SplitExcludeKeywords(tc.in)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("SplitExcludeKeywords(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSplitExcludeKeywords_MaxLimit(t *testing.T) {
	parts := make([]string, 0, 30)
	for i := 0; i < 30; i++ {
		parts = append(parts, fmt.Sprintf("kw_%d", i))
	}

	got := common.SplitExcludeKeywords(strings.Join(parts, ","))
	if len(got) != common.MaxExcludeKeywords || common.MaxExcludeKeywords != 20 {
		t.Fatalf("SplitExcludeKeywords length = %d, want max %d (=20)", len(got), common.MaxExcludeKeywords)
	}
	if got[0] != "kw_0" || got[19] != "kw_19" {
		t.Fatalf("SplitExcludeKeywords elements mismatch: first=%s, last=%s", got[0], got[19])
	}
}
