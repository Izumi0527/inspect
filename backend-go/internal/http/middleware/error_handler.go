package middleware

import (
    "fmt"
    "net/http"
    "strings"

    "github.com/labstack/echo/v4"
)

type errorDetail struct {
    Type    string      `json:"type"`
    Message string      `json:"message"`
    Details interface{} `json:"details,omitempty"`
}

type errorResponse struct {
    Success bool        `json:"success"`
    Error   errorDetail `json:"error"`
}

func ErrorHandler(err error, c echo.Context) {
    if c.Response().Committed {
        return
    }

    code := http.StatusInternalServerError
    errorType := "InternalServerError"
    message := "服务器内部错误"

    if httpErr, ok := err.(*echo.HTTPError); ok {
        code = httpErr.Code
        errorType = "HTTPException"
        if msg := toString(httpErr.Message); strings.TrimSpace(msg) != "" {
            message = msg
        } else if httpErr.Message != nil {
            message = fmt.Sprint(httpErr.Message)
        } else if statusText := http.StatusText(code); statusText != "" {
            message = statusText
        }
    }

    response := errorResponse{
        Success: false,
        Error: errorDetail{
            Type:    errorType,
            Message: message,
        },
    }

    _ = c.JSON(code, response)
}

func toString(value interface{}) string {
    switch v := value.(type) {
    case string:
        return v
    case error:
        return v.Error()
    default:
        return ""
    }
}
