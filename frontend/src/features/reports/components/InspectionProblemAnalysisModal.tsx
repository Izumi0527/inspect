import React, { useMemo, useState } from 'react'
import { AlertCircle, Lightbulb } from 'lucide-react'
import { Badge, Button, Loading, Modal, ModalContent, ModalTitle } from '@/components/atoms'
import { useInspectionReportData } from '../hooks/useReports'
import { formatDateYMD } from '@/utils/formatters'

interface Props {
  onClose: () => void
}

const trendLabel = (value: string): string => {
  const v = String(value || '').toLowerCase()
  if (v === 'increasing') return '上升'
  if (v === 'decreasing') return '下降'
  return '稳定'
}

const severityBadge = (value: string) => {
  const v = String(value || '').toLowerCase()
  if (v === 'critical') return <Badge variant="danger">严重</Badge>
  if (v === 'high') return <Badge variant="warning">高</Badge>
  if (v === 'medium') return <Badge variant="primary">中</Badge>
  return <Badge variant="secondary">低</Badge>
}

export const InspectionProblemAnalysisModal: React.FC<Props> = ({ onClose }) => {
  const [dateRange, setDateRange] = useState(() => {
    const endDate = formatDateYMD(new Date())
    const startDate = formatDateYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    return { startDate, endDate }
  })

  const { data, isLoading, error, refetch } = useInspectionReportData({
    dateRange
  })

  const summary = data?.summary
  const problemAnalysis = useMemo(() => (Array.isArray(data?.problemAnalysis) ? data!.problemAnalysis : []), [data])
  const recommendations = useMemo(
    () => (Array.isArray(data?.recommendations) ? data!.recommendations : []),
    [data]
  )

  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent className="sm:max-w-6xl p-0" hideDescription>
        <div className="flex items-center justify-between p-6 pr-14 border-b dark:border-border flex-shrink-0">
          <div>
            <ModalTitle className="text-xl font-semibold text-foreground">问题分析</ModalTitle>
            <p className="text-sm text-muted-foreground">基于巡检数据聚合统计</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 查询条件 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                开始日期
              </label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-1">
                结束日期
              </label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground"
                disabled={isLoading}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="w-full">
                刷新数据
              </Button>
            </div>
          </div>

          {/* 状态 */}
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loading />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-10 text-red-600 dark:text-red-400">
              <AlertCircle className="w-6 h-6 mr-2" />
              <span>加载失败：{error.message || '未知错误'}</span>
            </div>
          )}

          {!isLoading && !error && data && (
            <div className="space-y-6">
              {/* 概览 */}
              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-card border dark:border-border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">设备数</div>
                    <div className="text-2xl font-semibold text-foreground">{summary.totalDevices}</div>
                  </div>
                  <div className="bg-card border dark:border-border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">执行次数</div>
                    <div className="text-2xl font-semibold text-foreground">{summary.totalExecutions}</div>
                  </div>
                  <div className="bg-card border dark:border-border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">平均分</div>
                    <div className="text-2xl font-semibold text-foreground">{summary.avgScore.toFixed(2)}</div>
                  </div>
                  <div className="bg-card border dark:border-border rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">成功率</div>
                    <div className="text-2xl font-semibold text-foreground">{summary.successRate.toFixed(2)}%</div>
                  </div>
                </div>
              )}

              {/* 问题分析 */}
              <div className="border dark:border-border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-4 py-3 border-b dark:border-border font-medium text-foreground">
                  问题分类统计
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/60 dark:bg-muted/80">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-foreground/90">分类</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-foreground/90">严重度</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">次数</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">占比</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-foreground/90">趋势</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-foreground/90">影响设备</th>
                      </tr>
                    </thead>
                    <tbody>
                      {problemAnalysis.length > 0 ? (
                        problemAnalysis.map((item: any, idx: number) => (
                          <tr key={item.category || idx} className="border-t dark:border-border">
                            <td className="px-4 py-2 text-sm text-foreground">
                              <div className="font-medium">{item.category || '-'}</div>
                              <div className="text-xs text-muted-foreground line-clamp-1">{item.description || ''}</div>
                            </td>
                            <td className="px-4 py-2 text-sm">{severityBadge(item.severity)}</td>
                            <td className="px-4 py-2 text-sm text-right text-foreground">{item.count ?? 0}</td>
                            <td className="px-4 py-2 text-sm text-right text-foreground">
                              {Number(item.percentage ?? 0).toFixed(2)}%
                            </td>
                            <td className="px-4 py-2 text-sm text-foreground">{trendLabel(item.trend)}</td>
                            <td className="px-4 py-2 text-sm text-right text-foreground">
                              {Array.isArray(item.affectedDevices) ? item.affectedDevices.length : 0}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            暂无问题分析数据
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 建议 */}
              <div className="border dark:border-border rounded-lg overflow-hidden">
                <div className="bg-muted/40 px-4 py-3 border-b dark:border-border font-medium text-foreground flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  优化建议
                </div>
                <div className="p-4">
                  {recommendations.length > 0 ? (
                    <div className="space-y-3">
                      {recommendations.map((rec: any) => (
                        <div key={rec.id} className="border dark:border-border rounded-lg p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{rec.title}</div>
                              <div className="text-sm text-muted-foreground mt-1">{rec.description}</div>
                            </div>
                            <Badge variant="outline">{rec.priority}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      暂无建议数据（后端目前默认返回空数组）。
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t dark:border-border bg-muted/40 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            关闭
          </Button>
        </div>
      </ModalContent>
    </Modal>
  )
}

