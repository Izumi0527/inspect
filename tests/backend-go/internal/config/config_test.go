package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

// testStrongSecret 为长度 ≥32 的强密钥占位，供需要通过生产校验的用例复用。
const testStrongSecret = "0123456789abcdef0123456789abcdef0123456789abcdef"

func TestLoadResolvesLogFileRelativeToEnvFileDirectory(t *testing.T) {
	projectRoot := t.TempDir()
	backendDir := filepath.Join(projectRoot, "backend-go")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		t.Fatalf("create backend dir: %v", err)
	}

	envPath := filepath.Join(projectRoot, ".env")
	envContent := "SERVER_PORT=9000\nLOG_FILE=logs/backend-go/app-dev.log\nJWT_SECRET_KEY=" + testStrongSecret + "\n"
	if err := os.WriteFile(envPath, []byte(envContent), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(originalWD); err != nil {
			t.Fatalf("restore working directory: %v", err)
		}
	})
	if err := os.Chdir(backendDir); err != nil {
		t.Fatalf("change working directory: %v", err)
	}

	withCleanEnv(t, "ENV_FILE", "LOG_FILE", "SERVER_PORT", "JWT_SECRET_KEY")
	t.Setenv("ENV_FILE", envPath)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	expected := filepath.Join(projectRoot, "logs", "backend-go", "app-dev.log")
	if cfg.LogFile != expected {
		t.Fatalf("LogFile = %q, want %q", cfg.LogFile, expected)
	}
}

func TestLoadResolvesReportDirsRelativeToEnvFileDirectory(t *testing.T) {
	projectRoot := t.TempDir()
	backendDir := filepath.Join(projectRoot, "backend-go")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		t.Fatalf("create backend dir: %v", err)
	}

	envPath := filepath.Join(projectRoot, ".env")
	envContent := strings.Join([]string{
		"SERVER_PORT=9000",
		"REPORT_OUTPUT_DIR=backend-go/data/reports/monitoring",
		"REPORTS_OUTPUT_DIR=backend-go/data/reports",
		"JWT_SECRET_KEY=" + testStrongSecret,
		"",
	}, "\n")
	if err := os.WriteFile(envPath, []byte(envContent), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(originalWD); err != nil {
			t.Fatalf("restore working directory: %v", err)
		}
	})
	if err := os.Chdir(backendDir); err != nil {
		t.Fatalf("change working directory: %v", err)
	}

	withCleanEnv(t, "ENV_FILE", "REPORT_OUTPUT_DIR", "REPORTS_OUTPUT_DIR", "SERVER_PORT", "JWT_SECRET_KEY")
	t.Setenv("ENV_FILE", envPath)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	expectedMonitoringDir := filepath.Join(projectRoot, "backend-go", "data", "reports", "monitoring")
	if cfg.ReportOutputDir != expectedMonitoringDir {
		t.Fatalf("ReportOutputDir = %q, want %q", cfg.ReportOutputDir, expectedMonitoringDir)
	}

	expectedReportsDir := filepath.Join(projectRoot, "backend-go", "data", "reports")
	if cfg.ReportsOutputDir != expectedReportsDir {
		t.Fatalf("ReportsOutputDir = %q, want %q", cfg.ReportsOutputDir, expectedReportsDir)
	}
}

func withCleanEnv(t *testing.T, keys ...string) {
	t.Helper()

	type envState struct {
		key     string
		value   string
		existed bool
	}

	states := make([]envState, 0, len(keys))
	for _, key := range keys {
		value, existed := os.LookupEnv(key)
		states = append(states, envState{key: key, value: value, existed: existed})
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}

	t.Cleanup(func() {
		for _, state := range states {
			if state.existed {
				_ = os.Setenv(state.key, state.value)
			} else {
				_ = os.Unsetenv(state.key)
			}
		}
	})
}

