package dashboard

import (
	"testing"
	"time"
)

func TestBuildDashboardSections_ShouldMarkLimitedSections(t *testing.T) {
	sections := buildDashboardSections(overviewAccess{
		CanReadDevices:    false,
		CanReadAlerts:     true,
		CanReadMonitoring: false,
	})

	if sections["stats"].Ok != true {
		t.Fatalf("stats.ok = %v, want true", sections["stats"].Ok)
	}
	if sections["networkOverview"].LimitedByPermission != true {
		t.Fatalf("networkOverview should be permission limited")
	}
	if sections["networkOverview"].RequiredPermission != "devices:read" {
		t.Fatalf("required permission = %q, want %q", sections["networkOverview"].RequiredPermission, "devices:read")
	}
	if sections["statsBandwidth"].RequiredPermission != "monitoring:read" {
		t.Fatalf("statsBandwidth required permission = %q, want %q", sections["statsBandwidth"].RequiredPermission, "monitoring:read")
	}
}

func TestFilterNotificationCandidatesByAccess_ShouldKeepOnlyAllowedSources(t *testing.T) {
	now := time.Now().UTC()
	candidates := []notificationCandidate{
		{
			notification: Notification{ID: "alert-1"},
			timestamp:    now,
			source:       notificationSourceAlert,
		},
		{
			notification: Notification{ID: "report-1"},
			timestamp:    now.Add(-time.Second),
			source:       notificationSourceReport,
		},
		{
			notification: Notification{ID: "scan-1"},
			timestamp:    now.Add(-2 * time.Second),
			source:       notificationSourceScan,
		},
	}

	filtered := filterNotificationCandidatesByAccess(candidates, notificationAccess{
		CanReadAlerts:      false,
		CanReadReports:     true,
		CanReadDevices:     false,
		CanReadInspections: false,
	})

	if len(filtered) != 1 {
		t.Fatalf("filtered count = %d, want 1", len(filtered))
	}
	if filtered[0].notification.ID != "report-1" {
		t.Fatalf("kept id = %q, want %q", filtered[0].notification.ID, "report-1")
	}
}

func TestFilterNotificationActionIDsByAccess_ShouldDropUnauthorizedIDs(t *testing.T) {
	now := time.Now().UTC()
	candidates := []notificationCandidate{
		{
			notification: Notification{ID: "alert-1"},
			timestamp:    now,
			source:       notificationSourceAlert,
		},
		{
			notification: Notification{ID: "inspection-1"},
			timestamp:    now.Add(-time.Second),
			source:       notificationSourceInspection,
		},
		{
			notification: Notification{ID: "scan-1"},
			timestamp:    now.Add(-2 * time.Second),
			source:       notificationSourceScan,
		},
	}

	filteredIDs := filterNotificationActionIDsByAccess(
		[]string{"alert-1", "inspection-1", "scan-1", "missing"},
		candidates,
		notificationAccess{
			CanReadAlerts:      false,
			CanReadInspections: true,
			CanReadDevices:     false,
			CanReadReports:     false,
		},
	)

	if len(filteredIDs) != 1 {
		t.Fatalf("filtered id count = %d, want 1", len(filteredIDs))
	}
	if filteredIDs[0] != "inspection-1" {
		t.Fatalf("kept id = %q, want %q", filteredIDs[0], "inspection-1")
	}
}
