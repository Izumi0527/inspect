package snmpmib

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

//go:embed huawei-campus-models.json
var embeddedHuaweiModelCatalog []byte

var (
	defaultHuaweiModelCatalog *HuaweiModelCatalog
	huaweiModelCatalogOnce    sync.Once
	huaweiModelCatalogErr     error
)

// HuaweiModelCatalog 保存华为近五年（2021–2026）园区交换机型号知识库，
// 由 huawei-campus-models.json 嵌入二进制并在首次加载时校验。
type HuaweiModelCatalog struct {
	SchemaVersion int                  `json:"schema_version"`
	Source        string               `json:"source,omitempty"`
	Models        []SwitchModelProfile `json:"models"`
}

// SwitchModelProfile 描述单个华为园区交换机系列的规格与采集画像。
type SwitchModelProfile struct {
	Series           string   `json:"series"`
	DisplayName      string   `json:"display_name"`
	Layer            string   `json:"layer"`
	FormFactor       string   `json:"form_factor"`
	Platforms        []string `json:"platforms"`
	ReleaseYear      int      `json:"release_year"`
	ModelPrefixes    []string `json:"model_prefixes"`
	SysObjectIDs     []string `json:"sys_object_ids"`
	PrimaryCPUMIB    string   `json:"primary_cpu_mib"`
	PrimaryMemoryMIB string   `json:"primary_memory_mib"`
	Notes            string   `json:"notes,omitempty"`
}

var (
	validSwitchLayers = map[string]struct{}{
		"access": {}, "aggregation": {}, "core": {},
	}
	validFormFactors = map[string]struct{}{
		"fixed": {}, "modular": {},
	}
	validHuaweiPlatforms = map[string]struct{}{
		"V200": {}, "V600": {},
	}
	genericHuaweiRootOIDs = map[string]struct{}{
		"1.3.6.1.4.1.2011":      {},
		"1.3.6.1.4.1.2011.2":    {},
		"1.3.6.1.4.1.2011.2.23": {},
	}
	huaweiBrandPrefixes = []string{"CLOUDENGINE ", "QUIDWAY ", "HUAWEI "}
)

// DefaultHuaweiModelCatalog 返回嵌入的华为园区交换机型号知识库（首次加载并校验，之后复用）。
func DefaultHuaweiModelCatalog() (*HuaweiModelCatalog, error) {
	huaweiModelCatalogOnce.Do(func() {
		var catalog HuaweiModelCatalog
		huaweiModelCatalogErr = json.Unmarshal(embeddedHuaweiModelCatalog, &catalog)
		if huaweiModelCatalogErr == nil {
			huaweiModelCatalogErr = catalog.Validate()
		}
		if huaweiModelCatalogErr == nil {
			defaultHuaweiModelCatalog = &catalog
		}
	})
	return defaultHuaweiModelCatalog, huaweiModelCatalogErr
}

// Validate 校验型号知识库的 Schema 版本、枚举值域及字段完整性。
func (c HuaweiModelCatalog) Validate() error {
	if c.SchemaVersion != 1 {
		return fmt.Errorf("unsupported model catalog schema_version: %d", c.SchemaVersion)
	}
	if len(c.Models) == 0 {
		return fmt.Errorf("model catalog models is empty")
	}
	for i, model := range c.Models {
		if err := validateModelProfile(i, model); err != nil {
			return err
		}
	}
	return nil
}

func validateModelProfile(idx int, model SwitchModelProfile) error {
	if strings.TrimSpace(model.Series) == "" || strings.TrimSpace(model.DisplayName) == "" {
		return fmt.Errorf("models[%d] series or display_name is empty", idx)
	}
	if _, ok := validSwitchLayers[model.Layer]; !ok {
		return fmt.Errorf("models[%s].layer invalid: %q", model.Series, model.Layer)
	}
	if _, ok := validFormFactors[model.FormFactor]; !ok {
		return fmt.Errorf("models[%s].form_factor invalid: %q", model.Series, model.FormFactor)
	}
	if len(model.Platforms) == 0 {
		return fmt.Errorf("models[%s].platforms is empty", model.Series)
	}
	for _, platform := range model.Platforms {
		if _, ok := validHuaweiPlatforms[platform]; !ok {
			return fmt.Errorf("models[%s].platforms invalid entry: %q", model.Series, platform)
		}
	}
	if model.ReleaseYear < 2008 || model.ReleaseYear > 2030 {
		return fmt.Errorf("models[%s].release_year out of range: %d", model.Series, model.ReleaseYear)
	}
	if len(model.ModelPrefixes) == 0 {
		return fmt.Errorf("models[%s].model_prefixes is empty", model.Series)
	}
	for _, prefix := range model.ModelPrefixes {
		if strings.TrimSpace(prefix) == "" {
			return fmt.Errorf("models[%s].model_prefixes contains empty prefix", model.Series)
		}
	}
	if strings.TrimSpace(model.PrimaryCPUMIB) == "" || strings.TrimSpace(model.PrimaryMemoryMIB) == "" {
		return fmt.Errorf("models[%s] primary_cpu_mib or primary_memory_mib is empty", model.Series)
	}
	for _, rawOID := range model.SysObjectIDs {
		normalized := NormalizeOID(rawOID)
		if normalized == "" {
			return fmt.Errorf("models[%s].sys_object_ids contains empty oid", model.Series)
		}
		if _, isGeneric := genericHuaweiRootOIDs[normalized]; isGeneric {
			return fmt.Errorf("models[%s].sys_object_ids cannot contain generic root %q", model.Series, normalized)
		}
	}
	return nil
}

