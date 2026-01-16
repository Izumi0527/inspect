package settings

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (s *Service) ListRoles(ctx context.Context) ([]RoleDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}

	var roles []Role
	if err := s.db.WithContext(ctx).Order("created_at asc").Find(&roles).Error; err != nil {
		return nil, err
	}

	result := make([]RoleDTO, 0, len(roles))
	for _, role := range roles {
		perms, _ := s.ListPermissionsByRoleID(ctx, role.ID)
		count := s.countByRole(ctx, role.Name)
		result = append(result, RoleDTO{
			ID:            role.ID,
			Name:          role.Name,
			DisplayName:   role.DisplayName,
			Description:   safeString(role.Description),
			Permissions:   perms,
			UserCount:     count,
			IsBuiltIn:     role.IsBuiltIn,
			CreatedAt:     role.CreatedAt,
			UpdatedAt:     role.UpdatedAt,
			PermissionIDs: permissionIDs(perms),
		})
	}

	return result, nil
}

func (s *Service) GetRole(ctx context.Context, roleID string) (*RoleDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(roleID)
	if id == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var role Role
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&role).Error; err != nil {
		return nil, err
	}

	perms, _ := s.ListPermissionsByRoleID(ctx, role.ID)
	dto := RoleDTO{
		ID:            role.ID,
		Name:          role.Name,
		DisplayName:   role.DisplayName,
		Description:   safeString(role.Description),
		Permissions:   perms,
		UserCount:     s.countByRole(ctx, role.Name),
		IsBuiltIn:     role.IsBuiltIn,
		CreatedAt:     role.CreatedAt,
		UpdatedAt:     role.UpdatedAt,
		PermissionIDs: permissionIDs(perms),
	}
	return &dto, nil
}

func (s *Service) CreateRole(ctx context.Context, payload map[string]interface{}) (*RoleDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	name := strings.TrimSpace(readString(payload, "name"))
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if strings.TrimSpace(readString(payload, "display_name", "displayName")) == "" {
		payload["display_name"] = name
	}

	now := time.Now().UTC()
	role := Role{
		ID:          uuid.NewString(),
		Name:        name,
		DisplayName: readString(payload, "display_name", "displayName"),
		Description: emptyToNil(readString(payload, "description")),
		IsBuiltIn:   false,
		CreatedAt:   &now,
		UpdatedAt:   &now,
	}

	if err := s.db.WithContext(ctx).Create(&role).Error; err != nil {
		return nil, err
	}

	return s.GetRole(ctx, role.ID)
}

