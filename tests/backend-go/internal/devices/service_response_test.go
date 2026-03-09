package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"gorm.io/datatypes"
)

//go:linkname buildDeviceResponse github.com/your-org/inspect-system/backend-go/internal/devices.buildDeviceResponse
func buildDeviceResponse(device devices.Device, alertCount *int) devices.DeviceResponse

func TestBuildDeviceResponse_ShouldStripSensitiveCredentialValues(t *testing.T) {
	snmpPort := 1161
	cliProtocol := "ssh"
	sshUsername := "netops"
	snmpVersion := "3"
	device := devices.Device{
		ID:            7,
		Name:          "edge-01",
		IPAddress:     "10.0.0.7",
		DeviceType:    "router",
		Status:        "online",
		SnmpCommunity: stringPtr("super-secret-community"),
		SnmpVersion:   &snmpVersion,
		SnmpPort:      &snmpPort,
		CliProtocol:   &cliProtocol,
		SshUsername:   &sshUsername,
		Tags: datatypes.JSON([]byte(`{
			"cli_config": {
				"cli_protocol": "ssh",
				"ssh_config": {
					"username": "netops",
					"password": "secret-password",
					"private_key": "PRIVATE-KEY-DATA",
					"port": 22
				},
				"telnet_config": {
					"username": "legacy",
					"password": "legacy-password",
					"enable_password": "enable-secret",
					"port": 23
				}
			},
			"snmp_config": {
				"version": "v3",
				"port": 1161,
				"v2c_config": {
					"community": "secret-community",
					"write_community": "write-secret"
				},
				"v3_config": {
					"username": "snmp-user",
					"auth_password": "auth-secret",
					"priv_password": "priv-secret"
				}
			}
		}`)),
	}

	response := buildDeviceResponse(device, nil)

	if response.SnmpCommunity != nil {
		t.Fatalf("response.SnmpCommunity = %v, want nil", *response.SnmpCommunity)
	}

	tags, ok := response.Tags.(map[string]interface{})
	if !ok {
		t.Fatalf("response.Tags type = %T, want map[string]interface{}", response.Tags)
	}

	cliConfig, ok := tags["cli_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("cli_config missing")
	}

	sshConfig, ok := cliConfig["ssh_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("ssh_config missing")
	}

	if _, exists := sshConfig["password"]; exists {
		t.Fatalf("ssh_config.password should be removed from response")
	}
	if _, exists := sshConfig["private_key"]; exists {
		t.Fatalf("ssh_config.private_key should be removed from response")
	}
	if configured, ok := sshConfig["password_configured"].(bool); !ok || !configured {
		t.Fatalf("ssh_config.password_configured = %v, want true", sshConfig["password_configured"])
	}
	if configured, ok := sshConfig["private_key_configured"].(bool); !ok || !configured {
		t.Fatalf("ssh_config.private_key_configured = %v, want true", sshConfig["private_key_configured"])
	}

	telnetConfig, ok := cliConfig["telnet_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("telnet_config missing")
	}
	if _, exists := telnetConfig["password"]; exists {
		t.Fatalf("telnet_config.password should be removed from response")
	}
	if _, exists := telnetConfig["enable_password"]; exists {
		t.Fatalf("telnet_config.enable_password should be removed from response")
	}
	if configured, ok := telnetConfig["password_configured"].(bool); !ok || !configured {
		t.Fatalf("telnet_config.password_configured = %v, want true", telnetConfig["password_configured"])
	}
	if configured, ok := telnetConfig["enable_password_configured"].(bool); !ok || !configured {
		t.Fatalf("telnet_config.enable_password_configured = %v, want true", telnetConfig["enable_password_configured"])
	}

	snmpConfig, ok := tags["snmp_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("snmp_config missing")
	}

	v2cConfig, ok := snmpConfig["v2c_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("v2c_config missing")
	}
	if _, exists := v2cConfig["community"]; exists {
		t.Fatalf("v2c_config.community should be removed from response")
	}
	if _, exists := v2cConfig["write_community"]; exists {
		t.Fatalf("v2c_config.write_community should be removed from response")
	}
	if configured, ok := v2cConfig["community_configured"].(bool); !ok || !configured {
		t.Fatalf("v2c_config.community_configured = %v, want true", v2cConfig["community_configured"])
	}
	if configured, ok := v2cConfig["write_community_configured"].(bool); !ok || !configured {
		t.Fatalf("v2c_config.write_community_configured = %v, want true", v2cConfig["write_community_configured"])
	}

	v3Config, ok := snmpConfig["v3_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("v3_config missing")
	}
	if _, exists := v3Config["auth_password"]; exists {
		t.Fatalf("v3_config.auth_password should be removed from response")
	}
	if _, exists := v3Config["priv_password"]; exists {
		t.Fatalf("v3Config.priv_password should be removed from response")
	}
	if configured, ok := v3Config["auth_password_configured"].(bool); !ok || !configured {
		t.Fatalf("v3_config.auth_password_configured = %v, want true", v3Config["auth_password_configured"])
	}
	if configured, ok := v3Config["priv_password_configured"].(bool); !ok || !configured {
		t.Fatalf("v3_config.priv_password_configured = %v, want true", v3Config["priv_password_configured"])
	}
}

func stringPtr(value string) *string {
	return &value
}
