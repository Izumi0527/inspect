/**
 * 检查项分组组件
 * 按类别分组显示检查项
 */

import { useState } from 'react'
import type { CheckItemType, InspectionCheckItem } from '../types'
import { isCheckItemTypeSupported } from '../utils/check-item-support'

// 兼容旧版 CheckItem 类型
type CheckItem = Omit<InspectionCheckItem, 'type'> & {
  type: string
  description?: string
  enabled?: boolean
  config?: {
    oid?: string
    command?: string
    timeout?: number
    unit?: string
    threshold?: { warning?: number; critical?: number }
    parsePattern?: string
    url?: string
  }
}

interface CheckItemGroupProps {
  category: string
  items: CheckItem[]
  defaultExpanded?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  health: '健康检查',
  performance: '性能检查',
  compliance: '合规检查',
  security: '安全检查',
  routing: '路由检查',
}

const CATEGORY_COLORS: Record<string, string> = {
  health: 'bg-green-100 text-green-800',
  performance: 'bg-blue-100 text-blue-800',
  compliance: 'bg-purple-100 text-purple-800',
  security: 'bg-red-100 text-red-800',
  routing: 'bg-yellow-100 text-yellow-800',
}

const TYPE_LABELS: Record<string, string> = {
  snmp: 'SNMP',
  ping: 'Ping',
  ssh: 'SSH',
  http: 'HTTP',
  script: '脚本',
  icmp: 'ICMP',
}

export function CheckItemGroup({
  category,
  items,
  defaultExpanded = true,
}: CheckItemGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  if (items.length === 0) {
    return null
  }

  const categoryLabel = CATEGORY_LABELS[category] || category
  const categoryColor = CATEGORY_COLORS[category] || 'bg-muted text-gray-800'

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 分组标题 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-muted/40 hover:bg-muted transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${categoryColor}`}>
            {categoryLabel}
          </span>
          <span className="text-sm text-muted-foreground">
            {items.length} 个检查项
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${
            isExpanded ? 'transform rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 检查项列表 */}
      {isExpanded && (
        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className="p-4 bg-card hover:bg-muted/40">
              {/* 检查项标题 */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground">{item.name}</h4>
                    <span className="text-xs bg-gray-200 text-foreground/90 px-2 py-0.5 rounded">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    {item.type !== 'icmp' && !isCheckItemTypeSupported(item.type as CheckItemType) && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        未支持执行
                      </span>
                    )}
                    {item.enabled === false && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        已禁用
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <div className="text-sm text-muted-foreground ml-4">
                  权重: <span className="font-medium">{item.weight}</span>
                </div>
              </div>

              {/* 配置详情 */}
              <div className="mt-3 bg-muted/40 rounded p-3">
                <div className="text-xs font-medium text-foreground/90 mb-2">配置参数</div>
                <div className="space-y-1 text-sm">
                  {/* SNMP 配置 */}
                  {item.type === 'snmp' && item.config && (
                    <>
                      {item.config.oid && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">OID:</span>
                          <span className="text-foreground font-mono text-xs">
                            {item.config.oid}
                          </span>
                        </div>
                      )}
                      {item.config.timeout && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">超时:</span>
                          <span className="text-foreground">{item.config.timeout}s</span>
                        </div>
                      )}
                      {item.config.unit && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">单位:</span>
                          <span className="text-foreground">{item.config.unit}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* SSH 配置 */}
                  {item.type === 'ssh' && item.config && (
                    <>
                      {item.config.command && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">命令:</span>
                          <span className="text-foreground font-mono text-xs">
                            {item.config.command}
                          </span>
                        </div>
                      )}
                      {item.config.parsePattern && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">解析模式:</span>
                          <span className="text-foreground font-mono text-xs">
                            {item.config.parsePattern}
                          </span>
                        </div>
                      )}
                      {item.config.timeout && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">超时:</span>
                          <span className="text-foreground">{item.config.timeout}s</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* HTTP 配置 */}
                  {item.type === 'http' && item.config && (
                    <>
                      {item.config.url && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">URL:</span>
                          <span className="text-foreground font-mono text-xs break-all">
                            {item.config.url}
                          </span>
                        </div>
                      )}
                      {item.config.timeout && (
                        <div className="flex">
                          <span className="text-muted-foreground w-24">超时:</span>
                          <span className="text-foreground">{item.config.timeout}s</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* 阈值配置 */}
                  {item.config?.threshold && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="text-xs font-medium text-foreground/90 mb-1">阈值</div>
                      <div className="flex gap-4">
                        {item.config.threshold.warning !== undefined && (
                          <div className="flex items-center gap-1">
                            <span className="text-yellow-600">⚠</span>
                            <span className="text-muted-foreground">警告:</span>
                            <span className="text-foreground font-medium">
                              {item.config.threshold.warning}
                            </span>
                          </div>
                        )}
                        {item.config.threshold.critical !== undefined && (
                          <div className="flex items-center gap-1">
                            <span className="text-red-600">✖</span>
                            <span className="text-muted-foreground">严重:</span>
                            <span className="text-foreground font-medium">
                              {item.config.threshold.critical}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

