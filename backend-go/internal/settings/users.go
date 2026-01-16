package settings

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserQuery struct {
	Page      int
	PageSize  int
	Search    string
	Keyword   string
	Role      string
	Status    string
	SortBy    string
	SortOrder string
}

func (s *Service) ListUsers(ctx context.Context, query UserQuery) (UserListResponse, error) {
	if !s.isReady() {
		return UserListResponse{}, fmt.Errorf("database not initialized")
	}

	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}

	search := strings.TrimSpace(query.Search)
	if search == "" {
		search = strings.TrimSpace(query.Keyword)
	}
	role := strings.TrimSpace(query.Role)
	status := strings.TrimSpace(query.Status)
	sortBy := normalizeUserSort(query.SortBy)
	order := strings.ToLower(strings.TrimSpace(query.SortOrder))
	if order != "asc" {
		order = "desc"
	}

	base := s.db.WithContext(ctx).Model(&User{})
	if search != "" {
		pattern := "%%" + search + "%%"
		base = base.Where("username ILIKE ? OR email ILIKE ? OR full_name ILIKE ?", pattern, pattern, pattern)
	}
	if role != "" {
		base = base.Where("role = ?", role)
	}

	now := time.Now().UTC()
	switch status {
	case "inactive":
		base = base.Where("is_active = ?", false)
	case "locked":
		base = base.Where("locked_until IS NOT NULL AND locked_until > ?", now)
	case "active":
		base = base.Where("(is_active = true OR is_active IS NULL) AND (locked_until IS NULL OR locked_until <= ?)", now)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return UserListResponse{}, err
	}

	var users []User
	if err := base.Order(fmt.Sprintf("%s %s", sortBy, order)).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&users).Error; err != nil {
		return UserListResponse{}, err
	}

	rolePermissions, err := s.permissionsByRoles(ctx, users)
	if err != nil {
		return UserListResponse{}, err
	}

	items := make([]UserDTO, 0, len(users))
	for _, user := range users {
		items = append(items, buildUserDTO(user, rolePermissions[user.Role]))
	}

	hasNext := page*pageSize < int(total)
	hasPrev := page > 1

	return UserListResponse{
		Items:      items,
		Total:      int(total),
		Page:       page,
		PageSize:   pageSize,
		HasNext:    hasNext,
		HasPrev:    hasPrev,
		Users:      items,
		TotalCount: int(total),
		PageSizeCamel: pageSize,
		HasNextCamel:  hasNext,
		HasPrevCamel:  hasPrev,
		TotalCountCamel: int(total),
	}, nil
}

func (s *Service) GetUserByID(ctx context.Context, userID string) (*UserDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(userID)
	if id == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var user User
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&user).Error; err != nil {
		return nil, err
	}

	permissions, err := s.GetPermissionNamesByRole(ctx, user.Role)
	if err != nil {
		return nil, err
	}

	dto := buildUserDTO(user, permissions)
	return &dto, nil
}

func (s *Service) CreateUser(ctx context.Context, payload map[string]interface{}, creatorID string) (*UserDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}

	username := strings.ToLower(readString(payload, "username"))
	email := strings.ToLower(readString(payload, "email"))
	password := readString(payload, "password", "new_password")
	fullName := readString(payload, "full_name", "fullName")
	role := readString(payload, "role")
	status := readString(payload, "status")
	forcePasswordChange, hasForcePasswordChange := readBool(payload, "force_password_change", "forcePasswordChange")

	if username == "" || email == "" {
		return nil, fmt.Errorf("username and email are required")
	}
	if password == "" {
		return nil, fmt.Errorf("password is required")
	}
	if role == "" {
		role = "viewer"
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	isActive := true
	lockedUntil := (*time.Time)(nil)
	if status == "inactive" {
		isActive = false
	}
	if status == "locked" {
		lock := time.Now().UTC().Add(365 * 24 * time.Hour)
		lockedUntil = &lock
	}

	now := time.Now().UTC()
	user := User{
		ID:             uuid.NewString(),
		Username:       username,
		Email:          email,
		FullName:       emptyToNil(fullName),
		HashedPassword: string(hashed),
		Role:           role,
		IsActive:       &isActive,
		ForcePasswordChange: func() *bool {
			if hasForcePasswordChange {
				return &forcePasswordChange
			}
			return nil
		}(),
		LockedUntil:    lockedUntil,
		CreatedAt:      &now,
		UpdatedAt:      &now,
		CreatedBy:      emptyToNil(creatorID),
	}

	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return nil, err
	}

	return s.GetUserByID(ctx, user.ID)
}

