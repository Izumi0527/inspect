package middleware

import (
    "context"
    "fmt"
    "net/http"
    "strings"
    "time"

    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
)

type contextKey string

const requestIDKey contextKey = "request_id"

func RequestTracking(next echo.HandlerFunc) echo.HandlerFunc {
    return func(c echo.Context) error {
        start := time.Now()
        requestID := getOrGenerateRequestID(c.Request())

        ctx := context.WithValue(c.Request().Context(), requestIDKey, requestID)
        c.SetRequest(c.Request().WithContext(ctx))

        c.Response().Header().Set("X-Request-ID", requestID)

        err := next(c)

        duration := time.Since(start).Seconds()
        c.Response().Header().Set("X-Process-Time", fmt.Sprintf("%.4f", duration))

        return err
    }
}

func GetRequestID(ctx context.Context) string {
    value := ctx.Value(requestIDKey)
    if value == nil {
        return ""
    }
    if requestID, ok := value.(string); ok {
        return requestID
    }
    return ""
}

func getOrGenerateRequestID(r *http.Request) string {
    existing := strings.TrimSpace(r.Header.Get("X-Request-ID"))
    if isValidRequestID(existing) {
        return existing
    }
    return generateRequestID()
}

func isValidRequestID(value string) bool {
    if value == "" || len(value) < 8 || len(value) > 128 {
        return false
    }
    if strings.ContainsAny(value, "\n\r\t\u0000") {
        return false
    }
    return true
}

func generateRequestID() string {
    ts := time.Now().UnixNano() / int64(time.Millisecond)
    shortID := strings.ReplaceAll(uuid.New().String(), "-", "")
    if len(shortID) > 12 {
        shortID = shortID[:12]
    }
    return fmt.Sprintf("req_%d_%s", ts, shortID)
}
