import toast from 'react-hot-toast'

type ApiResponse = {
  message?: string;
} | Record<string, unknown> | void | null | undefined | object;

export const showSuccessToast = (message: string, data?: ApiResponse) => {
  if (data && typeof data === 'object' && 'message' in data && data.message) {
    toast.success(data.message as string)
  } else {
    toast.success(message)
  }
}

export const showErrorToast = (error: Error, fallbackMessage?: string) => {
  toast.error(error.message || fallbackMessage || '操作失败')
}

export const handleDownload = (
  blob: Blob,
  fileNamePrefix: string,
  format: string
) => {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileNamePrefix}_${Date.now()}.${format}`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}