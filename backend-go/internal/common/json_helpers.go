package common

import (
	"encoding/json"
	"gorm.io/datatypes"
)

// DecodeJSONMap decodes a GORM datatypes.JSON into a map[string]interface{}
func DecodeJSONMap(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return map[string]interface{}{}
	}
	return result
}

// DecodeJSONMapSlice decodes a GORM datatypes.JSON into a []map[string]interface{}
func DecodeJSONMapSlice(raw datatypes.JSON) []map[string]interface{} {
	if len(raw) == 0 || string(raw) == "null" {
		return []map[string]interface{}{}
	}
	var result []map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return []map[string]interface{}{}
	}
	return result
}

// EncodeJSON encodes a value to datatypes.JSON
func EncodeJSON(value interface{}) datatypes.JSON {
	if value == nil {
		return datatypes.JSON("{}")
	}
	data, err := json.Marshal(value)
	if err != nil {
		return datatypes.JSON("{}")
	}
	return datatypes.JSON(data)
}