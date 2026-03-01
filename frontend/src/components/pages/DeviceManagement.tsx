import * as React from 'react'
import {
  Server,
  Wifi,
  Shield,
  Monitor,
  Plus,
  Edit,
  Trash2,
  Eye,
  Power,
  AlertTriangle,
  CheckCircle,
  Clock
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
  ConfirmModal
} from '@/components/atoms'

// 设备状态类型
type DeviceStatus = 'online' | 'offline' | 'warning' | 'maintenance'

// 设备数据接口
interface Device {
  id: number
  name: string
  ip: string
  device_type: string
  status: DeviceStatus
  location: string
  last_seen: string
  uptime: string
  cpu_usage?: number
  memory_usage?: number
  network_traffic?: number
  alert_count?: number
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  switch: '交换机',
  router: '路由器',
  firewall: '防火墙',
  wireless_ap: '无线AP'
}

const DEVICE_STATUSES: DeviceStatus[] = ['online', 'offline', 'warning', 'maintenance']

const isDeviceStatus = (value: unknown): value is DeviceStatus =>
  typeof value === 'string' && (DEVICE_STATUSES as string[]).includes(value)

const getDeviceTypeLabel = (value: unknown): string => {
  if (typeof value === 'string') {
    return DEVICE_TYPE_LABELS[value] ?? value
  }
  return '-'
}