func (s *Service) UpdateUser(ctx context.Context, userID string, payload map[string]interface{}) (*UserDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(userID)
	if id == "" {
		return nil, gorm.ErrRecordNotFound
	}

	updates := map[string]interface{}{}
	if username := readString(payload, "username"); username != "" {
		updates["username"] = strings.ToLower(username)
	}
	if email := readString(payload, "email"); email != "" {
		updates["email"] = strings.ToLower(email)
	}
	if fullName := readString(payload, "full_name", "fullName"); fullName != "" {
		updates["full_name"] = fullName
	}
	if role := readString(payload, "role"); role != "" {
		updates["role"] = role
	}
	if status := readString(payload, "status"); status != "" {
		applyStatusUpdate(status, updates)
	}

	if len(updates) == 0 {
		return s.GetUserByID(ctx, id)
	}

	updates["updated_at"] = time.Now().UTC()
	if err := s.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}

	return s.GetUserByID(ctx, id)
}

func (s *Service) DeleteUser(ctx context.Context, userID string) error {
	if !s.isReady() {
		return fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(userID)
	if id == "" {
		return gorm.ErrRecordNotFound
	}

	result := s.db.WithContext(ctx).Where("id = ?", id).Delete(&User{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) ChangePassword(ctx context.Context, userID string, newPassword string) error {
	if !s.isReady() {
		return fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(userID)
	if id == "" || strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("user_id and new_password are required")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	updates := map[string]interface{}{
		"hashed_password":    string(hashed),
		"password_changed_at": time.Now().UTC(),
		"force_password_change": false,
		"updated_at":          time.Now().UTC(),
	}

	result := s.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) SetUserActive(ctx context.Context, userID string, active bool) error {
	updates := map[string]interface{}{
		"is_active":  active,
		"updated_at": time.Now().UTC(),
	}
	if !active {
		updates["locked_until"] = nil
	}
	return s.updateUserFields(ctx, userID, updates)
}

func (s *Service) LockUser(ctx context.Context, userID string) error {
	lock := time.Now().UTC().Add(365 * 24 * time.Hour)
	updates := map[string]interface{}{
		"locked_until": lock,
		"updated_at":   time.Now().UTC(),
	}
	return s.updateUserFields(ctx, userID, updates)
}

func (s *Service) UnlockUser(ctx context.Context, userID string) error {
	updates := map[string]interface{}{
		"locked_until": nil,
		"login_attempts": 0,
		"updated_at":   time.Now().UTC(),
	}
	return s.updateUserFields(ctx, userID, updates)
}

func (s *Service) BatchOperateUsers(ctx context.Context, userIDs []string, operation string, params map[string]interface{}) (BatchOperationResponse, error) {
	if !s.isReady() {
		return BatchOperationResponse{}, fmt.Errorf("database not initialized")
	}
	if len(userIDs) == 0 {
		return BatchOperationResponse{}, fmt.Errorf("user_ids is required")
	}

	results := make([]BatchOperationResult, 0, len(userIDs))
	success := 0
	failed := 0

	for _, id := range userIDs {
		opErr := s.applyBatchOperation(ctx, id, operation, params)
		if opErr != nil {
			failed++
			results = append(results, BatchOperationResult{UserID: id, Success: false, Message: opErr.Error()})
			continue
		}
		success++
		results = append(results, BatchOperationResult{UserID: id, Success: true, Message: "操作成功"})
	}

	message := fmt.Sprintf("批量操作完成：成功 %d 个，失败 %d 个", success, failed)
	return BatchOperationResponse{
		SuccessCount: success,
		FailedCount:  failed,
		Results:      results,
		Message:      message,
	}, nil
}

func (s *Service) ImportUsers(ctx context.Context, users []ImportUserPayload, forcePasswordChange bool, createdBy string) (UserBulkImportResult, error) {
	if !s.isReady() {
		return UserBulkImportResult{}, fmt.Errorf("database not initialized")
	}

	result := UserBulkImportResult{
		Total:  len(users),
		Errors: make([]UserBulkImportError, 0),
	}

	for index, payload := range users {
		row := index + 1
		username := strings.ToLower(strings.TrimSpace(payload.Username))
		email := strings.ToLower(strings.TrimSpace(payload.Email))

		if username == "" || email == "" {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    "用户名和邮箱不能为空",
			})
			continue
		}

		if exists, err := s.userExistsByUsername(ctx, username); err != nil {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    "检查用户名失败",
			})
			continue
		} else if exists {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    "用户名已存在",
			})
			continue
		}

		if exists, err := s.userExistsByEmail(ctx, email); err != nil {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    "检查邮箱失败",
			})
			continue
		} else if exists {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    "邮箱已存在",
			})
			continue
		}

		role := strings.ToLower(strings.TrimSpace(payload.Role))
		if role == "" {
			role = "viewer"
		} else if !isValidUserRole(role) {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    "角色无效",
			})
			continue
		}

		password := strings.TrimSpace(payload.Password)
		generatedPassword := false
		if password == "" {
			created, err := generateRandomPassword(12)
			if err != nil {
				result.Errors = append(result.Errors, UserBulkImportError{
					Row:      row,
					Username: username,
					Email:    email,
					Error:    "生成随机密码失败",
				})
				continue
			}
			password = created
			generatedPassword = true
		}

		createPayload := map[string]interface{}{
			"username": username,
			"email":    email,
			"password": password,
			"full_name": strings.TrimSpace(payload.FullName),
			"role":     role,
		}
		if status := strings.TrimSpace(payload.Status); status != "" {
			createPayload["status"] = status
		}
		rowForce := false
		if payload.ForcePasswordChange != nil {
			rowForce = *payload.ForcePasswordChange
		}
		if forcePasswordChange || rowForce || generatedPassword {
			createPayload["force_password_change"] = true
		}

		if _, err := s.CreateUser(ctx, createPayload, createdBy); err != nil {
			result.Errors = append(result.Errors, UserBulkImportError{
				Row:      row,
				Username: username,
				Email:    email,
				Error:    err.Error(),
			})
			continue
		}

		result.Success++
	}

	result.Failed = len(result.Errors)
	return result, nil
}

