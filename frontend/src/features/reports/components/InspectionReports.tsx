import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'
import { 
  FileText, 
  Plus, 
  Calendar, 
  Download,
  Eye, 
  Edit, 
  Trash2, 
  Clock, 
  Users,
  AlertCircle,
  Play,
  CheckCircle,
  Settings,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  ConfirmModal,
  ErrorAlert,
} from '@/components/atoms'
import type { BadgeProps } from '@/components/atoms/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useReports,
  useDeleteReport,
  useGenerateInspectionReport
} from '../hooks/useReports'
import { downloadReport as fetchDownloadUrl } from '../api/reports.api'
import { downloadWithAuth } from '@/utils/download'
import { Report } from '../types'
import { formatDateYMD } from '@/utils/formatters'
import { InspectionReportModal } from './InspectionReportModal'
import { ReportPreviewModal } from './ReportPreviewModal'
import { ReportEditModal } from './ReportEditModal'
import { InspectionCompareModal } from './InspectionCompareModal'
import { InspectionProblemAnalysisModal } from './InspectionProblemAnalysisModal'
import { ReportsToolbar } from './shared/ReportsToolbar'

interface Props {
  searchText: string
  onSearchTextChange?: (value: string) => void
}

export const InspectionReports: React.FC<Props> = ({
  searchText,
  onSearchTextChange = () => undefined,
}) => {
  const router = useRouter()
  const canCreate = usePermission(Permission.REPORTS_CREATE)
  const canUpdate = usePermission(Permission.REPORTS_UPDATE)
  const canDelete = usePermission(Permission.REPORTS_DELETE)

  const [reportModal, setReportModal] = useState(false)
  const [previewReport, setPreviewReport] = useState<Report | null>(null)
  const [editingReport, setEditingReport] = useState<Report | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 分页：后端分页从 1 开始，默认 20 条/页
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')
  const [quickDailyLoading, setQuickDailyLoading] = useState(false)

  // 当筛选条件变化时重置到第一页，避免落在空页
  useEffect(() => {
    setPage(1)
  }, [searchText, statusFilter, formatFilter])

  const { data: reportsData, isLoading, error, refetch } = useReports({
    page,
    pageSize,
    type: 'inspection',
    status: statusFilter !== 'all' ? statusFilter : undefined
  })
  const deleteReport = useDeleteReport()
  const generateReport = useGenerateInspectionReport()

  const reports = reportsData?.reports || []
  const total = useMemo(() => {
    const serverTotal = typeof reportsData?.total === 'number' ? reportsData.total : 0
    return Math.max(serverTotal, reports.length)
  }, [reportsData?.total, reports.length])

  // 删除/筛选后可能出现“当前页超出最后页”的情况：自动回退到最后一页，避免列表空白且无法翻页。
  useEffect(() => {
    if (total <= 0) return
    const lastPage = Math.max(1, Math.ceil(total / pageSize))
    if (page > lastPage) {
      setPage(lastPage)
    }
  }, [page, pageSize, total])

  const handleDownloadReport = async (report: Report) => {
    try {
      const url = report.downloadUrl || (await fetchDownloadUrl(report.id))
      if (!url) {
        toast.error('暂无可用的下载链接')
        return
      }

      const format = String(report.format || 'pdf').toLowerCase()
      const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : format
      const filename = `${report.title || 'report'}.${ext}`
      await downloadWithAuth(url, filename)
    } catch (err) {
      console.error('下载报表失败:', err)
      toast.error('下载失败，请稍后重试')
    }
  }

  const handleQuickDailyReport = async () => {
    if (!canCreate) {
      toast.error('暂无权限生成报表')
      return
    }
    if (quickDailyLoading) return

    try {
      setQuickDailyLoading(true)
      const endDate = formatDateYMD(new Date())
      const yesterday = formatDateYMD(new Date(Date.now() - 24 * 60 * 60 * 1000))

      const report = await generateReport.mutateAsync({
        title: `巡检日报_${yesterday}`,
        description: '昨日巡检总结',
        category: 'daily',
        dateRange: {
          startDate: yesterday,
          endDate
        },
        format: 'pdf',
        includeCharts: true,
        includeDetailData: false,
        includeRecommendations: true
      })

      await handleDownloadReport(report)
    } catch (err) {
      console.error('快速日报生成失败:', err)
      // toast 由 mutation hook onError 统一处理
    } finally {
      setQuickDailyLoading(false)
    }
  }

  // 颜色映射对象 - 解决动态类名问题
  const colorMap = {
    blue: {
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      icon: 'text-blue-600 dark:text-blue-400'
    },
    green: {
      bg: 'bg-green-100 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
      icon: 'text-green-600 dark:text-green-400'
    },
    red: {
      bg: 'bg-red-100 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      icon: 'text-red-600 dark:text-red-400'
    },
    purple: {
      bg: 'bg-purple-100 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      icon: 'text-purple-600 dark:text-purple-400'
    }
  }

  // 过滤报表列表
  const normalizedKeyword = searchText.trim().toLowerCase()
  const isClientFiltering = normalizedKeyword.length > 0 || formatFilter !== 'all'
  const filteredReports = reports.filter((report: Report) => {
    const title = String(report?.title || '').toLowerCase()
    const description = String(report?.description || '').toLowerCase()
    const keywordMatched =
      normalizedKeyword.length === 0 ||
      title.includes(normalizedKeyword) ||
      description.includes(normalizedKeyword)

    const reportFormat = String(report?.format || '').toLowerCase()
    const formatMatched = formatFilter === 'all' || reportFormat === formatFilter

    return keywordMatched && formatMatched
  })

  const handleGenerateReport = () => {
    if (!canCreate) {
      toast.error('暂无权限生成报表')
      return
    }
    setReportModal(true)
  }

  const handlePreviewReport = (report: Report) => {
    setPreviewReport(report)
  }

  const handleDeleteReport = async (id: string) => {
    try {
      await deleteReport.mutateAsync(id)
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Delete report failed:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'generating':
        return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'generating':
        return <Badge variant="primary">生成中</Badge>
      case 'completed':
        return <Badge variant="success">已完成</Badge>
      case 'failed':
        return <Badge variant="danger">失败</Badge>
      case 'scheduled':
        return <Badge variant="warning">已计划</Badge>
      default:
        return <Badge variant="secondary">未知</Badge>
    }
  }

  type BadgeVariant = BadgeProps['variant']

  const getFormatBadge = (format: string) => {
    const formatConfig: Record<'pdf' | 'excel' | 'html' | 'word', { variant: BadgeVariant; label: string }> = {
      pdf: { variant: 'primary', label: 'PDF' },
      excel: { variant: 'success', label: 'Excel' },
      html: { variant: 'secondary', label: 'HTML' },
      word: { variant: 'outline', label: 'Word' }
    }
    const config = formatConfig[format as keyof typeof formatConfig] ?? formatConfig.pdf
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return '-'
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const columns: Column<Report>[] = [
    {
      key: 'title',
      title: '报表信息',
      render: (_, report) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-foreground">{report.title}</span>
          </div>
          <span className="text-sm text-muted-foreground line-clamp-2 mt-1">{report.description}</span>
          <div className="flex items-center gap-2 mt-2">
            {getFormatBadge(report.format)}
            <span className="text-xs text-muted-foreground/80">
              {formatFileSize(report.fileSize)}
            </span>
          </div>
        </div>
      )
    },
    {
      key: 'category',
      title: '类别',
      render: (_, report) => (
        <Badge variant="outline">
          {report.category === 'daily' ? '日报' :
           report.category === 'weekly' ? '周报' :
           report.category === 'monthly' ? '月报' :
           report.category === 'quarterly' ? '季报' :
           report.category === 'yearly' ? '年报' : '自定义'}
        </Badge>
      )
    },
    {
      key: 'status',
      title: '状态',
      render: (_, report) => (
        <div className="flex items-center gap-2">
          {getStatusIcon(report.status)}
          {getStatusBadge(report.status)}
        </div>
      )
    },
    {
      key: 'parameters',
      title: '参数范围',
      render: (_, report) => (
        <div className="flex flex-col text-sm">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-muted-foreground/80" />
            <span>
              {new Date(report.parameters.dateRange.startDate).toLocaleDateString()} -
              {new Date(report.parameters.dateRange.endDate).toLocaleDateString()}
            </span>
          </div>
          {report.parameters.devices && (
            <div className="flex items-center gap-1 mt-1">
              <Users className="w-3 h-3 text-muted-foreground/80" />
              <span>{report.parameters.devices.length} 个设备</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'created',
      title: '创建信息',
      render: (_, report) => (
        <div className="flex flex-col text-sm">
          <div className="font-medium text-foreground">{report.generatedBy}</div>
          <div className="text-muted-foreground">
            {new Date(report.createdAt).toLocaleDateString()}
          </div>
          <div className="text-muted-foreground/80 text-xs">
            {new Date(report.createdAt).toLocaleTimeString()}
          </div>
        </div>
      )
    },
    {
      key: 'actions',
      title: '操作',
      render: (_, report) => (
        <div className="flex items-center gap-1">
          {report.status === 'completed' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handlePreviewReport(report)}
                title="预览报表"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDownloadReport(report)}
                title="下载报表"
              >
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
          {canUpdate && (
            <Button
              size="sm"
              variant="ghost"
              title="编辑"
              onClick={() => setEditingReport(report)}
            >
              <Edit className="w-4 h-4" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirm(report.id)}
              title="删除"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          )}
        </div>
      )
    }
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* 加载骨架屏 */}
        {[...Array(5)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-4 bg-muted rounded w-1/6"></div>
                <div className="h-4 bg-muted rounded w-1/6"></div>
                <div className="h-4 bg-muted rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <ErrorAlert
        title="巡检报告加载失败"
        message="无法加载巡检报表列表，请检查网络连接或稍后重试"
        error={error}
        onRetry={refetch}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">巡检报告管理</h3>
          <Badge variant="secondary">
            {isClientFiltering ? `${filteredReports.length} / ${total}` : `${total}`} 项
          </Badge>
          {isClientFiltering && total > 0 && (
            <span className="text-xs text-muted-foreground">
              （搜索/格式筛选仅对当前页生效）
            </span>
          )}
        </div>
      </div>

      <ReportsToolbar
        search={{
          value: searchText,
          placeholder: '搜索报告标题、描述...',
          ariaLabel: '搜索巡检报告',
          onChange: onSearchTextChange,
        }}
        filters={(
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="报告状态筛选">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="generating">生成中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="scheduled">已计划</SelectItem>
              </SelectContent>
            </Select>
            <Select value={formatFilter} onValueChange={setFormatFilter}>
              <SelectTrigger className="h-9 w-[110px] text-sm" aria-label="报告格式筛选">
                <SelectValue placeholder="格式筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部格式</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="word">Word</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        secondaryActions={[
          {
            key: 'refresh-reports',
            label: '刷新',
            icon: <RefreshCw className="mr-2 h-4 w-4" />,
            disabled: Boolean(isLoading),
            onClick: () => void refetch(),
          },
        ]}
        primaryActions={
          canCreate
            ? [
                {
                  key: 'generate-report',
                  label: '生成报告',
                  icon: <Plus className="mr-2 h-4 w-4" />,
                  onClick: handleGenerateReport,
                },
              ]
            : []
        }
      />

      {/* 快速操作卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            title: '快速日报',
            description: '生成昨日巡检总结',
            icon: Calendar,
            color: 'blue',
            action: handleQuickDailyReport,
            disabled: !canCreate || quickDailyLoading || generateReport.isPending
          },
          {
            title: '设备对比',
            description: '对比设备性能表现',
            icon: Users,
            color: 'green',
            action: () => setCompareOpen(true),
            disabled: false
          },
          {
            title: '问题分析',
            description: '分析常见问题趋势',
            icon: AlertCircle,
            color: 'red',
            action: () => setAnalysisOpen(true),
            disabled: false
          },
          {
            title: '自定义配置',
            description: '配置报告模板',
            icon: Settings,
            color: 'purple',
            action: () => router.push('/reports?tab=custom'),
            disabled: false
          }
        ].map((item) => {
          const colors = colorMap[item.color as keyof typeof colorMap]
          const disabled = !!(item as any).disabled
          return (
            <Card
              key={item.title}
              className={
                disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:shadow-md transition-shadow cursor-pointer'
              }
            >
              <CardContent
                className="p-4"
                onClick={() => {
                  if (disabled) return
                  item.action()
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={colors.bg + ' p-2 rounded-lg'}>
                    <item.icon className={colors.icon + ' w-5 h-5'} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.description}</div>
                  </div>
                  {disabled ? (
                    <Clock className="w-4 h-4 text-muted-foreground/80 animate-pulse" />
                  ) : (
                    <Play className="w-4 h-4 text-muted-foreground/80" />
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 报表列表 */}
      {total > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {isClientFiltering && filteredReports.length === 0 && (
            <div className="text-sm text-muted-foreground mb-2">
              本页无匹配结果，可尝试翻页或清空搜索/格式筛选。
            </div>
          )}
          <Table
            data={filteredReports}
            columns={columns}
            className="bg-card rounded-lg shadow-sm"
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage)
                setPageSize(nextPageSize)
              },
            }}
          />
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <FileText className="w-12 h-12 text-muted-foreground/80" />
              <div>
                <h3 className="text-lg font-medium text-foreground">暂无巡检报告</h3>
                <p className="text-muted-foreground mt-1">
                  {searchText ? '没有找到匹配的报告' : '开始生成您的第一个巡检报告'}
                </p>
              </div>
              {!searchText && (
                canCreate ? (
                  <Button onClick={handleGenerateReport} className="mt-2">
                    <Plus className="w-4 h-4 mr-2" />
                    生成报告
                  </Button>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 生成报告弹窗 */}
      {reportModal && (
        <InspectionReportModal
          onClose={() => setReportModal(false)}
          onSuccess={() => {
            setReportModal(false)
          }}
        />
      )}

      {/* 报告预览弹窗 */}
      {previewReport && (
        <ReportPreviewModal
          report={previewReport}
          onClose={() => setPreviewReport(null)}
        />
      )}

      {/* 编辑弹窗 */}
      {editingReport && (
        <ReportEditModal
          report={editingReport}
          onClose={() => setEditingReport(null)}
          onSuccess={() => setEditingReport(null)}
        />
      )}

      {/* 设备对比弹窗 */}
      {compareOpen && (
        <InspectionCompareModal
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* 问题分析弹窗 */}
      {analysisOpen && (
        <InspectionProblemAnalysisModal
          onClose={() => setAnalysisOpen(false)}
        />
      )}

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          if (!deleteConfirm) return
          await handleDeleteReport(deleteConfirm)
        }}
        title="删除报告"
        description="确定要删除这个巡检报告吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
      />
    </div>
  )
}
