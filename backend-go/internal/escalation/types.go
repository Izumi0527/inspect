package escalation

import "time"

const (
	defaultLevel1Timeout = 1800
	defaultLevel2Timeout = 3600
	defaultLevel3Timeout = 7200
	defaultLevel4Timeout = 14400
	minTimeoutSeconds    = 60
	maxTimeoutSeconds    = 86400
)

const (
	level1 = "level_1"
	level2 = "level_2"
	level3 = "level_3"
	level4 = "level_4"
)

type Rule struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Severity             string    `json:"severity"`
	EscalationEnabled    bool      `json:"escalation_enabled"`
	Level1Timeout        int       `json:"level_1_timeout"`
	Level2Timeout        int       `json:"level_2_timeout"`
	Level3Timeout        int       `json:"level_3_timeout"`
	Level4Timeout        int       `json:"level_4_timeout"`
	AutoSeverityUpgrade  bool      `json:"auto_severity_upgrade"`
	MaxSeverity          string    `json:"max_severity"`
	NotificationChannels []string  `json:"notification_channels"`
	Level1Recipients     []string  `json:"level_1_recipients"`
	Level2Recipients     []string  `json:"level_2_recipients"`
	Level3Recipients     []string  `json:"level_3_recipients"`
	Level4Recipients     []string  `json:"level_4_recipients"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

type RuleRequest struct {
	Name                 string   `json:"name"`
	Severity             string   `json:"severity"`
	EscalationEnabled    *bool    `json:"escalation_enabled"`
	Level1Timeout        int      `json:"level_1_timeout"`
	Level2Timeout        int      `json:"level_2_timeout"`
	Level3Timeout        int      `json:"level_3_timeout"`
	Level4Timeout        int      `json:"level_4_timeout"`
	AutoSeverityUpgrade  *bool    `json:"auto_severity_upgrade"`
	MaxSeverity          string   `json:"max_severity"`
	NotificationChannels []string `json:"notification_channels"`
	Level1Recipients     []string `json:"level_1_recipients"`
	Level2Recipients     []string `json:"level_2_recipients"`
	Level3Recipients     []string `json:"level_3_recipients"`
	Level4Recipients     []string `json:"level_4_recipients"`
}

type Status struct {
	EscalationID       string                   `json:"escalation_id"`
	AlertID            string                   `json:"alert_id"`
	CurrentLevel       string                   `json:"current_level"`
	NextEscalationTime *time.Time               `json:"next_escalation_time"`
	History            []map[string]interface{} `json:"history"`
	IsActive           bool                     `json:"is_active"`
	CreatedAt          time.Time                `json:"created_at"`
	UpdatedAt          time.Time                `json:"updated_at"`
}

type Escalation struct {
	ID                 string
	AlertID            string
	RuleID             string
	CurrentLevel       string
	NextEscalationTime *time.Time
	History            []map[string]interface{}
	IsActive           bool
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
