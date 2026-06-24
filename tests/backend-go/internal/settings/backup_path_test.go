package settings_test

import (
	"path/filepath"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

// 备份根目录内的相对路径应被接受并返回绝对路径。
func TestResolveBackupPath_AllowsWithinRoot(t *testing.T) {
	for _, in := range []string{"", "data/backups", "data/backups/nightly", "data/backups/sub/dir/f.json"} {
		got, err := settings.ResolveBackupPath(in)
		if err != nil {
			t.Fatalf("ResolveBackupPath(%q) 不应报错: %v", in, err)
		}
		if !filepath.IsAbs(got) {
			t.Fatalf("ResolveBackupPath(%q)=%q 应为绝对路径", in, got)
		}
	}
}

// 越界路径（.. 逃逸、绝对路径、盘符路径）应被拒绝。
func TestResolveBackupPath_RejectsEscape(t *testing.T) {
	cases := []string{
		"../../etc/passwd",
		"data/../../secret",
		"/etc/passwd",
		`C:\Windows\Temp`,
		"data/backups/../../x",
	}
	for _, in := range cases {
		if _, err := settings.ResolveBackupPath(in); err == nil {
			t.Fatalf("ResolveBackupPath(%q) 应拒绝越界路径", in)
		}
	}
}
