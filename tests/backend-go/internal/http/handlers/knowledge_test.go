package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestKnowledgeHandler_AuthAndPermissions(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"alerts:read"})

	h := handlers.KnowledgeHandler{Auth: deniedAuth}
	err := h.LookupHuaweiKnowledge(newEchoContext(http.MethodGet, "/api/v1/knowledge/huawei/lookup?oid=1.0.8802.1.1.2.0.0.1", deniedToken))
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	err = h.GetHuaweiKnowledgeStats(newEchoContext(http.MethodGet, "/api/v1/knowledge/huawei/stats", deniedToken))
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	unauthErr := h.LookupHuaweiKnowledge(newEchoContext(http.MethodGet, "/api/v1/knowledge/huawei/lookup?oid=1.0.8802.1.1.2.0.0.1", ""))
	assertHTTPErrorCode(t, unauthErr, http.StatusUnauthorized)

	hAllowed := handlers.KnowledgeHandler{Auth: allowedAuth}
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/knowledge/huawei/stats", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+allowedToken)
	rec := httptest.NewRecorder()
	if err := hAllowed.GetHuaweiKnowledgeStats(e.NewContext(req, rec)); err != nil {
		t.Fatalf("GetHuaweiKnowledgeStats error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var statsResp struct {
		Success bool `json:"success"`
		Data    struct {
			MIBNodes    int `json:"mib_nodes"`
			AlarmCount  int `json:"alarm_count"`
			LogCount    int `json:"log_count"`
			ModelSeries int `json:"model_series"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &statsResp); err != nil {
		t.Fatalf("unmarshal stats: %v", err)
	}
	if !statsResp.Success || statsResp.Data.MIBNodes < 11600 || statsResp.Data.AlarmCount < 1300 || statsResp.Data.LogCount < 2100 {
		t.Fatalf("unexpected stats response: %+v", statsResp)
	}
}

func TestKnowledgeHandler_LookupValidationAndResponses(t *testing.T) {
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	h := handlers.KnowledgeHandler{Auth: allowedAuth}
	e := echo.New()

	callLookup := func(query string) (*httptest.ResponseRecorder, error) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/knowledge/huawei/lookup"+query, nil)
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+allowedToken)
		rec := httptest.NewRecorder()
		return rec, h.LookupHuaweiKnowledge(e.NewContext(req, rec))
	}

	// 校验 400
	for _, badQuery := range []string{
		"",
		"?oid=not-an-oid",
		"?oid=" + strings.Repeat("1.", 65) + "1",
		"?module=" + strings.Repeat("A", 65),
		"?message=" + strings.Repeat("x", 2049),
	} {
		_, err := callLookup(badQuery)
		assertHTTPErrorCode(t, err, http.StatusBadRequest)
	}

	// 命中告警多变体
	rec, err := callLookup("?oid=1.3.6.1.4.1.2011.5.25.219.2.4.5&event_id=136203")
	if err != nil {
		t.Fatalf("lookup alarm variant error = %v", err)
	}
	var alarmResp struct {
		Success bool `json:"success"`
		Data    struct {
			Matched bool   `json:"matched"`
			Kind    string `json:"kind"`
			Alarm   struct {
				AlarmName    string `json:"alarm_name"`
				SubID        string `json:"sub_id"`
				VariantCount int    `json:"variant_count"`
			} `json:"alarm"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &alarmResp); err != nil || !alarmResp.Success || !alarmResp.Data.Matched || alarmResp.Data.Kind != "alarm" {
		t.Fatalf("unexpected alarm resp: %s (err=%v)", rec.Body.String(), err)
	}
	if alarmResp.Data.Alarm.SubID != "136203" || alarmResp.Data.Alarm.VariantCount < 2 {
		t.Fatalf("unexpected alarm variant fields: %+v", alarmResp.Data.Alarm)
	}

	// 命中日志
	rec, err = callLookup("?module=VOSCPU&mnemonic=CPU_USAGE_HIGH")
	if err != nil {
		t.Fatalf("lookup log error = %v", err)
	}
	if !strings.Contains(rec.Body.String(), `"kind":"log"`) || !strings.Contains(rec.Body.String(), `"CPU_USAGE_HIGH"`) {
		t.Fatalf("unexpected log resp: %s", rec.Body.String())
	}

	// 命中 MIB 节点
	rec, err = callLookup("?oid=.1.3.6.1.4.1.2011.5.25.31.1.1.3.1.4.7")
	if err != nil {
		t.Fatalf("lookup mib error = %v", err)
	}
	if !strings.Contains(rec.Body.String(), `"kind":"mib"`) || !strings.Contains(rec.Body.String(), `"hwEntityOpticalVendorSn"`) || !strings.Contains(rec.Body.String(), `"instance_suffix":"7"`) {
		t.Fatalf("unexpected mib resp: %s", rec.Body.String())
	}

	// 未命中返回 matched:false
	rec, err = callLookup("?oid=1.2.3.4.5.6.7.8")
	if err != nil {
		t.Fatalf("lookup miss error = %v", err)
	}
	if !strings.Contains(rec.Body.String(), `"matched":false`) {
		t.Fatalf("unexpected miss resp: %s", rec.Body.String())
	}
}
