package escalation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	rulesSettingKey = "alert_escalation_rules"
)

var (
	ErrRuleNotFound  = errors.New("rule not found")
	ErrAlertNotFound = errors.New("alert not found")
)

type Service struct {
	db            *gorm.DB
	logger        *zap.Logger
	mu            sync.Mutex
	rules         []Rule
	rulesLoaded   bool
	escalationsByAlert map[string]*Escalation
}

func NewService(db *gorm.DB, logger *zap.Logger) *Service {
	return &Service{
		db:            db,
		logger:        logger,
		escalationsByAlert: make(map[string]*Escalation),
	}
}

func (s *Service) ListRules(ctx context.Context) ([]Rule, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRulesLoaded(ctx); err != nil {
		return nil, err
	}

	rules := append([]Rule(nil), s.rules...)
	sort.Slice(rules, func(i, j int) bool {
		return rules[i].CreatedAt.After(rules[j].CreatedAt)
	})

	return rules, nil
}

func (s *Service) CreateRule(ctx context.Context, req RuleRequest) (Rule, error) {
	if s == nil || s.db == nil {
		return Rule{}, fmt.Errorf("database not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRulesLoaded(ctx); err != nil {
		return Rule{}, err
	}

	now := time.Now().UTC()
	rule, err := buildRuleFromRequest(req, now)
	if err != nil {
		return Rule{}, err
	}
	rule.ID = uuid.NewString()

	updated := append([]Rule(nil), s.rules...)
	updated = append(updated, rule)
	if err := s.saveRules(ctx, updated); err != nil {
		return Rule{}, err
	}

	s.rules = updated
	return rule, nil
}

func (s *Service) UpdateRule(ctx context.Context, ruleID string, req RuleRequest) (Rule, error) {
	if s == nil || s.db == nil {
		return Rule{}, fmt.Errorf("database not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRulesLoaded(ctx); err != nil {
		return Rule{}, err
	}

	index := -1
	for i, rule := range s.rules {
		if rule.ID == ruleID {
			index = i
			break
		}
	}
	if index == -1 {
		return Rule{}, ErrRuleNotFound
	}

	now := time.Now().UTC()
	updatedRule, err := buildRuleFromRequest(req, now)
	if err != nil {
		return Rule{}, err
	}
	updatedRule.ID = s.rules[index].ID
	updatedRule.CreatedAt = s.rules[index].CreatedAt

	updated := append([]Rule(nil), s.rules...)
	updated[index] = updatedRule

	if err := s.saveRules(ctx, updated); err != nil {
		return Rule{}, err
	}

	s.rules = updated
	return updatedRule, nil
}

func (s *Service) DeleteRule(ctx context.Context, ruleID string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRulesLoaded(ctx); err != nil {
		return err
	}

	index := -1
	for i, rule := range s.rules {
		if rule.ID == ruleID {
			index = i
			break
		}
	}
	if index == -1 {
		return ErrRuleNotFound
	}

	updated := append([]Rule(nil), s.rules[:index]...)
	updated = append(updated, s.rules[index+1:]...)

	if err := s.saveRules(ctx, updated); err != nil {
		return err
	}

	s.rules = updated
	return nil
}

func (s *Service) GetEscalationStatus(ctx context.Context, alertID string) (*Status, error) {
	if s == nil {
		return nil, fmt.Errorf("service not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	escalation := s.escalationsByAlert[strings.TrimSpace(alertID)]
	if escalation == nil || !escalation.IsActive {
		return nil, nil
	}

	return toStatus(escalation), nil
}

func (s *Service) CancelEscalation(ctx context.Context, alertID string, reason string) (bool, error) {
	if s == nil {
		return false, fmt.Errorf("service not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	escalation := s.escalationsByAlert[strings.TrimSpace(alertID)]
	if escalation == nil || !escalation.IsActive {
		return false, nil
	}

	now := time.Now().UTC()
	entry := map[string]interface{}{
		"action":       "cancelled",
		"reason":       strings.TrimSpace(reason),
		"cancelled_at": now.Format(time.RFC3339),
		"level":        escalation.CurrentLevel,
	}
	if entry["reason"] == "" {
		entry["reason"] = "告警已取消"
	}

	escalation.History = append(escalation.History, entry)
	escalation.IsActive = false
	escalation.UpdatedAt = now

	return true, nil
}

func (s *Service) CreateTestEscalation(ctx context.Context, alertID string) (string, bool, error) {
	if s == nil || s.db == nil {
		return "", false, fmt.Errorf("database not initialized")
	}

	alertSeverity, err := s.getAlertSeverity(ctx, alertID)
	if err != nil {
		return "", false, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRulesLoaded(ctx); err != nil {
		return "", false, err
	}

	trimmedID := strings.TrimSpace(alertID)
	if existing := s.escalationsByAlert[trimmedID]; existing != nil && existing.IsActive {
		return existing.ID, false, nil
	}

	rule := matchRuleBySeverity(s.rules, alertSeverity)
	if rule == nil {
		return "", false, nil
	}

	now := time.Now().UTC()
	nextTime := now.Add(time.Duration(rule.Level1Timeout) * time.Second)
	escalation := &Escalation{
		ID:                 uuid.NewString(),
		AlertID:            trimmedID,
		RuleID:             rule.ID,
		CurrentLevel:       level1,
		NextEscalationTime: &nextTime,
		History:            []map[string]interface{}{},
		IsActive:           true,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	s.escalationsByAlert[trimmedID] = escalation
	return escalation.ID, true, nil
}

func (s *Service) GetStatistics(ctx context.Context) (map[string]interface{}, error) {
	if s == nil {
		return nil, fmt.Errorf("service not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureRulesLoaded(ctx); err != nil {
		return nil, err
	}

	levelDistribution := map[string]int{
		level1: 0,
		level2: 0,
		level3: 0,
		level4: 0,
	}

	activeCount := 0
	for _, escalation := range s.escalationsByAlert {
		if escalation == nil || !escalation.IsActive {
			continue
		}
		activeCount++
		levelDistribution[escalation.CurrentLevel]++
	}

	enabledRules := 0
	for _, rule := range s.rules {
		if rule.EscalationEnabled {
			enabledRules++
		}
	}

	return map[string]interface{}{
		"total_active_escalations": activeCount,
		"level_distribution":       levelDistribution,
		"total_rules":              len(s.rules),
		"enabled_rules":            enabledRules,
		"is_running":               true,
	}, nil
}

func (s *Service) getAlertSeverity(ctx context.Context, alertID string) (string, error) {
	id, err := strconv.Atoi(strings.TrimSpace(alertID))
	if err != nil || id <= 0 {
		return "", ErrAlertNotFound
	}

	type row struct {
		Severity string `gorm:"column:severity"`
	}
	var result row
	err = s.db.WithContext(ctx).Table("alerts").Select("severity").Where("id = ?", id).Take(&result).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", ErrAlertNotFound
	}
	if err != nil {
		return "", err
	}

	severity := normalizeSeverity(result.Severity)
	if severity == "" {
		return "", ErrAlertNotFound
	}
	return severity, nil
}

func (s *Service) ensureRulesLoaded(ctx context.Context) error {
	if s.rulesLoaded {
		return nil
	}

	rules, err := s.loadRules(ctx)
	if err != nil {
		return err
	}
	if len(rules) == 0 {
		now := time.Now().UTC()
		rules = defaultRules(now)
		if err := s.saveRules(ctx, rules); err != nil {
			return err
		}
	}

	s.rules = normalizeRules(rules)
	s.rulesLoaded = true
	return nil
}

func (s *Service) loadRules(ctx context.Context) ([]Rule, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type settingRow struct {
		Value *string `gorm:"column:value"`
	}
	var row settingRow

	err := s.db.WithContext(ctx).
		Table("system_settings").
		Select("value").
		Where("key = ?", rulesSettingKey).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if row.Value == nil || strings.TrimSpace(*row.Value) == "" {
		return nil, nil
	}

	var rules []Rule
	if err := json.Unmarshal([]byte(*row.Value), &rules); err != nil {
		if s.logger != nil {
			s.logger.Warn("failed to parse escalation rules", zap.Error(err))
		}
		return nil, nil
	}

	return rules, nil
}

func (s *Service) saveRules(ctx context.Context, rules []Rule) error {
	payload, err := json.Marshal(rules)
	if err != nil {
		return err
	}

	query := `
        INSERT INTO system_settings (key, value, category, data_type, description, updated_at)
        VALUES (?, ?, 'alerts', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            data_type = EXCLUDED.data_type,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP`

	return s.db.WithContext(ctx).Exec(query, rulesSettingKey, string(payload), "json", "告警升级规则").Error
}

func defaultRules(now time.Time) []Rule {
	return []Rule{
		{
			ID:                   "critical_escalation",
			Name:                 "严重告警升级",
			Severity:             "critical",
			EscalationEnabled:    true,
			Level1Timeout:        900,
			Level2Timeout:        1800,
			Level3Timeout:        3600,
			Level4Timeout:        7200,
			AutoSeverityUpgrade:  true,
			MaxSeverity:          "fatal",
			NotificationChannels: defaultChannels(),
			Level1Recipients:     []string{},
			Level2Recipients:     []string{},
			Level3Recipients:     []string{},
			Level4Recipients:     []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
		},
		{
			ID:                   "warning_escalation",
			Name:                 "警告告警升级",
			Severity:             "warning",
			EscalationEnabled:    true,
			Level1Timeout:        1800,
			Level2Timeout:        3600,
			Level3Timeout:        7200,
			Level4Timeout:        14400,
			AutoSeverityUpgrade:  false,
			MaxSeverity:          "fatal",
			NotificationChannels: defaultChannels(),
			Level1Recipients:     []string{},
			Level2Recipients:     []string{},
			Level3Recipients:     []string{},
			Level4Recipients:     []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
		},
		{
			ID:                   "emergency_escalation",
			Name:                 "紧急告警升级",
			Severity:             "fatal",
			EscalationEnabled:    true,
			Level1Timeout:        300,
			Level2Timeout:        600,
			Level3Timeout:        1200,
			Level4Timeout:        1800,
			AutoSeverityUpgrade:  false,
			MaxSeverity:          "fatal",
			NotificationChannels: defaultChannels(),
			Level1Recipients:     []string{},
			Level2Recipients:     []string{},
			Level3Recipients:     []string{},
			Level4Recipients:     []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
		},
	}
}

func buildRuleFromRequest(req RuleRequest, now time.Time) (Rule, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return Rule{}, fmt.Errorf("name is required")
	}
	severity := normalizeSeverity(req.Severity)
	if !isValidSeverity(severity) {
		return Rule{}, fmt.Errorf("invalid severity")
	}

	level1, err := resolveTimeout(req.Level1Timeout, defaultLevel1Timeout)
	if err != nil {
		return Rule{}, err
	}
	level2, err := resolveTimeout(req.Level2Timeout, defaultLevel2Timeout)
	if err != nil {
		return Rule{}, err
	}
	level3, err := resolveTimeout(req.Level3Timeout, defaultLevel3Timeout)
	if err != nil {
		return Rule{}, err
	}
	level4, err := resolveTimeout(req.Level4Timeout, defaultLevel4Timeout)
	if err != nil {
		return Rule{}, err
	}

	escalationEnabled := boolValue(req.EscalationEnabled, true)
	autoUpgrade := boolValue(req.AutoSeverityUpgrade, false)

	maxSeverity := normalizeSeverity(req.MaxSeverity)
	if maxSeverity == "" {
		maxSeverity = "fatal"
	}
	if !isValidSeverity(maxSeverity) {
		return Rule{}, fmt.Errorf("invalid max_severity")
	}

	channels := normalizeChannels(req.NotificationChannels)
	if len(channels) == 0 {
		channels = defaultChannels()
	}

	return Rule{
		Name:                 name,
		Severity:             severity,
		EscalationEnabled:    escalationEnabled,
		Level1Timeout:        level1,
		Level2Timeout:        level2,
		Level3Timeout:        level3,
		Level4Timeout:        level4,
		AutoSeverityUpgrade:  autoUpgrade,
		MaxSeverity:          maxSeverity,
		NotificationChannels: channels,
		Level1Recipients:     normalizeRecipients(req.Level1Recipients),
		Level2Recipients:     normalizeRecipients(req.Level2Recipients),
		Level3Recipients:     normalizeRecipients(req.Level3Recipients),
		Level4Recipients:     normalizeRecipients(req.Level4Recipients),
		CreatedAt:            now,
		UpdatedAt:            now,
	}, nil
}

func normalizeRules(rules []Rule) []Rule {
	now := time.Now().UTC()
	updated := make([]Rule, 0, len(rules))
	for _, rule := range rules {
		if rule.CreatedAt.IsZero() {
			rule.CreatedAt = now
		}
		if rule.UpdatedAt.IsZero() {
			rule.UpdatedAt = rule.CreatedAt
		}
		if rule.Level1Timeout <= 0 {
			rule.Level1Timeout = defaultLevel1Timeout
		}
		if rule.Level2Timeout <= 0 {
			rule.Level2Timeout = defaultLevel2Timeout
		}
		if rule.Level3Timeout <= 0 {
			rule.Level3Timeout = defaultLevel3Timeout
		}
		if rule.Level4Timeout <= 0 {
			rule.Level4Timeout = defaultLevel4Timeout
		}
		if rule.MaxSeverity == "" {
			rule.MaxSeverity = "fatal"
		}
		if len(rule.NotificationChannels) == 0 {
			rule.NotificationChannels = defaultChannels()
		}
		if rule.Level1Recipients == nil {
			rule.Level1Recipients = []string{}
		}
		if rule.Level2Recipients == nil {
			rule.Level2Recipients = []string{}
		}
		if rule.Level3Recipients == nil {
			rule.Level3Recipients = []string{}
		}
		if rule.Level4Recipients == nil {
			rule.Level4Recipients = []string{}
		}
		updated = append(updated, rule)
	}
	return updated
}

func resolveTimeout(value int, fallback int) (int, error) {
	if value == 0 {
		return fallback, nil
	}
	if value < minTimeoutSeconds || value > maxTimeoutSeconds {
		return 0, fmt.Errorf("timeout must be between %d and %d", minTimeoutSeconds, maxTimeoutSeconds)
	}
	return value, nil
}

func boolValue(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func normalizeSeverity(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isValidSeverity(value string) bool {
	switch value {
	case "info", "warning", "critical", "fatal", "emergency":
		return true
	default:
		return false
	}
}

func normalizeChannels(channels []string) []string {
	if len(channels) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(channels))
	for _, item := range channels {
		value := strings.ToLower(strings.TrimSpace(item))
		if value == "" {
			continue
		}
		if !isValidChannel(value) {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func isValidChannel(value string) bool {
	switch value {
	case "email", "sms", "webhook", "websocket", "voice":
		return true
	default:
		return false
	}
}

func defaultChannels() []string {
	return []string{"email", "websocket"}
}

func normalizeRecipients(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, item := range values {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func matchRuleBySeverity(rules []Rule, severity string) *Rule {
	if severity == "" {
		return nil
	}

	try := []string{severity}
	if severity == "emergency" {
		try = append(try, "fatal")
	}

	for _, target := range try {
		for i := range rules {
			rule := &rules[i]
			if !rule.EscalationEnabled {
				continue
			}
			if normalizeSeverity(rule.Severity) == target {
				return rule
			}
		}
	}
	return nil
}

func toStatus(escalation *Escalation) *Status {
	if escalation == nil {
		return nil
	}

	history := make([]map[string]interface{}, 0)
	if escalation.History != nil {
		history = append(history, escalation.History...)
	}

	return &Status{
		EscalationID:       escalation.ID,
		AlertID:            escalation.AlertID,
		CurrentLevel:       escalation.CurrentLevel,
		NextEscalationTime: escalation.NextEscalationTime,
		History:            history,
		IsActive:           escalation.IsActive,
		CreatedAt:          escalation.CreatedAt,
		UpdatedAt:          escalation.UpdatedAt,
	}
}
