package settings

import "time"

type SettingItem struct {
	Key         string      `json:"key"`
	Value       interface{} `json:"value"`
	Category    string      `json:"category"`
	Type        string      `json:"type,omitempty"`
	Label       string      `json:"label,omitempty"`
	Description *string     `json:"description,omitempty"`
	Required    bool        `json:"required,omitempty"`
	Readonly    bool        `json:"readonly,omitempty"`
	Validation  interface{} `json:"validation,omitempty"`
	UpdatedAt   *time.Time  `json:"updated_at,omitempty"`
	UpdatedBy   *string     `json:"updated_by,omitempty"`
}

type SettingListResponse struct {
	Items []SettingItem `json:"items"`
	Total int           `json:"total"`
}

type BulkUpdateResponse struct {
	UpdatedCount int      `json:"updated_count"`
	FailedKeys   []string `json:"failed_keys"`
	Message      string   `json:"message"`
}

type ExportConfigResponse struct {
	ConfigData map[string]interface{} `json:"config_data"`
	ExportTime time.Time              `json:"export_time"`
	TotalCount int                    `json:"total_count"`
}

type ImportConfigResponse struct {
	ImportedCount int      `json:"imported_count"`
	SkippedCount  int      `json:"skipped_count"`
	FailedKeys    []string `json:"failed_keys"`
	Message       string   `json:"message"`
}

type SettingGroup struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	DisplayName string           `json:"displayName"`
	Description string           `json:"description"`
	Icon        string           `json:"icon"`
	Order       int              `json:"order"`
	Configs     []SettingDetails `json:"configs"`
}

type SettingDetails struct {
	ID          string          `json:"id"`
	Key         string          `json:"key"`
	Value       interface{}     `json:"value"`
	Category    string          `json:"category"`
	Type        string          `json:"type"`
	Label       string          `json:"label"`
	Description *string         `json:"description,omitempty"`
	Required    bool            `json:"required"`
	Readonly    bool            `json:"readonly"`
	Validation  *ValidationRule `json:"validation,omitempty"`
	UpdatedAt   *time.Time      `json:"updated_at,omitempty"`
	UpdatedBy   *string         `json:"updated_by,omitempty"`
}

type SystemInfoResponse struct {
	ApplicationName string     `json:"application_name"`
	Version         string     `json:"version"`
	Timezone        string     `json:"timezone"`
	LastBackup      *time.Time `json:"last_backup"`
}

