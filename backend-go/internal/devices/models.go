package devices

import (
	"encoding/json"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/secrets"
)

type Device struct {
	ID              int            `gorm:"column:id;primaryKey"`
	Name            string         `gorm:"column:name"`
	IPAddress       string         `gorm:"column:ip_address;unique"`
	Hostname        *string        `gorm:"column:hostname"`
	MacAddress      *string        `gorm:"column:mac_address"`
	DeviceType      string         `gorm:"column:device_type"`
	Vendor          string         `gorm:"column:vendor"`
	Model           *string        `gorm:"column:model"`
	SerialNumber    *string        `gorm:"column:serial_number"`
	FirmwareVersion *string        `gorm:"column:firmware_version"`
	Location        *string        `gorm:"column:location"`
	GroupID         *int           `gorm:"column:group_id"`
	Status          string         `gorm:"column:status"`
	IsActive        bool           `gorm:"column:is_active"`
	IsMonitored     bool           `gorm:"column:is_monitored"`
	MonitorInterval int            `gorm:"column:monitor_interval"`
	SnmpVersion     *string        `gorm:"column:snmp_version"`
	SnmpCommunity   *string        `gorm:"column:snmp_community"`
	SnmpPort        *int           `gorm:"column:snmp_port"`
	CliProtocol     *string        `gorm:"column:cli_protocol"`
	SshUsername     *string        `gorm:"column:ssh_username"`
	SshPassword     *string        `gorm:"column:ssh_password"`
	SshPort         *int           `gorm:"column:ssh_port"`
	TelnetUsername  *string        `gorm:"column:telnet_username"`
	TelnetPassword  *string        `gorm:"column:telnet_password"`
	TelnetPort      *int           `gorm:"column:telnet_port"`
	EnablePassword  *string        `gorm:"column:enable_password"`
	IcmpStatus      *string        `gorm:"column:icmp_status"`
	SnmpStatus      *string        `gorm:"column:snmp_status"`
	LastProbeTime   *time.Time     `gorm:"column:last_probe_time"`
	CPUUsage        *float64       `gorm:"column:cpu_usage"`
	MemoryUsage     *float64       `gorm:"column:memory_usage"`
	Temperature     *float64       `gorm:"column:temperature"`
	Uptime          *int64         `gorm:"column:uptime"`
	ResponseTime    *float64       `gorm:"column:response_time"`
	LastSeen        *time.Time     `gorm:"column:last_seen"`
	AlertCount      *int           `gorm:"column:alert_count"`
	Description     *string        `gorm:"column:description"`
	Tags            datatypes.JSON `gorm:"column:tags;type:jsonb"`
	CreatedBy       *string        `gorm:"column:created_by"`
	CreatedAt       *time.Time     `gorm:"column:created_at"`
	UpdatedAt       *time.Time     `gorm:"column:updated_at"`
}

func (Device) TableName() string {
	return "devices"
}

// credentialCipher 为设备 CLI 凭据的加解密器，由 app 启动时经 SetCredentialCipher 注入。
// 为 nil 时所有加解密退化为明文直通（兼容未配置密钥的开发裸跑）。
var credentialCipher *secrets.Cipher

// SetCredentialCipher 注入设备凭据加解密器（进程级，启动时设置一次）。
func SetCredentialCipher(c *secrets.Cipher) {
	credentialCipher = c
}

// encryptCredential 加密单个凭据字段，供 map 更新路径（不触发 GORM 钩子）显式调用。
func encryptCredential(plaintext string) (string, error) {
	if credentialCipher == nil {
		return plaintext, nil
	}
	return credentialCipher.Encrypt(plaintext)
}

// deviceCredentialFields 返回需加解密的顶层凭据列指针集合（统一维护，避免遗漏）。
// 含 CLI 三密码与 SNMP community（v2c 团体名等价于读凭据）。
func (d *Device) deviceCredentialFields() []**string {
	return []**string{&d.SshPassword, &d.TelnetPassword, &d.EnablePassword, &d.SnmpCommunity}
}

