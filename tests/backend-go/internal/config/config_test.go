package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/config"
)

func TestLoadResolvesLogFileRelativeToEnvFileDirectory(t *testing.T) {
	projectRoot := t.TempDir()
	backendDir := filepath.Join(projectRoot, "backend-go")
	if err := os.MkdirAll(backendDir, 0o755); err != nil {
		t.Fatalf("create backend dir: %v", err)
	}

	envPath := filepath.Join(projectRoot, ".env")
	envContent := "SERVER_PORT=8000\nLOG_FILE=logs/backend-go/app-dev.log\n"
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

	withCleanEnv(t, "ENV_FILE", "LOG_FILE", "SERVER_PORT")
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
