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

type Config struct {
	Debug      bool   `env:"DEBUG" envDefault:"false"`
	AppName    string `env:"APP_NAME" envDefault:"Inspect System"`
	AppVersion string `env:"APP_VERSION" envDefault:"1.0.0"`
	SecretKey  string `env:"SECRET_KEY" envDefault:"your-secret-key-change-in-production"`

	ServerHost string `env:"SERVER_HOST" envDefault:"0.0.0.0"`
	ServerPort int    `env:"SERVER_PORT" envDefault:"38000"`

	DatabaseURL         string `env:"DATABASE_URL" envDefault:"postgresql://postgres:password@localhost:5432/inspect_db"`
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

	JWTSecretKey             string `env:"JWT_SECRET_KEY" envDefault:"your-jwt-secret-key-change-in-production"`
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
	AllowedHostsRaw string `env:"ALLOWED_HOSTS" envDefault:"[\"*\"]"`

	CorsOrigins  []string `env:"-"`
	AllowedHosts []string `env:"-"`
}

func Load() (Config, error) {
	loadEnvFiles()

	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return Config{}, err
	}

	cfg.DatabaseURL = normalizeDatabaseURL(cfg.DatabaseURL)
	cfg.CorsOrigins = parseStringList(cfg.CorsOriginsRaw, []string{"http://localhost:3000", "http://127.0.0.1:3000"})
	cfg.AllowedHosts = parseStringList(cfg.AllowedHostsRaw, []string{"*"})

	if strings.TrimSpace(cfg.JWTSecretKey) == "" {
		cfg.JWTSecretKey = cfg.SecretKey
	}

	if strings.TrimSpace(cfg.LogFile) != "" {
		cfg.LogFile = filepath.Clean(cfg.LogFile)
	}
	if strings.TrimSpace(cfg.ReportOutputDir) != "" {
		cfg.ReportOutputDir = filepath.Clean(cfg.ReportOutputDir)
	}
	if strings.TrimSpace(cfg.ReportsOutputDir) != "" {
		cfg.ReportsOutputDir = filepath.Clean(cfg.ReportsOutputDir)
	}

	return cfg, nil
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

func loadEnvFiles() {
	envFile := strings.TrimSpace(os.Getenv("ENV_FILE"))
	if envFile != "" {
		envValues, err := godotenv.Read(envFile)
		if err == nil {
			for key, value := range envValues {
				if _, exists := os.LookupEnv(key); !exists {
					_ = os.Setenv(key, value)
				}
			}
		}
		return
	}

	searchDirs := []string{"."}
	if wd, err := os.Getwd(); err == nil {
		dir := wd
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
		return
	}
	if path := findFirst(".env.development"); path != "" {
		_ = godotenv.Load(path)
		return
	}
	if path := findFirst(".env.production"); path != "" {
		_ = godotenv.Load(path)
	}
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
