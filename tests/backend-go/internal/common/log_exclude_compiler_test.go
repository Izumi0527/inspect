package common_test

import (
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/common"
)

func TestLogPlainRules_AllRegexValidAndSafeForPostgresARE(t *testing.T) {
	rules := common.LogPlainRules()
	if len(rules) < 49 {
		t.Fatalf("expected >= 49 plain rules, got %d", len(rules))
	}
	seenIDs := make(map[string]struct{}, len(rules))
	for _, r := range rules {
		if r.ID == "" || r.ChineseText == "" || r.SQLPattern == "" {
			t.Fatalf("rule %+v has empty required field", r)
		}
		if _, dup := seenIDs[r.ID]; dup {
			t.Fatalf("duplicate rule ID %q", r.ID)
		}
		seenIDs[r.ID] = struct{}{}

		for _, pat := range []string{r.SQLPattern, r.ExcludePattern} {
			if pat == "" {
				continue
			}
			if strings.Contains(pat, `\b`) {
				t.Fatalf("rule %s contains forbidden \\b in %q", r.ID, pat)
			}
			if strings.Contains(pat, `(?<!`) {
				t.Fatalf("rule %s contains forbidden (?<! in %q", r.ID, pat)
			}
			if strings.Contains(pat, `.*`) {
				t.Fatalf("rule %s contains unbounded .* in %q", r.ID, pat)
			}
			if strings.Contains(pat, `[\s\S]`) {
				t.Fatalf("rule %s contains forbidden [\\s\\S] in %q", r.ID, pat)
			}
			if _, err := regexp.Compile("(?is)" + pat); err != nil {
				t.Fatalf("rule %s pattern failed Go RE2 compile: %v (pattern=%q)", r.ID, err, pat)
			}
		}
	}
}

func matchClauses(t *testing.T, clauses []common.RuleExcludeClause, msg string) bool {
	t.Helper()
	for _, c := range clauses {
		re, err := regexp.Compile("(?is)" + c.Pattern)
		if err != nil {
			t.Fatalf("compile Pattern for %s failed: %v", c.RuleID, err)
		}
		if !re.MatchString(msg) {
			continue
		}
		if c.ExcludePattern == "" {
			return true
		}
		exRe, err := regexp.Compile("(?is)" + c.ExcludePattern)
		if err != nil {
			t.Fatalf("compile ExcludePattern for %s failed: %v", c.RuleID, err)
		}
		if !exRe.MatchString(msg) {
			return true
		}
	}
	return false
}