const formatPercentage = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}%`
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) {
      return `${parsed}%`
    }
  }
  return '-'
}

const toAlertCount = (value: unknown): number => {
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

// 模拟设备数据
const mockDevices: Device[] = [
  {
    id: 1,
    name: 'Core-Switch-01',
    ip: '192.168.1.1',
    device_type: 'switch',
    status: 'online',
    location: '数据中心A',
    last_seen: '2024-01-15 10:30:00',
    uptime: '45天 12小时',
    cpu_usage: 25,
    memory_usage: 60,
    network_traffic: 850,
    alert_count: 0
  },
  {
    id: 2,
    name: 'Router-Gateway-01',
    ip: '192.168.1.254',
    device_type: 'router',
    status: 'warning',
    location: '数据中心A',
    last_seen: '2024-01-15 10:25:00',
    uptime: '30天 8小时',
    cpu_usage: 85,
    memory_usage: 78,
    network_traffic: 1200,
    alert_count: 3
  },
  {
    id: 3,
    name: 'Firewall-01',
    ip: '192.168.1.100',
    device_type: 'firewall',
    status: 'online',
    location: '数据中心B',
    last_seen: '2024-01-15 10:29:00',
    uptime: '15天 3小时',
    cpu_usage: 45,
    memory_usage: 55,
    network_traffic: 650,
    alert_count: 1
  },
  {
    id: 4,
    name: 'AP-Office-Floor2',
    ip: '192.168.2.10',
    device_type: 'wireless_ap',
    status: 'offline',
    location: '办公楼2层',
    last_seen: '2024-01-15 08:15:00',
    uptime: '0天 0小时',
    cpu_usage: 0,
    memory_usage: 0,
    network_traffic: 0,
    alert_count: 5
  }
]

const DeviceIcon: React.FC<{ type: string; className?: string }> = ({ type, className = "h-5 w-5" }) => {
  const iconMap = {
    switch: <Server className={className} />,
    router: <Wifi className={className} />,
    firewall: <Shield className={className} />,
    wireless_ap: <Wifi className={className} />,
    default: <Monitor className={className} />
  }
  
  return iconMap[type as keyof typeof iconMap] || iconMap.default
}

const StatusBadge: React.FC<{ status: DeviceStatus }> = ({ status }) => {
  const statusConfig = {
    online: { label: '在线', variant: 'success' as const, icon: CheckCircle },
    offline: { label: '离线', variant: 'error' as const, icon: Power },
    warning: { label: '告警', variant: 'warning' as const, icon: AlertTriangle },
    maintenance: { label: '维护', variant: 'info' as const, icon: Clock }
  }
  
  const config = statusConfig[status]
  const IconComponent = config.icon
  
  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <IconComponent className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

export const DeviceManagementPage: React.FC = () => {
  const [devices, setDevices] = React.useState<Device[]>(mockDevices)
  const loading = false
  const [selectedDevices, setSelectedDevices] = React.useState<number[]>([])
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false)
  const [deviceToDelete, setDeviceToDelete] = React.useState<Device | null>(null)

  // 过滤设备
  const filteredDevices = React.useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           device.ip.includes(searchQuery) ||
                           device.location.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === 'all' || device.status === statusFilter
      const matchesType = typeFilter === 'all' || device.device_type === typeFilter
      
      return matchesSearch && matchesStatus && matchesType
    })
  }, [devices, searchQuery, statusFilter, typeFilter])

  // 表格列定义
  const columns: Column<Device>[] = [
    {
      key: 'name',
      title: '设备名称',
      width: '200px',
      render: (_, record) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center">
            <DeviceIcon type={record.device_type} className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium text-foreground">{record.name}</div>
            <div className="text-sm text-muted-foreground">{record.ip}</div>
          </div>
        </div>
      )
    },
    {
      key: 'device_type',
      title: '设备类型',
      width: '120px',
      render: (value) => getDeviceTypeLabel(value)
    },
    {
      key: 'status',
      title: '状态',
      width: '100px',
      render: (value) => (
        isDeviceStatus(value) ? (
          <StatusBadge status={value} />
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      )
    },
    {
      key: 'location',
      title: '位置',
      width: '150px'
    },
    {
      key: 'cpu_usage',
      title: 'CPU使用率',
      width: '120px',
      render: (value) => formatPercentage(value)
    },
    {
      key: 'memory_usage',
      title: '内存使用率',
      width: '120px',
      render: (value) => formatPercentage(value)
    },
    {
      key: 'alert_count',
      title: '告警数',
      width: '80px',
      render: (value) => {
        const count = toAlertCount(value)
        return (
          <Badge variant={count > 0 ? 'error' : 'secondary'}>
            {count}
          </Badge>
        )
      }
    },
    {
      key: 'actions',
      title: '操作',
      width: '120px',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewDevice(record)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditDevice(record)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDeleteDevice(record)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ]

  const handleViewDevice = (device: Device) => {
    console.log('查看设备:', device)
  }

  const handleEditDevice = (device: Device) => {
    console.log('编辑设备:', device)
  }

  const handleDeleteDevice = (device: Device) => {
    setDeviceToDelete(device)
    setDeleteModalOpen(true)
  }

  const confirmDelete = () => {
    if (deviceToDelete) {
      setDevices(prev => prev.filter(d => d.id !== deviceToDelete.id))
      setDeviceToDelete(null)
    }
    setDeleteModalOpen(false)
  }

  const handleAddDevice = () => {
    console.log('添加设备')
  }

  const handleBulkAction = (action: string) => {
    console.log('批量操作:', action, selectedDevices)
  }

  const summary = React.useMemo(() => {
    const total = devices.length
    const online = devices.filter(d => d.status === 'online').length
    const offline = devices.filter(d => d.status === 'offline').length
    const warning = devices.filter(d => d.status === 'warning').length
    const totalAlerts = devices.reduce((sum, d) => sum + (d.alert_count || 0), 0)

    return { total, online, offline, warning, totalAlerts }
  }, [devices])

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">设备管理</h1>
          <p className="text-muted-foreground mt-1">管理和监控网络设备状态</p>
        </div>
        <Button onClick={handleAddDevice} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          添加设备
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">总设备数</p>
                <p className="text-2xl font-bold text-foreground">{summary.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">在线设备</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.online}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <Power className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">离线设备</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.offline}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">告警设备</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{summary.warning}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <AlertTriangle className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">总告警数</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{summary.totalAlerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选和搜索 */}
      <Card>
        <CardHeader>
          <CardTitle>设备列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="搜索设备名称、IP或位置..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="online">在线</SelectItem>
                <SelectItem value="offline">离线</SelectItem>
                <SelectItem value="warning">告警</SelectItem>
                <SelectItem value="maintenance">维护</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="类型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="switch">交换机</SelectItem>
                <SelectItem value="router">路由器</SelectItem>
                <SelectItem value="firewall">防火墙</SelectItem>
                <SelectItem value="wireless_ap">无线AP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 批量操作 */}
          {selectedDevices.length > 0 && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
              <span className="text-sm text-purple-700 dark:text-purple-300">
                已选择 {selectedDevices.length} 个设备
              </span>
              <div className="flex gap-2 ml-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('start_inspection')}
                >
                  开始巡检
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('batch_config')}
                >
                  批量配置
                </Button>
              </div>
            </div>
          )}

          {/* 设备表格 */}
          <Table
            columns={columns}
            data={filteredDevices}
            loading={loading}
            rowSelection={{
              selectedRowKeys: selectedDevices,
              onChange: (keys) => setSelectedDevices(keys as number[])
            }}
            pagination={{
              current: 1,
              pageSize: 10,
              total: filteredDevices.length,
              onChange: (page, pageSize) => {
                console.log('分页:', page, pageSize)
              }
            }}
          />
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="删除设备"
        description={`确定要删除设备 "${deviceToDelete?.name}" 吗？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
      />
    </div>
  )
}
