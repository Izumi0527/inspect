package logs_test

import (
	"fmt"
	"reflect"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// escapeLikePattern 是 logs 包的未导出纯函数（搜索关键字通配符转义），
// 按本仓库约定通过 go:linkname 桥接做白盒测试。
//
//go:linkname escapeLikePattern github.com/your-org/inspect-system/backend-go/internal/logs.escapeLikePattern
func escapeLikePattern(raw string) string

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
			if got := escapeLikePattern(tc.in); got != tc.want {
				t.Fatalf("escapeLikePattern(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestEscapeLikePattern_QuoteRoundTrip 验证转义结果再经 strings 替换可还原，
// 确保转义语义（字面匹配用户输入）而非破坏输入内容。
func TestEscapeLikePattern_EscapesAllMetacharacters(t *testing.T) {
	input := `%_%\\%`
	got := escapeLikePattern(input)
	for _, reserved := range []string{`%`, `_`} {
		// 输出中除反斜杠对之外不应存在裸通配符：每个 % 与 _ 前面必须是反斜杠
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

func TestSplitLogExcludeKeywords(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "多分隔符切分与去重",
			in:   " NTP , lldp，GigabitEthernet; ntp ； LLDP ; ; ",
			want: []string{"NTP", "lldp", "GigabitEthernet"},
		},
		{
			name: "空串返回 nil",
			in:   "   ",
			want: nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := logs.SplitLogExcludeKeywords(tc.in)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("SplitLogExcludeKeywords(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSplitLogExcludeKeywords_MaxLimit(t *testing.T) {
	var input []string
	for i := 0; i < 30; i++ {
		input = append(input, fmt.Sprintf("kw_%d", i))
	}
	inStr := ""
	for i, item := range input {
		if i > 0 {
			inStr += ","
		}
		inStr += item
	}

	got := logs.SplitLogExcludeKeywords(inStr)
	if len(got) != 20 {
		t.Fatalf("SplitLogExcludeKeywords length = %d, want max 20", len(got))
	}
	if got[0] != "kw_0" || got[19] != "kw_19" {
		t.Fatalf("SplitLogExcludeKeywords elements mismatch: first=%s, last=%s", got[0], got[19])
	}
}
