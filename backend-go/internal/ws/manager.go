package ws

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"github.com/your-org/inspect-system/backend-go/internal/authz"
)

type Connection struct {
	ID          string
	UserID      string
	Permissions []string
	Rooms       map[string]struct{}
	Socket      *websocket.Conn

	ConnectedAt   time.Time
	LastHeartbeat time.Time

	writeMu sync.Mutex
}

type Manager struct {
	mu              sync.RWMutex
	connections     map[string]*Connection
	userConnections map[string]map[string]struct{}
	roomConnections map[string]map[string]struct{}
	connectionCount int64
	messageCount    int64
	cleanupOnce     sync.Once
}

func NewManager() *Manager {
	return &Manager{
		connections:     make(map[string]*Connection),
		userConnections: make(map[string]map[string]struct{}),
		roomConnections: make(map[string]map[string]struct{}),
	}
}

func (m *Manager) StartCleanup(interval time.Duration, timeout time.Duration) {
	m.cleanupOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(interval)
			defer ticker.Stop()

			for range ticker.C {
				m.CleanupInactiveConnections(timeout)
			}
		}()
	})
}

func (m *Manager) Connect(socket *websocket.Conn, userID string, rooms []string, permissions []string) (string, error) {
	connectionID := m.generateConnectionID()

	roomSet := make(map[string]struct{})
	for _, room := range rooms {
		trimmed := strings.TrimSpace(room)
		if trimmed == "" {
			continue
		}
		roomSet[trimmed] = struct{}{}
	}

	conn := &Connection{
		ID:            connectionID,
		UserID:        strings.TrimSpace(userID),
		Permissions:   normalizePermissions(permissions),
		Rooms:         roomSet,
		Socket:        socket,
		ConnectedAt:   time.Now(),
		LastHeartbeat: time.Now(),
	}

	m.mu.Lock()
	m.connections[connectionID] = conn

	if conn.UserID != "" {
		if _, ok := m.userConnections[conn.UserID]; !ok {
			m.userConnections[conn.UserID] = make(map[string]struct{})
		}
		m.userConnections[conn.UserID][connectionID] = struct{}{}
	}

	for room := range roomSet {
		if _, ok := m.roomConnections[room]; !ok {
			m.roomConnections[room] = make(map[string]struct{})
		}
		m.roomConnections[room][connectionID] = struct{}{}
	}
	m.mu.Unlock()

	return connectionID, nil
}

func (m *Manager) Disconnect(connectionID string) {
	m.mu.Lock()
	conn, ok := m.connections[connectionID]
	if !ok {
		m.mu.Unlock()
		return
	}

	delete(m.connections, connectionID)

	if userSet, ok := m.userConnections[conn.UserID]; ok {
		delete(userSet, connectionID)
		if len(userSet) == 0 {
			delete(m.userConnections, conn.UserID)
		}
	}

	for room := range conn.Rooms {
		if roomSet, ok := m.roomConnections[room]; ok {
			delete(roomSet, connectionID)
			if len(roomSet) == 0 {
				delete(m.roomConnections, room)
			}
		}
	}
	m.mu.Unlock()

	_ = conn.Socket.Close()
}

func (m *Manager) SendToConnection(connectionID string, message Message) bool {
	conn := m.getConnection(connectionID)
	if conn == nil {
		return false
	}

	envelope := buildEnvelope(message)
	if err := conn.writeJSON(envelope); err != nil {
		m.Disconnect(connectionID)
		return false
	}

	atomic.AddInt64(&m.messageCount, 1)
	return true
}

func (m *Manager) SendToUser(userID string, message Message) int {
	m.mu.RLock()
	ids := copyKeys(m.userConnections[userID])
	m.mu.RUnlock()

	sent := 0
	for _, id := range ids {
		if m.SendToConnection(id, message) {
			sent++
		}
	}

	return sent
}

func (m *Manager) SendToRoom(room string, message Message) int {
	m.mu.RLock()
	ids := copyKeys(m.roomConnections[room])
	m.mu.RUnlock()

	sent := 0
	for _, id := range ids {
		if m.SendToConnection(id, message) {
			sent++
		}
	}

	return sent
}

