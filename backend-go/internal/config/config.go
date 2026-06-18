package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/caarlos0/env/v10"
	"github.com/joho/godotenv"
)

const (
	// minProductionSecretLength 为生产环境 JWT 签名密钥的最小字节长度。
	minProductionSecretLength = 32
)

// placeholderSecretMarkers 列举历史默认/模板占位密钥的特征子串。
// 生产环境若密钥包含其中任一标记，视为未替换的占位值，必须 fail-closed 拒绝启动。
// 真实 CSPRNG 随机密钥包含这些长标记的概率可忽略，不会误伤合法密钥。
var placeholderSecretMarkers = []string{
	"change-in-production",
	"change-me",
	"on-first-start",
	"your-secret-key",
	"your-jwt-secret-key",
	"your-super-secret",
}

type Config struct {
	Debug      bool   `env:"DEBUG" envDefault:"false"`
	AppName    string `env:"APP_NAME" envDefault:"Inspect System"`
	AppVersion string `env:"APP_VERSION" envDefault:"1.0.1"`
	SecretKey  string `env:"SECRET_KEY"`

	ServerHost string `env:"SERVER_HOST" envDefault:"0.0.0.0"`
	ServerPort int    `env:"SERVER_PORT"`

	DatabaseURL         string `env:"DATABASE_URL"`
	DatabasePoolSize    int    `env:"DATABASE_POOL_SIZE" envDefault:"5"`
	DatabaseMaxOverflow int    `env:"DATABASE_MAX_OVERFLOW" envDefault:"10"`
	DatabasePoolRecycle int    `env:"DATABASE_POOL_RECYCLE" envDefault:"3600"`
	DatabaseEcho        bool   `env:"DATABASE_ECHO" envDefault:"false"`
	DatabaseAutoMigrate bool   `env:"DB_AUTO_MIGRATE" envDefault:"true"`
	TimescaleEnabled    bool   `env:"TIMESCALE_ENABLED" envDefault:"true"`

	RedisURL                             string        `env:"REDIS_URL" envDefault:"redis://localhost:6379/0"`
	MonitoringCacheEnabled               bool          `env:"MONITORING_CACHE_ENABLED" envDefault:"true"`
	MonitoringCacheTTL                   time.Duration `env:"MONITORING_CACHE_TTL" envDefault:"2m"`
	MonitoringReportDownloadTokenTTL     time.Duration `env:"MONITORING_REPORT_DOWNLOAD_TOKEN_TTL" envDefault:"5m"`
	MonitoringReportDownloadTokenMaxUses int           `env:"MONITORING_REPORT_DOWNLOAD_TOKEN_MAX_USES" envDefault:"3"`

	JWTSecretKey             string `env:"JWT_SECRET_KEY"`
	JWTAlgorithm             string `env:"JWT_ALGORITHM" envDefault:"HS256"`
	AccessTokenExpireMinutes int    `env:"ACCESS_TOKEN_EXPIRE_MINUTES" envDefault:"30"`
	RefreshTokenExpireDays   int    `env:"REFRESH_TOKEN_EXPIRE_DAYS" envDefault:"7"`

	LogLevel         string `env:"LOG_LEVEL" envDefault:"INFO"`
	LogFormat        string `env:"LOG_FORMAT" envDefault:"json"`
	LogToConsole     bool   `env:"LOG_TO_CONSOLE" envDefault:"true"`
	LogFile          string `env:"LOG_FILE" envDefault:"logs/backend-go/app.log"`
	ReportOutputDir  string `env:"REPORT_OUTPUT_DIR" envDefault:"data/reports/monitoring"`
	ReportsOutputDir string `env:"REPORTS_OUTPUT_DIR" envDefault:"data/reports"`
	SnmpTrapEnabled  bool   `env:"SNMP_TRAP_ENABLED" envDefault:"false"`
	SnmpTrapHost     string `env:"SNMP_TRAP_HOST" envDefault:"0.0.0.0"`
	SnmpTrapPort     int    `env:"SNMP_TRAP_PORT" envDefault:"162"`

	CorsOriginsRaw  string `env:"CORS_ORIGINS" envDefault:"[\"http://localhost:3000\",\"http://127.0.0.1:3000\"]"`
	// AllowedHosts 当前未在请求链路强制启用；默认收敛为空列表，避免内置 "*" 通配默认，
	// 后续若启用 Host 校验则从安全默认起步。
	AllowedHostsRaw string `env:"ALLOWED_HOSTS" envDefault:"[]"`

	CorsOrigins  []string `env:"-"`
	AllowedHosts []string `env:"-"`
}

