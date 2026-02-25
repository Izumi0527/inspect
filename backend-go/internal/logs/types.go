package logs

import "time"

type LogItem struct {
	ID           int        `json:"id"`
	DeviceID     int        `json:"device_id"`
	DeviceName   *string    `json:"device_name,omitempty"`
	DeviceIP     *string    `json:"device_ip,omitempty"`
	Level        string     `json:"level"`
	Facility     string     `json:"facility"`
	Source       string     `json:"source"`
	Message      string     `json:"message"`
	RawMessage   *string    `json:"raw_message,omitempty"`
	SourceIP     *string    `json:"source_ip,omitempty"`
	SourceProcess *string   `json:"source_process,omitempty"`
	LogTimestamp time.Time  `json:"log_timestamp"`
	CollectedAt  time.Time  `json:"collected_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

type LogListResponse struct {
	Items      []LogItem `json:"items"`
	Total      int64     `json:"total"`
	Page       int       `json:"page"`
	PageSize   int       `json:"page_size"`
	TotalPages int       `json:"total_pages"`
	HasNext    bool      `json:"has_next"`
	HasPrev    bool      `json:"has_prev"`
}

type LogStatistics struct {
	TotalLogs     int64            `json:"total_logs"`
	ByLevel       map[string]int64 `json:"by_level"`
	ByFacility    map[string]int64 `json:"by_facility"`
	ByDevice      map[int]int64    `json:"by_device"`
	Trends        map[string]int64 `json:"trends"`
	TimeRangeHours int             `json:"time_range_hours"`
}

type LogCollectionResponse struct {
	Success        bool   `json:"success"`
	Message        string `json:"message"`
	CollectedCount int    `json:"collected_count"`
	DeviceID       int    `json:"device_id"`
}

type BatchLogCollectionResponse struct {
	Success        bool   `json:"success"`
	Message        string `json:"message"`
	CollectedCount int    `json:"collected_count"`
	// 兼容旧前端：批量采集时保持 device_id 字段存在（固定为 0）。
	DeviceID int `json:"device_id"`
	// 新增：提供每台设备的采集明细，便于前端展示成功/失败原因。
	Collected map[int]int    `json:"collected,omitempty"`
	Failed    map[int]string `json:"failed,omitempty"`
}

type ParsingRulePayload struct {
	Name            string  `json:"name"`
	Description     *string `json:"description"`
	Vendor          string  `json:"vendor"`
	DeviceType      *string `json:"device_type"`
	Pattern         string  `json:"pattern"`
	LevelMapping    *string `json:"level_mapping"`
	FacilityMapping *string `json:"facility_mapping"`
	IsActive        *bool   `json:"is_active"`
	Priority        *int    `json:"priority"`
}

type DeleteLogsRequest struct {
	LogIDs []int `json:"log_ids"`
}