// loadWithEnvFile 在隔离的临时目录与 ENV_FILE 下执行 config.Load()，
// 避免读到仓库真实 .env，专用于校验生产密钥 fail-closed 行为。
func loadWithEnvFile(t *testing.T, envContent string) (config.Config, error) {
	t.Helper()

	projectRoot := t.TempDir()
	backendDir := filepath.Join(projectRoot, "backend-go")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		t.Fatalf("create backend dir: %v", err)
	}

	envPath := filepath.Join(projectRoot, ".env")
	if err := os.WriteFile(envPath, []byte(envContent), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	originalWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("get working directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(originalWD); err != nil {
			t.Fatalf("restore working directory: %v", err)
		}
	})
	if err := os.Chdir(backendDir); err != nil {
		t.Fatalf("change working directory: %v", err)
	}

	withCleanEnv(t, "ENV_FILE", "DEBUG", "SECRET_KEY", "JWT_SECRET_KEY",
		"DATABASE_URL", "SERVER_PORT", "ALLOWED_HOSTS",
		"LOG_FILE", "REPORT_OUTPUT_DIR", "REPORTS_OUTPUT_DIR")
	t.Setenv("ENV_FILE", envPath)

	return config.Load()
}

func TestLoadFailsWhenProductionSecretMissing(t *testing.T) {
	if _, err := loadWithEnvFile(t, "DEBUG=false\nSERVER_PORT=9000\n"); err == nil {
		t.Fatal("生产模式缺少 JWT 密钥应当报错，但 Load 成功返回")
	}
}

func TestLoadFailsWhenProductionSecretIsLegacyDefault(t *testing.T) {
	content := "DEBUG=false\nJWT_SECRET_KEY=your-jwt-secret-key-change-in-production\n"
	if _, err := loadWithEnvFile(t, content); err == nil {
		t.Fatal("生产模式使用历史占位密钥应当报错，但 Load 成功返回")
	}
}

func TestLoadFailsWhenSecretKeyFallbackIsLegacyDefault(t *testing.T) {
	// 仅设置 SECRET_KEY 为历史占位，JWT_SECRET_KEY 留空走回退，仍应被拦截。
	content := "DEBUG=false\nSECRET_KEY=your-secret-key-change-in-production\n"
	if _, err := loadWithEnvFile(t, content); err == nil {
		t.Fatal("回退到历史占位 SECRET_KEY 应当报错，但 Load 成功返回")
	}
}

func TestLoadFailsWhenSecretIsInstallerPlaceholder(t *testing.T) {
	// 安装包模板首启前的占位值（长度虽 ≥32，但属未替换占位），应被拦截。
	content := "DEBUG=false\nJWT_SECRET_KEY=change-me-generated-on-first-start\n"
	if _, err := loadWithEnvFile(t, content); err == nil {
		t.Fatal("安装包占位密钥应当报错，但 Load 成功返回")
	}
}

func TestLoadFailsWhenProductionSecretTooShort(t *testing.T) {
	if _, err := loadWithEnvFile(t, "DEBUG=false\nJWT_SECRET_KEY=short-secret\n"); err == nil {
		t.Fatal("生产模式密钥过短应当报错，但 Load 成功返回")
	}
}

func TestLoadSucceedsWithStrongProductionSecret(t *testing.T) {
	content := "DEBUG=false\nSERVER_PORT=9000\nJWT_SECRET_KEY=" + testStrongSecret + "\n"
	cfg, err := loadWithEnvFile(t, content)
	if err != nil {
		t.Fatalf("强密钥下应当成功加载: %v", err)
	}
	if cfg.JWTSecretKey != testStrongSecret {
		t.Fatalf("JWTSecretKey = %q, want %q", cfg.JWTSecretKey, testStrongSecret)
	}
}

func TestLoadAllowsMissingSecretInDebug(t *testing.T) {
	if _, err := loadWithEnvFile(t, "DEBUG=true\nSERVER_PORT=9000\n"); err != nil {
		t.Fatalf("开发模式（DEBUG=true）不应强制密钥: %v", err)
	}
}
