// 类型安全的错误信息获取工具
export const getErrorMessage = (error: unknown): string | undefined => {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return undefined
}

// 类型安全的嵌套错误信息获取
export const getNestedErrorMessage = (errors: unknown, path: string): string | undefined => {
  if (!errors || typeof errors !== 'object') return undefined

  const keys = path.split('.')
  let current: unknown = errors

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key] as unknown
    } else {
      return undefined
    }
  }

  return getErrorMessage(current)
}