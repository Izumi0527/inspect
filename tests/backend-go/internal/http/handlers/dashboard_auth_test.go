package handlers_test

import (
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestDashboardHandler_DeviceEndpointsRequireDevicesRead(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"alerts:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})

	h := handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: deniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/dashboard/network-overview", deniedToken)
	err := h.GetNetworkOverview(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: allowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/dashboard/network-overview", allowedToken)
	err = h.GetNetworkOverview(ctx)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)
}

func TestDashboardHandler_AlertEndpointsRequireAlertsRead(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"alerts:read"})

	h := handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: deniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/dashboard/recent-alerts", deniedToken)
	err := h.GetRecentAlerts(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: allowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/dashboard/recent-alerts", allowedToken)
	err = h.GetRecentAlerts(ctx)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)
}

func TestDashboardHandler_BandwidthEndpointsRequireMonitoringRead(t *testing.T) {
	deniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"devices:read"})
	allowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: deniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/dashboard/bandwidth-stats", deniedToken)
	err := h.GetBandwidthStats(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.DashboardHandler{Service: &dashboard.Service{}, Auth: allowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/dashboard/bandwidth-stats", allowedToken)
	err = h.GetBandwidthStats(ctx)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)
}
