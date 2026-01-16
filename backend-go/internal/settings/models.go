package settings

import (
	"time"

	"gorm.io/datatypes"
)

type SystemSetting struct {
	ID             int             `gorm:"column:id;primaryKey;autoIncrement"`
	Key            string          `gorm:"column:key;size:100;not null;unique"`
	Value          *string         `gorm:"column:value"`
	Category       string          `gorm:"column:category;size:20;not null"`
	Level          string          `gorm:"column:level;size:20"`
	Description    *string         `gorm:"column:description"`
	DataType       string          `gorm:"column:data_type;size:20"`
	IsRequired     bool            `gorm:"column:is_required"`
	IsEncrypted    bool            `gorm:"column:is_encrypted"`
	IsReadonly     bool            `gorm:"column:is_readonly"`
	ValidationRule *string         `gorm:"column:validation_rule;size:200"`
	DefaultValue   *string         `gorm:"column:default_value"`
	MinValue       *float64        `gorm:"column:min_value"`
	MaxValue       *float64        `gorm:"column:max_value"`
	AllowedValues  datatypes.JSON  `gorm:"column:allowed_values"`
	UpdatedBy      *string         `gorm:"column:updated_by;size:36"`
	CreatedAt      *time.Time      `gorm:"column:created_at"`
	UpdatedAt      *time.Time      `gorm:"column:updated_at"`
}

func (SystemSetting) TableName() string {
	return "system_settings"
}

type SystemBackup struct {
	ID              int        `gorm:"column:id;primaryKey;autoIncrement"`
	BackupName      string     `gorm:"column:backup_name;size:200;not null;unique"`
	BackupType      string     `gorm:"column:backup_type;size:20;not null"`
	Description     *string    `gorm:"column:description"`
	IncludeDatabase bool       `gorm:"column:include_database"`
	IncludeSettings bool       `gorm:"column:include_settings"`
	IncludeLogs     bool       `gorm:"column:include_logs"`
	IncludeFiles    bool       `gorm:"column:include_files"`
	FilePath        *string    `gorm:"column:file_path;size:500"`
	FileSize        *int64     `gorm:"column:file_size"`
	FileChecksum    *string    `gorm:"column:file_checksum;size:100"`
	CompressionType *string    `gorm:"column:compression_type;size:20"`
	Status          string     `gorm:"column:status;size:20"`
	Progress        int        `gorm:"column:progress"`
	ErrorMessage    *string    `gorm:"column:error_message"`
	StartedAt       *time.Time `gorm:"column:started_at"`
	CompletedAt     *time.Time `gorm:"column:completed_at"`
	DurationSeconds *int       `gorm:"column:duration_seconds"`
	RetentionDays   int        `gorm:"column:retention_days"`
	ExpiresAt       *time.Time `gorm:"column:expires_at"`
	AutoDelete      bool       `gorm:"column:auto_delete"`
	CreatedBy       *string    `gorm:"column:created_by;size:36"`
	CreatedAt       *time.Time `gorm:"column:created_at"`
	UpdatedAt       *time.Time `gorm:"column:updated_at"`
}

func (SystemBackup) TableName() string {
	return "system_backups"
}

type User struct {
	ID                  string     `gorm:"column:id;size:36;primaryKey"`
	Username            string     `gorm:"column:username;size:50;unique"`
	Email               string     `gorm:"column:email;size:100;unique"`
	FullName            *string    `gorm:"column:full_name;size:100"`
	HashedPassword      string     `gorm:"column:hashed_password;size:255"`
	Avatar              *string    `gorm:"column:avatar;size:500"`
	Role                string     `gorm:"column:role;size:20"`
	IsActive            *bool      `gorm:"column:is_active"`
	IsSuperuser         *bool      `gorm:"column:is_superuser"`
	LastLoginAt         *time.Time `gorm:"column:last_login_at"`
	LastLoginIP         *string    `gorm:"column:last_login_ip;size:45"`
	PasswordChangedAt   *time.Time `gorm:"column:password_changed_at"`
	ForcePasswordChange *bool      `gorm:"column:force_password_change"`
	LoginAttempts       *int       `gorm:"column:login_attempts"`
	LockedUntil         *time.Time `gorm:"column:locked_until"`
	CreatedAt           *time.Time `gorm:"column:created_at"`
	UpdatedAt           *time.Time `gorm:"column:updated_at"`
	CreatedBy           *string    `gorm:"column:created_by;size:36"`
}

