// Package assets 持有后端二进制内嵌的静态资源。
// 内嵌中文字体用于 PDF 报告生成的最终兜底：Windows、Ubuntu 和精简
// 容器缺少中文 .ttf 时直接从内存加载，无须临时文件或字体挂载。
// 系统字体可用时仍优先系统字体（见 pdfkit.ResolveFontPaths）。
package assets

import (
	_ "embed"
)

// NotoSansSC-Regular.ttf：思源黑体 Google Fonts 版（可变字体，默认实例 Regular），
// SIL Open Font License 1.1 授权，允许随软件再分发（许可证见 LICENSE-OFL.txt）。
//
//go:embed fonts/NotoSansSC-Regular.ttf
var embeddedNotoSansSC []byte

// EmbeddedNotoSansSC 返回内嵌中文字体的只读共享字节，调用方不得修改。
func EmbeddedNotoSansSC() []byte {
	return embeddedNotoSansSC
}
