package settings_test

import (
	"testing"
	_ "unsafe"
)

//go:linkname parseRedisUptimeSeconds github.com/your-org/inspect-system/backend-go/internal/settings.parseRedisUptimeSeconds
func parseRedisUptimeSeconds(info string) (*int64, error)

//go:linkname normalizeUptimeSeconds github.com/your-org/inspect-system/backend-go/internal/settings.normalizeUptimeSeconds
func normalizeUptimeSeconds(value int64) *int64

func TestParseRedisUptimeSeconds(t *testing.T) {
	tests := []struct {
		name      string
		info      string
		want      *int64
		wantError bool
	}{
		{
			name: "解析成功",
			info: "# Server\nredis_version:7.2.0\nuptime_in_seconds:3600\n",
			want: int64Ptr(3600),
		},
		{
			name:      "缺少字段",
			info:      "# Server\nredis_version:7.2.0\n",
			wantError: true,
		},
		{
			name:      "字段为空",
			info:      "uptime_in_seconds:\n",
			wantError: true,
		},
		{
			name:      "字段非法",
			info:      "uptime_in_seconds:abc\n",
			wantError: true,
		},
		{
			name: "负值归一化为空",
			info: "uptime_in_seconds:-1\n",
			want: nil,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := parseRedisUptimeSeconds(testCase.info)
			if testCase.wantError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			assertInt64PtrEqual(t, testCase.want, got)
		})
	}
}

func TestNormalizeUptimeSeconds(t *testing.T) {
	tests := []struct {
		name  string
		input int64
		want  *int64
	}{
		{
			name:  "负值返回空",
			input: -1,
			want:  nil,
		},
		{
			name:  "零值保留",
			input: 0,
			want:  int64Ptr(0),
		},
		{
			name:  "正值保留",
			input: 123,
			want:  int64Ptr(123),
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			got := normalizeUptimeSeconds(testCase.input)
			assertInt64PtrEqual(t, testCase.want, got)
		})
	}
}

func assertInt64PtrEqual(t *testing.T, expected *int64, actual *int64) {
	t.Helper()
	if expected == nil || actual == nil {
		if expected != actual {
			t.Fatalf("expected %v, got %v", expected, actual)
		}
		return
	}
	if *expected != *actual {
		t.Fatalf("expected %d, got %d", *expected, *actual)
	}
}

func int64Ptr(value int64) *int64 {
	v := value
	return &v
}