func TestCompileLogExcludePlan_RuleMatchingAndPriority(t *testing.T) {
	t.Run("半双工命中规则且正反例正确", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("半双工", nil)
		if len(plan.RuleClauses) == 0 {
			t.Fatal("expected rule clauses for 半双工")
		}
		if !matchClauses(t, plan.RuleClauses, "SRM/3/HALFDUPLEXALARM: Port works in half-duplex mode") {
			t.Fatal("expected half-duplex message to match")
		}
		if matchClauses(t, plan.RuleClauses, "Port works in full-duplex mode") {
			t.Fatal("did not expect full-duplex message to match")
		}
	})

	t.Run("端口处在半双工状态不命中任何中文规则", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("端口处在半双工状态", nil)
		if len(plan.RuleClauses) != 0 {
			t.Fatalf("expected no rule clauses, got %+v", plan.RuleClauses)
		}
		if !reflect.DeepEqual(plan.LiteralTerms, []string{"端口处在半双工状态"}) {
			t.Fatalf("LiteralTerms = %v", plan.LiteralTerms)
		}
	})

	t.Run("接口链路 Down 排除 line-protocol-down", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("接口链路 Down", nil)
		if !matchClauses(t, plan.RuleClauses, "Interface GigabitEthernet0/0/1 changed state to down") {
			t.Fatal("expected interface-down message to match")
		}
		if matchClauses(t, plan.RuleClauses, "Line protocol on interface GigabitEthernet0/0/1, changed state to down") {
			t.Fatal("did not expect line-protocol-down to be excluded by 接口链路 Down")
		}
	})

	t.Run("端口因错误被关闭排除恢复日志", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("端口因错误被关闭", nil)
		if !matchClauses(t, plan.RuleClauses, "ERRDOWN/4/ERRDOWN_DOWNNOTIFY: The interface GE0/0/1 changes to the error-down state") {
			t.Fatal("expected error-down notify to match")
		}
		if matchClauses(t, plan.RuleClauses, "ERRDOWN/4/ERRDOWN_DOWNRECOVER: The interface GE0/0/1 leaves the error-down state") {
			t.Fatal("did not expect error-down recover to match")
		}
	})

	t.Run("电源不误杀风扇恢复且同时覆盖 power-fault 与 hardware-recover-power", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("电源", nil)
		if !matchClauses(t, plan.RuleClauses, "SRM/4/POWERNORMAL: Power 1 has resumed.") {
			t.Fatal("expected power resume to match")
		}
		if !matchClauses(t, plan.RuleClauses, "SRM/3/POWERFAIL: Power 1 failed.") {
			t.Fatal("expected power fail to match")
		}
		if matchClauses(t, plan.RuleClauses, "SRM/4/FANNORMAL: Fan 1 resumed.") {
			t.Fatal("did not expect fan resume to be excluded by 电源")
		}
	})

	t.Run("错包不包含 suggestion 且不误杀 error-down-recover", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("错包", nil)
		if !matchClauses(t, plan.RuleClauses, "Port GE0/0/1 CRC error count exceeded threshold") {
			t.Fatal("expected CRC exceed to match 错包")
		}
		if matchClauses(t, plan.RuleClauses, "ERRDOWN/4/ERRDOWN_DOWNRECOVER: The interface GE0/0/1 leaves the error-down state") {
			t.Fatal("did not expect error-down-recover to match 错包 (suggestion only)")
		}
	})

	t.Run("光模块已插入排除 not present", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("光模块已插入", nil)
		if !matchClauses(t, plan.RuleClauses, "Transceiver GE0/0/1 is present") {
			t.Fatal("expected transceiver present to match")
		}
		if matchClauses(t, plan.RuleClauses, "Transceiver GE0/0/1 is not present") {
			t.Fatal("did not expect transceiver not present to match")
		}
	})

	t.Run("单板已插入不误杀 Board 1 unregistered", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("单板已插入", nil)
		if !matchClauses(t, plan.RuleClauses, "Board 1 is inserted") {
			t.Fatal("expected board inserted to match")
		}
		if matchClauses(t, plan.RuleClauses, "Board 1 unregistered") {
			t.Fatal("did not expect Board 1 unregistered to be excluded by 单板已插入")
		}
	})

	t.Run("PoE 供电异常不误杀 PoE overload", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("PoE 供电异常", nil)
		if !matchClauses(t, plan.RuleClauses, "PoE power abnormal on interface GE0/0/1") {
			t.Fatal("expected PoE power abnormal to match")
		}
		if matchClauses(t, plan.RuleClauses, "PoE overload on slot 1") {
			t.Fatal("did not expect PoE overload to be excluded by PoE 供电异常")
		}
	})

	t.Run("单字中文与短纯ASCII不触发规则或Trap匹配", func(t *testing.T) {
		called := false
		matcher := func(kw string) []string {
			called = true
			return []string{"1.3.6.1.4.1.2011.5.25.219.2.5.3"}
		}
		p1 := common.CompileLogExcludePlan("电", matcher)
		if called || len(p1.RuleClauses) != 0 || len(p1.Facilities) != 0 || len(p1.VRPModules) != 0 || len(p1.TrapOIDs) != 0 {
			t.Fatalf("single CJK char should not trigger rules/traps/labels: %+v, called=%v", p1, called)
		}
		p2 := common.CompileLogExcludePlan("BGP", matcher)
		if called || len(p2.RuleClauses) != 0 || len(p2.TrapOIDs) != 0 {
			t.Fatalf("short ASCII should not trigger trapMatcher or rules: %+v, called=%v", p2, called)
		}
	})

	t.Run("纯ASCII大于等于4字符调用TrapMatcher并校验OID格式", func(t *testing.T) {
		matcher := func(kw string) []string {
			if kw == "hwFanFail" {
				return []string{"1.3.6.1.4.1.2011.5.25.219.2.6.3", "bad-oid", "1.2.3.4"}
			}
			return nil
		}
		plan := common.CompileLogExcludePlan("hwFanFail", matcher)
		if !reflect.DeepEqual(plan.TrapOIDs, []string{"1.3.6.1.4.1.2011.5.25.219.2.6.3"}) {
			t.Fatalf("TrapOIDs = %v", plan.TrapOIDs)
		}
		if len(plan.RuleClauses) != 0 {
			t.Fatalf("ASCII should not scan Chinese rules: %+v", plan.RuleClauses)
		}
	})

	t.Run("设施与VRP模块中文反查与泛词排除", func(t *testing.T) {
		plan := common.CompileLogExcludePlan("接口, 设备, 链路聚合控制", nil)
		if !reflect.DeepEqual(plan.Facilities, []string{"interface"}) {
			t.Fatalf("Facilities = %v, want [interface]", plan.Facilities)
		}
		if !reflect.DeepEqual(plan.VRPModules, []string{"LACP"}) {
			t.Fatalf("VRPModules = %v, want [LACP]", plan.VRPModules)
		}
	})
}