type UserDTO struct {
	ID          string     `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	FullName    *string    `json:"fullName,omitempty"`
	Avatar      *string    `json:"avatar,omitempty"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	Permissions []string   `json:"permissions"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	LastLoginIP *string    `json:"lastLoginIP,omitempty"`
	CreatedAt   *time.Time `json:"createdAt,omitempty"`
	UpdatedAt   *time.Time `json:"updatedAt,omitempty"`
	CreatedBy   string     `json:"createdBy"`
	UpdatedBy   string     `json:"updatedBy"`
}

type UserListResponse struct {
	Items           []UserDTO `json:"items"`
	Total           int       `json:"total"`
	Page            int       `json:"page"`
	PageSize        int       `json:"page_size"`
	HasNext         bool      `json:"has_next"`
	HasPrev         bool      `json:"has_prev"`
	Users           []UserDTO `json:"users"`
	TotalCount      int       `json:"total_count"`
	PageSizeCamel   int       `json:"pageSize,omitempty"`
	HasNextCamel    bool      `json:"hasNext,omitempty"`
	HasPrevCamel    bool      `json:"hasPrev,omitempty"`
	TotalCountCamel int       `json:"totalCount,omitempty"`
}

type UserStatsResponse struct {
	TotalUsers    int                      `json:"total_users"`
	ActiveUsers   int                      `json:"active_users"`
	InactiveUsers int                      `json:"inactive_users"`
	LockedUsers   int                      `json:"locked_users"`
	AdminCount    int                      `json:"admin_count"`
	OperatorCount int                      `json:"operator_count"`
	ViewerCount   int                      `json:"viewer_count"`
	OnlineUsers   int                      `json:"online_users"`
	UsersByRole   map[string]int           `json:"users_by_role,omitempty"`
	NewUsersToday int                      `json:"new_users_today,omitempty"`
	NewUsersWeek  int                      `json:"new_users_this_week,omitempty"`
	NewUsersMonth int                      `json:"new_users_this_month,omitempty"`
	LoginToday    int                      `json:"login_count_today,omitempty"`
	LoginWeek     int                      `json:"login_count_this_week,omitempty"`
	RecentUsers   []map[string]interface{} `json:"recent_active_users,omitempty"`
}

type ImportUserPayload struct {
	Username            string `json:"username"`
	Email               string `json:"email"`
	FullName            string `json:"fullName,omitempty"`
	Role                string `json:"role,omitempty"`
	Password            string `json:"password,omitempty"`
	Status              string `json:"status,omitempty"`
	ForcePasswordChange *bool  `json:"forcePasswordChange,omitempty"`
}

type UserBulkImportRequest struct {
	Users               []ImportUserPayload `json:"users"`
	SendEmail           bool                `json:"sendEmail"`
	ForcePasswordChange bool                `json:"forcePasswordChange"`
}

type UserBulkImportError struct {
	Row      int    `json:"row"`
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
	Error    string `json:"error"`
}

type UserBulkImportResult struct {
	Total   int                   `json:"total"`
	Success int                   `json:"success"`
	Failed  int                   `json:"failed"`
	Errors  []UserBulkImportError `json:"errors"`
}

type BatchOperationResult struct {
	UserID  string `json:"user_id"`
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

type BatchOperationResponse struct {
	SuccessCount int                    `json:"success_count"`
	FailedCount  int                    `json:"failed_count"`
	Results      []BatchOperationResult `json:"results"`
	Message      string                 `json:"message"`
}

type RoleDTO struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	DisplayName   string          `json:"displayName"`
	Description   string          `json:"description"`
	Permissions   []PermissionDTO `json:"permissions"`
	UserCount     int             `json:"userCount"`
	IsBuiltIn     bool            `json:"isBuiltIn"`
	CreatedAt     *time.Time      `json:"createdAt,omitempty"`
	UpdatedAt     *time.Time      `json:"updatedAt,omitempty"`
	PermissionIDs []string        `json:"permission_ids,omitempty"`
}

type PermissionDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	DisplayName string  `json:"displayName"`
	Description *string `json:"description,omitempty"`
	Module      string  `json:"module"`
	Action      string  `json:"action"`
	Resource    string  `json:"resource"`
}

type AuditLogItem struct {
	ID           string      `json:"id"`
	UserID       *string     `json:"user_id,omitempty"`
	UserIDCamel  *string     `json:"userId,omitempty"`
	Username     *string     `json:"username,omitempty"`
	Action       string      `json:"action"`
	ResourceType string      `json:"resource_type"`
	ResourceID   *string     `json:"resource_id,omitempty"`
	Description  string      `json:"description"`
	Details      interface{} `json:"details,omitempty"`
	IPAddress    *string     `json:"ip_address,omitempty"`
	UserAgent    *string     `json:"user_agent,omitempty"`
	Status       string      `json:"status"`
	ErrorMessage *string     `json:"error_message,omitempty"`
	CreatedAt    *time.Time  `json:"created_at,omitempty"`

	Resource  string     `json:"resource,omitempty"`
	Method    string     `json:"method,omitempty"`
	Path      string     `json:"path,omitempty"`
	IP        string     `json:"ip,omitempty"`
	Timestamp *time.Time `json:"timestamp,omitempty"`
	Duration  int        `json:"duration,omitempty"`
}

type AuditLogListResponse struct {
	Items    []AuditLogItem `json:"items"`
	Total    int            `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
}

type AuditStatsResponse struct {
	TotalLogs             int                      `json:"total_logs"`
	LogsToday             int                      `json:"logs_today"`
	LogsThisWeek          int                      `json:"logs_this_week"`
	LogsThisMonth         int                      `json:"logs_this_month"`
	LogsByAction          map[string]int           `json:"logs_by_action"`
	LogsByStatus          map[string]int           `json:"logs_by_status"`
	LogsByResourceType    map[string]int           `json:"logs_by_resource_type"`
	TopActiveUsers        []map[string]interface{} `json:"top_active_users"`
	TopActions            []map[string]interface{} `json:"top_actions"`
	FailedOperationsCount int                      `json:"failed_operations_count"`
	FailedOperationsRate  float64                  `json:"failed_operations_rate"`
}

type BackupConfig struct {
	AutoBackupEnabled bool   `json:"autoBackupEnabled"`
	BackupFrequency   string `json:"backupFrequency"`
	BackupTime        string `json:"backupTime"`
	RetentionDays     int    `json:"retentionDays"`
	BackupPath        string `json:"backupPath"`
	IncludeDatabase   bool   `json:"includeDatabase"`
	IncludeFiles      bool   `json:"includeFiles"`
	CompressBackup    bool   `json:"compressBackup"`
}

type BackupRecord struct {
	ID           string  `json:"id"`
	FileName     string  `json:"fileName"`
	FilePath     string  `json:"filePath"`
	FileSize     int64   `json:"fileSize"`
	BackupType   string  `json:"backupType"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"createdAt"`
	CreatedBy    string  `json:"createdBy"`
	Duration     int     `json:"duration"`
	ErrorMessage *string `json:"errorMessage,omitempty"`
}

