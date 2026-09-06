package reports_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/golang/freetype/truetype"
	"github.com/phpdave11/gofpdf"

	"github.com/your-org/inspect-system/backend-go/assets"
	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

func renderWithFontPaths(t *testing.T, paths pdfkit.FontPaths) []byte {
	t.Helper()
	pdf := gofpdf.New("P", "mm", "A4", "")
	if err := pdfkit.RegisterFontsWithPaths(pdf, paths); err != nil {
		t.Fatalf("注册字体失败: %v", err)
	}
	pdf.AddPage()
	for _, face := range []struct{ family, style string }{
		{pdfkit.FontFamilyCJK, ""},
		{pdfkit.FontFamilyCJK, "B"},
		{pdfkit.FontFamilyLatin, ""},
		{pdfkit.FontFamilyLatin, "B"},
	} {
		pdf.SetFont(face.family, face.style, 14)
		pdf.CellFormat(0, 10, "网络设备巡检报告 2026 CPU 99.8%", "", 1, "L", false, 0, "")
	}
	var output bytes.Buffer
	if err := pdf.Output(&output); err != nil {
		t.Fatalf("生成中文 PDF 失败: %v", err)
	}
	raw := output.Bytes()
	if !bytes.HasPrefix(raw, []byte("%PDF-")) || !bytes.Contains(raw, []byte("/ToUnicode")) || len(raw) < 1024 {
		t.Fatalf("输出缺少有效 PDF 或 Unicode 字体映射，文件大小 %d", len(raw))
	}
	return raw
}

func TestRegisterFontsWithPaths_EmbeddedFallbackDoesNotDependOnTempFiles(t *testing.T) {
	for _, scenario := range []string{"临时目录不存在", "临时目录不可用", "遗留缓存内容损坏"} {
		t.Run(scenario, func(t *testing.T) {
			root := t.TempDir()
			tempPath := filepath.Join(root, "font-temp")
			var corruptPath string
			var corrupt []byte
			switch scenario {
			case "临时目录不可用":
				if err := os.WriteFile(tempPath, []byte("此处是文件而非目录"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "遗留缓存内容损坏":
				corruptPath = filepath.Join(tempPath, "inspect-pdf-fonts", "NotoSansSC-Regular.ttf")
				if err := os.MkdirAll(filepath.Dir(corruptPath), 0o755); err != nil {
					t.Fatal(err)
				}
				corrupt = make([]byte, len(assets.EmbeddedNotoSansSC()))
				copy(corrupt, []byte("BAD!"))
				if err := os.WriteFile(corruptPath, corrupt, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			// 同时覆盖 Windows 和 Ubuntu 的临时目录环境变量。
			for _, key := range []string{"TMP", "TEMP", "TMPDIR"} {
				t.Setenv(key, tempPath)
			}
			// 所有外部字体均缺失时，四个字面仍必须能够渲染中文。
			renderWithFontPaths(t, pdfkit.FontPaths{})
			renderWithFontPaths(t, pdfkit.FontPaths{})
			if scenario == "临时目录不存在" {
				if _, err := os.Stat(tempPath); !os.IsNotExist(err) {
					t.Fatalf("内存字体渲染不应创建临时目录，stat error = %v", err)
				}
			}
			if corruptPath != "" {
				actual, err := os.ReadFile(corruptPath)
				if err != nil || !bytes.Equal(actual, corrupt) {
					t.Fatalf("渲染不应覆盖遗留字体缓存: %v", err)
				}
			}
		})
	}
}

func TestRegisterFontsWithPaths_MissingFacesReuseConfiguredCJK(t *testing.T) {
	path := filepath.Join(t.TempDir(), "custom.ttf")
	if err := os.WriteFile(path, assets.EmbeddedNotoSansSC(), 0o600); err != nil {
		t.Fatal(err)
	}
	renderWithFontPaths(t, pdfkit.FontPaths{CJK: path})
}

func TestRegisterFontsWithPaths_ReturnsFontLoadError(t *testing.T) {
	for _, scenario := range []string{"路径不存在", "文件不是字体"} {
		t.Run(scenario, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "invalid.ttf")
			if scenario == "文件不是字体" {
				if err := os.WriteFile(path, []byte("BAD!invalid-font-data"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			pdf := gofpdf.New("P", "mm", "A4", "")
			if err := pdfkit.RegisterFontsWithPaths(pdf, pdfkit.FontPaths{CJK: path}); err == nil {
				t.Fatal("字体注册失败必须立即返回错误，不能仅设置 gofpdf 内部错误标志")
			}
		})
	}
}

func TestResolveFontPaths_PrefersConfiguredTTF(t *testing.T) {
	path := filepath.Join(t.TempDir(), "configured.ttf")
	if err := os.WriteFile(path, assets.EmbeddedNotoSansSC(), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{
		"REPORT_PDF_FONT_CJK_PATH", "REPORT_PDF_FONT_CJK_BOLD_PATH",
		"REPORT_PDF_FONT_LATIN_PATH", "REPORT_PDF_FONT_LATIN_BOLD_PATH",
	} {
		t.Setenv(key, path)
	}
	paths, err := pdfkit.ResolveFontPaths()
	if err != nil {
		t.Fatal(err)
	}
	if paths.CJK != path || paths.CJKBold != path || paths.Latin != path || paths.LatinBold != path {
		t.Fatalf("显式配置应优先于系统字体: %+v", paths)
	}
	raw, err := pdfkit.CJKFontBytes()
	if err != nil || !bytes.Equal(raw, assets.EmbeddedNotoSansSC()) {
		t.Fatalf("图表应读取相同的中文字体: %v", err)
	}
}

func TestEmbeddedFont_ContainsReportChineseGlyphs(t *testing.T) {
	font, err := truetype.Parse(assets.EmbeddedNotoSansSC())
	if err != nil {
		t.Fatalf("图表引擎无法解析内嵌字体: %v", err)
	}
	for _, char := range "网络设备巡检报告告警流量统计0123456789CPU%" {
		if font.Index(char) == 0 {
			t.Errorf("内嵌字体缺少字符 %q", char)
		}
	}
}
