package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/db"
	"github.com/your-org/inspect-system/backend-go/internal/logger"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

type permissionSeed struct {
	Name        string
	DisplayName string
	Description string
	Module      string
	Action      string
	Resource    string
}

type roleSeed struct {
	Name            string
	DisplayName     string
	Description     string
	IsBuiltIn       bool
	PermissionNames []string
}

func main() {
	username := flag.String("username", "admin", "要初始化的用户名（默认：admin）")
	password := flag.String("password", "admin123", "要初始化的密码（默认：admin123）")
	email := flag.String("email", "admin@admin.com", "要初始化的邮箱（默认：admin@admin.com）")
	role := flag.String("role", "superadmin", "要初始化的角色（superadmin 会映射为 admin）")
	fullName := flag.String("full-name", "系统管理员", "用户显示名（可选）")
	skipMigrate := flag.Bool("skip-migrate", false, "跳过数据库迁移（不推荐）")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "加载配置失败: %v\n", err)
		os.Exit(1)
	}

	log, err := logger.New(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "初始化日志失败: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = log.Sync() }()

	database, err := db.OpenPostgres(cfg)
	if err != nil {
		log.Error("连接数据库失败", zap.Error(err))
		os.Exit(1)
	}

	if !*skipMigrate {
		if err := db.Migrate(database, cfg, log); err != nil {
			log.Error("数据库迁移失败", zap.Error(err))
			os.Exit(1)
		}
	}

	ctx := context.Background()

	normalizedRole := normalizeRole(*role)
	permSeeds := builtInPermissions()
	roleSeeds := builtInRoles(permSeeds)

	permIDs, err := ensurePermissions(ctx, database, permSeeds)
	if err != nil {
		log.Error("初始化权限失败", zap.Error(err))
		os.Exit(1)
	}

	roleIDs, err := ensureRoles(ctx, database, roleSeeds)
	if err != nil {
		log.Error("初始化角色失败", zap.Error(err))
		os.Exit(1)
	}

	if err := ensureRolePermissions(ctx, database, roleSeeds, roleIDs, permIDs); err != nil {
		log.Error("初始化角色权限关联失败", zap.Error(err))
		os.Exit(1)
	}

	userResult, err := ensureAdminUser(ctx, database, ensureAdminUserArgs{
		Username: *username,
		Password: *password,
		Email:    *email,
		FullName: *fullName,
		Role:     normalizedRole,
	})
	if err != nil {
		log.Error("初始化管理员用户失败", zap.Error(err))
		os.Exit(1)
	}

	log.Info("初始化完成",
		zap.String("user", userResult.Username),
		zap.String("email", userResult.Email),
		zap.String("role", userResult.Role),
		zap.String("action", userResult.Action),
	)
}

func normalizeRole(role string) string {
	value := strings.ToLower(strings.TrimSpace(role))
	switch value {
	case "", "admin", "administrator":
		return "admin"
	case "superadmin", "super-admin", "super_admin", "root", "superuser":
		// 当前后端内置角色仅支持 admin/operator/viewer，且权限解析依赖 roles.name。
		// 这里将 superadmin 统一映射为 admin（超级管理员）。
		return "admin"
	case "operator", "ops":
		return "operator"
	case "viewer", "readonly", "read_only", "read-only":
		return "viewer"
	default:
		return value
	}
}