func (s *Service) UpdateRole(ctx context.Context, roleID string, payload map[string]interface{}) (*RoleDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(roleID)
	if id == "" {
		return nil, gorm.ErrRecordNotFound
	}

	updates := map[string]interface{}{}
	if name := readString(payload, "name"); name != "" {
		updates["name"] = name
	}
	if displayName := readString(payload, "display_name", "displayName"); displayName != "" {
		updates["display_name"] = displayName
	}
	if desc := readString(payload, "description"); desc != "" {
		updates["description"] = desc
	}
	if len(updates) == 0 {
		return s.GetRole(ctx, id)
	}
	updates["updated_at"] = time.Now().UTC()

	if err := s.db.WithContext(ctx).Model(&Role{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetRole(ctx, id)
}

func (s *Service) DeleteRole(ctx context.Context, roleID string) error {
	if !s.isReady() {
		return fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(roleID)
	if id == "" {
		return gorm.ErrRecordNotFound
	}

	var role Role
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&role).Error; err != nil {
		return err
	}
	if role.IsBuiltIn {
		return fmt.Errorf("built-in role cannot be deleted")
	}

	if err := s.db.WithContext(ctx).Where("role_id = ?", id).Delete(&RolePermission{}).Error; err != nil {
		return err
	}

	result := s.db.WithContext(ctx).Where("id = ?", id).Delete(&Role{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) ListPermissions(ctx context.Context) ([]PermissionDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}

	var perms []Permission
	if err := s.db.WithContext(ctx).Order("module asc, name asc").Find(&perms).Error; err != nil {
		return nil, err
	}

	result := make([]PermissionDTO, 0, len(perms))
	for _, perm := range perms {
		result = append(result, PermissionDTO{
			ID:          perm.ID,
			Name:        perm.Name,
			DisplayName: perm.DisplayName,
			Description: perm.Description,
			Module:      perm.Module,
			Action:      perm.Action,
			Resource:    perm.Resource,
		})
	}
	return result, nil
}

func (s *Service) AssignRolePermissions(ctx context.Context, roleID string, permissionIDs []string) error {
	if !s.isReady() {
		return fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(roleID)
	if id == "" {
		return gorm.ErrRecordNotFound
	}

	if err := s.db.WithContext(ctx).Where("role_id = ?", id).Delete(&RolePermission{}).Error; err != nil {
		return err
	}

	if len(permissionIDs) == 0 {
		return nil
	}

	now := time.Now().UTC()
	rows := make([]RolePermission, 0, len(permissionIDs))
	for _, permID := range permissionIDs {
		trimmed := strings.TrimSpace(permID)
		if trimmed == "" {
			continue
		}
		rows = append(rows, RolePermission{
			ID:           uuid.NewString(),
			RoleID:       id,
			PermissionID: trimmed,
			CreatedAt:    &now,
		})
	}
	if len(rows) == 0 {
		return nil
	}

	return s.db.WithContext(ctx).Create(&rows).Error
}

func (s *Service) ListPermissionsByRoleID(ctx context.Context, roleID string) ([]PermissionDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(roleID)
	if id == "" {
		return []PermissionDTO{}, nil
	}

	var perms []Permission
	query := `
		SELECT p.id, p.name, p.display_name, p.description, p.module, p.action, p.resource
		FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		WHERE rp.role_id = ?
		ORDER BY p.name`

	if err := s.db.WithContext(ctx).Raw(query, id).Scan(&perms).Error; err != nil {
		return nil, err
	}

	result := make([]PermissionDTO, 0, len(perms))
	for _, perm := range perms {
		result = append(result, PermissionDTO{
			ID:          perm.ID,
			Name:        perm.Name,
			DisplayName: perm.DisplayName,
			Description: perm.Description,
			Module:      perm.Module,
			Action:      perm.Action,
			Resource:    perm.Resource,
		})
	}
	return result, nil
}

func (s *Service) GetPermissionNamesByRole(ctx context.Context, roleName string) ([]string, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	name := strings.TrimSpace(roleName)
	if name == "" {
		return []string{}, nil
	}

	query := `
		SELECT p.name
		FROM roles r
		JOIN role_permissions rp ON rp.role_id = r.id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE r.name = ?
		ORDER BY p.name`

	rows := make([]struct{ Name string }, 0)
	if err := s.db.WithContext(ctx).Raw(query, name).Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]string, 0, len(rows))
	for _, row := range rows {
		if strings.TrimSpace(row.Name) != "" {
			result = append(result, row.Name)
		}
	}
	return result, nil
}

func (s *Service) ListPermissionsByRoleName(ctx context.Context, roleName string) ([]PermissionDTO, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	name := strings.TrimSpace(roleName)
	if name == "" {
		return []PermissionDTO{}, nil
	}

	query := `
		SELECT p.id, p.name, p.display_name, p.description, p.module, p.action, p.resource
		FROM roles r
		JOIN role_permissions rp ON rp.role_id = r.id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE r.name = ?
		ORDER BY p.name`

	var perms []Permission
	if err := s.db.WithContext(ctx).Raw(query, name).Scan(&perms).Error; err != nil {
		return nil, err
	}

	result := make([]PermissionDTO, 0, len(perms))
	for _, perm := range perms {
		result = append(result, PermissionDTO{
			ID:          perm.ID,
			Name:        perm.Name,
			DisplayName: perm.DisplayName,
			Description: perm.Description,
			Module:      perm.Module,
			Action:      perm.Action,
			Resource:    perm.Resource,
		})
	}
	return result, nil
}

func permissionIDs(perms []PermissionDTO) []string {
	ids := make([]string, 0, len(perms))
	for _, perm := range perms {
		if perm.ID != "" {
			ids = append(ids, perm.ID)
		}
	}
	return ids
}

func safeString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
