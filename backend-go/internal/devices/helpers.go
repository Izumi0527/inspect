package devices

import (
	"encoding/json"
	"fmt"
	"strings"

	"gorm.io/datatypes"
)

func normalizeSNMPVersion(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "v1", "1":
		return "1"
	case "v3", "3":
		return "3"
	case "v2c", "2c":
		return "2c"
	default:
		return normalized
	}
}

func encodeTags(tags interface{}) (datatypes.JSON, error) {
	if tags == nil {
		return nil, nil
	}
	switch value := tags.(type) {
	case datatypes.JSON:
		if len(value) == 0 {
			return nil, nil
		}
		return value, nil
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil, nil
		}
		if !json.Valid([]byte(trimmed)) {
			return nil, fmt.Errorf("invalid tags JSON")
		}
		return datatypes.JSON([]byte(trimmed)), nil
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		return datatypes.JSON(encoded), nil
	}
}

func decodeTags(raw datatypes.JSON) interface{} {
	if len(raw) == 0 {
		return nil
	}
	var parsed interface{}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil
	}
	return parsed
}

func sanitizeDeviceResponseTags(raw datatypes.JSON) interface{} {
	decoded := decodeTags(raw)
	root, ok := cloneJSONValue(decoded).(map[string]interface{})
	if !ok {
		return decoded
	}

	if cliConfig, ok := root["cli_config"].(map[string]interface{}); ok {
		if sshConfig, ok := cliConfig["ssh_config"].(map[string]interface{}); ok {
			markConfiguredAndDelete(sshConfig, "password", "password_configured")
			markConfiguredAndDelete(sshConfig, "private_key", "private_key_configured")
		}
		if telnetConfig, ok := cliConfig["telnet_config"].(map[string]interface{}); ok {
			markConfiguredAndDelete(telnetConfig, "password", "password_configured")
			markConfiguredAndDelete(telnetConfig, "enable_password", "enable_password_configured")
		}
	}

	if snmpConfig, ok := root["snmp_config"].(map[string]interface{}); ok {
		if v2cConfig, ok := snmpConfig["v2c_config"].(map[string]interface{}); ok {
			markConfiguredAndDelete(v2cConfig, "community", "community_configured")
			markConfiguredAndDelete(v2cConfig, "write_community", "write_community_configured")
		}
		if v3Config, ok := snmpConfig["v3_config"].(map[string]interface{}); ok {
			markConfiguredAndDelete(v3Config, "auth_password", "auth_password_configured")
			markConfiguredAndDelete(v3Config, "priv_password", "priv_password_configured")
		}
	}

	return root
}

func cloneJSONValue(value interface{}) interface{} {
	switch typed := value.(type) {
	case map[string]interface{}:
		cloned := make(map[string]interface{}, len(typed))
		for key, item := range typed {
			cloned[key] = cloneJSONValue(item)
		}
		return cloned
	case []interface{}:
		cloned := make([]interface{}, len(typed))
		for index, item := range typed {
			cloned[index] = cloneJSONValue(item)
		}
		return cloned
	default:
		return typed
	}
}

func markConfiguredAndDelete(values map[string]interface{}, sourceKey string, flagKey string) {
	raw, exists := values[sourceKey]
	if exists {
		if text, ok := raw.(string); ok && strings.TrimSpace(text) != "" {
			values[flagKey] = true
		}
	}
	delete(values, sourceKey)
}

func decodeJSONList(raw datatypes.JSON) []int {
	if len(raw) == 0 {
		return []int{}
	}
	var parsed []int
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return []int{}
}

func decodeJSONMap(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return map[string]interface{}{}
}
