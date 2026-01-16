package ws

import (
    "encoding/json"
    "net/http"
    "strings"
    "time"

    "github.com/gorilla/websocket"
    "github.com/labstack/echo/v4"
    "go.uber.org/zap"
)

type Handler struct {
    Manager  *Manager
    Logger   *zap.Logger
    upgrader websocket.Upgrader
}

func NewHandler(manager *Manager, logger *zap.Logger) *Handler {
    return &Handler{
        Manager: manager,
        Logger:  logger,
        upgrader: websocket.Upgrader{
            CheckOrigin: func(r *http.Request) bool { return true },
        },
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
    userID := c.Param("user_id")
    rooms := parseRooms(c.QueryParam("rooms"))

    socket, err := h.upgrader.Upgrade(c.Response(), c.Request(), nil)
    if err != nil {
        return err
    }

    h.Manager.StartCleanup(60*time.Second, 5*time.Minute)

    connectionID, err := h.Manager.Connect(socket, userID, rooms)
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
        room := readRoom(msg.Data)
        success := h.Manager.Subscribe(connectionID, room)
        _ = h.Manager.SendToConnection(connectionID, Message{
            Type: MessageSystemStatus,
            Data: map[string]interface{}{
                "action":  "subscribe",
                "room":    room,
                "success": success,
            },
        })
    case "unsubscribe":
        room := readRoom(msg.Data)
        success := h.Manager.Unsubscribe(connectionID, room)
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
    return c.JSON(http.StatusOK, h.Manager.Stats())
}

func (h *Handler) Broadcast(c echo.Context) error {
    var payload Message
    if err := c.Bind(&payload); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "Invalid payload")
    }

    sent := h.Manager.Broadcast(payload)
    return c.JSON(http.StatusOK, map[string]interface{}{
        "success":   true,
        "message":   "Message broadcasted",
        "recipients": sent,
    })
}

func (h *Handler) SendToUser(c echo.Context) error {
    userID := c.Param("user_id")

    var payload Message
    if err := c.Bind(&payload); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "Invalid payload")
    }

    sent := h.Manager.SendToUser(userID, payload)
    return c.JSON(http.StatusOK, map[string]interface{}{
        "success":   true,
        "message":   "Message sent to user",
        "user_id":   userID,
        "recipients": sent,
    })
}

func (h *Handler) SendToRoom(c echo.Context) error {
    room := c.Param("room")

    var payload Message
    if err := c.Bind(&payload); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "Invalid payload")
    }

    sent := h.Manager.SendToRoom(room, payload)
    return c.JSON(http.StatusOK, map[string]interface{}{
        "success":   true,
        "message":   "Message sent to room",
        "room":      room,
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
