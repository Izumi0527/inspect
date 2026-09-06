package config_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

// 仓库级版本一致性契约：
//
// 版本权威源是仓库根 VERSION 文件（README 与各构建脚本共同声明）。分发链路
// （build-release / build-installer / deploy / upgrade）都在构建时把 VERSION
// 经 ldflags 注入 config.buildInjectedVersion，但存在三处「兜底值」需要人工
// 与 VERSION 保持同步，历史上已经漂移：
//   - backend-go/internal/config/version.go 的 defaultAppVersion（编译期最后兜底）
//   - frontend/package.json 的 version（前端仓库外独立构建的最后回退）
//   - installer/inspect.iss 的 AppVersion 默认 define（手工编译安装包兜底）
//
// 本测试读取仓库根 VERSION，断言三处兜底值与其一致——下次 bump 漏改时在
// go test ./... 阶段直接失败，而不是在 /health 与安装包元数据里静默失真。

// repoRoot 从测试二进制的运行目录（tests/backend-go/internal/config）向上定位仓库根。
func repoRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatalf("定位仓库根失败: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "VERSION")); err != nil {
		t.Fatalf("仓库根 VERSION 文件不存在（root=%s）: %v", root, err)
	}
	return root
}

func readRepoFile(t *testing.T, root, rel string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("读取 %s 失败: %v", rel, err)
	}
	return string(data)
}

func readCanonicalVersion(t *testing.T, root string) string {
	t.Helper()
	version := strings.TrimSpace(readRepoFile(t, root, "VERSION"))
	matched := regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(version)
	if !matched {
		t.Fatalf("VERSION 文件内容 %q 不是 x.y.z 形式", version)
	}
	return version
}

func TestVersionFallbacks_MatchRepoVERSION(t *testing.T) {
	root := repoRoot(t)
	want := readCanonicalVersion(t, root)

	t.Run("后端 defaultAppVersion 编译兜底", func(t *testing.T) {
		src := readRepoFile(t, root, "backend-go/internal/config/version.go")
		m := regexp.MustCompile(`var defaultAppVersion = "([^"]+)"`).FindStringSubmatch(src)
		if m == nil {
			t.Fatal("version.go 中未找到 defaultAppVersion 定义（结构变更时请同步本测试）")
		}
		if m[1] != want {
			t.Fatalf("defaultAppVersion = %q, want %q（仓库根 VERSION）。请同步更新", m[1], want)
		}
	})

	t.Run("构建注入哨兵默认为空", func(t *testing.T) {
		src := readRepoFile(t, root, "backend-go/internal/config/version.go")
		m := regexp.MustCompile(`var buildInjectedVersion = "([^"]*)"`).FindStringSubmatch(src)
		if m == nil {
			t.Fatal("version.go 中未找到 buildInjectedVersion 定义")
		}
		if m[1] != "" {
			t.Fatalf("buildInjectedVersion = %q, want 空串：该变量只能由构建脚本经 ldflags 注入，源码里不得写死版本", m[1])
		}
	})

	t.Run("前端 package.json version 回退", func(t *testing.T) {
		var pkg struct {
			Version string `json:"version"`
		}
		if err := json.Unmarshal([]byte(readRepoFile(t, root, "frontend/package.json")), &pkg); err != nil {
			t.Fatalf("解析 frontend/package.json 失败: %v", err)
		}
		if pkg.Version != want {
			t.Fatalf("package.json version = %q, want %q（仓库根 VERSION）。该值是前端仓库外独立构建时的最后回退，请同步更新", pkg.Version, want)
		}
	})

	t.Run("安装包 AppVersion 默认 define", func(t *testing.T) {
		src := readRepoFile(t, root, "installer/inspect.iss")
		m := regexp.MustCompile(`#define AppVersion "([^"]+)"`).FindStringSubmatch(src)
		if m == nil {
			t.Fatal("inspect.iss 中未找到 AppVersion 默认 define")
		}
		if m[1] != want {
			t.Fatalf("inspect.iss AppVersion = %q, want %q（仓库根 VERSION）。正常构建由 build-installer 经 /DAppVersion 覆盖，此默认值仅兜底手工编译，请同步更新", m[1], want)
		}
	})
}

