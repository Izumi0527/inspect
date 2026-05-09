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
	FontFamilyCJK    = "cjk"
	FontFamilyLatin  = "latin"
	FontFamilyLegacy = "report" // backwards-compat alias for pre-pdfkit code paths
)

// FontPaths captures the resolved on-disk locations of the CJK and Latin
// font files. Latin may be empty — RegisterFonts will alias the Latin family
// to the CJK file so SetFont(FontFamilyLatin, ...) keeps working.
type FontPaths struct {
	CJK   string
	Latin string
}

// ResolveFontPaths picks the best available CJK and (optionally) Latin fonts
// on the host. Resolution honors environment overrides:
//
//   - REPORT_PDF_FONT_CJK_PATH   (preferred, new)
//   - REPORT_PDF_FONT_PATH       (legacy single-font override, kept for
//     backwards compatibility with existing deployments)
//   - REPORT_PDF_FONT_LATIN_PATH (optional)
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

	latinOverrides := []string{envOverride("REPORT_PDF_FONT_LATIN_PATH")}
	latin, _ := pickFirstExisting(append(latinOverrides, latinCandidates()...)...)
	return FontPaths{CJK: cjk, Latin: latin}, nil
}

// RegisterFonts registers the resolved CJK and Latin families on the given
// gofpdf document, including bold variants. When no Latin font is available,
// the Latin family is aliased to the CJK font so callers can switch faces
// freely without runtime errors.
//
// The legacy "report" family is also registered as a CJK alias so any legacy
// callers that haven't migrated to FontFamilyCJK yet keep working during the
// transition. Once all SetFont sites have been migrated, the legacy alias
// can be dropped.
func RegisterFonts(pdf *gofpdf.Fpdf) error {
	paths, err := ResolveFontPaths()
	if err != nil {
		return err
	}
	pdf.AddUTF8Font(FontFamilyCJK, "", paths.CJK)
	pdf.AddUTF8Font(FontFamilyCJK, "B", paths.CJK)
	pdf.AddUTF8Font(FontFamilyLegacy, "", paths.CJK)
	pdf.AddUTF8Font(FontFamilyLegacy, "B", paths.CJK)
	if strings.TrimSpace(paths.Latin) != "" {
		pdf.AddUTF8Font(FontFamilyLatin, "", paths.Latin)
		pdf.AddUTF8Font(FontFamilyLatin, "B", paths.Latin)
	} else {
		// Without a dedicated Latin face we fall back to the CJK font so
		// SetFont(FontFamilyLatin, ...) calls remain valid.
		pdf.AddUTF8Font(FontFamilyLatin, "", paths.CJK)
		pdf.AddUTF8Font(FontFamilyLatin, "B", paths.CJK)
	}
	return nil
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
func cjkCandidates() []string {
	return []string{
		// Windows — SimHei / SimSun / Fang Song are the historical
		// preinstalled .ttf faces; msyh.ttc (YaHei) is intentionally
		// excluded because gofpdf cannot parse TTC files.
		`C:\Windows\Fonts\simhei.ttf`,
		`C:\Windows\Fonts\simfang.ttf`,
		`C:\Windows\Fonts\simkai.ttf`,
		`C:\Windows\Fonts\simsunb.ttf`,

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
