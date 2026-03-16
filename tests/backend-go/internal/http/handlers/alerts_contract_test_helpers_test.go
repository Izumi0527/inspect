package handlers_test

import (
	"context"

	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
)

// alertsServiceStub 用于 handler 契约测试的最小实现，避免引入数据库依赖。
type alertsServiceStub struct{}

func (alertsServiceStub) DB() *gorm.DB { return nil }

func (alertsServiceStub) ListAlerts(_ context.Context, _ alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error) {
	return []alerts.AlertWithDevice{}, 0, nil
}

func (alertsServiceStub) GetAlert(_ context.Context, _ int) (alerts.AlertWithDevice, error) {
	return alerts.AlertWithDevice{}, gorm.ErrRecordNotFound
}

func (alertsServiceStub) GetRecentAlerts(_ context.Context, _ int) ([]alerts.AlertWithDevice, error) {
	return []alerts.AlertWithDevice{}, nil
}

func (alertsServiceStub) GetAlertStatistics(_ context.Context) (alerts.AlertStatistics, error) {
	return alerts.AlertStatistics{}, nil
}

func (alertsServiceStub) ListAlertOperations(_ context.Context, _ int, _ int) ([]alerts.AlertOperationHistory, error) {
	return []alerts.AlertOperationHistory{}, nil
}

func (alertsServiceStub) AcknowledgeAlert(_ context.Context, _ int, _ alerts.Operator, _ *string, _ *string) error {
	return nil
}

func (alertsServiceStub) ResolveAlert(_ context.Context, _ int, _ alerts.Operator, _ *string, _ *string) error {
	return nil
}

func (alertsServiceStub) ReactivateAlert(_ context.Context, _ int, _ alerts.Operator, _ *string) error {
	return nil
}

func (alertsServiceStub) DeleteAlert(_ context.Context, _ int) error {
	return nil
}

func (alertsServiceStub) AddAlertComment(_ context.Context, _ int, _ alerts.Operator, _ *string) error {
	return nil
}

func (alertsServiceStub) AssignAlert(_ context.Context, _ int, _ alerts.Operator, _ *string) error {
	return nil
}

func (alertsServiceStub) ListRules(_ context.Context, _ alerts.ListRulesFilter) ([]alerts.AlertRule, error) {
	return []alerts.AlertRule{}, nil
}

func (alertsServiceStub) GetRule(_ context.Context, _ int) (alerts.AlertRule, error) {
	return alerts.AlertRule{}, gorm.ErrRecordNotFound
}

func (alertsServiceStub) CreateRule(_ context.Context, _ *alerts.AlertRule) error {
	return nil
}

func (alertsServiceStub) UpdateRule(_ context.Context, _ int, _ map[string]interface{}) (alerts.AlertRule, error) {
	return alerts.AlertRule{}, nil
}

func (alertsServiceStub) DeleteRule(_ context.Context, _ int) error {
	return nil
}

