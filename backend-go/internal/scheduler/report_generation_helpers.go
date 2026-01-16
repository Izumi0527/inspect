package scheduler

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func (s *Service) loadPendingReport(ctx context.Context, scheduleID int) (*reports.Report, error) {
	if s == nil || s.reportService == nil {
		return nil, nil
	}

	var report reports.Report
	err := s.reportService.DB().WithContext(ctx).
		Where("schedule_id = ? AND status = ?", scheduleID, "pending").
		Order("created_at desc").
		Take(&report).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (s *Service) ensurePendingReport(
	ctx context.Context,
	schedule reports.ReportSchedule,
	template reports.ReportTemplate,
	params map[string]interface{},
	start time.Time,
	end time.Time,
	formatsJSON datatypes.JSON,
) error {
	if s == nil || s.reportService == nil {
		return nil
	}

	pending, err := s.loadPendingReport(ctx, schedule.ID)
	if err != nil || pending != nil {
		return err
	}

	filtersJSON, err := encodeJSON(params)
	if err != nil {
		return err
	}

	report := reports.Report{
		TemplateID:    &template.ID,
		ScheduleID:    &schedule.ID,
		Title:         schedule.Name,
		Description:   schedule.Description,
		ReportType:    template.ReportType,
		StartDate:     start,
		EndDate:       end,
		DeviceFilters: filtersJSON,
		Status:        "pending",
		FileFormats:   formatsJSON,
		FilePaths:     datatypes.JSON([]byte("{}")),
		FileSizes:     datatypes.JSON([]byte("{}")),
	}

	if schedule.CreatedBy != nil && strings.TrimSpace(*schedule.CreatedBy) != "" {
		report.GeneratedBy = schedule.CreatedBy
	}

	return s.reportService.CreateReport(ctx, &report)
}
