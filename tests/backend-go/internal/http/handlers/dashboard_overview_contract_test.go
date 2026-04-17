package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type dashboardOverviewContractResponse struct {
	Sections map[string]struct {
		Ok                  bool    `json:"ok"`
		Message             *string `json:"message"`
		LimitedByPermission bool    `json:"limitedByPermission"`
		RequiredPermission  string  `json:"requiredPermission"`
	} `json:"sections"`
}

func newDashboardOverviewHandler(t *testing.T, permissions []string) (handlers.DashboardHandler, sqlmock.Sqlmock, func()) {
	t.Helper()

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	service := dashboard.NewService(gormDB, nil, nil, nil, nil, zap.NewNop())
	return handlers.DashboardHandler{
		Service: service,
		Auth: notificationContractAuthService{
			userID:      "user-1",
			permissions: permissions,
		},
	}, mock, cleanup
}

func TestDashboardOverviewHandler_ShouldReturnSectionFailureInsteadOfFatalPageError(t *testing.T) {
	h, mock, cleanup := newDashboardOverviewHandler(t, []string{"alerts:read"})
	defer cleanup()

	mock.ExpectQuery(`(?is)SELECT .*COUNT\(\*\) AS count.*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*GROUP BY .*severity.*`).
		WillReturnRows(sqlmock.NewRows([]string{"severity", "status", "count"}).
			AddRow("critical", "active", 3))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM alerts AS a JOIN devices d ON d\.id = a\.device_id WHERE .*status IN .*`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT .*FROM alerts AS a JOIN devices d ON d\.id = a\.device_id.*`).
		WillReturnError(assertiveError("recent alerts unavailable"))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/dashboard/overview", "test-token", nil)

	if err := h.GetOverview(ctx); err != nil {
		t.Fatalf("GetOverview returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var resp dashboardOverviewContractResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal response: %v", err)
	}

	section := resp.Sections["recentAlerts"]
	if section.Ok {
		t.Fatalf("recentAlerts.ok = true, want false")
	}
	if section.Message == nil || *section.Message == "" {
		t.Fatalf("recentAlerts.message should not be empty")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

type assertiveError string

func (e assertiveError) Error() string {
	return string(e)
}