func (m *Manager) Broadcast(message Message) int {
	m.mu.RLock()
	ids := copyKeys(m.connections)
	m.mu.RUnlock()

	sent := 0
	for _, id := range ids {
		if m.SendToConnection(id, message) {
			sent++
		}
	}

	return sent
}

func (m *Manager) Subscribe(connectionID, room string) bool {
	if strings.TrimSpace(room) == "" {
		return false
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	conn, ok := m.connections[connectionID]
	if !ok {
		return false
	}

	conn.Rooms[room] = struct{}{}

	if _, ok := m.roomConnections[room]; !ok {
		m.roomConnections[room] = make(map[string]struct{})
	}
	m.roomConnections[room][connectionID] = struct{}{}

	return true
}

func (m *Manager) Unsubscribe(connectionID, room string) bool {
	if strings.TrimSpace(room) == "" {
		return false
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	conn, ok := m.connections[connectionID]
	if !ok {
		return false
	}

	delete(conn.Rooms, room)

	if roomSet, ok := m.roomConnections[room]; ok {
		delete(roomSet, connectionID)
		if len(roomSet) == 0 {
			delete(m.roomConnections, room)
		}
	}

	return true
}

func (m *Manager) HasPermission(connectionID string, permission string) bool {
	perm := authz.NormalizePermissionKey(permission)
	if perm == "" {
		return true
	}

	conn := m.getConnection(connectionID)
	if conn == nil {
		return false
	}

	for _, item := range conn.Permissions {
		if item == perm {
			return true
		}
	}

	return false
}

func (m *Manager) UpdateHeartbeat(connectionID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	conn, ok := m.connections[connectionID]
	if !ok {
		return false
	}

	conn.LastHeartbeat = time.Now()
	return true
}

func (m *Manager) CleanupInactiveConnections(timeout time.Duration) int {
	cutoff := time.Now().Add(-timeout)

	m.mu.RLock()
	ids := make([]string, 0)
	for id, conn := range m.connections {
		if conn.LastHeartbeat.Before(cutoff) {
			ids = append(ids, id)
		}
	}
	m.mu.RUnlock()

	for _, id := range ids {
		m.Disconnect(id)
	}

	return len(ids)
}

func (m *Manager) Stats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	details := make(map[string]interface{}, len(m.connections))
	for id, conn := range m.connections {
		details[id] = map[string]interface{}{
			"user_id":        conn.UserID,
			"subscriptions":  keys(conn.Rooms),
			"connected_at":   conn.ConnectedAt.Unix(),
			"last_heartbeat": conn.LastHeartbeat.Unix(),
		}
	}

	return map[string]interface{}{
		"total_connections":   len(m.connections),
		"unique_users":        len(m.userConnections),
		"active_rooms":        len(m.roomConnections),
		"messages_sent":       atomic.LoadInt64(&m.messageCount),
		"connection_details":  details,
	}
}

func (m *Manager) generateConnectionID() string {
	count := atomic.AddInt64(&m.connectionCount, 1)
	ts := time.Now().UnixNano() / int64(time.Millisecond)
	return fmt.Sprintf("conn_%d_%d", ts, count)
}

func (m *Manager) getConnection(connectionID string) *Connection {
	m.mu.RLock()
	conn := m.connections[connectionID]
	m.mu.RUnlock()
	return conn
}

func buildEnvelope(message Message) Envelope {
	return Envelope{
		Timestamp: time.Now().Unix(),
		MessageID: fmt.Sprintf("msg_%d", time.Now().UnixNano()/int64(time.Millisecond)),
		Type:      message.Type,
		Data:      message.Data,
	}
}

func normalizePermissions(raw []string) []string {
	if len(raw) == 0 {
		return []string{}
	}

	seen := make(map[string]struct{}, len(raw))
	result := make([]string, 0, len(raw))
	for _, item := range raw {
		normalized := authz.NormalizePermissionKey(item)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func copyKeys[T any](input map[string]T) []string {
	if len(input) == 0 {
		return []string{}
	}

	keys := make([]string, 0, len(input))
	for key := range input {
		keys = append(keys, key)
	}
	return keys
}

func keys(input map[string]struct{}) []string {
	if len(input) == 0 {
		return []string{}
	}

	result := make([]string, 0, len(input))
	for key := range input {
		result = append(result, key)
	}
	return result
}

func (c *Connection) writeJSON(payload interface{}) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.Socket.WriteJSON(payload)
}