// BeforeSave 在 struct 写入（如 Create）前加密设备凭据（顶层列 + tags 内嵌套凭据）。
// 幂等：空串与已加密值不变。注意 map 形式的 Updates 不触发本钩子，由 service 层显式加密。
func (d *Device) BeforeSave(tx *gorm.DB) error {
	if credentialCipher == nil {
		return nil
	}
	for _, field := range d.deviceCredentialFields() {
		if *field == nil {
			continue
		}
		enc, err := credentialCipher.Encrypt(**field)
		if err != nil {
			return err
		}
		*field = &enc
	}
	encTags, err := transformTagsCredentials(d.Tags, credentialCipher.Encrypt)
	if err != nil {
		return err
	}
	d.Tags = encTags
	return nil
}

// AfterFind 在查询后解密设备凭据（顶层列 + tags 内嵌套凭据），使所有读取点
// （备份/采集/探测/连接测试等）直接拿到明文，无需各自解密。
// 存量明文（无前缀）原样返回，实现平滑兼容。
func (d *Device) AfterFind(tx *gorm.DB) error {
	if credentialCipher == nil {
		return nil
	}
	for _, field := range d.deviceCredentialFields() {
		if *field == nil {
			continue
		}
		dec, err := credentialCipher.Decrypt(**field)
		if err != nil {
			return err
		}
		*field = &dec
	}
	decTags, err := transformTagsCredentials(d.Tags, credentialCipher.Decrypt)
	if err != nil {
		return err
	}
	d.Tags = decTags
	return nil
}

// tagsCredentialPaths 列举 tags(JSONB) 中需要加解密的凭据字段路径。
// 这些字段历史上以明文嵌套存储于 tags，需与顶层列一并保护。
var tagsCredentialPaths = [][]string{
	{"cli_config", "ssh_config", "password"},
	{"cli_config", "ssh_config", "private_key"},
	{"cli_config", "ssh_config", "key_passphrase"},
	{"cli_config", "telnet_config", "password"},
	{"cli_config", "telnet_config", "enable_password"},
	{"snmp_config", "v2c_config", "community"},
	{"snmp_config", "v2c_config", "write_community"},
	{"snmp_config", "v3_config", "auth_password"},
	{"snmp_config", "v3_config", "priv_password"},
}

// transformTagsCredentials 对 tags(JSONB) 内已知凭据字段路径应用 transform（加密或解密），
// 仅改动凭据字段、保留其余结构。空/非对象 JSON 原样返回。
func transformTagsCredentials(raw datatypes.JSON, transform func(string) (string, error)) (datatypes.JSON, error) {
	if len(raw) == 0 {
		return raw, nil
	}
	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		// 非对象 JSON（理论上不应出现）原样返回，避免破坏数据。
		return raw, nil
	}

	changed := false
	for _, path := range tagsCredentialPaths {
		if err := applyTagCredential(root, path, transform, &changed); err != nil {
			return raw, err
		}
	}
	if !changed {
		return raw, nil
	}

	out, err := json.Marshal(root)
	if err != nil {
		return raw, err
	}
	return datatypes.JSON(out), nil
}

// applyTagCredential 沿 path 导航到目标字段并对其字符串值应用 transform；
// 路径不存在、非字符串或空串则跳过。
func applyTagCredential(root map[string]interface{}, path []string, transform func(string) (string, error), changed *bool) error {
	node := root
	for i := 0; i < len(path)-1; i++ {
		next, ok := node[path[i]].(map[string]interface{})
		if !ok {
			return nil
		}
		node = next
	}
	key := path[len(path)-1]
	value, ok := node[key].(string)
	if !ok || value == "" {
		return nil
	}
	transformed, err := transform(value)
	if err != nil {
		return err
	}
	if transformed != value {
		node[key] = transformed
		*changed = true
	}
	return nil
}

