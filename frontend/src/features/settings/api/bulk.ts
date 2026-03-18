export type BulkUpdateResponse = {
  updated_count?: number
  failed_keys?: unknown
  message?: unknown
  // 兼容可能的 camelCase 返回（历史/别名）
  updatedCount?: number
  failedKeys?: unknown
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

export function requireBulkSuccess(
  response: BulkUpdateResponse | null | undefined,
  options?: {
    /**
     * 用于错误提示的动作描述，例如“保存通用配置”。
     */
    action?: string
    /**
     * 错误提示里最多展示多少个失败 key，避免 toast 过长。
     */
    maxKeysPreview?: number
  }
): void {
  const action = options?.action?.trim() || '保存配置'
  const maxKeysPreview = options?.maxKeysPreview ?? 3

  const failedKeys = normalizeStringArray(response?.failed_keys ?? response?.failedKeys)
  if (failedKeys.length === 0) return

  const preview = failedKeys.slice(0, Math.max(0, maxKeysPreview)).join(', ')
  const suffix =
    failedKeys.length > maxKeysPreview ? `等 ${failedKeys.length} 项` : `共 ${failedKeys.length} 项`

  const baseMessage =
    typeof response?.message === 'string' && response.message.trim().length > 0
      ? response.message.trim()
      : `${action}部分失败：${suffix}`

  const detail = preview ? `失败项示例：${preview}` : undefined
  const msg = detail ? `${baseMessage}（${detail}）` : baseMessage

  throw new Error(msg)
}

