import React, { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Button,
  Modal,
  ModalContent,
  ModalTitle,
  SimpleInput as Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/atoms'
import type { Report } from '../types'
import { useUpdateReport } from '../hooks/useReports'

interface Props {
  report: Report
  onClose: () => void
  onSuccess?: () => void
}

type ReportCategoryOption = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

const CATEGORY_OPTIONS: Array<{ value: ReportCategoryOption; label: string }> = [
  { value: 'daily', label: '日报' },
  { value: 'weekly', label: '周报' },
  { value: 'monthly', label: '月报' },
  { value: 'quarterly', label: '季报' },
  { value: 'yearly', label: '年报' },
  { value: 'custom', label: '自定义' }
]

export const ReportEditModal: React.FC<Props> = ({ report, onClose, onSuccess }) => {
  const [title, setTitle] = useState(report.title || '')
  const [description, setDescription] = useState(report.description || '')
  const [category, setCategory] = useState<ReportCategoryOption>(
    (report.category as ReportCategoryOption) || 'custom'
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateReport = useUpdateReport()
  const isLoading = updateReport.isPending

  const canEdit = useMemo(() => {
    // 当前仅允许编辑展示性字段：标题/描述/类别。
    // 不允许修改格式/类型/参数，避免造成“看起来改了但文件未重生成”的误解。
    return true
  }, [])

  const validate = () => {
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = '请输入标题'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) {
      toast.error('当前报表不可编辑')
      return
    }
    if (!validate()) return

    try {
      await updateReport.mutateAsync({
        id: report.id,
        data: {
          title: title.trim(),
          description: description.trim(),
          category
        }
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      // toast 由 hook onError 统一处理
      console.error('更新报表失败:', err)
    }
  }

  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent className="sm:max-w-2xl p-0" hideDescription>
        <div className="flex items-center justify-between p-6 pr-14 border-b dark:border-border">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <ModalTitle className="text-xl font-semibold text-foreground">编辑巡检报表</ModalTitle>
              <p className="text-sm text-muted-foreground">仅修改标题、描述与类别</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              标题 *
            </label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (errors.title) setErrors(prev => ({ ...prev, title: '' }))
              }}
              placeholder="请输入报表标题"
              error={errors.title}
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入报表描述（可选）"
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-card text-foreground"
              rows={3}
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              类别
            </label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ReportCategoryOption)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择类别" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              取消
            </Button>
            <Button type="submit" disabled={isLoading || !canEdit}>
              {isLoading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  )
}

