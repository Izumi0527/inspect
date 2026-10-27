// Package assets 持有后端二进制内嵌的静态资源。
// 内嵌中文字体用于 PDF 报告生成：Windows、Ubuntu、macOS 和精简容器环境
// 均直接从内存加载，确保多端排版字形与字重（PingFang SC Medium + Bold）完全一致。
// 外部字体可通过 REPORT_PDF_FONT_*_PATH 自定义覆盖（见 pdfkit.ResolveFontPaths）。
package assets

import (
	_ "embed"
)

// NotoSansSC-Regular.ttf：macOS 苹方（PingFang SC Medium 500 字重，TrueType 轮廓），
//
//go:embed fonts/NotoSansSC-Regular.ttf
var embeddedNotoSansSC []byte

// PingFangSC-Bold.ttf：macOS 苹方粗体（PingFang SC Bold 700 字重，TrueType 轮廓）。
//
//go:embed fonts/PingFangSC-Bold.ttf
var embeddedCJKBold []byte

// EmbeddedNotoSansSC 返回内嵌常规中文字体（PingFang SC Medium）的只读共享字节，调用方不得修改。
func EmbeddedNotoSansSC() []byte {
	return embeddedNotoSansSC
}

// EmbeddedCJKBold 返回内嵌粗体中文字体（PingFang SC Bold）的只读共享字节，调用方不得修改。
func EmbeddedCJKBold() []byte {
	return embeddedCJKBold
}