func builtInPermissions() []permissionSeed {
	// 说明：权限名以当前后端 `requirePermission` 使用的字符串为准（见 internal/http/handlers）。
	// 如需扩展权限，请同时更新后端权限校验点与此处种子列表。
	return []permissionSeed{
		{Name: "users:read", DisplayName: "查看用户", Description: "查看用户列表和详细信息", Module: "users", Action: "read", Resource: "user"},
		{Name: "users:create", DisplayName: "创建用户", Description: "创建新用户账户", Module: "users", Action: "create", Resource: "user"},
		{Name: "users:update", DisplayName: "更新用户", Description: "更新用户信息与状态", Module: "users", Action: "update", Resource: "user"},
		{Name: "users:delete", DisplayName: "删除用户", Description: "删除用户账户", Module: "users", Action: "delete", Resource: "user"},

		{Name: "devices:read", DisplayName: "查看设备", Description: "查看设备列表和详细信息", Module: "devices", Action: "read", Resource: "device"},
		{Name: "devices:create", DisplayName: "添加设备", Description: "添加新的网络设备", Module: "devices", Action: "create", Resource: "device"},
		{Name: "devices:update", DisplayName: "更新设备", Description: "更新设备配置和信息", Module: "devices", Action: "update", Resource: "device"},
		{Name: "devices:delete", DisplayName: "删除设备", Description: "删除网络设备", Module: "devices", Action: "delete", Resource: "device"},

		{Name: "inspections:read", DisplayName: "查看巡检", Description: "查看巡检任务和历史记录", Module: "inspections", Action: "read", Resource: "inspection"},
		{Name: "inspections:create", DisplayName: "创建巡检", Description: "创建巡检任务和策略", Module: "inspections", Action: "create", Resource: "inspection"},
		{Name: "inspections:update", DisplayName: "更新巡检", Description: "更新巡检任务和策略", Module: "inspections", Action: "update", Resource: "inspection"},
		{Name: "inspections:delete", DisplayName: "删除巡检", Description: "删除巡检任务和策略", Module: "inspections", Action: "delete", Resource: "inspection"},
		{Name: "inspections:execute", DisplayName: "执行巡检", Description: "手动执行巡检任务", Module: "inspections", Action: "execute", Resource: "inspection"},

		{Name: "alerts:read", DisplayName: "查看告警", Description: "查看告警信息与历史", Module: "alerts", Action: "read", Resource: "alert"},
		{Name: "alerts:create", DisplayName: "创建告警", Description: "创建告警与规则", Module: "alerts", Action: "create", Resource: "alert"},
		{Name: "alerts:update", DisplayName: "更新告警", Description: "确认/处理告警及更新状态", Module: "alerts", Action: "update", Resource: "alert"},
		{Name: "alerts:delete", DisplayName: "删除告警", Description: "删除告警记录", Module: "alerts", Action: "delete", Resource: "alert"},

		{Name: "monitoring:read", DisplayName: "查看监控", Description: "查看实时监控数据与仪表板", Module: "monitoring", Action: "read", Resource: "monitoring"},
		{Name: "monitoring:control", DisplayName: "控制监控", Description: "启动/停止监控服务及写入监控指标", Module: "monitoring", Action: "control", Resource: "monitoring"},
		{Name: "monitoring:export", DisplayName: "导出监控报告", Description: "导出监控中心报告（PDF/CSV/Excel）", Module: "monitoring", Action: "export", Resource: "monitoring"},

		{Name: "reports:read", DisplayName: "查看报表", Description: "查看各类统计报表", Module: "reports", Action: "read", Resource: "report"},
		{Name: "reports:create", DisplayName: "创建报表", Description: "生成与导出报表", Module: "reports", Action: "create", Resource: "report"},
		{Name: "reports:update", DisplayName: "更新报表", Description: "更新报表模板与配置", Module: "reports", Action: "update", Resource: "report"},
		{Name: "reports:delete", DisplayName: "删除报表", Description: "删除报表记录", Module: "reports", Action: "delete", Resource: "report"},

		{Name: "system:config", DisplayName: "系统配置", Description: "管理系统配置与设置", Module: "system", Action: "update", Resource: "config"},
		{Name: "system:logs", DisplayName: "查看日志", Description: "查看系统日志与审计记录", Module: "system", Action: "read", Resource: "log"},
		{Name: "system:logs:manage", DisplayName: "管理日志", Description: "采集/删除/管理系统日志", Module: "system", Action: "update", Resource: "log"},
	}
}

