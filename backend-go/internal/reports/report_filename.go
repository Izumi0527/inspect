package reports

import (
	"fmt"
	"strings"
	"time"
	"unicode"
)

// BuildInspectionReportFileName 生成面向用户的下载文件名：
// 巡检报告_<执行名称>_<本地时间 yyyyMMdd_HHmmss>.<扩展名>。
// 执行名称中的路径分隔符、Windows 保留字符、空白与控制字符统一替换为 "_"；
// 磁盘上的物理文件名另由 GenerateReportFile 生成（ASCII 安全），两者互不影响。
func BuildInspectionReportFileName(executionName string, at time.Time, format string) string {
	ext := reportFileExtension(normalizeFormat(format))
	stamp := at.Local().Format("20060102_150405")
	name := sanitizeFileNamePart(executionName)
	if name == "" {
		return fmt.Sprintf("巡检报告_%s.%s", stamp, ext)
	}
	return fmt.Sprintf("巡检报告_%s_%s.%s", name, stamp, ext)
}

func sanitizeFileNamePart(value string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(value) {
		if unicode.IsSpace(r) || unicode.IsControl(r) || strings.ContainsRune(`\/:*?"<>|`, r) {
			b.WriteRune('_')
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