func (User) TableName() string {
	return "users"
}

type UserSession struct {
	ID           string     `gorm:"column:id;size:36;primaryKey"`
	UserID       string     `gorm:"column:user_id;size:36"`
	SessionToken string     `gorm:"column:session_token;size:255;unique"`
	RefreshToken *string    `gorm:"column:refresh_token;size:255;unique"`
	IPAddress    *string    `gorm:"column:ip_address;size:45"`
	UserAgent    *string    `gorm:"column:user_agent"`
	IsActive     bool       `gorm:"column:is_active"`
	ExpiresAt    time.Time  `gorm:"column:expires_at"`
	CreatedAt    *time.Time `gorm:"column:created_at"`
	LastAccessed *time.Time `gorm:"column:last_accessed_at"`
}

func (UserSession) TableName() string {
	return "user_sessions"
}

type Role struct {
	ID          string     `gorm:"column:id;size:36;primaryKey"`
	Name        string     `gorm:"column:name;size:50;unique"`
	DisplayName string     `gorm:"column:display_name;size:100"`
	Description *string    `gorm:"column:description"`
	IsBuiltIn   bool       `gorm:"column:is_built_in"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
}

func (Role) TableName() string {
	return "roles"
}

type Permission struct {
	ID          string     `gorm:"column:id;size:36;primaryKey"`
	Name        string     `gorm:"column:name;size:100;unique"`
	DisplayName string     `gorm:"column:display_name;size:200"`
	Description *string    `gorm:"column:description"`
	Module      string     `gorm:"column:module;size:50"`
	Action      string     `gorm:"column:action;size:20"`
	Resource    string     `gorm:"column:resource;size:100"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
}

func (Permission) TableName() string {
	return "permissions"
}

type RolePermission struct {
	ID           string     `gorm:"column:id;size:36;primaryKey"`
	RoleID       string     `gorm:"column:role_id;size:36;uniqueIndex:uni_role_permissions_role_id_permission_id;priority:1"`
	PermissionID string     `gorm:"column:permission_id;size:36;uniqueIndex:uni_role_permissions_role_id_permission_id;priority:2"`
	CreatedAt    *time.Time `gorm:"column:created_at"`
}

func (RolePermission) TableName() string {
	return "role_permissions"
}

type UserRole struct {
	UserID    string     `gorm:"column:user_id;size:36;primaryKey"`
	RoleID    string     `gorm:"column:role_id;size:36;primaryKey"`
	CreatedAt *time.Time `gorm:"column:created_at"`
}

func (UserRole) TableName() string {
	return "user_roles"
}

type AuditLog struct {
	ID           string         `gorm:"column:id;size:36;primaryKey"`
	UserID       *string        `gorm:"column:user_id;size:36"`
	Action       string         `gorm:"column:action;size:100"`
	ResourceType string         `gorm:"column:resource_type;size:100"`
	ResourceID   *string        `gorm:"column:resource_id;size:36"`
	Description  string         `gorm:"column:description"`
	Details      datatypes.JSON `gorm:"column:details"`
	IPAddress    *string        `gorm:"column:ip_address;size:45"`
	UserAgent    *string        `gorm:"column:user_agent"`
	Status       string         `gorm:"column:status;size:20"`
	ErrorMessage *string        `gorm:"column:error_message"`
	CreatedAt    *time.Time     `gorm:"column:created_at"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}
