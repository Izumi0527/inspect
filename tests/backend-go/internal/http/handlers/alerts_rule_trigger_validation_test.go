package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type recordingAlertRuleService struct {
	alertsServiceStub
	createdRule *alerts.AlertRule
	updatedMap  map[string]interface{}
	existing    alerts.AlertRule
}

func (s *recordingAlertRuleService) CreateRule(_ context.Context, rule *alerts.AlertRule) error {
	copyRule := *rule
	copyRule.ID = 10
	*rule = copyRule
	s.createdRule = &copyRule
	return nil
}

func (s *recordingAlertRuleService) GetRule(_ context.Context, ruleID int) (alerts.AlertRule, error) {
	if s.existing.ID == ruleID {
		return s.existing, nil
	}
	return alerts.AlertRule{}, gorm.ErrRecordNotFound
}

func (s *recordingAlertRuleService) UpdateRule(_ context.Context, ruleID int, updates map[string]interface{}) (alerts.AlertRule, error) {
	s.updatedMap = updates
	res := s.existing
	res.ID = ruleID
	if v, ok := updates["duration"].(int); ok {
		res.Duration = v
	}
	return res, nil
}

func TestAlertRulesAndTriggers_DurationZeroAndValidation(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"alerts:create", "alerts:update", "alerts:read"})
	e := echo.New()

	t.Run("创建规则显式传 duration=0 保留 0（不篡改为 300）；缺失传 nil 默认 300；负数返回 400", func(t *testing.T) {
		svc := &recordingAlertRuleService{}
		h := handlers.AlertsHandler{Service: svc, Auth: authService}

		// 1. duration=0
		bodyZero := `{"name":"立即触发","metric_name":"cpu_usage","operator":">","threshold_value":90,"duration":0}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/rules", bytes.NewBufferString(bodyZero))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec := httptest.NewRecorder()
		if err := h.CreateRule(e.NewContext(req, rec)); err != nil {
			t.Fatalf("CreateRule(duration=0) error = %v", err)
		}
		if svc.createdRule == nil || svc.createdRule.Duration != 0 {
			t.Fatalf("created Duration = %+v, want 0", svc.createdRule)
		}

		// 2. 缺失 duration -> 默认 300
		bodyMissing := `{"name":"默认持续","metric_name":"cpu_usage","operator":">","threshold_value":90}`
		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/rules", bytes.NewBufferString(bodyMissing))
		req2.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req2.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		rec2 := httptest.NewRecorder()
		if err := h.CreateRule(e.NewContext(req2, rec2)); err != nil {
			t.Fatalf("CreateRule(missing duration) error = %v", err)
		}
		if svc.createdRule == nil || svc.createdRule.Duration != 300 {
			t.Fatalf("created Duration = %+v, want 300", svc.createdRule)
		}

		// 3. duration=-5 -> 400
		bodyNeg := `{"name":"非法持续","metric_name":"cpu_usage","operator":">","threshold_value":90,"duration":-5}`
		req3 := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/rules", bytes.NewBufferString(bodyNeg))
		req3.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req3.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		errNeg := h.CreateRule(e.NewContext(req3, httptest.NewRecorder()))
		assertHTTPErrorCode(t, errNeg, http.StatusBadRequest)
	})

	t.Run("更新规则显式传 duration=0 写入 updates；负数返回 400", func(t *testing.T) {
		svc := &recordingAlertRuleService{
			existing: alerts.AlertRule{ID: 5, Name: "r", MetricName: "cpu_usage", Operator: ">", ThresholdValue: 80, Duration: 300},
		}
		h := handlers.AlertsHandler{Service: svc, Auth: authService}

		req := httptest.NewRequest(http.MethodPut, "/api/v1/alerts/rules/5", bytes.NewBufferString(`{"duration":0}`))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		c := e.NewContext(req, httptest.NewRecorder())
		c.SetParamNames("rule_id")
		c.SetParamValues("5")
		if err := h.UpdateRule(c); err != nil {
			t.Fatalf("UpdateRule(duration=0) error = %v", err)
		}
		if dur, ok := svc.updatedMap["duration"].(int); !ok || dur != 0 {
			t.Fatalf("updates[duration] = %#v, want 0", svc.updatedMap["duration"])
		}

		reqBad := httptest.NewRequest(http.MethodPut, "/api/v1/alerts/rules/5", bytes.NewBufferString(`{"duration":-1}`))
		reqBad.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		reqBad.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		cBad := e.NewContext(reqBad, httptest.NewRecorder())
		cBad.SetParamNames("rule_id")
		cBad.SetParamValues("5")
		assertHTTPErrorCode(t, h.UpdateRule(cBad), http.StatusBadRequest)
	})

	t.Run("Trigger API: hysteresis 与 manual_device 校验及合法放行", func(t *testing.T) {
		svc := &recordingAlertRuleService{
			existing: alerts.AlertRule{
				ID:             7,
				Name:           "hyst",
				MetricName:     "temperature",
				Operator:       ">",
				ThresholdValue: 85,
				ExpressionMode: alerts.ExpressionModeHysteresis,
				DependencyMode: alerts.DependencyModeNone,
			},
		}
		mh := handlers.MonitoringHandler{Alerts: svc, Auth: authService}

		invalidCreatePayloads := []map[string]interface{}{
			// hysteresis 缺 recovery_threshold
			{"name": "h1", "metric_name": "temperature", "operator": ">", "threshold_value": 85, "expression_mode": "hysteresis", "recovery_operator": "<"},
			// hysteresis 方向冲突: > 搭配 >
			{"name": "h2", "metric_name": "temperature", "operator": ">", "threshold_value": 85, "expression_mode": "hysteresis", "recovery_operator": ">", "recovery_threshold": 75},
			// hysteresis 阈值关系错误: > 搭配 < 但 recovery_threshold >= threshold_value
			{"name": "h3", "metric_name": "temperature", "operator": ">", "threshold_value": 85, "expression_mode": "hysteresis", "recovery_operator": "<", "recovery_threshold": 85},
			// hysteresis 反向阈值关系错误: < 搭配 > 但 recovery_threshold <= threshold_value
			{"name": "h4", "metric_name": "uptime", "operator": "<", "threshold_value": 60, "expression_mode": "hysteresis", "recovery_operator": ">", "recovery_threshold": 50},
			// manual_device 缺 depends_on_device_id
			{"name": "d1", "metric_name": "cpu_usage", "operator": ">", "threshold_value": 80, "dependency_mode": "manual_device"},
			// manual_device depends_on_device_id <= 0
			{"name": "d2", "metric_name": "cpu_usage", "operator": ">", "threshold_value": 80, "dependency_mode": "manual_device", "depends_on_device_id": 0},
		}

		for i, p := range invalidCreatePayloads {
			raw, _ := json.Marshal(p)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/triggers", bytes.NewReader(raw))
			req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
			req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
			err := mh.CreateMonitoringTrigger(e.NewContext(req, httptest.NewRecorder()))
			if err == nil {
				t.Fatalf("case %d expected 400, got nil", i)
			}
			assertHTTPErrorCode(t, err, http.StatusBadRequest)
		}

		// 合法 hysteresis + duration=0 创建成功
		validHyst, _ := json.Marshal(map[string]interface{}{
			"name":               "h-ok",
			"metric_name":        "temperature",
			"operator":           ">",
			"threshold_value":    85,
			"duration":           0,
			"expression_mode":    "hysteresis",
			"recovery_operator":  "<",
			"recovery_threshold": 75,
		})
		reqOK := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/triggers", bytes.NewReader(validHyst))
		reqOK.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		reqOK.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		recOK := httptest.NewRecorder()
		if err := mh.CreateMonitoringTrigger(e.NewContext(reqOK, recOK)); err != nil {
			t.Fatalf("CreateMonitoringTrigger(valid hysteresis) error = %v", err)
		}
		if recOK.Code != http.StatusCreated {
			t.Fatalf("status = %d, want 201", recOK.Code)
		}
		if svc.createdRule == nil || svc.createdRule.Duration != 0 {
			t.Fatalf("expected created trigger Duration=0, got %+v", svc.createdRule)
		}

		// UpdateMonitoringTrigger 将已有 hysteresis 的 recovery_threshold 置 nil 返回 400
		reqUpdBad := httptest.NewRequest(http.MethodPut, "/api/v1/monitoring/triggers/7", bytes.NewBufferString(`{"recovery_threshold":null}`))
		reqUpdBad.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		reqUpdBad.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		cUpdBad := e.NewContext(reqUpdBad, httptest.NewRecorder())
		cUpdBad.SetParamNames("id")
		cUpdBad.SetParamValues("7")
		assertHTTPErrorCode(t, mh.UpdateMonitoringTrigger(cUpdBad), http.StatusBadRequest)

		// UpdateMonitoringTrigger 传 duration=0 成功
		reqUpdOK := httptest.NewRequest(http.MethodPut, "/api/v1/monitoring/triggers/7", bytes.NewBufferString(`{"duration":0,"recovery_operator":"<","recovery_threshold":70}`))
		reqUpdOK.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		reqUpdOK.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		cUpdOK := e.NewContext(reqUpdOK, httptest.NewRecorder())
		cUpdOK.SetParamNames("id")
		cUpdOK.SetParamValues("7")
		if err := mh.UpdateMonitoringTrigger(cUpdOK); err != nil {
			t.Fatalf("UpdateMonitoringTrigger(valid) error = %v", err)
		}
		if dur, ok := svc.updatedMap["duration"].(int); !ok || dur != 0 {
			t.Fatalf("updated duration = %#v, want 0", svc.updatedMap["duration"])
		}
	})
}
