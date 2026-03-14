package ws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/authz"
)

// AccessTokenAuthorizer 用于 WS 握手鉴权与权限解析。
// 采用“适配器”方式注入，避免 ws 包直接依赖 internal/auth 造成循环引用：ws -> auth -> settings -> monitoring -> ws。
type AccessTokenAuthorizer interface {
	AuthorizeAccessToken(ctx context.Context, accessToken string) (userID string, permissions []string, err error)
}

type Handler struct {
	Manager *Manager
	Logger  *zap.Logger
	Auth    AccessTokenAuthorizer

	upgrader websocket.Upgrader
}

const (
	// wsAuthProtocolName 约定的鉴权子协议名称。
	// 客户端需传：Sec-WebSocket-Protocol: inspect-token, <access_token>
	wsAuthProtocolName = "inspect-token"

	// maxWSTokenLength 用于避免异常超长 header 导致的资源消耗。
	maxWSTokenLength = 4096
)

var (
	// ErrUserInactive 表示用户被禁用。
	ErrUserInactive = errors.New("user inactive")

	// ErrPermissionResolveFailed 表示权限解析失败（通常是后端依赖/数据库问题）。
	ErrPermissionResolveFailed = errors.New("permission resolve failed")
)

func NewHandler(manager *Manager, authService AccessTokenAuthorizer, logger *zap.Logger) *Handler {
	return NewHandlerWithOrigins(manager, authService, logger, nil)
}

// NewHandlerWithOrigins 创建 WS handler，并可选传入允许的 Origin 列表（用于浏览器 WebSocket 防跨站）。
// - origins 为空或包含 "*" 时：允许所有 Origin（保持兼容，但安全性较弱）
// - origins 非空且不含 "*" 时：仅允许列表内 Origin；当请求无 Origin 头（非浏览器客户端）时放行
func NewHandlerWithOrigins(manager *Manager, authService AccessTokenAuthorizer, logger *zap.Logger, origins []string) *Handler {
	originChecker := buildOriginChecker(origins, logger)
	return &Handler{
		Manager: manager,
		Logger:  logger,
		Auth:    authService,
		upgrader: websocket.Upgrader{
			CheckOrigin: originChecker,
			Subprotocols: []string{
				wsAuthProtocolName,
			},
		},
	}
}

func buildOriginChecker(origins []string, logger *zap.Logger) func(r *http.Request) bool {
	allowed := make(map[string]struct{}, len(origins))
	allowAny := false
	for _, item := range origins {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if trimmed == "*" {
			allowAny = true
			break
		}
		allowed[trimmed] = struct{}{}
	}

	if allowAny || len(allowed) == 0 {
		if logger != nil {
			logger.Warn("ws_origin_check_disabled", zap.Int("origins_count", len(origins)))
		}
		return func(_ *http.Request) bool { return true }
	}

	if logger != nil {
		logger.Info("ws_origin_check_enabled", zap.Int("origins_count", len(allowed)))
	}

	return func(r *http.Request) bool {
		if r == nil {
			return false
		}

		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			// 非浏览器客户端通常不会携带 Origin
			return true
		}

		_, ok := allowed[origin]
		return ok
	}
}

func (h *Handler) Register(group *echo.Group) {
	group.GET("/ws/stats", h.GetStats)
	group.POST("/ws/broadcast", h.Broadcast)
	group.POST("/ws/send-to-user/:user_id", h.SendToUser)
	group.POST("/ws/send-to-room/:room", h.SendToRoom)
	group.GET("/ws/:user_id", h.ServeWS)
}

