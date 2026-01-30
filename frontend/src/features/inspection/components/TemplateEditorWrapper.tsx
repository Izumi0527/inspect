/**
 * 模板编辑器包装组件
 * 处理 API 调用逻辑，将 TemplateEditor 与新版 API hooks 集成
 */

import { useCreateTemplate, useUpdateTemplate } from '../hooks/useInspection'
import type { InspectionTemplate } from '../types'
import { TemplateEditor } from './TemplateEditor'

interface TemplateEditorWrapperProps {
  template?: InspectionTemplate
  onSuccess: () => void
  onCancel: () => void
}

export function TemplateEditorWrapper({
  template,
  onSuccess,
  onCancel,
}: TemplateEditorWrapperProps) {
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  const handleSave = async (data: Omit<InspectionTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (template) {
        // 更新模板
        await updateTemplate.mutateAsync({
          id: String(template.id),
          data,
        })
      } else {
        // 创建模板
        await createTemplate.mutateAsync(data)
      }
      onSuccess()
    } catch (error) {
      alert(`${template ? '更新' : '创建'}模板失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const isLoading = createTemplate.isPending || updateTemplate.isPending

  return (
    <TemplateEditor
      template={template}
      onSave={handleSave}
      onCancel={onCancel}
      isLoading={isLoading}
    />
  )
}
