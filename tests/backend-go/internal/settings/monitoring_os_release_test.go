package settings_test

import (
	"testing"
	_ "unsafe"
)

//go:linkname parseOSRelease github.com/your-org/inspect-system/backend-go/internal/settings.parseOSRelease
func parseOSRelease(content string) (name string, version string)

// /etc/os-release 是 systemd 规范的发行版描述文件，gopsutil 在 Ubuntu 上只取 lsb-release 的
// DISTRIB_ID/DISTRIB_RELEASE（得到小写 "ubuntu" 与不含小版本的 "24.04"），
// 而 os-release 的 NAME/VERSION 才是与 Windows 产品名+构建号对等的人类可读信息。
func TestParseOSRelease(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		wantName    string
		wantVersion string
	}{
		{
			name: "Ubuntu 24.04 真实文件：取 NAME 与 VERSION 并去掉双引号",
			content: `PRETTY_NAME="Ubuntu 24.04.4 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.4 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
`,
			wantName:    "Ubuntu",
			wantVersion: "24.04.4 LTS (Noble Numbat)",
		},
		{
			name: "缺少 VERSION 时回退 VERSION_ID（Alpine 等）",
			content: `NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.19.1
PRETTY_NAME="Alpine Linux v3.19"
`,
			wantName:    "Alpine Linux",
			wantVersion: "3.19.1",
		},
		{
			name: "单引号、注释、空行与值中的等号均正确处理",
			content: `# generated
NAME='Rocky Linux'

VERSION='9.3 (Blue Onyx)'
BUG_REPORT_URL="https://bugs.rockylinux.org/?a=b"
`,
			wantName:    "Rocky Linux",
			wantVersion: "9.3 (Blue Onyx)",
		},
		{
			name:        "缺少 NAME 时返回空名（调用方应保留 gopsutil 值）",
			content:     "VERSION=\"1.0\"\nID=custom\n",
			wantName:    "",
			wantVersion: "1.0",
		},
		{
			name:        "空内容",
			content:     "",
			wantName:    "",
			wantVersion: "",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			gotName, gotVersion := parseOSRelease(testCase.content)
			if gotName != testCase.wantName {
				t.Fatalf("name = %q, want %q", gotName, testCase.wantName)
			}
			if gotVersion != testCase.wantVersion {
				t.Fatalf("version = %q, want %q", gotVersion, testCase.wantVersion)
			}
		})
	}
}
