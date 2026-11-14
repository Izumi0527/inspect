package common

import "strings"

// MaxExcludeKeywords 单次请求允许的屏蔽关键字上限，超出部分静默截断，防止参数爆炸。
const MaxExcludeKeywords = 20

// MaxExpandedExcludeKeywords 双语同义词展开后的总条件词上限，防止 SQL 参数过多。
const MaxExpandedExcludeKeywords = 40

// plainLanguageExcludeSynonyms 将前端人话翻译层的常见中文术语映射为设备原始英文报文关键词，
// 解决数据库存储英文 Trap/Syslog 原文而用户在界面看到中文翻译后按中文词配置屏蔽不命中的问题。
var plainLanguageExcludeSynonyms = map[string][]string{
	"电源":  {"power", "dying gasp", "dyinggasp", "psu"},
	"供电":  {"power", "poe", "psu"},
	"断电":  {"dying gasp", "dyinggasp", "power"},
	"下电":  {"dying gasp", "dyinggasp", "power"},
	"风扇":  {"fan"},
	"温度":  {"temperature", "tempfalling", "temprising", "overtemp"},
	"电压":  {"voltage"},
	"湿度":  {"humidity"},
	"单板":  {"board", "entityoffline", "entityonline"},
	"光模块": {"optical", "transceiver", "sfp"},
	"生成树": {"mstp", "stp", "topology", "topoc"},
	"拓扑":  {"topology", "topoc", "mstp"},
	"冷启动": {"coldstart"},
	"热启动": {"warmstart"},
	"邻居":  {"neighbor", "lldp", "nbrchg", "nbradd", "nbrdel"},
	"错包":  {"crc"},
	"环路":  {"loopback", "loopdetect"},
}

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

// ExpandExcludeKeywords 在 SplitExcludeKeywords 基础上追加中文人话术语对应的设备英文原文同义词，
// 去重并限制总词数上限为 MaxExpandedExcludeKeywords。
func ExpandExcludeKeywords(raw string) []string {
	base := SplitExcludeKeywords(raw)
	if len(base) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(base)*2)
	result := make([]string, 0, len(base))
	appendTerm := func(term string) {
		trimmed := strings.TrimSpace(term)
		if trimmed == "" || len(result) >= MaxExpandedExcludeKeywords {
			return
		}
		lower := strings.ToLower(trimmed)
		if _, exists := seen[lower]; exists {
			return
		}
		seen[lower] = struct{}{}
		result = append(result, trimmed)
	}
	for _, kw := range base {
		appendTerm(kw)
		if synonyms, ok := plainLanguageExcludeSynonyms[strings.ToLower(kw)]; ok {
			for _, syn := range synonyms {
				appendTerm(syn)
			}
		}
	}
	return result
}
