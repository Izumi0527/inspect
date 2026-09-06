package middleware_test

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"

	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

func TestRequestLogger_LogsFinalHTTPStatusAndLevel(t *testing.T) {
	for _, tc := range []struct {
		name          string
		err           error
		writtenStatus int
		wantStatus    int
		wantLevel     zapcore.Level
	}{
		{name: "成功", writtenStatus: 200, wantStatus: 200, wantLevel: zapcore.InfoLevel},
		{name: "重定向", writtenStatus: 302, wantStatus: 302, wantLevel: zapcore.InfoLevel},
		{name: "参数错误", err: echo.NewHTTPError(400), wantStatus: 400, wantLevel: zapcore.WarnLevel},
		{name: "未登录", err: echo.NewHTTPError(401), wantStatus: 401, wantLevel: zapcore.WarnLevel},
		{name: "权限不足", err: echo.NewHTTPError(403), wantStatus: 403, wantLevel: zapcore.WarnLevel},
		{name: "未找到", err: echo.NewHTTPError(404), wantStatus: 404, wantLevel: zapcore.WarnLevel},
		{name: "服务错误", err: echo.NewHTTPError(500).SetInternal(errors.New("字体读取失败")), wantStatus: 500, wantLevel: zapcore.ErrorLevel},
		{name: "普通错误", err: errors.New("生成失败"), wantStatus: 500, wantLevel: zapcore.ErrorLevel},
		{name: "包装错误沿用统一处理器语义", err: fmt.Errorf("wrapped: %w", echo.NewHTTPError(403)), wantStatus: 500, wantLevel: zapcore.ErrorLevel},
		{name: "直接写入客户端错误", writtenStatus: 422, wantStatus: 422, wantLevel: zapcore.WarnLevel},
		{name: "直接写入服务错误", writtenStatus: 503, wantStatus: 503, wantLevel: zapcore.ErrorLevel},
		{name: "已提交响应不被错误覆盖", writtenStatus: 202, err: errors.New("响应后错误"), wantStatus: 202, wantLevel: zapcore.InfoLevel},
	} {
		t.Run(tc.name, func(t *testing.T) {
			core, observed := observer.New(zapcore.DebugLevel)
			e := echo.New()
			errorHandlerCalls := 0
			e.HTTPErrorHandler = func(err error, c echo.Context) {
				errorHandlerCalls++
				mw.ErrorHandler(err, c)
			}
			var propagatedError error
			e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
				return func(c echo.Context) error {
					propagatedError = next(c)
					return propagatedError
				}
			})
			e.Use(mw.RequestLogger(zap.New(core)))
			e.GET("/report", func(c echo.Context) error {
				if tc.writtenStatus != 0 {
					if err := c.NoContent(tc.writtenStatus); err != nil {
						return err
					}
				}
				return tc.err
			})
			recorder := httptest.NewRecorder()
			e.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/report", nil))
			if recorder.Code != tc.wantStatus {
				t.Fatalf("响应状态 %d，期望 %d", recorder.Code, tc.wantStatus)
			}
			entries := observed.All()
			if len(entries) != 1 {
				t.Fatalf("请求日志数量 %d，期望 1", len(entries))
			}
			if got := entries[0].ContextMap()["status"]; got != int64(tc.wantStatus) {
				t.Errorf("日志状态 %v，实际 HTTP 状态 %d", got, tc.wantStatus)
			}
			if entries[0].Level != tc.wantLevel {
				t.Errorf("日志级别 %s，期望 %s", entries[0].Level, tc.wantLevel)
			}
			wantCalls := 0
			if tc.err != nil {
				wantCalls = 1
				if _, ok := entries[0].ContextMap()["error"]; !ok {
					t.Error("日志必须保留原始错误")
				}
			}
			if errorHandlerCalls != wantCalls || propagatedError != tc.err {
				t.Errorf("错误传播发生变化：处理器调用 %d 次，传播错误 %v", errorHandlerCalls, propagatedError)
			}
		})
	}
}
