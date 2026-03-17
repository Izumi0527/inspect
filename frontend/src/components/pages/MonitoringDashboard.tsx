import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  Cpu,
  Download,
  Network,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  LineChartComponent,
  AreaChartComponent,
  PieChartComponent,
  CircularProgress
} from '@/components/atoms'
import { CompactStatCard } from '@/components/shared'

// 生成模拟监控数据
const generateTimeSeriesData = (points: number = 24) => {
  const now = new Date()
  return Array.from({ length: points }, (_, i) => {
    const time = new Date(now.getTime() - (points - 1 - i) * 60 * 60 * 1000)
    return {
      time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      cpu: Math.floor(Math.random() * 40) + 30,
      memory: Math.floor(Math.random() * 30) + 50,
      network: Math.floor(Math.random() * 500) + 200,
      temperature: Math.floor(Math.random() * 20) + 35
    }
  })
}

const generateTrafficData = () => {
  return Array.from({ length: 12 }, (_, i) => ({
    time: `${8 + i}:00`,
    inbound: Math.floor(Math.random() * 800) + 200,
    outbound: Math.floor(Math.random() * 600) + 150
  }))
}

const generateDeviceStatusData = () => [
  { name: '在线', value: 125, color: '#10B981' },
  { name: '离线', value: 8, color: '#EF4444' },
  { name: '告警', value: 15, color: '#F59E0B' },
  { name: '维护', value: 3, color: '#6B7280' }
]

const generateTopDevicesData = () => [
  { device: 'Core-Switch-01', cpu: 85, memory: 75, alerts: 3 },
  { device: 'Router-Gateway-01', cpu: 78, memory: 82, alerts: 5 },
  { device: 'Firewall-Main', cpu: 65, memory: 68, alerts: 2 },
  { device: 'Switch-Floor-3', cpu: 60, memory: 55, alerts: 1 },
  { device: 'AP-Conference', cpu: 45, memory: 40, alerts: 0 }
]

