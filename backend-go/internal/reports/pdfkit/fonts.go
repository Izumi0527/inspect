package pdfkit

import (
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
		if face.path == "" {
			pdf.AddUTF8FontFromBytes(face.family, face.style, assets.EmbeddedNotoSansSC())
		} else {
			pdf.AddUTF8Font(face.family, face.style, face.path)
		}
		if err := pdf.Error(); err != nil {
			return err
		}
	}
	return nil
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
	if paths.CJK == "" {
		return assets.EmbeddedNotoSansSC(), nil
	}
	return os.ReadFile(paths.CJK)
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
