package common

import "strings"

// MaxExcludeKeywords 单次请求允许的屏蔽关键字上限，超出部分静默截断，防止参数爆炸。
const MaxExcludeKeywords = 20

// EscapeLikePattern 转义 SQL LIKE/ILIKE 模式中的通配符与反斜杠，使用户输入按字面匹配。
// 告警与日志的搜索/屏蔽共用；前端 utils/excludeKeywords.ts 的匹配规则与此对齐。
func EscapeLikePattern(raw string) string {
	return strings.NewReplacer(
		`\`, `\\`,
		`%`, `\%`,
		`_`, `\_`,
	).Replace(raw)
}

// SplitExcludeKeywords 按英文/中文逗号与分号切分屏蔽关键字：去空白、按小写去重（保留首次出现的原样）、
// 截断至 MaxExcludeKeywords。空输入或只有分隔符时返回 nil。
func SplitExcludeKeywords(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	splitter := func(r rune) bool {
		return r == ',' || r == '，' || r == ';' || r == '；'
	}
	parts := strings.FieldsFunc(raw, splitter)
	seen := make(map[string]struct{}, len(parts))
	var result []string
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if _, exists := seen[lower]; exists {
			continue
		}
		seen[lower] = struct{}{}
		result = append(result, trimmed)
		if len(result) >= MaxExcludeKeywords {
			break
		}
	}
	return result
}