func (h *Handler) ServeWS(c echo.Context) error {
	req := c.Request()

	token, err := readAccessTokenFromSubprotocol(req)
	if err != nil {
		return err
	}

	if h.Auth == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	userID, permissions, err := h.Auth.AuthorizeAccessToken(req.Context(), token)
	if err != nil {
		return httpErrorForAuthFailure(err)
	}

	requestedRooms := parseRooms(c.QueryParam("rooms"))
	rooms := filterRoomsByPermissions(permissions, requestedRooms)

	socket, err := h.upgrader.Upgrade(c.Response(), req, nil)
	if err != nil {
		return err
	}

	h.Manager.StartCleanup(60*time.Second, 5*time.Minute)

	// 连接用户以 token 解析结果为准，避免客户端可伪造 URL user_id。
	connectionID, err := h.Manager.Connect(socket, userID, rooms, permissions)
	if err != nil {
		_ = socket.Close()
		return err
	}

	_ = h.Manager.SendToConnection(connectionID, Message{
		Type: MessageSystemStatus,
		Data: map[string]interface{}{
			"status":        "connected",
			"connection_id": connectionID,
			"server_time":   time.Now().Unix(),
		},
	})

	for {
		_, payload, err := socket.ReadMessage()
		if err != nil {
			break
		}

		var clientMsg ClientMessage
		if err := json.Unmarshal(payload, &clientMsg); err != nil {
			_ = h.Manager.SendToConnection(connectionID, Message{
				Type: MessageError,
				Data: map[string]interface{}{"message": "Invalid JSON format"},
			})
			continue
		}

		h.handleClientMessage(connectionID, clientMsg)
	}

	h.Manager.Disconnect(connectionID)
	return nil
}

func (h *Handler) handleClientMessage(connectionID string, msg ClientMessage) {
	switch msg.Type {
	case "heartbeat":
		h.Manager.UpdateHeartbeat(connectionID)
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageHeartbeat,
			Data: map[string]interface{}{"status": "ok"},
		})
	case "subscribe":
		room := normalizeRoom(readRoom(msg.Data))
		success := h.subscribeRoom(connectionID, room)
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageSystemStatus,
			Data: map[string]interface{}{
				"action":  "subscribe",
				"room":    room,
				"success": success,
			},
		})
	case "unsubscribe":
		room := normalizeRoom(readRoom(msg.Data))
		success := h.unsubscribeRoom(connectionID, room)
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageSystemStatus,
			Data: map[string]interface{}{
				"action":  "unsubscribe",
				"room":    room,
				"success": success,
			},
		})
	default:
		if h.Logger != nil {
			h.Logger.Warn("unknown_ws_message", zap.String("type", msg.Type))
		}
	}
}

func (h *Handler) GetStats(c echo.Context) error {
	if err := h.requireHTTPPermission(c, "system:config"); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, h.Manager.Stats())
}

func (h *Handler) Broadcast(c echo.Context) error {
	if err := h.requireHTTPPermission(c, "system:config"); err != nil {
		return err
	}
	var payload Message
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid payload")
	}

	sent := h.Manager.Broadcast(payload)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":    true,
		"message":    "Message broadcasted",
		"recipients": sent,
	})
}

func (h *Handler) SendToUser(c echo.Context) error {
	if err := h.requireHTTPPermission(c, "system:config"); err != nil {
		return err
	}
	userID := c.Param("user_id")

	var payload Message
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid payload")
	}

	sent := h.Manager.SendToUser(userID, payload)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":    true,
		"message":    "Message sent to user",
		"user_id":    userID,
		"recipients": sent,
	})
}

func (h *Handler) SendToRoom(c echo.Context) error {
	if err := h.requireHTTPPermission(c, "system:config"); err != nil {
		return err
	}
	room := c.Param("room")

	var payload Message
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid payload")
	}

	sent := h.Manager.SendToRoom(room, payload)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":    true,
		"message":    "Message sent to room",
		"room":       room,
		"recipients": sent,
	})
}

func parseRooms(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}

	parts := strings.Split(raw, ",")
	rooms := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		rooms = append(rooms, trimmed)
	}
	return rooms
}

func readRoom(data map[string]interface{}) string {
	if data == nil {
		return ""
	}
	room, _ := data["room"].(string)
	return room
}

func normalizeRoom(room string) string {
	trimmed := strings.TrimSpace(room)
	if trimmed == "" {
		return ""
	}
	return strings.ToLower(trimmed)
}

func requiredPermissionForRoom(room string) (string, bool) {
	switch normalizeRoom(room) {
	case "alerts":
		return "alerts:read", true
	case "device_metrics":
		return "monitoring:read", true
	case "scan_progress":
		return "inspections:read", true
	default:
		return "", false
	}
}

