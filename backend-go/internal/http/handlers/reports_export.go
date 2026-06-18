package handlers

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

var safeReportFilenamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)

func isSafeReportFilename(filename string) bool {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return false
	}
	if filepath.VolumeName(filename) != "" {
		// Windows 盘符/UNC 路径等均拒绝，避免 filepath.Join 被绝对路径覆盖。
		return false
	}
	if strings.ContainsAny(filename, `/\`) {
		return false
	}
	if strings.Contains(filename, "..") {
		return false
	}
	if filepath.Base(filename) != filename {
		return false
	}
	return safeReportFilenamePattern.MatchString(filename)
}

func (h ReportsHandler) ExportExcel(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	var req struct {
		Title  string `json:"title"`
		Sheets []struct {
			Name    string                   `json:"name"`
			Data    []map[string]interface{} `json:"data"`
			Columns []struct {
				Header string `json:"header"`
				Key    string `json:"key"`
			} `json:"columns"`
		} `json:"sheets"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if strings.TrimSpace(h.OutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	if err := os.MkdirAll(h.OutputDir, 0o755); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create output dir")
	}

	filename := fmt.Sprintf("export-%s.csv", time.Now().UTC().Format("20060102-150405"))
	fullPath := filepath.Join(h.OutputDir, filename)

	file, err := os.Create(fullPath)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create export file")
	}
	defer file.Close()

	if _, err := file.Write([]byte("\xEF\xBB\xBF")); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to write export file")
	}

	writer := csv.NewWriter(file)
	for _, sheet := range req.Sheets {
		if sheet.Name != "" {
			_ = writer.Write([]string{sheet.Name})
		}
		headers := make([]string, 0, len(sheet.Columns))
		keys := make([]string, 0, len(sheet.Columns))
		for _, col := range sheet.Columns {
			headers = append(headers, col.Header)
			keys = append(keys, col.Key)
		}
		if len(headers) > 0 {
			_ = writer.Write(headers)
		}
		for _, row := range sheet.Data {
			values := make([]string, 0, len(keys))
			for _, key := range keys {
				values = append(values, fmt.Sprint(row[key]))
			}
			_ = writer.Write(values)
		}
		_ = writer.Write([]string{})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to write export file")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"download_url": buildDownloadURL(filename),
		},
	})
}

func (h ReportsHandler) ExportPDF(c echo.Context) error {
	return h.exportTextBased(c, "pdf")
}

func (h ReportsHandler) ExportWord(c echo.Context) error {
	return h.exportTextBased(c, "word")
}

func (h ReportsHandler) exportTextBased(c echo.Context, format string) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		Sections []struct {
			Title   string `json:"title"`
			Content string `json:"content"`
			Type    string `json:"type"`
		} `json:"sections"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	if strings.TrimSpace(h.OutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	if err := os.MkdirAll(h.OutputDir, 0o755); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create output dir")
	}

	ext := "txt"
	if format == "pdf" {
		ext = "pdf"
	} else if format == "word" {
		ext = "doc"
	}

	filename := fmt.Sprintf("export-%s.%s", time.Now().UTC().Format("20060102-150405"), ext)
	fullPath := filepath.Join(h.OutputDir, filename)

	builder := &strings.Builder{}
	builder.WriteString(req.Title)
	builder.WriteString("\n\n")
	if req.Content != "" {
		builder.WriteString(req.Content)
		builder.WriteString("\n\n")
	}
	for _, section := range req.Sections {
		if section.Title != "" {
			builder.WriteString(section.Title)
			builder.WriteString("\n")
		}
		if section.Content != "" {
			builder.WriteString(section.Content)
			builder.WriteString("\n")
		}
		builder.WriteString("\n")
	}

	if err := os.WriteFile(fullPath, []byte(builder.String()), 0o644); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create export file")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"download_url": buildDownloadURL(filename),
		},
	})
}