type BackupManagementResponse struct {
	Config     BackupConfig   `json:"config"`
	Backups    []BackupRecord `json:"backups"`
	TotalCount int            `json:"totalCount"`
	DiskUsage  DiskUsage      `json:"diskUsage"`
}

type DiskUsage struct {
	Used       int64   `json:"used"`
	Total      int64   `json:"total"`
	Percentage float64 `json:"percentage"`
}

type BackupStats struct {
	TotalBackups      int     `json:"total_backups"`
	SuccessfulBackups int     `json:"successful_backups"`
	FailedBackups     int     `json:"failed_backups"`
	TotalSize         int64   `json:"total_size"`
	LastBackupTime    *string `json:"last_backup_time"`
	LastBackupStatus  *string `json:"last_backup_status"`
}

type MonitoringMetrics struct {
	CPU     CPUMetrics     `json:"cpu"`
	Memory  MemoryMetrics  `json:"memory"`
	Disk    DiskMetrics    `json:"disk"`
	Network NetworkMetrics `json:"network"`
}

type CPUMetrics struct {
	Usage       float64   `json:"usage"`
	Cores       int       `json:"cores"`
	Temperature *float64  `json:"temperature,omitempty"`
	LoadAverage []float64 `json:"loadAverage,omitempty"`
}

type MemoryMetrics struct {
	Total int64   `json:"total"`
	Used  int64   `json:"used"`
	Free  int64   `json:"free"`
	Usage float64 `json:"usage"`
}

type DiskMetrics struct {
	Total int64   `json:"total"`
	Used  int64   `json:"used"`
	Free  int64   `json:"free"`
	Usage float64 `json:"usage"`
}

type NetworkMetrics struct {
	BytesReceived   uint64 `json:"bytesReceived"`
	BytesSent       uint64 `json:"bytesSent"`
	PacketsReceived uint64 `json:"packetsReceived"`
	PacketsSent     uint64 `json:"packetsSent"`
}

type ServiceHealth struct {
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	ResponseTime int       `json:"responseTime"`
	Uptime       *int64    `json:"uptime"`
	LastCheck    time.Time `json:"lastCheck"`
	ErrorMessage *string   `json:"errorMessage,omitempty"`
}

type SystemInfo struct {
	Hostname      string `json:"hostname"`
	Platform      string `json:"platform"`
	OSVersion     string `json:"osVersion"`
	NodeVersion   string `json:"nodeVersion"`
	Uptime        int64  `json:"uptime"`
	ProcessUptime int64  `json:"processUptime"`
}

type MonitoringResponse struct {
	Metrics   MonitoringMetrics `json:"metrics"`
	Services  []ServiceHealth   `json:"services"`
	System    SystemInfo        `json:"system"`
	Timestamp time.Time         `json:"timestamp"`
}

type MetricDataPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

type MetricHistory struct {
	CPU    []MetricDataPoint `json:"cpu"`
	Memory []MetricDataPoint `json:"memory"`
	Disk   []MetricDataPoint `json:"disk"`
}

type SystemHealthResponse struct {
	Overall   string                `json:"overall"`
	Services  []SystemServiceHealth `json:"services"`
	Resources SystemResourceHealth  `json:"resources"`
	Alerts    []SystemAlert         `json:"alerts"`
}

type SystemServiceHealth struct {
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Uptime    int64     `json:"uptime"`
	LastCheck time.Time `json:"lastCheck"`
	Details   *string   `json:"details,omitempty"`
}

type SystemResourceHealth struct {
	CPU      ResourceStatus `json:"cpu"`
	Memory   ResourceStatus `json:"memory"`
	Disk     ResourceStatus `json:"disk"`
	Database DatabaseStatus `json:"database"`
}

type ResourceStatus struct {
	Status string  `json:"status"`
	Usage  float64 `json:"usage"`
}

type DatabaseStatus struct {
	Status      string `json:"status"`
	Connections int    `json:"connections"`
}

type SystemAlert struct {
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type SessionInfo struct {
	SessionID    string     `json:"session_id"`
	UserID       string     `json:"user_id"`
	Username     string     `json:"username"`
	IPAddress    *string    `json:"ip_address,omitempty"`
	UserAgent    *string    `json:"user_agent,omitempty"`
	CreatedAt    *time.Time `json:"created_at,omitempty"`
	LastActivity *time.Time `json:"last_activity,omitempty"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
	IsActive     bool       `json:"is_active"`
}

type SessionListResponse struct {
	Total    int           `json:"total"`
	Sessions []SessionInfo `json:"sessions"`
}

type TestResult struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}
