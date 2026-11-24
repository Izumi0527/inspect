package monitoring

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	MaxPreprocessSteps = 8
	MaxRegexLength     = 256
)

// PreprocessStep 描述单步数据换算与清洗规则。
type PreprocessStep struct {
	Type   string            `json:"type"`
	Params map[string]string `json:"params,omitempty"`
}

// PrevSample 保存上一次采集的原始数值与时间，用于 change_per_sec 速率计算。
type PrevSample struct {
	Value       float64   `json:"value"`
	CollectedAt time.Time `json:"collected_at"`
	CurrentAt   time.Time `json:"current_at,omitempty"`
}

// PreprocessStepTrace 记录单步预处理的输入、输出及错误详情。
type PreprocessStepTrace struct {
	StepIndex int    `json:"step_index"`
	Type      string `json:"type"`
	Input     string `json:"input"`
	Output    string `json:"output"`
	Error     string `json:"error,omitempty"`
}

// PreprocessTrace 汇总预处理管线的完整追踪结果。
type PreprocessTrace struct {
	RawValue     string                `json:"raw_value"`
	Steps        []PreprocessStepTrace `json:"steps"`
	FinalValue   string                `json:"final_value"`
	NumericValue *float64              `json:"numeric_value,omitempty"`
	DisplayText  string                `json:"display_text"`
}

// ApplyPreprocessing 按顺序对原始采集值执行预处理步骤（multiplier / change_per_sec / regex / valuemap）与值映射。
func ApplyPreprocessing(raw string, prev *PrevSample, steps []PreprocessStep, valueMap map[string]string) (PreprocessTrace, error) {
	trace := PreprocessTrace{
		RawValue: raw,
		Steps:    make([]PreprocessStepTrace, 0, len(steps)),
	}
	if len(steps) > MaxPreprocessSteps {
		return trace, fmt.Errorf("preprocessing steps exceed limit (%d > %d)", len(steps), MaxPreprocessSteps)
	}

	current := strings.TrimSpace(raw)
	displayText := current

	for idx, step := range steps {
		stepType := strings.ToLower(strings.TrimSpace(step.Type))
		stepTrace := PreprocessStepTrace{
			StepIndex: idx,
			Type:      stepType,
			Input:     current,
		}

		var out string
		var err error
		switch stepType {
		case "multiplier":
			out, err = applyMultiplierStep(current, step.Params)
		case "change_per_sec":
			out, err = applyChangePerSecStep(current, prev, step.Params)
		case "regex":
			out, err = applyRegexStep(current, step.Params)
		case "valuemap":
			mapped, ok := lookupValueMap(current, valueMap)
			if ok {
				displayText = mapped
			}
			out = displayText
		default:
			err = fmt.Errorf("unsupported preprocessing step type: %s", step.Type)
		}

		if err != nil {
			stepTrace.Error = err.Error()
			trace.Steps = append(trace.Steps, stepTrace)
			return trace, err
		}

		stepTrace.Output = out
		trace.Steps = append(trace.Steps, stepTrace)
		if stepType != "valuemap" {
			current = out
			displayText = current
		}
	}

	trace.FinalValue = current
	if num, err := strconv.ParseFloat(strings.TrimSpace(current), 64); err == nil && !math.IsNaN(num) && !math.IsInf(num, 0) {
		trace.NumericValue = &num
	}

	if len(valueMap) > 0 {
		if mapped, ok := lookupValueMap(current, valueMap); ok {
			displayText = mapped
		}
	}
	trace.DisplayText = displayText
	return trace, nil
}

func applyMultiplierStep(current string, params map[string]string) (string, error) {
	val, err := strconv.ParseFloat(strings.TrimSpace(current), 64)
	if err != nil {
		return "", fmt.Errorf("multiplier requires numeric input: %w", err)
	}
	factorStr := strings.TrimSpace(params["factor"])
	if factorStr == "" {
		return "", fmt.Errorf("multiplier requires factor parameter")
	}
	factor, err := strconv.ParseFloat(factorStr, 64)
	if err != nil || math.IsNaN(factor) || math.IsInf(factor, 0) {
		return "", fmt.Errorf("invalid multiplier factor: %q", factorStr)
	}
	res := val * factor
	return formatFloatClean(res), nil
}

func applyChangePerSecStep(current string, prev *PrevSample, params map[string]string) (string, error) {
	if prev == nil {
		return "", fmt.Errorf("change_per_sec requires previous sample")
	}
	currVal, err := strconv.ParseFloat(strings.TrimSpace(current), 64)
	if err != nil {
		return "", fmt.Errorf("change_per_sec requires numeric input: %w", err)
	}
	now := prev.CurrentAt
	if now.IsZero() {
		now = time.Now().UTC()
	}
	dt := now.Sub(prev.CollectedAt).Seconds()
	if dt <= 0 {
		return "", fmt.Errorf("change_per_sec requires positive time delta (dt=%.4f)", dt)
	}

	delta := currVal - prev.Value
	if delta < 0 {
		bits := strings.TrimSpace(params["bits"])
		switch bits {
		case "64":
			delta = (float64(math.MaxUint64) - prev.Value) + currVal + 1
		case "32":
			delta = (float64(math.MaxUint32) - prev.Value) + currVal + 1
		default:
			// 自动判断：前值在 32 位上限内按 32 位回绕，否则按 64 位回绕
			if prev.Value <= float64(math.MaxUint32) && currVal <= float64(math.MaxUint32) {
				delta = (float64(math.MaxUint32) - prev.Value) + currVal + 1
			} else {
				delta = (float64(math.MaxUint64) - prev.Value) + currVal + 1
			}
		}
		if delta < 0 {
			return "", fmt.Errorf("counter rollover produced negative delta")
		}
	}

	return formatFloatClean(delta / dt), nil
}