// SSHKeyCredentials 从 tags 中提取 SSH 密钥认证凭据（私钥与口令），
// 须在 AfterFind 解密之后调用（经 GORM 查询的 Device 已满足）。
// 仅当 cli_config.ssh_config.use_key_auth 为 true 时返回私钥——
// 用户在表单切回密码认证后，即使 tags 中残留私钥也不再使用。
func (d *Device) SSHKeyCredentials() (privateKey, keyPassphrase string) {
	if len(d.Tags) == 0 {
		return "", ""
	}
	var root map[string]interface{}
	if err := json.Unmarshal(d.Tags, &root); err != nil {
		return "", ""
	}
	cliConfig, _ := root["cli_config"].(map[string]interface{})
	sshConfig, _ := cliConfig["ssh_config"].(map[string]interface{})
	if sshConfig == nil {
		return "", ""
	}
	if useKeyAuth, _ := sshConfig["use_key_auth"].(bool); !useKeyAuth {
		return "", ""
	}
	privateKey, _ = sshConfig["private_key"].(string)
	keyPassphrase, _ = sshConfig["key_passphrase"].(string)
	return privateKey, keyPassphrase
}

// mergeTagsCredentials 将旧 tags 中的凭据合并进新 tags：凭据键在新 tags 中缺失或为空、
// 且其父对象存在时，继承旧值。配合前端"编辑留空=保持原值"的约定，避免 UpdateDevice
// 整体替换 tags 时把未重新输入的密码/私钥静默抹掉（私钥仅存于 tags，没有顶层列可回退，
// 一旦抹掉巡检/备份即认证失败）。父对象不存在视为用户放弃该配置块（如切换 CLI 协议），
// 不继承。两侧均为明文（旧值经 AfterFind 解密、新值来自前端提交），合并后由调用方统一加密。
func mergeTagsCredentials(newTags, oldTags datatypes.JSON) datatypes.JSON {
	if len(newTags) == 0 || len(oldTags) == 0 {
		return newTags
	}
	var newRoot, oldRoot map[string]interface{}
	if err := json.Unmarshal(newTags, &newRoot); err != nil {
		return newTags
	}
	if err := json.Unmarshal(oldTags, &oldRoot); err != nil {
		return newTags
	}

	changed := false
	for _, path := range tagsCredentialPaths {
		node := navigateTagPath(newRoot, path)
		if node == nil {
			continue
		}
		key := path[len(path)-1]
		if text, _ := node[key].(string); strings.TrimSpace(text) != "" {
			continue // 用户输入了新凭据，保留新值
		}
		oldNode := navigateTagPath(oldRoot, path)
		if oldNode == nil {
			continue
		}
		if oldText, _ := oldNode[key].(string); oldText != "" {
			node[key] = oldText
			changed = true
		}
	}
	if !changed {
		return newTags
	}
	out, err := json.Marshal(newRoot)
	if err != nil {
		return newTags
	}
	return datatypes.JSON(out)
}

// navigateTagPath 沿 path（不含最后一段键名）导航到父对象，任一层不存在返回 nil。
func navigateTagPath(root map[string]interface{}, path []string) map[string]interface{} {
	node := root
	for i := 0; i < len(path)-1; i++ {
		next, ok := node[path[i]].(map[string]interface{})
		if !ok {
			return nil
		}
		node = next
	}
	return node
}

