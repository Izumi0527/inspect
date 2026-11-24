package logs

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/common"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

// applyLogExcludeKeywords 将日志屏蔽关键字编译为字面量、设施、VRP 模块、人话正则规则及 Trap OID 过滤条件。
func (s *Service) applyLogExcludeKeywords(ctx context.Context, query *gorm.DB, raw *string) *gorm.DB {
	effectiveExclude := s.effectiveExcludeSearch(ctx, raw)
	if effectiveExclude == "" {
		return query
	}

	var trapMatcher common.TrapOIDMatcher
	if catalog, err := snmpmib.DefaultAlarmCatalog(); err == nil && catalog != nil {
		trapMatcher = catalog.MatchTrapOIDsByKeyword
	}

	plan := common.CompileLogExcludePlan(effectiveExclude, trapMatcher)
	for _, kw := range plan.LiteralTerms {
		pattern := "%" + common.EscapeLikePattern(kw) + "%"
		query = query.Where(
			"(COALESCE(l.message, '') NOT ILIKE ? AND COALESCE(l.raw_message, '') NOT ILIKE ? AND COALESCE(d.name, '') NOT ILIKE ? AND COALESCE(CAST(d.ip_address AS TEXT), '') NOT ILIKE ? AND COALESCE(l.source_process, '') NOT ILIKE ? AND COALESCE(l.facility, '') NOT ILIKE ?)",
			pattern, pattern, pattern, pattern, pattern, pattern,
		)
	}
	if len(plan.Facilities) > 0 {
		query = query.Where(
			"NOT (LOWER(COALESCE(l.facility, '')) = ANY(string_to_array(?, ',')))",
			strings.Join(plan.Facilities, ","),
		)
	}
	if len(plan.VRPModules) > 0 {
		query = query.Where(
			"NOT (UPPER(COALESCE(l.source_process, '')) = ANY(string_to_array(?, ',')))",
			strings.Join(plan.VRPModules, ","),
		)
	}
	for _, rc := range plan.RuleClauses {
		if rc.ExcludePattern == "" {
			query = query.Where("NOT (COALESCE(l.message, '') ~* ?)", rc.Pattern)
		} else {
			query = query.Where(
				"NOT (COALESCE(l.message, '') ~* ? AND NOT (COALESCE(l.message, '') ~* ?))",
				rc.Pattern, rc.ExcludePattern,
			)
		}
	}
	if len(plan.TrapOIDs) > 0 {
		query = query.Where(
			"NOT (replace(COALESCE(substring(COALESCE(l.message, '') FROM '([0-9]+(\\.[0-9]+){5,})'), ''), '1.3.6.1.4.1.56813.', '1.3.6.1.4.1.2011.') = ANY(string_to_array(?, ',')))",
			strings.Join(plan.TrapOIDs, ","),
		)
	}
	return query
}