func filterRoomsByPermissions(permissions []string, rooms []string) []string {
	if len(rooms) == 0 {
		return []string{}
	}

	allowed := make([]string, 0, len(rooms))
	for _, raw := range rooms {
		room := normalizeRoom(raw)
		if room == "" {
			continue
		}
		required, ok := requiredPermissionForRoom(room)
		if !ok {
			continue
		}
		if hasPermission(required, permissions) {
			allowed = append(allowed, room)
		}
	}
	return allowed
}

func hasPermission(permission string, permissions []string) bool {
	required := authz.NormalizePermissionKey(permission)
	if required == "" {
		return true
	}
	for _, item := range permissions {
		if authz.NormalizePermissionKey(item) == required {
			return true
		}
	}
	return false
}

func readAccessTokenFromSubprotocol(r *http.Request) (string, error) {
	if r == nil {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid request")
	}

	protocols := websocket.Subprotocols(r)
	for i := 0; i < len(protocols); i++ {
		if !strings.EqualFold(protocols[i], wsAuthProtocolName) {
			continue
		}
		if i+1 >= len(protocols) {
			return "", echo.NewHTTPError(http.StatusUnauthorized, "缺少 access token")
		}
		token := strings.TrimSpace(protocols[i+1])
		if token == "" {
			return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization token")
		}
		if len(token) > maxWSTokenLength {
			return "", echo.NewHTTPError(http.StatusUnauthorized, "Token too large")
		}
		return token, nil
	}

	return "", echo.NewHTTPError(http.StatusUnauthorized, fmt.Sprintf("缺少鉴权子协议：%s", wsAuthProtocolName))
}

func (h *Handler) subscribeRoom(connectionID string, room string) bool {
	if strings.TrimSpace(room) == "" {
		return false
	}

	required, ok := requiredPermissionForRoom(room)
	if !ok {
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageError,
			Data: map[string]interface{}{"message": "未知房间，默认拒绝", "room": room},
		})
		return false
	}
	if !h.Manager.HasPermission(connectionID, required) {
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageError,
			Data: map[string]interface{}{"message": fmt.Sprintf("缺少订阅权限：%s", required), "room": room},
		})
		return false
	}

	return h.Manager.Subscribe(connectionID, room)
}

func (h *Handler) unsubscribeRoom(connectionID string, room string) bool {
	if strings.TrimSpace(room) == "" {
		return false
	}

	required, ok := requiredPermissionForRoom(room)
	if !ok {
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageError,
			Data: map[string]interface{}{"message": "未知房间，默认拒绝", "room": room},
		})
		return false
	}
	if !h.Manager.HasPermission(connectionID, required) {
		_ = h.Manager.SendToConnection(connectionID, Message{
			Type: MessageError,
			Data: map[string]interface{}{"message": fmt.Sprintf("缺少退订权限：%s", required), "room": room},
		})
		return false
	}

	return h.Manager.Unsubscribe(connectionID, room)
}

func (h *Handler) requireHTTPPermission(c echo.Context, permission string) error {
	if h.Auth == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	token, err := readBearerToken(c)
	if err != nil {
		return err
	}

	_, permissions, err := h.Auth.AuthorizeAccessToken(c.Request().Context(), token)
	if err != nil {
		return httpErrorForAuthFailure(err)
	}

	if strings.TrimSpace(permission) == "" {
		return nil
	}
	if !hasPermission(permission, permissions) {
		return echo.NewHTTPError(http.StatusForbidden, fmt.Sprintf("Permission denied: %s", permission))
	}

	return nil
}

func readBearerToken(c echo.Context) (string, error) {
	raw := strings.TrimSpace(c.Request().Header.Get("Authorization"))
	if raw == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Authorization header missing")
	}

	parts := strings.Fields(raw)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization header")
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization token")
	}

	return token, nil
}

func httpErrorForAuthFailure(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrUserInactive) {
		return echo.NewHTTPError(http.StatusBadRequest, "用户已被禁用")
	}
	if errors.Is(err, ErrPermissionResolveFailed) {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to resolve permissions")
	}
	return echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
}
