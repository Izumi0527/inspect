package devices

import (
	"encoding/json"
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
			return nil, nil
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
