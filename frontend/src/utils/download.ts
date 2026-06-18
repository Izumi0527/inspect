import { getApiOrigin } from '@/lib/api-client'

const sanitizeFilename = (filename: string): string => {
  const trimmed = String(filename || '').trim()
  const safe = trimmed.replace(/[\\/:*?"<>|]+/g, '_')
  return safe || 'download'
}

const resolveUrl = (urlOrPath: string): string => {
  const raw = String(urlOrPath || '').trim()
  if (/^https?:\/\//i.test(raw)) return raw

  const apiOrigin = getApiOrigin()
  if (!raw.startsWith('/')) return `${apiOrigin}/${raw}`
  return `${apiOrigin}${raw}`
}

/**
 * 鉴权下载：以 blob 方式触发浏览器保存文件。
 *
 * 适用场景：后端下载接口需要鉴权（例如 /api/v1/reports/files/:filename）。
 * S3：认证由 httpOnly Cookie 承载，全局 fetch 拦截器会自动注入 credentials。
 */
export async function downloadWithAuth(urlOrPath: string, filename: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('downloadWithAuth 只能在浏览器端调用')
  }

  const url = resolveUrl(urlOrPath)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`下载失败(${response.status})`)
  }

  const blob = await response.blob()
  const blobUrl = window.URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = blobUrl
  a.download = sanitizeFilename(filename)

  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  window.URL.revokeObjectURL(blobUrl)
}