func builtInRoles(perms []permissionSeed) []roleSeed {
	allPermNames := make([]string, 0, len(perms))
	for _, p := range perms {
		allPermNames = append(allPermNames, p.Name)
	}
	sort.Strings(allPermNames)

	viewerPerms := []string{
		"devices:read",
		"inspections:read",
		"alerts:read",
		"monitoring:read",
		"reports:read",
		"system:logs",
	}

	operatorPerms := []string{
		"devices:read",
		"devices:create",
		"devices:update",
		"inspections:read",
		"inspections:create",
		"inspections:update",
		"inspections:execute",
		"alerts:read",
		"alerts:update",
		"monitoring:read",
		"monitoring:control",
		"monitoring:export",
		"reports:read",
		"reports:create",
		"system:logs",
		"system:logs:manage",
	}

	return []roleSeed{
		{
			Name:            "admin",
			DisplayName:     "系统管理员",
			Description:     "拥有系统所有权限的超级管理员",
			IsBuiltIn:       true,
			PermissionNames: allPermNames,
		},
		{
			Name:            "operator",
			DisplayName:     "操作员",
			Description:     "日常运维操作权限",
			IsBuiltIn:       true,
			PermissionNames: operatorPerms,
		},
		{
			Name:            "viewer",
			DisplayName:     "只读用户",
			Description:     "只读查看权限",
			IsBuiltIn:       true,
			PermissionNames: viewerPerms,
		},
	}
}

func ensurePermissions(ctx context.Context, dbConn *gorm.DB, seeds []permissionSeed) (map[string]string, error) {
	now := time.Now().UTC()
	result := make(map[string]string, len(seeds))

	for _, seed := range seeds {
		name := strings.TrimSpace(seed.Name)
		if name == "" {
			continue
		}

		var existing settings.Permission
		err := dbConn.WithContext(ctx).Where("name = ?", name).Take(&existing).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			row := settings.Permission{
				ID:          uuid.NewString(),
				Name:        name,
				DisplayName: strings.TrimSpace(seed.DisplayName),
				Description: emptyToNil(strings.TrimSpace(seed.Description)),
				Module:      strings.TrimSpace(seed.Module),
				Action:      strings.TrimSpace(seed.Action),
				Resource:    strings.TrimSpace(seed.Resource),
				CreatedAt:   &now,
				UpdatedAt:   &now,
			}
			if err := dbConn.WithContext(ctx).Create(&row).Error; err != nil {
				return nil, err
			}
			result[name] = row.ID
		case err != nil:
			return nil, err
		default:
			updates := map[string]interface{}{
				"display_name": strings.TrimSpace(seed.DisplayName),
				"description":  emptyToNil(strings.TrimSpace(seed.Description)),
				"module":       strings.TrimSpace(seed.Module),
				"action":       strings.TrimSpace(seed.Action),
				"resource":     strings.TrimSpace(seed.Resource),
				"updated_at":   now,
			}
			if err := dbConn.WithContext(ctx).Model(&settings.Permission{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return nil, err
			}
			result[name] = existing.ID
		}
	}

	return result, nil
}

func ensureRoles(ctx context.Context, dbConn *gorm.DB, seeds []roleSeed) (map[string]string, error) {
	now := time.Now().UTC()
	result := make(map[string]string, len(seeds))

	for _, seed := range seeds {
		name := strings.TrimSpace(seed.Name)
		if name == "" {
			continue
		}

		var existing settings.Role
		err := dbConn.WithContext(ctx).Where("name = ?", name).Take(&existing).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			row := settings.Role{
				ID:          uuid.NewString(),
				Name:        name,
				DisplayName: strings.TrimSpace(seed.DisplayName),
				Description: emptyToNil(strings.TrimSpace(seed.Description)),
				IsBuiltIn:   seed.IsBuiltIn,
				CreatedAt:   &now,
				UpdatedAt:   &now,
			}
			if err := dbConn.WithContext(ctx).Create(&row).Error; err != nil {
				return nil, err
			}
			result[name] = row.ID
		case err != nil:
			return nil, err
		default:
			updates := map[string]interface{}{
				"display_name": strings.TrimSpace(seed.DisplayName),
				"description":  emptyToNil(strings.TrimSpace(seed.Description)),
				"is_built_in":  seed.IsBuiltIn,
				"updated_at":   now,
			}
			if err := dbConn.WithContext(ctx).Model(&settings.Role{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return nil, err
			}
			result[name] = existing.ID
		}
	}

	return result, nil
}