func (s *Service) applyBatchOperation(ctx context.Context, userID string, operation string, params map[string]interface{}) error {
	switch strings.ToLower(strings.TrimSpace(operation)) {
	case "activate":
		return s.SetUserActive(ctx, userID, true)
	case "deactivate":
		return s.SetUserActive(ctx, userID, false)
	case "lock":
		return s.LockUser(ctx, userID)
	case "unlock":
		return s.UnlockUser(ctx, userID)
	case "delete":
		return s.DeleteUser(ctx, userID)
	case "update_role", "assign_role":
		role := ""
		if params != nil {
			if value, ok := params["role"]; ok {
				if text, ok := value.(string); ok {
					role = text
				}
			}
		}
		if strings.TrimSpace(role) == "" {
			return fmt.Errorf("role is required")
		}
		return s.updateUserFields(ctx, userID, map[string]interface{}{"role": role, "updated_at": time.Now().UTC()})
	default:
		return fmt.Errorf("unsupported operation")
	}
}

func (s *Service) userExistsByUsername(ctx context.Context, username string) (bool, error) {
	if strings.TrimSpace(username) == "" {
		return false, nil
	}
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&User{}).
		Where("LOWER(username) = ?", strings.ToLower(username)).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) userExistsByEmail(ctx context.Context, email string) (bool, error) {
	if strings.TrimSpace(email) == "" {
		return false, nil
	}
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&User{}).
		Where("LOWER(email) = ?", strings.ToLower(email)).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Service) updateUserFields(ctx context.Context, userID string, updates map[string]interface{}) error {
	id := strings.TrimSpace(userID)
	if id == "" {
		return gorm.ErrRecordNotFound
	}
	result := s.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) GetUserStats(ctx context.Context) (UserStatsResponse, error) {
	if !s.isReady() {
		return UserStatsResponse{}, fmt.Errorf("database not initialized")
	}

	now := time.Now().UTC()
	stats := UserStatsResponse{
		UsersByRole: map[string]int{},
	}

	var total int64
	if err := s.db.WithContext(ctx).Model(&User{}).Count(&total).Error; err != nil {
		return stats, err
	}
	stats.TotalUsers = int(total)

	var active int64
	if err := s.db.WithContext(ctx).Model(&User{}).
		Where("(is_active = true OR is_active IS NULL) AND (locked_until IS NULL OR locked_until <= ?)", now).
		Count(&active).Error; err == nil {
		stats.ActiveUsers = int(active)
	}

	var inactive int64
	if err := s.db.WithContext(ctx).Model(&User{}).Where("is_active = ?", false).Count(&inactive).Error; err == nil {
		stats.InactiveUsers = int(inactive)
	}

	var locked int64
	if err := s.db.WithContext(ctx).Model(&User{}).
		Where("locked_until IS NOT NULL AND locked_until > ?", now).
		Count(&locked).Error; err == nil {
		stats.LockedUsers = int(locked)
	}

	stats.AdminCount = s.countByRole(ctx, "admin")
	stats.OperatorCount = s.countByRole(ctx, "operator")
	stats.ViewerCount = s.countByRole(ctx, "viewer")
	stats.UsersByRole["admin"] = stats.AdminCount
	stats.UsersByRole["operator"] = stats.OperatorCount
	stats.UsersByRole["viewer"] = stats.ViewerCount

	stats.OnlineUsers = s.countOnlineUsers(ctx, now)

	stats.NewUsersToday = s.countUsersCreatedAfter(ctx, startOfDay(now))
	stats.NewUsersWeek = s.countUsersCreatedAfter(ctx, startOfWeek(now))
	stats.NewUsersMonth = s.countUsersCreatedAfter(ctx, startOfMonth(now))
	stats.LoginToday = s.countLoginsAfter(ctx, startOfDay(now))
	stats.LoginWeek = s.countLoginsAfter(ctx, startOfWeek(now))
	stats.RecentUsers = s.listRecentActiveUsers(ctx)

	return stats, nil
}