// LookupModel 根据设备型号名查找所属华为园区交换机系列画像。
// 自动剥离 "CloudEngine " / "Quidway " / "Huawei " 品牌前缀并按最长前缀（含 -V2 变体）匹配。
func (c *HuaweiModelCatalog) LookupModel(modelName string) (SwitchModelProfile, bool) {
	if c == nil {
		return SwitchModelProfile{}, false
	}
	normalized := normalizeHuaweiModelName(modelName)
	if normalized == "" {
		return SwitchModelProfile{}, false
	}

	var best SwitchModelProfile
	bestScore := -1
	for _, profile := range c.Models {
		for _, rawPrefix := range profile.ModelPrefixes {
			score := matchModelPrefixScore(normalized, rawPrefix)
			if score > bestScore || (score >= 0 && score == bestScore && profile.Series < best.Series) {
				bestScore = score
				best = profile
			}
		}
	}
	return best, bestScore >= 0
}

// LookupBySysObjectID 根据 SNMP sysObjectID 查找华为园区交换机系列画像。
// 优先精确匹配已登记的叶子 OID，其次在非通用根分支上做 "." 边界最长前缀匹配。
func (c *HuaweiModelCatalog) LookupBySysObjectID(oid string) (SwitchModelProfile, bool) {
	if c == nil {
		return SwitchModelProfile{}, false
	}
	normalized := NormalizeOID(oid)
	if normalized == "" {
		return SwitchModelProfile{}, false
	}
	if _, isGeneric := genericHuaweiRootOIDs[normalized]; isGeneric {
		return SwitchModelProfile{}, false
	}

	// 第一轮：精确匹配优先
	for _, profile := range c.Models {
		for _, candidate := range profile.SysObjectIDs {
			if NormalizeOID(candidate) == normalized {
				return profile, true
			}
		}
	}

	// 第二轮：专属产品子分支 "." 边界最长前缀匹配
	var best SwitchModelProfile
	bestLen := -1
	for _, profile := range c.Models {
		for _, candidate := range profile.SysObjectIDs {
			prefix := NormalizeOID(candidate)
			if prefix == "" {
				continue
			}
			if _, isGeneric := genericHuaweiRootOIDs[prefix]; isGeneric {
				continue
			}
			if strings.HasPrefix(normalized, prefix+".") && len(prefix) > bestLen {
				bestLen = len(prefix)
				best = profile
			}
		}
	}
	return best, bestLen >= 0
}

func normalizeHuaweiModelName(modelName string) string {
	upper := strings.ToUpper(strings.TrimSpace(modelName))
	if upper == "" {
		return ""
	}
	for _, brand := range huaweiBrandPrefixes {
		if strings.HasPrefix(upper, brand) {
			upper = strings.TrimSpace(strings.TrimPrefix(upper, brand))
			break
		}
	}
	return upper
}

func matchModelPrefixScore(normalizedModel string, rawPrefix string) int {
	prefix := strings.ToUpper(strings.TrimSpace(rawPrefix))
	if prefix == "" {
		return -1
	}

	// 支持 -V2 系列后缀（如 "S5735-S-V2" 匹配 "S5735-S24T4XE-V2"）
	if strings.HasSuffix(prefix, "-V2") {
		if matchModelPrefixDirect(normalizedModel, prefix) {
			return len(prefix)
		}
		basePrefix := strings.TrimSuffix(prefix, "-V2")
		if baseModel, ok := stripV2VariantSuffix(normalizedModel); ok && matchModelPrefixDirect(baseModel, basePrefix) {
			return len(prefix)
		}
		return -1
	}

	if matchModelPrefixDirect(normalizedModel, prefix) {
		return len(prefix)
	}
	return -1
}

func matchModelPrefixDirect(normalizedModel string, prefix string) bool {
	if !strings.HasPrefix(normalizedModel, prefix) {
		return false
	}
	if len(normalizedModel) == len(prefix) {
		return true
	}
	// 若前缀以数字结尾（如 S300/S500/S12700），下一个字符必须为分隔符 '-' 或空格，
	// 防止 S500 误匹配 S5000 或 S12700 误匹配 S12700E。
	last := prefix[len(prefix)-1]
	if last >= '0' && last <= '9' {
		next := normalizedModel[len(prefix)]
		return next == '-' || next == ' ' || next == '/'
	}
	return true
}

func stripV2VariantSuffix(normalizedModel string) (string, bool) {
	if strings.HasSuffix(normalizedModel, "-V2") {
		return strings.TrimSuffix(normalizedModel, "-V2"), true
	}
	if idx := strings.Index(normalizedModel, "-V2-"); idx >= 0 {
		return normalizedModel[:idx] + normalizedModel[idx+3:], true
	}
	return "", false
}
