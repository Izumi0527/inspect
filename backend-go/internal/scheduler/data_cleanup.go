package scheduler

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
)

func (s *Service) cleanupDeviceLogs(ctx context.Context, before time.Time) (int64, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	if !tableExists(ctx, s.db, "device_logs") {
		return 0, nil
	}

	result := s.db.WithContext(ctx).
		Table("device_logs").
		Where("created_at < ?", before).
		Delete(nil)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func (s *Service) cleanupMetricsTables(ctx context.Context, before time.Time) (map[string]int64, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	tables := []struct {
		Table  string
		Column string
		Key    string
	}{
		{Table: "device_metrics", Column: "collected_at", Key: "device_metrics_deleted"},
		{Table: "system_metrics", Column: "collected_at", Key: "system_metrics_deleted"},
		{Table: "device_status_history", Column: "collected_at", Key: "device_status_deleted"},
	}

	results := map[string]int64{}
	for _, item := range tables {
		if !tableExists(ctx, s.db, item.Table) {
			continue
		}
		deleted, err := deleteByTime(ctx, s.db, item.Table, item.Column, before)
		if err != nil {
			return nil, err
		}
		results[item.Key] = deleted
	}

	return results, nil
}

func tableExists(ctx context.Context, db *gorm.DB, table string) bool {
	if db == nil || table == "" {
		return false
	}

	var exists bool
	err := db.WithContext(ctx).
		Raw(
			`SELECT EXISTS (
				SELECT 1
				FROM information_schema.tables
				WHERE table_schema = 'public' AND table_name = ?
			)`,
			table,
		).
		Scan(&exists).Error
	if err != nil {
		return false
	}
	return exists
}

func deleteByTime(ctx context.Context, db *gorm.DB, table string, column string, before time.Time) (int64, error) {
	if db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	if table == "" || column == "" {
		return 0, fmt.Errorf("invalid table or column")
	}

	result := db.WithContext(ctx).
		Table(table).
		Where(fmt.Sprintf("%s < ?", column), before).
		Delete(nil)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}
