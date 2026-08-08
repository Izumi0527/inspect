package pdfkit

import (
	"fmt"
	"os"
	"strings"

	"github.com/phpdave11/gofpdf"
)

// Font family identifiers that callers pass to pdf.SetFont(name, style, size).
// They are registered by RegisterFonts and remain stable across the whole
// PDF rendering pipeline so refactors don't have to chase magic strings.
const (
	FontFamilyCJK   = "cjk"
	FontFamilyLatin = "latin"
)

// FontPaths captures the resolved on-disk locations of the CJK and Latin
// font files, regular and bold. Latin may be empty — RegisterFonts will alias
// the Latin family to the CJK file so SetFont(FontFamilyLatin, ...) keeps
// working. Bold paths always resolve (falling back to the regular file) so
// the "B" style never fails, it just may not look heavier than regular.
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
// If no CJK font is found anywhere, an error is returned — every report
// produced by this codebase contains Chinese text, so a missing CJK face
// is a fatal config issue and should be surfaced immediately.
func ResolveFontPaths() (FontPaths, error) {
	cjkOverrides := []string{
		envOverride("REPORT_PDF_FONT_CJK_PATH"),
		envOverride("REPORT_PDF_FONT_PATH"),
	}
	cjk, err := pickFirstExisting(append(cjkOverrides, cjkCandidates()...)...)
	if err != nil {
		return FontPaths{}, fmt.Errorf("未找到可用的PDF中文字体，请设置 REPORT_PDF_FONT_CJK_PATH: %w", err)
	}

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
	pdf.AddUTF8Font(FontFamilyCJK, "", paths.CJK)
	pdf.AddUTF8Font(FontFamilyCJK, "B", paths.CJKBold)

	latin := paths.Latin
	if strings.TrimSpace(latin) == "" {
		// Without a dedicated Latin face we fall back to the CJK font so
		// SetFont(FontFamilyLatin, ...) calls remain valid.
		latin = paths.CJK
	}
	latinBold := paths.LatinBold
	if strings.TrimSpace(latinBold) == "" {
		latinBold = latin
	}
	pdf.AddUTF8Font(FontFamilyLatin, "", latin)
	pdf.AddUTF8Font(FontFamilyLatin, "B", latinBold)
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
// "not supported". If a host only has .ttc fonts (e.g. macOS PingFang),
// operators must extract a .ttf face and point REPORT_PDF_FONT_CJK_PATH
// at it. Order matters — earlier entries win when both exist.
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

		// Linux — WenQuanYi MicroHei / ZenHei ship as .ttc on most
		// distros; we still list a few common .ttf locations that some
		// minimal images expose. Production deployments should install
		// fonts-noto-cjk and convert NotoSansCJK to .ttf, then use
		// REPORT_PDF_FONT_CJK_PATH to point here.
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
