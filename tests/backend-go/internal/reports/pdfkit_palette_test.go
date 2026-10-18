package reports_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/reports/pdfkit"
)

// The monitoring PDF charts must mirror the frontend's device color memory:
// DEVICE_SERIES_COLORS in frontend/src/features/monitoring/utils/monitoring.ts
// (cyan-600, sky-500, green-500, amber-500, red-500). This test pins the PDF
// end of that cross-end contract so a future palette edit cannot silently
// drift the two ends apart.
func TestDeviceSeriesPalette_MirrorsFrontendColors(t *testing.T) {
	want := []pdfkit.Color{
		{8, 145, 178},  // cyan-600  #0891B2
		{14, 165, 233}, // sky-500   #0EA5E9
		{34, 197, 94},  // green-500 #22C55E
		{245, 158, 11}, // amber-500 #F59E0B
		{239, 68, 68},  // red-500   #EF4444
	}
	got := pdfkit.DeviceSeriesPalette
	if len(got) != len(want) {
		t.Fatalf("DeviceSeriesPalette length = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("DeviceSeriesPalette[%d] = %v, want %v", i, got[i], want[i])
		}
	}
}

// Traffic chart colors carry fixed semantics on the page: outbound/up is green,
// inbound/down is sky (TRAFFIC_SERIES in InterfaceTrafficChart.tsx). The PDF
// must use the same pairing so a reader who learned the page colors can read
// the exported report without a legend translation.
func TestTrafficColors_MatchFrontendSemantics(t *testing.T) {
	if pdfkit.ColorGreen600 != (pdfkit.Color{22, 163, 74}) {
		t.Errorf("ColorGreen600 = %v, want {22,163,74} (#16A34A)", pdfkit.ColorGreen600)
	}
	if pdfkit.ColorSky600 != (pdfkit.Color{2, 132, 199}) {
		t.Errorf("ColorSky600 = %v, want {2,132,199} (#0284C7)", pdfkit.ColorSky600)
	}
	if pdfkit.ColorTrafficUp != pdfkit.ColorGreen600 {
		t.Errorf("ColorTrafficUp = %v, want green-600 %v", pdfkit.ColorTrafficUp, pdfkit.ColorGreen600)
	}
	if pdfkit.ColorTrafficDown != pdfkit.ColorSky600 {
		t.Errorf("ColorTrafficDown = %v, want sky-600 %v", pdfkit.ColorTrafficDown, pdfkit.ColorSky600)
	}
}

// The font ladder is the single source for every size drawn in PDFs. Values are
// pinned to the sizes actually in use before the unification, so tokenizing the
// call sites is a visual no-op.
func TestFontSizeTokens_PinCurrentLadder(t *testing.T) {
	cases := []struct {
		name string
		got  float64
		want float64
	}{
		{"FontCover", pdfkit.FontCover, 32},
		{"FontHero", pdfkit.FontHero, 22},
		{"FontTitle", pdfkit.FontTitle, 18},
		{"FontSection", pdfkit.FontSection, 14},
		{"FontH2", pdfkit.FontH2, 13},
		{"FontSubtitle", pdfkit.FontSubtitle, 12},
		{"FontBody", pdfkit.FontBody, 11},
		{"FontTableBody", pdfkit.FontTableBody, 10},
		{"FontTableHead", pdfkit.FontTableHead, 9.5},
		{"FontSmall", pdfkit.FontSmall, 9},
		{"FontCaption", pdfkit.FontCaption, 8.5},
		{"FontMicro", pdfkit.FontMicro, 8},
		{"FontNano", pdfkit.FontNano, 7.5},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s = %v, want %v", c.name, c.got, c.want)
		}
	}
}
