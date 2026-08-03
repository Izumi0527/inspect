/**
 * 人话翻译层 —— 类型定义
 *
 * 将设备采集回来的原始技术信息（Syslog 原文、Trap 描述）转换为非开发者、
 * 非专业维护者可读的中文表述。
 *
 * 设计约束：
 * 1. 纯展示层逻辑，不落库、不改后端 —— 规则改进后历史数据自动享受新翻译
 * 2. 原文始终完整保留，翻译只是附加的一层解读，不是替代
 * 3. 纯函数实现，无副作用，便于单元测试
 */

/**
 * 翻译语气，用于 UI 着色。
 *
 * 刻意独立于日志原始 level：设备常把「接口恢复正常」也标记为 warning，
 * 若直接沿用 level，界面会用告警色告诉用户「一切正常」，反而造成困惑。
 */
export type PlainTone = 'critical' | 'warning' | 'info' | 'success'

/** 翻译输入。日志与告警共用同一组字段，由各自调用方适配 */
export interface PlainLanguageInput {
  /** 待翻译的原始消息（日志的 message / 告警的 description） */
  message: string
  /**
   * 告警标题。仅用于兜底提取 Trap OID —— 正常情况下 message 已含 OID
   * （形如 `SNMP Trap <OID> | 摘要`），但告警标题里也带一份
   * （形如 `[WARNING] 设备 - SNMP Trap 接口告警 (<OID>)`），可作为退路。
   */
  title?: string
  /** 原始级别，用于兜底翻译时判定语气 */
  level?: string
  /** 设施分类，用于兜底翻译时判定所属领域 */
  facility?: string
  /** 设备名，用于填充 {device} 占位 */
  deviceName?: string
  /** 来源进程，兜底时作为补充线索 */
  process?: string
}

/**
 * 识别出的 Trap OID 标识。
 *
 * 用途是「精确说明这条告警对应设备的哪一项」，与人话解读互补：
 * 人话负责可读性，本字段负责可核对性。
 */
export interface TrapIdentity {
  /** 完整 OID，如 1.3.6.1.4.1.2011.5.25.219.2.2.3 */
  oid: string
  /** 英文节点名，如 hwBoardFail */
  name: string
  /** 中文告警名（简短） */
  label: string
  /** 完整官方含义；仅当 label 为截断版时提供 */
  detail?: string
}

/** 翻译结果 */
export interface PlainLanguageResult {
  /** 人话标题，如「网络接口断开」 */
  title: string
  /** 发生了什么 —— 已代入设备名、接口名等上下文 */
  summary: string
  /**
   * 处置建议（「该怎么办」）。
   * 未命中具体规则时不提供，避免给出无依据的指导。
   */
  suggestion?: string
  /** UI 着色语气 */
  tone: PlainTone
  /**
   * 是否命中了具体规则。
   *
   * 为 false 表示走了兜底翻译，此时兜底文案信息量很低、原文才是唯一有效信息，
   * 调用方应当直接展示原文而非将其折叠。
   */
  matched: boolean
  /** 命中的规则 ID，便于排查「为什么翻译成这样」 */
  ruleId?: string
  /**
   * 识别出的 Trap OID 标识；消息中不含可识别 OID 时为 undefined。
   *
   * 注意它不参与 title/summary 的决定 —— 官方含义常比人话规则更晦涩
   * （如 linkDown 的 ifOperStatus 表述），故仅在正则完全未命中时才用它兜底。
   */
  trap?: TrapIdentity
}

/** 单条翻译规则 */
export interface PlainLanguageRule {
  /** 规则唯一标识，用于线上排查与测试断言 */
  id: string
  /**
   * 匹配模式。
   * 按 rules 数组顺序依次尝试、先命中先返回，因此数组顺序即优先级：
   * 越具体的规则应排在越前面。
   */
  pattern: RegExp
  /** 人话标题 */
  title: string
  /**
   * 说明模板，支持以下占位：
   * - `{device}` 设备名，缺省时回退为「该设备」
   * - `{1}`~`{9}` pattern 的捕获组，原样填充
   * - `{1:iface}` 捕获组经接口名词典转换（GigabitEthernet0/0/1 → 千兆网口 0/0/1）
   * - `{1:state}` 捕获组经状态词词典转换（down → 已断开）
   */
  summary: string
  /** 处置建议模板，占位规则同 summary */
  suggestion?: string
  /** 语气，缺省为 info */
  tone?: PlainTone
}