func Load() (Config, error) {
	envBaseDir := loadEnvFiles()

	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return Config{}, err
	}

	cfg.DatabaseURL = normalizeDatabaseURL(cfg.DatabaseURL)
	cfg.CorsOrigins = parseStringList(cfg.CorsOriginsRaw, []string{"http://localhost:3000", "http://127.0.0.1:3000"})
	cfg.AllowedHosts = parseStringList(cfg.AllowedHostsRaw, []string{})

	if strings.TrimSpace(cfg.JWTSecretKey) == "" {
		cfg.JWTSecretKey = cfg.SecretKey
	}

	if strings.TrimSpace(cfg.LogFile) != "" {
		cfg.LogFile = cleanPathFromBase(cfg.LogFile, envBaseDir)
	}
	if strings.TrimSpace(cfg.ReportOutputDir) != "" {
		cfg.ReportOutputDir = cleanPathFromBase(cfg.ReportOutputDir, envBaseDir)
	}
	if strings.TrimSpace(cfg.ReportsOutputDir) != "" {
		cfg.ReportsOutputDir = cleanPathFromBase(cfg.ReportsOutputDir, envBaseDir)
	}

	if err := cfg.validateProductionSecrets(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

// validateProductionSecrets 在生产模式（DEBUG=false）下强制校验 JWT 签名密钥，
// 杜绝使用空值或历史公开占位密钥签发 token 导致的认证绕过（fail-closed 纵深防御）。
// 开发模式（DEBUG=true）保持宽松以便本地裸跑。
func (c Config) validateProductionSecrets() error {
	if c.Debug {
		return nil
	}

	secret := strings.TrimSpace(c.JWTSecretKey)
	switch {
	case secret == "":
		return fmt.Errorf("生产环境（DEBUG=false）必须设置 JWT_SECRET_KEY 或 SECRET_KEY，当前为空")
	case isPlaceholderSecret(secret):
		return fmt.Errorf("JWT 密钥仍为占位/默认值，生产环境必须替换为强随机密钥")
	case len(secret) < minProductionSecretLength:
		return fmt.Errorf("JWT 密钥长度不足 %d 字节，生产环境需使用足够长的强随机密钥", minProductionSecretLength)
	}

	return nil
}

// isPlaceholderSecret 判断密钥是否命中占位特征子串（大小写不敏感）。
func isPlaceholderSecret(secret string) bool {
	lowered := strings.ToLower(secret)
	for _, marker := range placeholderSecretMarkers {
		if strings.Contains(lowered, marker) {
			return true
		}
	}
	return false
}

func (c Config) Address() string {
	return fmt.Sprintf("%s:%d", c.ServerHost, c.ServerPort)
}

func (c Config) SnmpTrapAddress() string {
	host := strings.TrimSpace(c.SnmpTrapHost)
	if host == "" {
		host = "0.0.0.0"
	}
	port := c.SnmpTrapPort
	if port <= 0 {
		port = 162
	}
	return fmt.Sprintf("%s:%d", host, port)
}

func loadEnvFiles() string {
	baseDir := "."
	if wd, err := os.Getwd(); err == nil {
		baseDir = wd
	}

	envFile := strings.TrimSpace(os.Getenv("ENV_FILE"))
	if envFile != "" {
		envValues, err := godotenv.Read(envFile)
		if err == nil {
			for key, value := range envValues {
				if _, exists := os.LookupEnv(key); !exists {
					_ = os.Setenv(key, value)
				}
			}
			return filepath.Dir(absOrClean(envFile))
		}
		return baseDir
	}

	searchDirs := []string{"."}
	if baseDir != "." {
		dir := baseDir
		for i := 0; i < 4; i++ {
			if i == 0 {
				searchDirs = []string{dir}
			} else {
				searchDirs = append(searchDirs, dir)
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	findFirst := func(filename string) string {
		for _, dir := range searchDirs {
			path := filepath.Join(dir, filename)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
		return ""
	}

	// 优先级保持与历史逻辑一致：.env > .env.development > .env.production
	if path := findFirst(".env"); path != "" {
		_ = godotenv.Load(path)
		return filepath.Dir(absOrClean(path))
	}
	if path := findFirst(".env.development"); path != "" {
		_ = godotenv.Load(path)
		return filepath.Dir(absOrClean(path))
	}
	if path := findFirst(".env.production"); path != "" {
		_ = godotenv.Load(path)
		return filepath.Dir(absOrClean(path))
	}
	return baseDir
}

func cleanPathFromBase(raw string, baseDir string) string {
	path := strings.TrimSpace(raw)
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	base := strings.TrimSpace(baseDir)
	if base == "" {
		base = "."
	}
	return filepath.Clean(filepath.Join(base, path))
}

func absOrClean(path string) string {
	if absPath, err := filepath.Abs(path); err == nil {
		return filepath.Clean(absPath)
	}
	return filepath.Clean(path)
}

func normalizeDatabaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return trimmed
	}

	if strings.HasPrefix(trimmed, "postgresql+asyncpg://") {
		return "postgresql://" + strings.TrimPrefix(trimmed, "postgresql+asyncpg://")
	}

	return trimmed
}

func parseStringList(raw string, fallback []string) []string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}

	if strings.HasPrefix(value, "[") {
		var decoded []string
		if err := json.Unmarshal([]byte(value), &decoded); err == nil {
			return trimList(decoded)
		}
	}

	return splitAndTrim(value, ",")
}

func splitAndTrim(value, sep string) []string {
	parts := strings.Split(value, sep)
	return trimList(parts)
}

func trimList(items []string) []string {
	result := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	if len(result) == 0 {
		return []string{}
	}
	return result
}
