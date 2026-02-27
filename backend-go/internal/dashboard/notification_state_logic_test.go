package dashboard

import (
	"testing"
	"time"
)

func TestNormalizeNotificationIDs_ShouldTrimDedupeAndSkipEmpty(t *testing.T) {
	ids := normalizeNotificationIDs([]string{"  ", "alert-1", "alert-1", "  report-9 "}, 0)
	if len(ids) != 2 {
		t.Fatalf("ids=%v, want 2 items", ids)
	}
	if ids[0] != "alert-1" {
		t.Fatalf("ids[0]=%q, want %q", ids[0], "alert-1")
	}
	if ids[1] != "report-9" {
		t.Fatalf("ids[1]=%q, want %q", ids[1], "report-9")
	}
}

func TestCollectUniqueNotificationIDs_ShouldDedupeAndLimit(t *testing.T) {
	now := time.Now().UTC()
	candidates := []notificationCandidate{
		{notification: Notification{ID: "a"}, timestamp: now},
		{notification: Notification{ID: "a"}, timestamp: now},
		{notification: Notification{ID: "b"}, timestamp: now},
		{notification: Notification{ID: "c"}, timestamp: now},
	}

	ids := collectUniqueNotificationIDs(candidates, 2)
	if len(ids) != 2 {
		t.Fatalf("ids=%v, want 2", ids)
	}
	if ids[0] != "a" || ids[1] != "b" {
		t.Fatalf("ids=%v, want [a b]", ids)
	}
}

func TestApplyUserNotificationStates_ShouldSkipDismissedAndCountUnread(t *testing.T) {
	now := time.Now().UTC()
	readAt := now.Add(-time.Minute)
	dismissedAt := now.Add(-time.Second)

	candidates := []notificationCandidate{
		{notification: Notification{ID: "alert-1", Read: false}, timestamp: now},
		{notification: Notification{ID: "alert-2", Read: false}, timestamp: now.Add(-time.Second)},
		{notification: Notification{ID: "alert-1", Read: false}, timestamp: now.Add(-2 * time.Second)},
	}

	stateByID := map[string]UserNotificationState{
		"alert-1": {NotificationID: "alert-1", ReadAt: &readAt},
		"alert-2": {NotificationID: "alert-2", DismissedAt: &dismissedAt},
	}

	notifications, unread := applyUserNotificationStates(candidates, stateByID, 20)
	if len(notifications) != 1 {
		t.Fatalf("notifications=%d, want 1", len(notifications))
	}
	if notifications[0].ID != "alert-1" {
		t.Fatalf("id=%q, want %q", notifications[0].ID, "alert-1")
	}
	if !notifications[0].Read {
		t.Fatalf("read=false, want true")
	}
	if unread != 0 {
		t.Fatalf("unread=%d, want 0", unread)
	}
}
