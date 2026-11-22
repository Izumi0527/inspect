package devices

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
)

const maxPersistedDiagnosticCandidates = 12

// SNMPCandidateDiagnostic 记录单个 SNMP 候选 OID 的脱敏执行诊断，严禁包含任何凭据信息。
type SNMPCandidateDiagnostic struct {
	Category    string `json:"category"`
	CandidateID string `json:"candidate_id"`
	Method      string `json:"method"`
	OID         string `json:"oid"`
	Status      string `json:"status"`
	Rows        int    `json:"rows"`
	ElapsedMs   int64  `json:"elapsed_ms"`
	ErrorClass  string `json:"error_class,omitempty"`
}

// SNMPCollectionDiagnostics 记录单轮 SNMP 采集的厂商识别、前缀重映射与候选耗时摘要。
type SNMPCollectionDiagnostics struct {
	InputVendor      string                    `json:"input_vendor,omitempty"`
	EffectiveVendor  string                    `json:"effective_vendor,omitempty"`
	SysObjectID      string                    `json:"sys_object_id,omitempty"`
	CanonicalPrefix  string                    `json:"canonical_prefix,omitempty"`
	ActivePrefix     string                    `json:"active_prefix,omitempty"`
	EnterpriseMapped bool                      `json:"enterprise_mapped,omitempty"`
	TotalElapsedMs   int64                     `json:"total_elapsed_ms"`
	Candidates       []SNMPCandidateDiagnostic `json:"candidates,omitempty"`
}

func newSNMPCollectionDiagnostics(inputVendor, effectiveVendor, sysObjectID, canonicalPrefix, activePrefix string) *SNMPCollectionDiagnostics {
	mapped := canonicalPrefix != "" && activePrefix != "" && canonicalPrefix != activePrefix
	return &SNMPCollectionDiagnostics{
		InputVendor:      strings.TrimSpace(inputVendor),
		EffectiveVendor:  strings.TrimSpace(effectiveVendor),
		SysObjectID:      strings.TrimSpace(sysObjectID),
		CanonicalPrefix:  strings.TrimSpace(canonicalPrefix),
		ActivePrefix:     strings.TrimSpace(activePrefix),
		EnterpriseMapped: mapped,
	}
}

func (d *SNMPCollectionDiagnostics) addCandidate(item SNMPCandidateDiagnostic) {
	if d == nil {
		return
	}
	d.Candidates = append(d.Candidates, item)
}

// ClassifySNMPError 将原始 SNMP 错误归一化为脱敏的白名单错误码，绝不暴露社区名、口令或底层连接串。
func ClassifySNMPError(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "canceled"
	}
	if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
		return "timeout"
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout"
	}

	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "context canceled"):
		return "canceled"
	case strings.Contains(lower, "timeout"),
		strings.Contains(lower, "timed out"),
		strings.Contains(lower, "deadline exceeded"):
		return "timeout"
	case strings.Contains(lower, "authentication"),
		strings.Contains(lower, "unknown user"),
		strings.Contains(lower, "usm"),
		strings.Contains(lower, "decryption"),
		strings.Contains(lower, "wrong digest"),
		strings.Contains(lower, "authorization"):
		return "auth_error"
	case strings.Contains(lower, "connection refused"),
		strings.Contains(lower, "network is unreachable"),
		strings.Contains(lower, "no route to host"),
		strings.Contains(lower, "host is down"),
		strings.Contains(lower, "unreachable"):
		return "unreachable"
	default:
		return "snmp_error"
	}
}

func isPriorityDiagnosticCandidate(item SNMPCandidateDiagnostic) bool {
	if item.Status == "error" || item.Status == "hit" {
		return true
	}
	switch item.Category {
	case "cpu", "memory", "temperature", "identity":
		return true
	default:
		return item.ElapsedMs >= 500
	}
}

// CompactSNMPDiagnostics 压缩候选诊断列表（最多保留 12 条异常/核心候选），避免 tags 膨胀。
func CompactSNMPDiagnostics(diag *SNMPCollectionDiagnostics) *SNMPCollectionDiagnostics {
	if diag == nil {
		return nil
	}
	out := &SNMPCollectionDiagnostics{
		InputVendor:      diag.InputVendor,
		EffectiveVendor:  diag.EffectiveVendor,
		SysObjectID:      diag.SysObjectID,
		CanonicalPrefix:  diag.CanonicalPrefix,
		ActivePrefix:     diag.ActivePrefix,
		EnterpriseMapped: diag.EnterpriseMapped,
		TotalElapsedMs:   diag.TotalElapsedMs,
	}
	if len(diag.Candidates) == 0 {
		return out
	}
	if len(diag.Candidates) <= maxPersistedDiagnosticCandidates {
		out.Candidates = append([]SNMPCandidateDiagnostic(nil), diag.Candidates...)
		return out
	}

	selected := make([]bool, len(diag.Candidates))
	count := 0
	for i, item := range diag.Candidates {
		if count >= maxPersistedDiagnosticCandidates {
			break
		}
		if isPriorityDiagnosticCandidate(item) {
			selected[i] = true
			count++
		}
	}
	for i := range diag.Candidates {
		if count >= maxPersistedDiagnosticCandidates {
			break
		}
		if !selected[i] {
			selected[i] = true
			count++
		}
	}

	out.Candidates = make([]SNMPCandidateDiagnostic, 0, count)
	for i, item := range diag.Candidates {
		if selected[i] {
			out.Candidates = append(out.Candidates, item)
		}
	}
	return out
}

// FormatCandidateDiagnosticsLog 生成单行脱敏的结构化诊断摘要文本，供后端日志输出。
func FormatCandidateDiagnosticsLog(diag *SNMPCollectionDiagnostics) string {
	if diag == nil {
		return ""
	}
	parts := make([]string, 0, len(diag.Candidates))
	for _, c := range diag.Candidates {
		if c.ErrorClass != "" {
			parts = append(parts, fmt.Sprintf("%s:%s=%s(%s,%dms)", c.Category, c.CandidateID, c.Status, c.ErrorClass, c.ElapsedMs))
			continue
		}
		parts = append(parts, fmt.Sprintf("%s:%s=%s(%dr,%dms)", c.Category, c.CandidateID, c.Status, c.Rows, c.ElapsedMs))
	}
	return fmt.Sprintf(
		"vendor=%s sys_oid=%s mapped=%v(%s->%s) total_ms=%d candidates=[%s]",
		diag.EffectiveVendor,
		diag.SysObjectID,
		diag.EnterpriseMapped,
		diag.CanonicalPrefix,
		diag.ActivePrefix,
		diag.TotalElapsedMs,
		strings.Join(parts, ","),
	)
}
