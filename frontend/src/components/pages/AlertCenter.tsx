import * as React from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  X,
  Eye,
  Plus,
  Activity
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  TextArea
} from '@/components/atoms'

// 告警严重级别
type AlertSeverity = 'info' | 'warning' | 'critical' | 'fatal'
// 告警状态
type AlertStatus = 'active' | 'acknowledged' | 'resolved'
// 告警类别
type AlertCategory = 'connectivity' | 'performance' | 'security' | 'configuration' | 'hardware' | 'other'

// 告警接口
interface Alert {
  id: number
  title: string
  message: string
  device_id: number
  device_name: string
  category: AlertCategory
  severity: AlertSeverity
  status: AlertStatus
  metric_name?: string
  current_value?: number
  threshold_value?: number
  first_occurred: string
  last_occurred: string
  occurrence_count: number
  acknowledged_at?: string
  acknowledged_by?: string
  resolved_at?: string
  resolved_by?: string
  resolution_note?: string
}

const ALERT_SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical', 'fatal']
const ALERT_STATUSES: AlertStatus[] = ['active', 'acknowledged', 'resolved']

const isAlertSeverity = (value: unknown): value is AlertSeverity =>
  typeof value === 'string' && (ALERT_SEVERITIES as string[]).includes(value)

const isAlertStatus = (value: unknown): value is AlertStatus =>
  typeof value === 'string' && (ALERT_STATUSES as string[]).includes(value)

const formatDateTime = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('zh-CN')
    }
  }
  return '-'
}

const toCountValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return 0
}

// 模拟告警数据
const mockAlerts: Alert[] = [
  {
    id: 1,
    title: 'CPU使用率过高',
    message: 'Router-Gateway-01的CPU使用率达到85%，超过阈值80%',
    device_id: 2,
    device_name: 'Router-Gateway-01',
    category: 'performance',
    severity: 'warning',
    status: 'active',
    metric_name: 'cpu_usage',
    current_value: 85,
    threshold_value: 80,
    first_occurred: '2024-01-15 09:30:00',
    last_occurred: '2024-01-15 10:30:00',
    occurrence_count: 15
  },
  {
    id: 2,
    title: '设备连接丢失',
    message: 'AP-Office-Floor2失去连接，无法访问',
    device_id: 4,
    device_name: 'AP-Office-Floor2',
    category: 'connectivity',
    severity: 'critical',
    status: 'active',
    first_occurred: '2024-01-15 08:15:00',
    last_occurred: '2024-01-15 10:25:00',
    occurrence_count: 45
  },
  {
    id: 3,
    title: '异常登录尝试',
    message: 'Firewall-01检测到来自未知IP的多次登录尝试',
    device_id: 3,
    device_name: 'Firewall-01',
    category: 'security',
    severity: 'warning',
    status: 'acknowledged',
    first_occurred: '2024-01-15 10:05:00',
    last_occurred: '2024-01-15 10:20:00',
    occurrence_count: 8,
    acknowledged_at: '2024-01-15 10:22:00',
    acknowledged_by: '管理员'
  },
  {
    id: 4,
    title: '内存使用率告警',
    message: 'Core-Switch-01内存使用率达到90%，建议检查',
    device_id: 1,
    device_name: 'Core-Switch-01',
    category: 'performance',
    severity: 'critical',
    status: 'resolved',
    metric_name: 'memory_usage',
    current_value: 90,
    threshold_value: 85,
    first_occurred: '2024-01-15 08:00:00',
    last_occurred: '2024-01-15 09:45:00',
    occurrence_count: 12,
    acknowledged_at: '2024-01-15 09:50:00',
    acknowledged_by: '技术员A',
    resolved_at: '2024-01-15 10:15:00',
    resolved_by: '技术员A',
    resolution_note: '重启服务后内存使用率恢复正常'
  }
]

const SeverityBadge: React.FC<{ severity: AlertSeverity }> = ({ severity }) => {
  const config = {
    info: { label: '信息', variant: 'info' as const, icon: '🔵' },
    warning: { label: '警告', variant: 'warning' as const, icon: '⚠️' },
    critical: { label: '严重', variant: 'error' as const, icon: '🔴' },
    fatal: { label: '致命', variant: 'error' as const, icon: '💀' }
  }
  
  return (
    <Badge variant={config[severity].variant}>
      {config[severity].icon} {config[severity].label}
    </Badge>
  )
}