type DeviceGroup struct {
	ID          int        `gorm:"column:id;primaryKey"`
	Name        string     `gorm:"column:name;unique"`
	Description *string    `gorm:"column:description"`
	ParentID    *int       `gorm:"column:parent_id"`
	DeviceCount *int       `gorm:"column:device_count"`
	IsActive    *bool      `gorm:"column:is_active"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
}

func (DeviceGroup) TableName() string {
	return "device_groups"
}

// DeviceInterface 设备接口当前状态表。此前缺失 model 与建表，
// 导致 WriteDeviceMetrics 写接口速率时报 42P01 并回滚整笔指标写入（含 cpu/mem 快照）。
type DeviceInterface struct {
	ID          int        `gorm:"column:id;primaryKey"`
	DeviceID    int        `gorm:"column:device_id;uniqueIndex:uq_device_iface"`
	Name        string     `gorm:"column:name;uniqueIndex:uq_device_iface"`
	Alias       *string    `gorm:"column:alias"`
	Speed       *int64     `gorm:"column:speed"`
	InOctets    *int64     `gorm:"column:in_octets"`
	OutOctets   *int64     `gorm:"column:out_octets"`
	IsUp        *bool      `gorm:"column:is_up"`
	LastUpdated *time.Time `gorm:"column:last_updated"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
}

func (DeviceInterface) TableName() string {
	return "device_interfaces"
}

type NetworkScan struct {
	ID              string         `gorm:"column:id;primaryKey"`
	Name            string         `gorm:"column:name"`
	TargetNetwork   string         `gorm:"column:target_network"`
	ScanType        string         `gorm:"column:scan_type"`
	Status          string         `gorm:"column:status"`
	Progress        int            `gorm:"column:progress"`
	TotalHosts      int            `gorm:"column:total_hosts"`
	ScannedHosts    int            `gorm:"column:scanned_hosts"`
	AliveHosts      int            `gorm:"column:alive_hosts"`
	DevicesFound    int            `gorm:"column:devices_found"`
	ScanPorts       datatypes.JSON `gorm:"column:scan_ports;type:jsonb"`
	SnmpCommunities datatypes.JSON `gorm:"column:snmp_communities;type:jsonb"`
	Timeout         *int           `gorm:"column:timeout"`
	MaxThreads      *int           `gorm:"column:max_threads"`
	PingCount       *int           `gorm:"column:ping_count"`
	StartedAt       *time.Time     `gorm:"column:started_at"`
	CompletedAt     *time.Time     `gorm:"column:completed_at"`
	Duration        *int           `gorm:"column:duration"`
	ResultSummary   datatypes.JSON `gorm:"column:result_summary;type:jsonb"`
	ErrorMessage    *string        `gorm:"column:error_message"`
	LogData         *string        `gorm:"column:log_data"`
	CreatedBy       *string        `gorm:"column:created_by"`
	CreatedAt       *time.Time     `gorm:"column:created_at"`
	UpdatedAt       *time.Time     `gorm:"column:updated_at"`
}

func (NetworkScan) TableName() string {
	return "network_scans"
}

type DiscoveredDevice struct {
	ID               int            `gorm:"column:id;primaryKey"`
	ScanID           string         `gorm:"column:scan_id;uniqueIndex:uni_discovered_devices_scan_id_ip_address;priority:1"`
	IPAddress        string         `gorm:"column:ip_address;uniqueIndex:uni_discovered_devices_scan_id_ip_address;priority:2"`
	Hostname         *string        `gorm:"column:hostname"`
	MacAddress       *string        `gorm:"column:mac_address"`
	Vendor           *string        `gorm:"column:vendor"`
	DeviceType       *string        `gorm:"column:device_type"`
	OSInfo           *string        `gorm:"column:os_info"`
	OpenPorts        datatypes.JSON `gorm:"column:open_ports;type:jsonb"`
	Services         datatypes.JSON `gorm:"column:services;type:jsonb"`
	SnmpInfo         datatypes.JSON `gorm:"column:snmp_info;type:jsonb"`
	ResponseTime     *float64       `gorm:"column:response_time"`
	Confidence       *float64       `gorm:"column:confidence"`
	IsImported       bool           `gorm:"column:is_imported"`
	ImportedDeviceID *int           `gorm:"column:imported_device_id"`
	DiscoveredAt     *time.Time     `gorm:"column:discovered_at"`
}

func (DiscoveredDevice) TableName() string {
	return "discovered_devices"
}