export const MonitoringDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = React.useState('24h')
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const [lastUpdate, setLastUpdate] = React.useState(new Date())
  const [loading, setLoading] = React.useState(false)

  // 模拟数据
  const [metricsData, setMetricsData] = React.useState(generateTimeSeriesData())
  const [trafficData, setTrafficData] = React.useState(generateTrafficData())
  const [deviceStatusData] = React.useState(generateDeviceStatusData())
  const [topDevicesData] = React.useState(generateTopDevicesData())

  // 自动刷新
  React.useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setMetricsData(generateTimeSeriesData())
      setTrafficData(generateTrafficData())
      setLastUpdate(new Date())
    }, 30000) // 30秒刷新一次

    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleRefresh = async () => {
    setLoading(true)
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000))
    setMetricsData(generateTimeSeriesData())
    setTrafficData(generateTrafficData())
    setLastUpdate(new Date())
    setLoading(false)
  }

  const handleExport = () => {
    console.log('导出监控数据')
  }

  // 计算总体指标
  const overallMetrics = React.useMemo(() => {
    const totalDevices = deviceStatusData.reduce((sum, item) => sum + item.value, 0)
    const onlineDevices = deviceStatusData.find(item => item.name === '在线')?.value || 0
    const alertDevices = deviceStatusData.find(item => item.name === '告警')?.value || 0
    const offlineDevices = deviceStatusData.find(item => item.name === '离线')?.value || 0
    
    const availabilityRate = totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0
    const avgCpu = metricsData.length > 0 ? 
      metricsData.reduce((sum, item) => sum + item.cpu, 0) / metricsData.length : 0
    const avgMemory = metricsData.length > 0 ? 
      metricsData.reduce((sum, item) => sum + item.memory, 0) / metricsData.length : 0
    const totalTraffic = trafficData.reduce((sum, item) => sum + item.inbound + item.outbound, 0)

    return {
      totalDevices,
      onlineDevices,
      alertDevices,
      offlineDevices,
      availabilityRate,
      avgCpu,
      avgMemory,
      totalTraffic
    }
  }, [deviceStatusData, metricsData, trafficData])

  return (
    <div className="space-y-6 p-6">
      {/* 页面头部 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">监控仪表盘</h1>
          <p className="text-muted-foreground mt-1">
            实时监控网络设备状态和性能指标
            <span className="ml-2 text-sm text-muted-foreground">
              最后更新: {lastUpdate.toLocaleString('zh-CN')}
            </span>
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1小时</SelectItem>
              <SelectItem value="6h">6小时</SelectItem>
              <SelectItem value="24h">24小时</SelectItem>
              <SelectItem value="7d">7天</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            自动刷新
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" />
            导出
          </Button>
        </div>
      </div>

      {/* 关键指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <CompactStatCard
          title="总设备数"
          value={overallMetrics.totalDevices}
          icon={Server}
          iconClassName="text-blue-600 dark:text-blue-400"
          className="lg:col-span-1"
        />
        
        <CompactStatCard
          title="在线设备"
          value={overallMetrics.onlineDevices}
          change="99.2%"
          trend="stable"
          icon={Activity}
          iconClassName="text-green-600 dark:text-green-400"
          className="lg:col-span-1"
        />
        
        <CompactStatCard
          title="告警设备"
          value={overallMetrics.alertDevices}
          change="-2"
          trend="down"
          icon={AlertTriangle}
          iconClassName="text-yellow-600 dark:text-yellow-400"
          className="lg:col-span-1"
        />
        
        <CompactStatCard
          title="可用性"
          value={`${overallMetrics.availabilityRate.toFixed(1)}%`}
          change="+0.3%"
          trend="up"
          icon={Shield}
          iconClassName="text-purple-600 dark:text-purple-400"
          className="lg:col-span-1"
        />
        
        <CompactStatCard
          title="平均CPU"
          value={`${overallMetrics.avgCpu.toFixed(0)}%`}
          change="+5%"
          trend="up"
          icon={Cpu}
          iconClassName="text-red-600 dark:text-red-400"
          className="lg:col-span-1"
        />
        
        <CompactStatCard
          title="总流量"
          value={`${(overallMetrics.totalTraffic / 1000).toFixed(1)} GB`}
          change="+12%"
          trend="up"
          icon={Network}
          iconClassName="text-green-600 dark:text-green-400"
          className="lg:col-span-1"
        />
      </div>

      {/* 主要图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 系统性能趋势 */}
        <LineChartComponent
          title="系统性能趋势"
          subtitle="CPU和内存使用率变化"
          data={metricsData}
          xKey="time"
          lines={[
            { key: 'cpu', name: 'CPU使用率', color: '#EF4444', strokeWidth: 2 },
            { key: 'memory', name: '内存使用率', color: '#3B82F6', strokeWidth: 2 }
          ]}
          height={300}
          formatter={(value) => `${value}%`}
        />

        {/* 网络流量 */}
        <AreaChartComponent
          title="网络流量"
          subtitle="入站和出站流量趋势"
          data={trafficData}
          xKey="time"
          areas={[
            { key: 'inbound', name: '入站流量', color: '#10B981', stackId: 'traffic' },
            { key: 'outbound', name: '出站流量', color: '#06B6D4', stackId: 'traffic' }
          ]}
          height={300}
          formatter={(value) => `${value} MB`}
        />
      </div>

      {/* 设备状态和性能详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 设备状态分布 */}
        <Card>
          <CardHeader>
            <CardTitle>设备状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChartComponent
              data={deviceStatusData}
              height={250}
              innerRadius={60}
              outerRadius={100}
            />
          </CardContent>
        </Card>

        {/* 设备可用性 */}
        <Card>
          <CardHeader>
            <CardTitle>整体可用性</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <CircularProgress
              percentage={overallMetrics.availabilityRate}
              size={150}
              strokeWidth={12}
              color="#10B981"
            />
          </CardContent>
        </Card>

        {/* 高负载设备 */}
        <Card>
          <CardHeader>
            <CardTitle>高负载设备</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topDevicesData.map((device, index) => (
                <motion.div
                  key={device.device}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground">
                      {device.device}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">CPU: {device.cpu}%</span>
                      <span className="text-xs text-muted-foreground">内存: {device.memory}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {device.alerts > 0 && (
                      <Badge variant="error" className="text-xs">
                        {device.alerts} 告警
                      </Badge>
                    )}
                    <div className="w-2 h-8 rounded bg-muted overflow-hidden">
                      <div 
                        className="w-full bg-purple-500 transition-all duration-500"
                        style={{ height: `${Math.max(device.cpu, device.memory)}%` }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 温度监控 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>设备温度监控</CardTitle>
            <Badge variant="info">实时监控</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <LineChartComponent
            data={metricsData}
            xKey="time"
            lines={[
              { key: 'temperature', name: '平均温度', color: '#F59E0B', strokeWidth: 3 }
            ]}
            height={200}
            formatter={(value) => `${value}°C`}
          />
        </CardContent>
      </Card>

      {/* 实时告警 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>实时告警</CardTitle>
            <Button variant="ghost" size="sm">
              查看全部
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                id: 1,
                device: 'Router-Gateway-01',
                message: 'CPU使用率过高 (85%)',
                severity: 'warning',
                time: '2分钟前'
              },
              {
                id: 2,
                device: 'Switch-Floor-2',
                message: '接口eth0/1连接断开',
                severity: 'critical',
                time: '5分钟前'
              },
              {
                id: 3,
                device: 'Firewall-Main',
                message: '异常登录尝试检测',
                severity: 'info',
                time: '8分钟前'
              }
            ].map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-3 rounded-lg border border-border"
              >
                <div className="flex-shrink-0">
                  <AlertTriangle className={`h-5 w-5 ${
                    alert.severity === 'critical' ? 'text-red-500' :
                    alert.severity === 'warning' ? 'text-yellow-500' :
                    'text-blue-500'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {alert.device}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {alert.message}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <Badge 
                    variant={
                      alert.severity === 'critical' ? 'error' :
                      alert.severity === 'warning' ? 'warning' :
                      'info'
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>
                <div className="flex-shrink-0 text-xs text-muted-foreground">
                  {alert.time}
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
