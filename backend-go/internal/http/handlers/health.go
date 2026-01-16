package handlers

import (
    "net/http"
    "time"

    "github.com/labstack/echo/v4"
)

type HealthHandler struct {
    Version string
}

func (h HealthHandler) Register(e *echo.Echo) {
    e.GET("/health", h.Health)
}

func (h HealthHandler) Health(c echo.Context) error {
    return c.JSON(http.StatusOK, map[string]interface{}{
        "status":    "healthy",
        "version":   h.Version,
        "timestamp": float64(time.Now().UnixNano()) / 1e9,
    })
}
