package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestReportsHandler_ExportExcel_ShouldWriteUTF8BOMForChineseCSV(t *testing.T) {
	outputDir := t.TempDir()
	authService, token := newAuthServiceWithPermissions(t, []string{"reports:create"})
	handler := handlers.ReportsHandler{
		Auth:      authService,
		OutputDir: outputDir,
	}

	payload := map[string]interface{}{
		"title": "统计报表_中文编码验证",
		"sheets": []map[string]interface{}{
			{
				"name": "概览KPI",
				"data": []map[string]interface{}{
					{
						"metric": "在线率",
						"value":  "98.5%",
						"change": "+1.2%",
					},
				},
				"columns": []map[string]string{
					{"header": "指标", "key": "metric"},
					{"header": "数值", "key": "value"},
					{"header": "变化", "key": "change"},
				},
			},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/export/excel", token, body)

	if err := handler.ExportExcel(ctx); err != nil {
		t.Fatalf("ExportExcel() error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	files, err := filepath.Glob(filepath.Join(outputDir, "export-*.csv"))
	if err != nil {
		t.Fatalf("查找导出文件失败: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("期望生成 1 个 CSV 文件，实际=%d files=%v", len(files), files)
	}

	content, err := os.ReadFile(files[0])
	if err != nil {
		t.Fatalf("读取导出文件失败: %v", err)
	}

	utf8BOM := []byte{0xEF, 0xBB, 0xBF}
	if !bytes.HasPrefix(content, utf8BOM) {
		t.Fatalf("期望 CSV 以 UTF-8 BOM 开头，实际前三字节=%v 内容=%q", content[:min(len(content), 3)], string(content))
	}

	csvText := strings.TrimPrefix(string(content), string(utf8BOM))
	for _, want := range []string{"概览KPI", "指标", "数值", "变化", "在线率"} {
		if !strings.Contains(csvText, want) {
			t.Fatalf("期望 CSV 包含中文内容 %q，实际内容:\n%s", want, csvText)
		}
	}
}
