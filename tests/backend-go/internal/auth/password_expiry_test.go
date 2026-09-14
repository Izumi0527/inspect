package auth_test

import (
	"testing"
	"time"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
)

//go:linkname passwordExpired github.com/your-org/inspect-system/backend-go/internal/auth.passwordExpired
func passwordExpired(user *auth.UserRecord, expireDays int, now time.Time) bool

func TestPasswordExpired(t *testing.T) {
	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	daysAgo := func(d int) *time.Time {
		v := now.Add(-time.Duration(d) * 24 * time.Hour)
		return &v
	}

	cases := []struct {
		name       string
		user       *auth.UserRecord
		expireDays int
		want       bool
	}{
		{"zero days means never expires", &auth.UserRecord{PasswordChangedAt: daysAgo(400)}, 0, false},
		{"changed recently", &auth.UserRecord{PasswordChangedAt: daysAgo(10)}, 90, false},
		{"changed long ago", &auth.UserRecord{PasswordChangedAt: daysAgo(91)}, 90, true},
		{"exactly at boundary is still valid", &auth.UserRecord{PasswordChangedAt: daysAgo(90)}, 90, false},
		{"never changed falls back to created_at", &auth.UserRecord{CreatedAt: daysAgo(120)}, 90, true},
		{"never changed and recently created", &auth.UserRecord{CreatedAt: daysAgo(5)}, 90, false},
		{"no timestamps at all cannot be judged", &auth.UserRecord{}, 90, false},
		{"nil user", nil, 90, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := passwordExpired(tc.user, tc.expireDays, now); got != tc.want {
				t.Fatalf("passwordExpired() = %v, want %v", got, tc.want)
			}
		})
	}
}