func ensureRolePermissions(
	ctx context.Context,
	dbConn *gorm.DB,
	roleSeeds []roleSeed,
	roleIDs map[string]string,
	permIDs map[string]string,
) error {
	now := time.Now().UTC()

	for _, roleSeed := range roleSeeds {
		roleName := strings.TrimSpace(roleSeed.Name)
		if roleName == "" {
			continue
		}
		roleID := strings.TrimSpace(roleIDs[roleName])
		if roleID == "" {
			return fmt.Errorf("角色不存在或未初始化: %s", roleName)
		}

		for _, permName := range roleSeed.PermissionNames {
			name := strings.TrimSpace(permName)
			if name == "" {
				continue
			}
			permID := strings.TrimSpace(permIDs[name])
			if permID == "" {
				return fmt.Errorf("权限不存在或未初始化: %s", name)
			}

			row := settings.RolePermission{
				ID:           uuid.NewString(),
				RoleID:       roleID,
				PermissionID: permID,
				CreatedAt:    &now,
			}

			if err := dbConn.WithContext(ctx).Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "role_id"}, {Name: "permission_id"}},
				DoNothing: true,
			}).Create(&row).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

type ensureAdminUserArgs struct {
	Username string
	Password string
	Email    string
	FullName string
	Role     string
}

type ensureAdminUserResult struct {
	Action   string
	Username string
	Email    string
	Role     string
}

func ensureAdminUser(ctx context.Context, dbConn *gorm.DB, args ensureAdminUserArgs) (ensureAdminUserResult, error) {
	username := strings.ToLower(strings.TrimSpace(args.Username))
	email := strings.ToLower(strings.TrimSpace(args.Email))
	role := strings.ToLower(strings.TrimSpace(args.Role))
	fullName := strings.TrimSpace(args.FullName)

	if username == "" {
		return ensureAdminUserResult{}, fmt.Errorf("username 不能为空")
	}
	if email == "" {
		return ensureAdminUserResult{}, fmt.Errorf("email 不能为空")
	}
	if strings.TrimSpace(args.Password) == "" {
		return ensureAdminUserResult{}, fmt.Errorf("password 不能为空")
	}
	if role == "" {
		role = "admin"
	}

	// 注意：此工具用于初始化默认管理员（开发/测试），直接写入 bcrypt 哈希，避免被系统密码策略拦截。
	hashed, err := bcrypt.GenerateFromPassword([]byte(args.Password), bcrypt.DefaultCost)
	if err != nil {
		return ensureAdminUserResult{}, err
	}

	now := time.Now().UTC()
	isActive := true
	isSuperuser := true

	var existing settings.User
	err = dbConn.WithContext(ctx).Where("username = ?", username).Take(&existing).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		row := settings.User{
			ID:                  uuid.NewString(),
			Username:            username,
			Email:               email,
			FullName:            emptyToNil(fullName),
			HashedPassword:      string(hashed),
			Role:                role,
			IsActive:            &isActive,
			IsSuperuser:         &isSuperuser,
			PasswordChangedAt:   &now,
			ForcePasswordChange: boolPtr(false),
			LoginAttempts:       intPtr(0),
			LockedUntil:         nil,
			CreatedAt:           &now,
			UpdatedAt:           &now,
			CreatedBy:           nil,
		}
		if err := dbConn.WithContext(ctx).Create(&row).Error; err != nil {
			return ensureAdminUserResult{}, err
		}
		return ensureAdminUserResult{
			Action:   "created",
			Username: row.Username,
			Email:    row.Email,
			Role:     row.Role,
		}, nil
	case err != nil:
		return ensureAdminUserResult{}, err
	default:
		updates := map[string]interface{}{
			"email":                email,
			"full_name":            emptyToNil(fullName),
			"hashed_password":      string(hashed),
			"role":                 role,
			"is_active":            true,
			"is_superuser":         true,
			"password_changed_at":  now,
			"force_password_change": false,
			"login_attempts":       0,
			"locked_until":         nil,
			"updated_at":           now,
		}
		if err := dbConn.WithContext(ctx).Model(&settings.User{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
			return ensureAdminUserResult{}, err
		}
		return ensureAdminUserResult{
			Action:   "updated",
			Username: username,
			Email:    email,
			Role:     role,
		}, nil
	}
}

func emptyToNil(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func boolPtr(v bool) *bool { return &v }

func intPtr(v int) *int { return &v }
