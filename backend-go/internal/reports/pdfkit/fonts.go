package pdfkit

import (
	"encoding/binary"
	"fmt"
	"os"
	"strings"

	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/assets"
)

// Font family identifiers that callers pass to pdf.SetFont(name, style, size).
// They are registered by RegisterFonts and remain stable across the whole
// PDF rendering pipeline so refactors don't have to chase magic strings.
const (
	FontFamilyCJK   = "cjk"
	FontFamilyLatin = "latin"
)

// FontPaths 保存外部字体路径。CJK 为空表示从内存加载内嵌 Noto Sans SC；
// 缺失的中文粗体回退到中文常规体，拉丁常规体回退到中文常规体，
// 拉丁粗体回退到拉丁常规体。零值可直接用于没有系统字体的部署环境。
type FontPaths struct {
	CJK       string
	CJKBold   string
	Latin     string
	LatinBold string
}

// ResolveFontPaths picks the best available CJK and (optionally) Latin fonts
// on the host. Resolution honors environment overrides:
//
//   - REPORT_PDF_FONT_CJK_PATH        (preferred, new)
//   - REPORT_PDF_FONT_PATH            (legacy single-font override, kept for
//     backwards compatibility with existing deployments)
//   - REPORT_PDF_FONT_CJK_BOLD_PATH   (optional true-bold CJK face)
//   - REPORT_PDF_FONT_LATIN_PATH      (optional)
//   - REPORT_PDF_FONT_LATIN_BOLD_PATH (optional)
//
// 中文字体按环境变量、系统候选的顺序查找；均不存在时保留空路径，
// 注册时直接从内存使用内嵌字体。Windows、Ubuntu 24.04 和精简容器
// 共用此回退方式，不需要创建或复用临时字体文件。
func ResolveFontPaths() (FontPaths, error) {
	cjkOverrides := []string{
		envOverride("REPORT_PDF_FONT_CJK_PATH"),
		envOverride("REPORT_PDF_FONT_PATH"),
	}
	cjk, _ := pickFirstExisting(append(cjkOverrides, cjkCandidates()...)...)

	// Bold falls back to the regular face — rendering stays correct, the
	// headings just lose weight contrast on hosts without a bold CJK .ttf.
	cjkBoldOverrides := []string{envOverride("REPORT_PDF_FONT_CJK_BOLD_PATH")}
	cjkBold, boldErr := pickFirstExisting(append(cjkBoldOverrides, cjkBoldCandidates()...)...)
	if boldErr != nil {
		cjkBold = cjk
	}

	latinOverrides := []string{envOverride("REPORT_PDF_FONT_LATIN_PATH")}
	latin, _ := pickFirstExisting(append(latinOverrides, latinCandidates()...)...)

	latinBoldOverrides := []string{envOverride("REPORT_PDF_FONT_LATIN_BOLD_PATH")}
	latinBold, latinBoldErr := pickFirstExisting(append(latinBoldOverrides, latinBoldCandidates()...)...)
	if latinBoldErr != nil {
		latinBold = latin // may be empty; RegisterFonts handles the fallback chain
	}

	return FontPaths{CJK: cjk, CJKBold: cjkBold, Latin: latin, LatinBold: latinBold}, nil
}

// RegisterFonts registers the resolved CJK and Latin families on the given
// gofpdf document, including true bold variants when the host provides a
// bold face (e.g. Dengb.ttf next to Deng.ttf). When no Latin font is
// available, the Latin family is aliased to the CJK font so callers can
// switch faces freely without runtime errors.
func RegisterFonts(pdf *gofpdf.Fpdf) error {
	paths, err := ResolveFontPaths()
	if err != nil {
		return err
	}
	return RegisterFontsWithPaths(pdf, paths)
}

// RegisterFontsWithPaths 按给定路径注册四个字面，空路径使用内嵌字体。
// 字体解析失败立即返回错误，供报告处理器记录原因并终止本次生成。
func RegisterFontsWithPaths(pdf *gofpdf.Fpdf, paths FontPaths) error {
	cjk := strings.TrimSpace(paths.CJK)
	cjkBold := strings.TrimSpace(paths.CJKBold)
	if cjkBold == "" {
		cjkBold = cjk
	}
	latin := strings.TrimSpace(paths.Latin)
	if latin == "" {
		latin = cjk
	}
	latinBold := strings.TrimSpace(paths.LatinBold)
	if latinBold == "" {
		latinBold = latin
	}

	for _, face := range []struct{ family, style, path string }{
		{FontFamilyCJK, "", cjk},
		{FontFamilyCJK, "B", cjkBold},
		{FontFamilyLatin, "", latin},
		{FontFamilyLatin, "B", latinBold},
	} {
		// gofpdf.AddUTF8Font 内部用 path.Join(fontpath, file) 拼路径，Linux 绝对路径
		// 的前导 "/" 会被吃掉变成相对路径（Windows 的 C:\ 不含正斜杠故侥幸正常）。
		// 因此字体文件一律自己读成字节再注册，不把路径交给 gofpdf。
		raw, err := fontBytes(face.path)
		if err != nil {
			return err
		}
		// AddUTF8FontFromBytes 与 AddUTF8Font 不对称：字节入口解析失败只打印到
		// stdout、不设置错误标志，字体会静默缺席直到 SetFont 才报 "undefined font"。
		// 这里先校验 TrueType 头，再用 SetFont 探针确认字体确实已注册。
		if err := validateTrueTypeHeader(raw, face.path); err != nil {
			return err
		}
		pdf.AddUTF8FontFromBytes(face.family, face.style, raw)
		pdf.SetFont(face.family, face.style, 10)
		if err := pdf.Error(); err != nil {
			return fmt.Errorf("注册PDF字体 %s/%s 失败（%s）: %w", face.family, face.style, describeFontSource(face.path), err)
		}
	}
	return nil
}