// ---------------------------------------------------------------------------
// 版本回退链行为单测（未导出符号经 go:linkname 桥接，沿用本仓库约定）
// ---------------------------------------------------------------------------

//go:linkname findVersionFileUpwards github.com/your-org/inspect-system/backend-go/internal/config.findVersionFileUpwards
func findVersionFileUpwards(startDir string) string

//go:linkname resolveAppVersion github.com/your-org/inspect-system/backend-go/internal/config.resolveAppVersion
func resolveAppVersion(envVersion, workDir string) string

//go:linkname buildInjectedVersionForTest github.com/your-org/inspect-system/backend-go/internal/config.buildInjectedVersion
var buildInjectedVersionForTest string

//go:linkname defaultAppVersionForTest github.com/your-org/inspect-system/backend-go/internal/config.defaultAppVersion
var defaultAppVersionForTest string

func TestFindVersionFileUpwards(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "VERSION"), []byte("9.9.9\n"), 0o644); err != nil {
		t.Fatalf("写 VERSION: %v", err)
	}
	deep := filepath.Join(root, "a", "b", "c")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatalf("建目录: %v", err)
	}

	if got := findVersionFileUpwards(deep); got != "9.9.9" {
		t.Fatalf("嵌套目录查找 = %q, want 9.9.9", got)
	}

	// 内容非 x.y.z 的 VERSION 不采用
	if err := os.WriteFile(filepath.Join(root, "VERSION"), []byte("not-a-version"), 0o644); err != nil {
		t.Fatalf("重写 VERSION: %v", err)
	}
	if got := findVersionFileUpwards(deep); got != "" {
		t.Fatalf("非法内容 = %q, want 空串", got)
	}

	// 无 VERSION 文件：隔离临时目录向上查找不应命中任何文件
	if got := findVersionFileUpwards(t.TempDir()); got != "" {
		t.Fatalf("无文件 = %q, want 空串", got)
	}
}

func TestResolveAppVersion_Priority(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "VERSION"), []byte("2.0.0"), 0o644); err != nil {
		t.Fatalf("写 VERSION: %v", err)
	}
	deep := filepath.Join(root, "sub")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatalf("建目录: %v", err)
	}

	origInjected := buildInjectedVersionForTest
	defer func() { buildInjectedVersionForTest = origInjected }()

	// 1. 运行时环境变量优先
	buildInjectedVersionForTest = "3.0.0"
	if got := resolveAppVersion("1.2.3", deep); got != "1.2.3" {
		t.Fatalf("env 分支 = %q, want 1.2.3（环境变量优先级最高）", got)
	}
	// 2. 构建注入优先于 VERSION 文件（版本描述二进制本身）
	if got := resolveAppVersion("", deep); got != "3.0.0" {
		t.Fatalf("注入分支 = %q, want 3.0.0（构建注入优先于文件）", got)
	}
	// 3. 未注入：向上查找 VERSION 文件（开发裸跑动态同步）
	buildInjectedVersionForTest = ""
	if got := resolveAppVersion("", deep); got != "2.0.0" {
		t.Fatalf("文件分支 = %q, want 2.0.0（裸跑读仓库 VERSION）", got)
	}
	// 4. 全未命中：编译期兜底
	if got := resolveAppVersion("", t.TempDir()); got != defaultAppVersionForTest {
		t.Fatalf("兜底分支 = %q, want %q", got, defaultAppVersionForTest)
	}
}

// 防御性检查：config 包必须对外暴露 AppVersion 字段（供 /health 与设置页消费）
func TestConfigAppVersionFieldExists(t *testing.T) {
	var cfg config.Config
	cfg.AppVersion = "probe"
	if cfg.AppVersion != "probe" {
		t.Fatal("AppVersion 字段不可写")
	}
}
