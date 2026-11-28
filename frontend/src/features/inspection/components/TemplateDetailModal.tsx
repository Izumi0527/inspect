import React from 'react'
import { FileText, Monitor, Settings, Shield, Edit, Calendar, Tag } from 'lucide-react'
import { Button, Badge } from '@/components/atoms'
import { SimpleModal } from '@/components/atoms/modal'
import { isCheckItemTypeSupported } from '../utils/check-item-support'
import { getCategoryMeta, getCheckTypeMeta } from '../utils/templatePresentation'
import { formatDateTimeYMDHMS } from '@/utils/formatters'
import { getDeviceTypeLabel } from '@/utils/deviceTypes'
import type { InspectionTemplate } from '../types'

interface Props {
  template: InspectionTemplate
  onClose: () => void
  onEdit?: () => void
}

export const TemplateDetailModal: React.FC<Props> = ({ template, onClose, onEdit }) => {
  const categoryMeta = getCategoryMeta(template.category)

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'network':
        return <Monitor className="w-5 h-5 text-primary" />
      case 'system':
        return <Settings className="w-5 h-5 text-primary" />
      case 'security':
        return <Shield className="w-5 h-5 text-primary" />
      default:
        return <FileText className="w-5 h-5 text-primary" />
    }
  }

  return (
    <SimpleModal
      open
      onClose={onClose}
      ariaLabel={template.name}
      size="5xl"
    >
      <div className="flex flex-col gap-5">
        {/* 头部信息条 */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4 pr-6">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {getCategoryIcon(template.category)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{template.name}</h2>
                {template.isBuiltIn ? (
                  <Badge variant="success" size="sm">内置模板</Badge>
                ) : (
                  <Badge variant="neutral" size="sm">自建模板</Badge>
                )}
                {!template.isActive && (
                  <Badge variant="outline" size="sm">已禁用</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {template.description || '暂无描述'}
              </p>
            </div>
          </div>
          {onEdit && !template.isBuiltIn && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="shrink-0 cursor-pointer"
            >
              <Edit className="w-4 h-4 mr-1" />
              编辑
            </Button>
          )}
        </div>

        {/* 内容区 - 横向两栏布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
          {/* 左侧：基本信息 + 适用设备类型 */}
          <div className="lg:col-span-5 space-y-4">
            <section className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 pb-2 border-b border-border">
                <FileText className="w-4 h-4 text-primary" />
                基本信息
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                    模板类别
                  </span>
                  <Badge variant={categoryMeta.badgeVariant} size="sm">
                    {categoryMeta.label}
                  </Badge>
                </div>
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                    检查项数量
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {template.checkItems?.length || 0} 项
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                    创建时间
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs tabular-nums text-foreground">
                      {template.createdAt ? formatDateTimeYMDHMS(template.createdAt) : '-'}
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-card p-3">
                  <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                    更新时间
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs tabular-nums text-foreground">
                      {template.updatedAt ? formatDateTimeYMDHMS(template.updatedAt) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface-2/40 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 pb-2 border-b border-border">
                <Monitor className="w-4 h-4 text-primary" />
                适用设备类型
              </h3>
              {template.deviceTypes && template.deviceTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {template.deviceTypes.map((type) => (
                    <Badge key={type} variant="secondary" size="sm" className="px-2.5 py-1">
                      {getDeviceTypeLabel(type)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  未声明适用设备类型（存量模板），编辑时需选择一种
                </p>
              )}
            </section>
          </div>

          {/* 右侧：结构化检查项列表 */}
          <section className="lg:col-span-7 rounded-lg border border-border bg-surface-2/40 p-4 flex flex-col min-h-0">
            <h3 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border flex items-center gap-2 shrink-0">
              <Settings className="w-4 h-4 text-primary" />
              检查项配置
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                ({template.checkItems?.length || 0} 项)
              </span>
            </h3>

            {template.checkItems && template.checkItems.length > 0 ? (
              <div className="space-y-2.5 overflow-y-auto flex-1 min-h-0 pr-1">
                {template.checkItems.map((checkItem, index) => {
                  const typeMeta = getCheckTypeMeta(checkItem.type)
                  const warningVal = checkItem.config?.threshold?.warning
                  const criticalVal = checkItem.config?.threshold?.critical

                  return (
                    <div
                      key={checkItem.id || index}
                      className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-surface-2/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                            #{index + 1}
                          </span>
                          <h4 className="text-sm font-medium text-foreground truncate">
                            {checkItem.name}
                          </h4>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <Badge variant={typeMeta.badgeVariant} size="sm">
                            {typeMeta.label}
                          </Badge>
                          {!isCheckItemTypeSupported(checkItem.type) && (
                            <Badge variant="outline" size="sm">
                              未支持执行
                            </Badge>
                          )}
                          {checkItem.enabled === false && (
                            <Badge variant="outline" size="sm">
                              已停用
                            </Badge>
                          )}
                          <span className="text-xs tabular-nums text-muted-foreground">
                            权重: {checkItem.weight || 1}
                          </span>
                        </div>
                      </div>

                      {checkItem.description && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {checkItem.description}
                        </p>
                      )}

                      {/* 结构化指标与阈值展示 */}
                      {(checkItem.metric || warningVal !== undefined || criticalVal !== undefined) && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {checkItem.metric && (
                            <Badge variant="outline" size="sm" className="font-mono">
                              指标: {checkItem.metric}
                            </Badge>
                          )}
                          {warningVal !== undefined && (
                            <Badge variant="warning" size="sm" className="tabular-nums">
                              警告: {warningVal}
                            </Badge>
                          )}
                          {criticalVal !== undefined && (
                            <Badge variant="error" size="sm" className="tabular-nums">
                              严重: {criticalVal}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* 原始参数折叠 */}
                      {checkItem.config && Object.keys(checkItem.config).length > 0 && (
                        <details className="group">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                            查看原始配置参数
                          </summary>
                          <div className="mt-2 rounded border border-border bg-surface-2/60 p-2">
                            <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                              {JSON.stringify(checkItem.config, null, 2)}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">暂无检查项配置</p>
              </div>
            )}
          </section>
        </div>

        {/* 底部操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
            关闭
          </Button>
          {onEdit && !template.isBuiltIn && (
            <Button size="sm" onClick={onEdit} className="cursor-pointer">
              <Edit className="w-4 h-4 mr-1" />
              编辑模板
            </Button>
          )}
        </div>
      </div>
    </SimpleModal>
  )
}
