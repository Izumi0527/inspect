/**
 * 模板导入导出组件
 * 支持模板的导入和导出功能
 */

import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchInspectionTemplate, createInspectionTemplate } from '../api/inspection.api'
import type { InspectionTemplate, TemplateCategory } from '../types'

interface TemplateImportExportProps {
  templateId?: string
  onImportSuccess?: (templateId: string) => void
  onExportSuccess?: () => void
}

export function TemplateImportExport({
  templateId,
  onImportSuccess,
  onExportSuccess,
}: TemplateImportExportProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // 导入模板
  const importMutation = useMutation({
    mutationFn: async ({ file, _overwrite }: { file: File; _overwrite?: boolean }) => {
      const text = await file.text()
      const data = JSON.parse(text)
      const templateData: Partial<InspectionTemplate> = {
        name: data.name,
        description: data.description || '',
        category: (data.category || 'custom') as TemplateCategory,
        deviceTypes: data.deviceTypes || [],
        checkItems: (data.checkItems || []).map((item: any) => ({
          id: item.id || `item-${Date.now()}`,
          name: item.name,
          type: item.type || 'snmp',
          config: item.config || {},
          weight: item.weight || 1,
        })),
        isActive: data.isActive ?? true,
      }
      return createInspectionTemplate(templateData as any)
    },
    onSuccess: (data: InspectionTemplate) => {
      setSelectedFile(null)
      setImportError(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      queryClient.invalidateQueries({ queryKey: ['inspection', 'templates'] })
      onImportSuccess?.(data.id)
    },
    onError: (error: Error) => {
      setImportError(error.message)
    },
  })

  // 导出模板
  const exportMutation = useMutation({
    mutationFn: async (id: string) => {
      const template = await fetchInspectionTemplate(Number(id))
      if (!template) throw new Error('模板不存在')
      return new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    },
    onSuccess: (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `template-${templateId}-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      onExportSuccess?.()
    },
    onError: (error: Error) => {
      console.error('导出失败:', error)
    },
  })

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.json')) {
        setImportError('请选择 JSON 格式的文件')
        setSelectedFile(null)
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setImportError('文件大小不能超过 5MB')
        setSelectedFile(null)
        return
      }
      setSelectedFile(file)
      setImportError(null)
    }
  }

  const handleImport = () => {
    if (!selectedFile) {
      setImportError('请先选择文件')
      return
    }
    importMutation.mutate({ file: selectedFile, _overwrite: overwrite })
  }

  const handleExport = () => {
    if (!templateId) {
      toast.error('请先选择要导出的模板')
      return
    }
    exportMutation.mutate(templateId)
  }

  const handleClearFile = () => {
    setSelectedFile(null)
    setImportError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border shadow p-6">
        <h3 className="text-lg font-semibold mb-4">导入模板</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">选择模板文件 (JSON)</label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="flex-1 border rounded px-3 py-2"
              />
              {selectedFile && (
                <button onClick={handleClearFile} className="px-3 py-2 border rounded hover:bg-gray-100">
                  ✕
                </button>
              )}
            </div>
          </div>
          {selectedFile && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
            </div>
          )}
          {importError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {importError}
            </div>
          )}
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="mr-2" />
            <span className="text-sm">如果存在同名模板，覆盖现有模板</span>
          </label>
          <div className="flex justify-end">
            <button
              onClick={handleImport}
              disabled={!selectedFile || importMutation.isPending}
              className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {importMutation.isPending ? '导入中...' : '导入模板'}
            </button>
          </div>
        </div>
      </div>

      {templateId && (
        <div className="bg-card rounded-lg border border-border shadow p-6">
          <h3 className="text-lg font-semibold mb-4">导出模板</h3>
          <p className="text-sm text-muted-foreground mb-4">将当前模板导出为 JSON 文件。</p>
          <div className="flex justify-end">
            <button
              onClick={handleExport}
              disabled={exportMutation.isPending}
              className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {exportMutation.isPending ? '导出中...' : '导出模板'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
