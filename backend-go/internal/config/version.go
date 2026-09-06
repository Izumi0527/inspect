package config

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// 本文件集中管理应用版本的解析逻辑。版本权威源是仓库根 VERSION 文件，
// 解析按以下优先级回退（见 Load）：
//  1. 运行时环境变量 APP_VERSION（显式覆盖，如 Docker development 阶段）；
//  2. buildInjectedVersion——正式分发链路（build-release / build-installer /
//     deploy / upgrade / Docker）在构建时经 ldflags 注入的值，描述**二进制本身**；
//  3. 运行目录向上查找 VERSION 文件——裸 go run / go build（无构建注入）时
//     从源码仓库动态获取，bump 版本无需改任何代码；
//  4. defaultAppVersion 编译期兜底——仅在 2/3 均未命中（如独立二进制在仓库外
//     运行）时展示。其值必须与仓库根 VERSION 一致，由 tests/backend-go 的
//     版本一致性契约测试守护，漏改会在 go test 阶段失败。

// defaultAppVersion 为编译期兜底版本号，语义见文件头注释。
var defaultAppVersion = "1.1.5"

// buildInjectedVersion 由构建脚本经 ldflags 注入，空串表示「本次构建未注入」。
// 与 defaultAppVersion 分离是为了能可靠区分「构建注入的真版本」与「源码兜底值」：
// 若共用一个变量，注入值恰好等于兜底值时无从判别，升级脚本以 /health 的
// 版本与源码 VERSION 对比来检测未完成升级的语义也会被破坏。
var buildInjectedVersion = ""

// versionFilePattern 要求 VERSION 文件内容为严格的 x.y.z 形式，
// 防止向上查找时误读仓库里同名但不合规范的文件。
var versionFilePattern = regexp.MustCompile(`^\d+\.\d+\.\d+$`)

// findVersionFileUpwards 从 startDir 起向上最多 8 级查找 VERSION 文件。
// 仅在构建未注入版本时被调用（裸 go run / go build 场景，工作目录通常在
// 仓库内），内容须匹配 x.y.z 才采用；找不到或内容不合法返回空串，
// 由调用方落到 defaultAppVersion 编译期兜底。
func findVersionFileUpwards(startDir string) string {
	dir, err := filepath.Abs(startDir)
	if err != nil {
		return ""
	}
	for range 8 {
		if data, err := os.ReadFile(filepath.Join(dir, "VERSION")); err == nil {
			if v := strings.TrimSpace(string(data)); versionFilePattern.MatchString(v) {
				return v
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}

// resolveAppVersion 按文件头注释的优先级解析版本号，envVersion 为运行时
// 环境变量 APP_VERSION 的值（可能为空）。工作目录用于未注入时的文件查找。
func resolveAppVersion(envVersion, workDir string) string {
	if v := strings.TrimSpace(envVersion); v != "" {
		return v
	}
	if v := strings.TrimSpace(buildInjectedVersion); v != "" {
		return v
	}
	if v := findVersionFileUpwards(workDir); v != "" {
		return v
	}
	return defaultAppVersion
}