func (s *Service) countByRole(ctx context.Context, role string) int {
	var count int64
	_ = s.db.WithContext(ctx).Model(&User{}).Where("role = ?", role).Count(&count).Error
	return int(count)
}

func (s *Service) countOnlineUsers(ctx context.Context, now time.Time) int {
	var count int64
	_ = s.db.WithContext(ctx).Model(&UserSession{}).
		Where("is_active = ? AND expires_at > ?", true, now).
		Count(&count).Error
	return int(count)
}

func (s *Service) countUsersCreatedAfter(ctx context.Context, since time.Time) int {
	var count int64
	_ = s.db.WithContext(ctx).Model(&User{}).Where("created_at >= ?", since).Count(&count).Error
	return int(count)
}

func (s *Service) countLoginsAfter(ctx context.Context, since time.Time) int {
	var count int64
	_ = s.db.WithContext(ctx).Model(&UserSession{}).Where("created_at >= ?", since).Count(&count).Error
	return int(count)
}

func (s *Service) listRecentActiveUsers(ctx context.Context) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)
	var users []User
	if err := s.db.WithContext(ctx).
		Where("last_login_at IS NOT NULL").
		Order("last_login_at desc").
		Limit(5).
		Find(&users).Error; err != nil {
		return result
	}
	for _, user := range users {
		result = append(result, map[string]interface{}{
			"user_id":      user.ID,
			"username":     user.Username,
			"last_activity": user.LastLoginAt,
		})
	}
	return result
}

func normalizeUserSort(sortBy string) string {
	value := strings.ToLower(strings.TrimSpace(sortBy))
	switch value {
	case "username":
		return "username"
	case "email":
		return "email"
	case "role":
		return "role"
	case "created_at", "createdat":
		return "created_at"
	case "last_login_at", "lastloginat":
		return "last_login_at"
	default:
		return "created_at"
	}
}

func isValidUserRole(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "operator", "viewer":
		return true
	default:
		return false
	}
}

func generateRandomPassword(length int) (string, error) {
	if length <= 0 {
		length = 12
	}
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%?"
	buffer := make([]byte, length)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	password := make([]byte, length)
	for i, value := range buffer {
		password[i] = charset[int(value)%len(charset)]
	}
	return string(password), nil
}

func buildUserDTO(user User, permissions []string) UserDTO {
	status := resolveUserStatus(user)
	createdBy := ""
	if user.CreatedBy != nil {
		createdBy = *user.CreatedBy
	}
	return UserDTO{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		FullName:    user.FullName,
		Avatar:      user.Avatar,
		Role:        user.Role,
		Status:      status,
		Permissions: permissions,
		LastLoginAt: user.LastLoginAt,
		LastLoginIP: user.LastLoginIP,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
		CreatedBy:   createdBy,
		UpdatedBy:   createdBy,
	}
}

func resolveUserStatus(user User) string {
	if user.IsActive != nil && !*user.IsActive {
		return "inactive"
	}
	if user.LockedUntil != nil && user.LockedUntil.After(time.Now().UTC()) {
		return "locked"
	}
	return "active"
}

func applyStatusUpdate(status string, updates map[string]interface{}) {
	value := strings.ToLower(strings.TrimSpace(status))
	switch value {
	case "inactive":
		updates["is_active"] = false
		updates["locked_until"] = nil
	case "locked":
		lock := time.Now().UTC().Add(365 * 24 * time.Hour)
		updates["locked_until"] = lock
		updates["is_active"] = true
	case "active":
		updates["is_active"] = true
		updates["locked_until"] = nil
	}
}

func (s *Service) permissionsByRoles(ctx context.Context, users []User) (map[string][]string, error) {
	roleSet := map[string]struct{}{}
	for _, user := range users {
		if user.Role != "" {
			roleSet[user.Role] = struct{}{}
		}
	}

	result := map[string][]string{}
	for role := range roleSet {
		perms, err := s.GetPermissionNamesByRole(ctx, role)
		if err != nil {
			return nil, err
		}
		result[role] = perms
	}
	return result, nil
}

func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}

func startOfWeek(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	return startOfDay(t).AddDate(0, 0, -(weekday - 1))
}

func startOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
}