func applyRegexStep(current string, params map[string]string) (string, error) {
	pattern := params["pattern"]
	if len(pattern) == 0 {
		return "", fmt.Errorf("regex step requires pattern")
	}
	if len(pattern) > MaxRegexLength {
		return "", fmt.Errorf("regex pattern exceeds max length %d", MaxRegexLength)
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return "", fmt.Errorf("invalid regex pattern: %w", err)
	}
	matches := re.FindStringSubmatch(current)
	if len(matches) == 0 {
		return "", fmt.Errorf("regex pattern did not match input")
	}
	if len(matches) > 1 {
		return matches[1], nil
	}
	return matches[0], nil
}

func lookupValueMap(value string, valueMap map[string]string) (string, bool) {
	if len(valueMap) == 0 {
		return "", false
	}
	trimmed := strings.TrimSpace(value)
	if mapped, ok := valueMap[trimmed]; ok {
		return mapped, true
	}
	if num, err := strconv.ParseFloat(trimmed, 64); err == nil {
		normalized := formatFloatClean(num)
		if mapped, ok := valueMap[normalized]; ok {
			return mapped, true
		}
	}
	return "", false
}

func formatFloatClean(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "0"
	}
	// 避免极小浮点误差如 2.3000000000000003
	rounded := math.Round(v*1e9) / 1e9
	return strconv.FormatFloat(rounded, 'f', -1, 64)
}

// LLDPresetFlags 描述普通用户友好的端口/硬件自动识别勾选开关。
type LLDPresetFlags struct {
	IgnoreVirtual   bool `json:"ignore_virtual"`
	IgnoreIdle      bool `json:"ignore_idle"`
	HighlightUplink bool `json:"highlight_uplink"`
}

const builtinVirtualInterfaceRegex = `(?i)^(Null|LoopBack|InLoopBack|lo($|[0-9/\-\s])|Vlan|Vlanif|Tunnel|Stack-Port|Css-Port|MEth|M-GigabitEthernet|M-Ethernet|M-Eth|Mgmt|Management|Eth-Trunk|Bridge-Aggregation|Route-Aggregation|Port-channel|Console|Aux|Vbdif|Vsi|Nve)`

// LLDMatcher 封装编译后的 RE2 自动识别匹配器。
type LLDMatcher struct {
	includeRe   *regexp.Regexp
	excludeRe   []*regexp.Regexp
	presetFlags LLDPresetFlags
}

// CompileLLDMatcher 将预设开关与高级正则编译为 RE2 线性时间匹配器。
func CompileLLDMatcher(rule MonitorLLDRule) (*LLDMatcher, error) {
	if len(rule.IncludeRegex) > MaxRegexLength {
		return nil, fmt.Errorf("include_regex exceeds max length %d", MaxRegexLength)
	}
	if len(rule.ExcludeRegex) > MaxRegexLength {
		return nil, fmt.Errorf("exclude_regex exceeds max length %d", MaxRegexLength)
	}

	var flags LLDPresetFlags
	if len(rule.PresetFlagsJSON) > 0 {
		_ = json.Unmarshal(rule.PresetFlagsJSON, &flags)
	}

	matcher := &LLDMatcher{
		presetFlags: flags,
	}

	if inc := strings.TrimSpace(rule.IncludeRegex); inc != "" {
		re, err := regexp.Compile(inc)
		if err != nil {
			return nil, fmt.Errorf("invalid include_regex: %w", err)
		}
		matcher.includeRe = re
	}

	if flags.IgnoreVirtual {
		matcher.excludeRe = append(matcher.excludeRe, regexp.MustCompile(builtinVirtualInterfaceRegex))
	}

	if exc := strings.TrimSpace(rule.ExcludeRegex); exc != "" {
		re, err := regexp.Compile(exc)
		if err != nil {
			return nil, fmt.Errorf("invalid exclude_regex: %w", err)
		}
		matcher.excludeRe = append(matcher.excludeRe, re)
	}

	return matcher, nil
}

// Match 判断给定实体名称是否通过当前自动识别过滤规则。
func (m *LLDMatcher) Match(entityName string) bool {
	if m == nil {
		return true
	}
	name := strings.TrimSpace(entityName)
	if name == "" {
		return false
	}
	for _, exc := range m.excludeRe {
		if exc.MatchString(name) {
			return false
		}
	}
	if m.includeRe != nil && !m.includeRe.MatchString(name) {
		return false
	}
	return true
}