const StatusBadge: React.FC<{ status: AlertStatus }> = ({ status }) => {
  const config = {
    active: { label: '活跃', variant: 'error' as const, icon: AlertTriangle },
    acknowledged: { label: '已确认', variant: 'warning' as const, icon: Eye },
    resolved: { label: '已解决', variant: 'success' as const, icon: CheckCircle }
  }
  
  const { label, variant, icon: Icon } = config[status]
  
  return (
    <Badge variant={variant} className="flex items-center gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

const CategoryBadge: React.FC<{ category: AlertCategory }> = ({ category }) => {
  const config = {
    connectivity: { label: '连通性', color: 'bg-blue-100 text-blue-800' },
    performance: { label: '性能', color: 'bg-orange-100 text-orange-800' },
    security: { label: '安全', color: 'bg-red-100 text-red-800' },
    configuration: { label: '配置', color: 'bg-purple-100 text-purple-800' },
    hardware: { label: '硬件', color: 'bg-gray-100 text-gray-800' },
    other: { label: '其他', color: 'bg-green-100 text-green-800' }
  }
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config[category].color}`}>
      {config[category].label}
    </span>
  )
}

export const AlertCenter: React.FC = () => {
  const [alerts, setAlerts] = React.useState<Alert[]>(mockAlerts)
  const [loading, setLoading] = React.useState(false)
  const [selectedAlerts, setSelectedAlerts] = React.useState<number[]>([])
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [severityFilter, setSeverityFilter] = React.useState<string>('all')
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
  
  // 模态框状态
  const [acknowledgeModalOpen, setAcknowledgeModalOpen] = React.useState(false)
  const [resolveModalOpen, setResolveModalOpen] = React.useState(false)
  const [selectedAlert, setSelectedAlert] = React.useState<Alert | null>(null)
  const [actionNote, setActionNote] = React.useState('')

  // 过滤告警
  const filteredAlerts = React.useMemo(() => {
    return alerts.filter(alert => {
      const matchesSearch = alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           alert.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           alert.message.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === 'all' || alert.status === statusFilter
      const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter
      const matchesCategory = categoryFilter === 'all' || alert.category === categoryFilter
      
      return matchesSearch && matchesStatus && matchesSeverity && matchesCategory
    })
  }, [alerts, searchQuery, statusFilter, severityFilter, categoryFilter])

  // 表格列定义
  const columns: Column<Alert>[] = [
    {
      key: 'title',
      title: '告警信息',
      width: '300px',
      render: (_, record) => (
        <div className="space-y-1">
          <div className="font-medium text-gray-900">{record.title}</div>
          <div className="text-sm text-gray-600">{record.device_name}</div>
          <CategoryBadge category={record.category} />
        </div>
      )
    },
    {
      key: 'severity',
      title: '严重级别',
      width: '120px',
      render: (value) => (
        isAlertSeverity(value) ? (
          <SeverityBadge severity={value} />
        ) : (
          <span className="text-gray-500">-</span>
        )
      )
    },
    {
      key: 'status',
      title: '状态',
      width: '120px',
      render: (value) => (
        isAlertStatus(value) ? (
          <StatusBadge status={value} />
        ) : (
          <span className="text-gray-500">-</span>
        )
      )
    },
    {
      key: 'occurrence_count',
      title: '发生次数',
      width: '100px',
      render: (value) => {
        const count = toCountValue(value)
        return (
          <Badge variant="secondary">
            {count} 次
          </Badge>
        )
      }
    },
    {
      key: 'first_occurred',
      title: '首次发生',
      width: '150px',
      render: (value) => formatDateTime(value)
    },
    {
      key: 'last_occurred',
      title: '最后发生',
      width: '150px',
      render: (value) => formatDateTime(value)
    },
    {
      key: 'actions',
      title: '操作',
      width: '180px',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewAlert(record)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {record.status === 'active' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAcknowledgeAlert(record)}
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleResolveAlert(record)}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {record.status === 'acknowledged' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleResolveAlert(record)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )
    }
  ]

  const handleViewAlert = (alert: Alert) => {
    console.log('查看告警详情:', alert)
  }

  const handleAcknowledgeAlert = (alert: Alert) => {
    setSelectedAlert(alert)
    setActionNote('')
    setAcknowledgeModalOpen(true)
  }

  const handleResolveAlert = (alert: Alert) => {
    setSelectedAlert(alert)
    setActionNote('')
    setResolveModalOpen(true)
  }

  const confirmAcknowledge = () => {
    if (selectedAlert) {
      setAlerts(prev => prev.map(alert => 
        alert.id === selectedAlert.id 
          ? {
              ...alert,
              status: 'acknowledged' as const,
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: '当前用户'
            }
          : alert
      ))
    }
    setAcknowledgeModalOpen(false)
    setSelectedAlert(null)
    setActionNote('')
  }

  const confirmResolve = () => {
    if (selectedAlert) {
      setAlerts(prev => prev.map(alert => 
        alert.id === selectedAlert.id 
          ? {
              ...alert,
              status: 'resolved' as const,
              resolved_at: new Date().toISOString(),
              resolved_by: '当前用户',
              resolution_note: actionNote
            }
          : alert
      ))
    }
    setResolveModalOpen(false)
    setSelectedAlert(null)
    setActionNote('')
  }

  const handleBulkAction = (action: string) => {
    console.log('批量操作:', action, selectedAlerts)
  }

  const handleRefresh = async () => {
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setLoading(false)
  }

  // 统计数据
  const statistics = React.useMemo(() => {
    const total = alerts.length
    const active = alerts.filter(a => a.status === 'active').length
    const acknowledged = alerts.filter(a => a.status === 'acknowledged').length
    const resolved = alerts.filter(a => a.status === 'resolved').length
    const critical = alerts.filter(a => a.severity === 'critical' || a.severity === 'fatal').length
    
    return { total, active, acknowledged, resolved, critical }
  }, [alerts])

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">告警中心</h1>
          <p className="text-gray-600 mt-1">管理和处理系统告警信息</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <Activity className="h-4 w-4" />
            刷新
          </Button>
          <Button onClick={() => console.log('创建告警规则')}>
            <Plus className="h-4 w-4" />
            创建规则
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-blue-100">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">总告警数</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">活跃告警</p>
                <p className="text-2xl font-bold text-red-600">{statistics.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-yellow-100">
                <Eye className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">已确认</p>
                <p className="text-2xl font-bold text-yellow-600">{statistics.acknowledged}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">已解决</p>
                <p className="text-2xl font-bold text-green-600">{statistics.resolved}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-purple-100">
                <X className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">严重告警</p>
                <p className="text-2xl font-bold text-purple-600">{statistics.critical}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 告警列表 */}
      <Card>
        <CardHeader>
          <CardTitle>告警列表</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 筛选和搜索 */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="搜索告警标题、设备名称或消息..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">活跃</SelectItem>
                <SelectItem value="acknowledged">已确认</SelectItem>
                <SelectItem value="resolved">已解决</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="严重级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="info">信息</SelectItem>
                <SelectItem value="warning">警告</SelectItem>
                <SelectItem value="critical">严重</SelectItem>
                <SelectItem value="fatal">致命</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="类别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类别</SelectItem>
                <SelectItem value="connectivity">连通性</SelectItem>
                <SelectItem value="performance">性能</SelectItem>
                <SelectItem value="security">安全</SelectItem>
                <SelectItem value="configuration">配置</SelectItem>
                <SelectItem value="hardware">硬件</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 批量操作 */}
          {selectedAlerts.length > 0 && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-purple-50 rounded-lg">
              <span className="text-sm text-purple-700">
                已选择 {selectedAlerts.length} 条告警
              </span>
              <div className="flex gap-2 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('acknowledge')}
                >
                  批量确认
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('resolve')}
                >
                  批量解决
                </Button>
              </div>
            </div>
          )}

          {/* 告警表格 */}
          <Table
            columns={columns}
            data={filteredAlerts}
            loading={loading}
            rowSelection={{
              selectedRowKeys: selectedAlerts,
              onChange: (keys) => setSelectedAlerts(keys as number[])
            }}
            pagination={{
              current: 1,
              pageSize: 10,
              total: filteredAlerts.length,
              onChange: (page, pageSize) => {
                console.log('分页:', page, pageSize)
              }
            }}
          />
        </CardContent>
      </Card>

      {/* 确认告警对话框 */}
      <Modal open={acknowledgeModalOpen} onOpenChange={setAcknowledgeModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>确认告警</ModalTitle>
            <ModalDescription>
              确认告警: {selectedAlert?.title}
            </ModalDescription>
          </ModalHeader>
          <div className="space-y-4">
            <TextArea
              placeholder="添加确认备注（可选）..."
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
            />
          </div>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setAcknowledgeModalOpen(false)}
            >
              取消
            </Button>
            <Button onClick={confirmAcknowledge}>
              确认告警
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 解决告警对话框 */}
      <Modal open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>解决告警</ModalTitle>
            <ModalDescription>
              解决告警: {selectedAlert?.title}
            </ModalDescription>
          </ModalHeader>
          <div className="space-y-4">
            <TextArea
              placeholder="请描述解决方案和处理过程..."
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              required
            />
          </div>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setResolveModalOpen(false)}
            >
              取消
            </Button>
            <Button 
              onClick={confirmResolve}
              disabled={!actionNote.trim()}
            >
              解决告警
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}