// validateTrueTypeHeader 复刻 gofpdf 的头部判定：只接受 0x00010000 与 'true'，
// 拒绝 OTTO（.otf）、ttcf（.ttc）及任意非字体内容。
func validateTrueTypeHeader(raw []byte, path string) error {
	if len(raw) < 4 {
		return fmt.Errorf("PDF字体文件过短（%s）", describeFontSource(path))
	}
	tag := binary.BigEndian.Uint32(raw[:4])
	switch tag {
	case 0x00010000, 0x74727565: // 0x00010000 / 'true'
		return nil
	case 0x4F54544F, 0x74746366: // 'OTTO' / 'ttcf'
		return fmt.Errorf("PDF字体 %s 为 .otf/.ttc 格式，gofpdf 仅支持 .ttf", describeFontSource(path))
	default:
		return fmt.Errorf("PDF字体 %s 不是 TrueType 文件", describeFontSource(path))
	}
}

func describeFontSource(path string) string {
	if path == "" {
		return "内嵌 Noto Sans SC"
	}
	return path
}

// fontBytes 返回字体文件内容；空路径表示使用内嵌 Noto Sans SC。
func fontBytes(path string) ([]byte, error) {
	if path == "" {
		return assets.EmbeddedNotoSansSC(), nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取PDF字体 %s 失败: %w", path, err)
	}
	return raw, nil
}

// CJKFontBytes returns the raw bytes of the resolved CJK regular font.
// Chart rendering (go-chart) needs the font parsed via freetype/truetype —
// its built-in default (Roboto) has no CJK glyphs, so chart titles and
// labels written in Chinese would otherwise render as .notdef boxes.
func CJKFontBytes() ([]byte, error) {
	paths, err := ResolveFontPaths()
	if err != nil {
		return nil, err
	}
	return fontBytes(paths.CJK)
}

func envOverride(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

func pickFirstExisting(candidates ...string) (string, error) {
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("no font candidates exist on disk")
}

// cjkCandidates lists CJK font files that ship with common host operating
// systems. Only .ttf files are listed because gofpdf v1.4.3's UTF8 font
// loader (utf8fontfile.go:106) explicitly rejects .ttc (TrueType
// Collection) and .otf (PostScript-outlined OpenType) — see error
// "not supported". 只有 .ttc/.otf 的主机直接使用内嵌字体；需要自定义
// 字体时，再通过 REPORT_PDF_FONT_CJK_PATH 指向兼容的 .ttf。
// Order matters — earlier entries win when both exist.
//
// simsunb.ttf (SimSun-ExtB) MUST NOT be listed: it only covers the CJK
// Extension B block of rare ideographs and contains none of the common
// Chinese characters, so falling back to it would blank out every report.
func cjkCandidates() []string {
	return []string{
		// Windows — DengXian (等线) is the modern Office-default face
		// shipped since Windows 8.1 / Server 2016; it pairs with a true
		// bold (Dengb.ttf) and reads much lighter than SimHei for body
		// text. SimHei / FangSong / KaiTi remain as fallbacks for older
		// hosts. msyh.ttc (YaHei) is intentionally excluded because
		// gofpdf cannot parse TTC files.
		`C:\Windows\Fonts\Deng.ttf`,
		`C:\Windows\Fonts\simhei.ttf`,
		`C:\Windows\Fonts\simfang.ttf`,
		`C:\Windows\Fonts\simkai.ttf`,

		// Ubuntu 的文泉驿、Noto CJK 软件包常提供 .ttc，不能直接交给
		// gofpdf。仅探测兼容的 .ttf；没有这些文件时使用内嵌字体，
		// 无须额外安装字体包或从字体集合中提取字面。
		`/usr/share/fonts/truetype/wqy/wqy-microhei.ttf`,
		`/usr/share/fonts/truetype/wqy/wqy-zenhei.ttf`,
		`/usr/share/fonts/truetype/arphic/uming.ttf`,
		`/usr/share/fonts/truetype/arphic/ukai.ttf`,
	}
}

// cjkBoldCandidates lists true-bold CJK faces matching cjkCandidates. SimHei
// doubles as the bold fallback on hosts without DengXian Bold: it is a heavy
// monoline face, so headings still read heavier than a DengXian/FangSong
// regular body. Same .ttf-only constraint as cjkCandidates.
func cjkBoldCandidates() []string {
	return []string{
		`C:\Windows\Fonts\Dengb.ttf`,
		`C:\Windows\Fonts\simhei.ttf`,
		`/usr/share/fonts/truetype/wqy/wqy-zenhei.ttf`,
	}
}

// latinCandidates lists Latin-only sans-serif fonts preferred for numeric
// content (metric values, table cells with percentages, page numbers).
// Same .ttf-only constraint as CJK.
func latinCandidates() []string {
	return []string{
		`C:\Windows\Fonts\Inter-Regular.ttf`,
		`C:\Windows\Fonts\InterDisplay-Regular.ttf`,
		`C:\Windows\Fonts\arial.ttf`,
		`/usr/share/fonts/truetype/inter/Inter-Regular.ttf`,
		`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`,
		`/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf`,
	}
}

// latinBoldCandidates mirrors latinCandidates with the bold cuts.
func latinBoldCandidates() []string {
	return []string{
		`C:\Windows\Fonts\Inter-Bold.ttf`,
		`C:\Windows\Fonts\InterDisplay-Bold.ttf`,
		`C:\Windows\Fonts\arialbd.ttf`,
		`/usr/share/fonts/truetype/inter/Inter-Bold.ttf`,
		`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
		`/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf`,
	}
}
