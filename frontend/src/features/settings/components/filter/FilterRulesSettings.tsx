'use client'

import React, { useState, useCallback } from 'react'
import {
  RotateCcw,
  Save,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Bell,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'react-hot-toast'
import { SectionHeader } from '@/features/settings/components/shared/SectionHeader'
import { useSettingsTabCapabilities } from '@/features/settings/hooks/useSettingsTabCapabilities'
import { useFilterRulesSettings } from '../../hooks/useFilterRulesSettings'
import { MAX_EXCLUDE_KEYWORDS } from '@/utils/excludeKeywords'

interface KeywordRuleSectionProps {
  title: string
  description: string
  icon: LucideIcon
  inputAriaLabel: string
  buttonAriaLabel: string
  removeAriaPrefix: string
  emptyText: string
  inputValue: string
  keywords: string[]
  actions?: React.ReactNode
  onInputChange: (value: string) => void
  onAdd: () => void
  onRemove: (keyword: string) => void
  onClear: () => void
}

function KeywordRuleSection({
  title,
  description,
  icon,
  inputAriaLabel,
  buttonAriaLabel,
  removeAriaPrefix,
  emptyText,
  inputValue,
  keywords,
  actions,
  onInputChange,
  onAdd,
  onRemove,
  onClear,
}: KeywordRuleSectionProps) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-border bg-card p-4"
    >
      <SectionHeader
        title={title}
        icon={icon}
        description={description}
        actions={actions}
      />

      <div className="mt-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            aria-label={inputAriaLabel}
            placeholder="输入屏蔽关键字，多个词可用逗号分隔，按回车添加..."
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAdd()
              }
            }}
            className="flex-1"
          />
          <Button
            type="button"
            aria-label={buttonAriaLabel}
            onClick={onAdd}
            disabled={!inputValue.trim()}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            添加
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            已配置 {keywords.length} / {MAX_EXCLUDE_KEYWORDS} 个关键字
          </span>
          {keywords.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              清空全部
            </Button>
          )}
        </div>

        {keywords.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {keywords.map((kw) => (
              <Badge
                key={kw}
                variant="secondary"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-normal"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  aria-label={`${removeAriaPrefix} ${kw}`}
                  onClick={() => onRemove(kw)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground inline-flex items-center justify-center transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  )
}

export function FilterRulesSettings() {
  const {
    alertKeywords,
    logKeywords,
    isLoading,
    isSaving,
    isDirty,
    error,
    addAlertKeywords,
    removeAlertKeyword,
    clearAlertKeywords,
    addLogKeywords,
    removeLogKeyword,
    clearLogKeywords,
    saveAll,
    resetAll,
  } = useFilterRulesSettings()

  const [alertInput, setAlertInput] = useState('')
  const [logInput, setLogInput] = useState('')
  const hasPendingInput = Boolean(alertInput.trim() || logInput.trim())
  const canSaveOrReset = isDirty || hasPendingInput

  useSettingsTabCapabilities('filter', {
    dirty: canSaveOrReset,
    saving: isSaving,
    blockLeave: canSaveOrReset,
  })

  const handleSave = useCallback(async () => {
    try {
      const ok = await saveAll({ alertInput, logInput })
      if (!ok) return
      setAlertInput('')
      setLogInput('')
      toast.success('保存成功！屏蔽规则已更新')
    } catch (err) {
      toast.error('保存失败：' + (err as Error).message)
    }
  }, [alertInput, logInput, saveAll])

  const handleReset = useCallback(() => {
    resetAll()
    setAlertInput('')
    setLogInput('')
    toast.success('已重置为服务器配置')
  }, [resetAll])

  const handleAddAlert = useCallback(() => {
    if (!alertInput.trim()) return
    if (addAlertKeywords(alertInput)) {
      setAlertInput('')
    }
  }, [alertInput, addAlertKeywords])

  const handleAddLog = useCallback(() => {
    if (!logInput.trim()) return
    if (addLogKeywords(logInput)) {
      setLogInput('')
    }
  }, [logInput, addLogKeywords])

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-start space-x-4 rounded-lg border border-red-200/80 bg-red-50/80 p-6 dark:border-red-400/20 dark:bg-card/92">
          <AlertCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-600 dark:text-red-300" />
          <div>
            <h3 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-100">
              加载配置失败
            </h3>
            <p className="text-sm text-red-700 dark:text-red-200">
              {(error as Error).message || '无法连接到服务器，请检查网络连接或稍后重试'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const pageActions = (
    <div
      role="group"
      aria-label="屏蔽规则操作"
      className="flex flex-wrap items-center gap-2"
    >
      <Button
        type="button"
        variant="outline"
        onClick={handleReset}
        disabled={!canSaveOrReset || isSaving}
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        重置整页更改
      </Button>
      <Button
        type="button"
        onClick={handleSave}
        disabled={!canSaveOrReset || isSaving}
      >
        <Save className="w-4 h-4 mr-2" />
        {isSaving ? '保存中...' : '保存整页更改'}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4 p-4">
      <KeywordRuleSection
        title="告警屏蔽规则"
        icon={Bell}
        description="配置告警全局屏蔽关键字。命中的告警（按标题、消息内容、设备名称或设备 IP，大小写不敏感匹配）将自动从告警中心列表、统计卡片、导出文件及实时推送通知中排除。"
        inputAriaLabel="添加告警屏蔽关键字"
        buttonAriaLabel="添加告警关键字"
        removeAriaPrefix="移除告警屏蔽词"
        emptyText="暂未配置告警屏蔽关键字"
        inputValue={alertInput}
        keywords={alertKeywords}
        actions={pageActions}
        onInputChange={setAlertInput}
        onAdd={handleAddAlert}
        onRemove={removeAlertKeyword}
        onClear={clearAlertKeywords}
      />

      <KeywordRuleSection
        title="日志屏蔽规则"
        icon={FileText}
        description="配置日志全局屏蔽关键字。命中的日志（按日志消息内容或原始报文，大小写不敏感匹配）将自动从日志中心列表、检索、导出文件及筛选批量清理中排除。"
        inputAriaLabel="添加日志屏蔽关键字"
        buttonAriaLabel="添加日志关键字"
        removeAriaPrefix="移除日志屏蔽词"
        emptyText="暂未配置日志屏蔽关键字"
        inputValue={logInput}
        keywords={logKeywords}
        onInputChange={setLogInput}
        onAdd={handleAddLog}
        onRemove={removeLogKeyword}
        onClear={clearLogKeywords}
      />
    </div>
  )
}
