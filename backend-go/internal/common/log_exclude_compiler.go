package common

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// TrapOIDMatcher 按屏蔽关键字反查命中的规范化 Trap OID 列表。
type TrapOIDMatcher func(keyword string) []string

// RuleExcludeClause 表示一条供 PostgreSQL ~* 正则执行的规则级排除子句。
type RuleExcludeClause struct {
	RuleID         string
	Pattern        string
	ExcludePattern string
}

// LogExcludePlan 保存日志屏蔽关键字编译后的多层过滤条件。
type LogExcludePlan struct {
	LiteralTerms []string
	Facilities   []string
	VRPModules   []string
	RuleClauses  []RuleExcludeClause
	TrapOIDs     []string
}

var logPlainRulesByID = buildLogPlainRulesIndex()

func buildLogPlainRulesIndex() map[string]LogPlainRule {
	index := make(map[string]LogPlainRule, len(logPlainRules))
	for _, rule := range logPlainRules {
		index[rule.ID] = rule
	}
	return index
}

// CompileLogExcludePlan 将用户屏蔽关键字编译为字面词、设施、VRP 模块、正则规则和 Trap OID 过滤计划。
func CompileLogExcludePlan(raw string, trapMatcher TrapOIDMatcher) LogExcludePlan {
	plan := LogExcludePlan{
		LiteralTerms: ExpandExcludeKeywords(raw),
	}
	if len(plan.LiteralTerms) == 0 {
		return plan
	}

	matchedRules := make(map[string]struct{})
	facilitySet := make(map[string]struct{})
	moduleSet := make(map[string]struct{})
	oidSet := make(map[string]struct{})

	for _, kw := range SplitExcludeKeywords(raw) {
		compileKeywordIntoSets(kw, trapMatcher, matchedRules, facilitySet, moduleSet, oidSet)
	}

	plan.Facilities = sortedKeys(facilitySet)
	plan.VRPModules = sortedKeys(moduleSet)
	plan.TrapOIDs = sortedKeys(oidSet)
	plan.RuleClauses = buildRuleExcludeClauses(matchedRules)
	return plan
}

func compileKeywordIntoSets(
	kw string,
	trapMatcher TrapOIDMatcher,
	matchedRules map[string]struct{},
	facilitySet map[string]struct{},
	moduleSet map[string]struct{},
	oidSet map[string]struct{},
) {
	if containsNonASCII(kw) {
		runeLen := utf8.RuneCountInString(kw)
		if runeLen < 2 {
			return
		}
		matchPlainRules(kw, matchedRules)
		matchFacilities(kw, facilitySet)
		matchVRPModules(kw, runeLen, moduleSet)
		collectTrapOIDs(kw, trapMatcher, oidSet)
		return
	}
	if len(kw) >= 4 {
		collectTrapOIDs(kw, trapMatcher, oidSet)
	}
}

func matchPlainRules(kw string, matchedRules map[string]struct{}) {
	lowerKW := strings.ToLower(kw)
	for _, rule := range logPlainRules {
		if strings.Contains(strings.ToLower(rule.ChineseText), lowerKW) {
			matchedRules[rule.ID] = struct{}{}
		}
	}
}

func matchFacilities(kw string, facilitySet map[string]struct{}) {
	for facility, labels := range logFacilityChineseLabels {
		for _, label := range labels {
			if strings.EqualFold(label, kw) {
				facilitySet[strings.ToLower(facility)] = struct{}{}
				break
			}
		}
	}
}

func matchVRPModules(kw string, runeLen int, moduleSet map[string]struct{}) {
	lowerKW := strings.ToLower(kw)
	for label, codes := range vrpModuleChineseLabels {
		exact := strings.EqualFold(label, kw)
		substr := runeLen >= 3 && strings.Contains(strings.ToLower(label), lowerKW)
		if !exact && !substr {
			continue
		}
		for _, code := range codes {
			moduleSet[strings.ToUpper(code)] = struct{}{}
		}
	}
}

func collectTrapOIDs(kw string, trapMatcher TrapOIDMatcher, oidSet map[string]struct{}) {
	if trapMatcher == nil {
		return
	}
	for _, oid := range trapMatcher(kw) {
		if isValidTrapOID(oid) {
			oidSet[oid] = struct{}{}
		}
	}
}

func buildRuleExcludeClauses(matchedRules map[string]struct{}) []RuleExcludeClause {
	if len(matchedRules) == 0 {
		return nil
	}
	var mergedPatterns []string
	var clauses []RuleExcludeClause

	for _, rule := range logPlainRules {
		if _, ok := matchedRules[rule.ID]; !ok {
			continue
		}
		excludePat := buildEffectiveExcludePattern(rule, matchedRules)
		if excludePat == "" {
			mergedPatterns = append(mergedPatterns, "(?:"+rule.SQLPattern+")")
			continue
		}
		clauses = append(clauses, RuleExcludeClause{
			RuleID:         rule.ID,
			Pattern:        rule.SQLPattern,
			ExcludePattern: excludePat,
		})
	}

	if len(mergedPatterns) > 0 {
		merged := RuleExcludeClause{
			RuleID:  "merged",
			Pattern: strings.Join(mergedPatterns, "|"),
		}
		clauses = append([]RuleExcludeClause{merged}, clauses...)
	}
	return clauses
}

func buildEffectiveExcludePattern(rule LogPlainRule, matchedRules map[string]struct{}) string {
	var parts []string
	if rule.ExcludePattern != "" {
		parts = append(parts, "(?:"+rule.ExcludePattern+")")
	}
	for _, hiID := range rule.HigherPriorityIDs {
		if _, hiMatched := matchedRules[hiID]; hiMatched {
			continue
		}
		if hiRule, ok := logPlainRulesByID[hiID]; ok && hiRule.SQLPattern != "" {
			parts = append(parts, "(?:"+hiRule.SQLPattern+")")
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "|")
}

func containsNonASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] > unicode.MaxASCII {
			return true
		}
	}
	return false
}

func isValidTrapOID(oid string) bool {
	if oid == "" || strings.HasPrefix(oid, ".") || strings.HasSuffix(oid, ".") || strings.Contains(oid, "..") {
		return false
	}
	dots := 0
	for i := 0; i < len(oid); i++ {
		ch := oid[i]
		if ch == '.' {
			dots++
			continue
		}
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return dots >= 5
}

func sortedKeys(set map[string]struct{}) []string {
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
