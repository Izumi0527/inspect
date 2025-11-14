'use client'

import { useSystemMonitoring } from '../../hooks/useSystemMonitoring'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'

// 格式化文件大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 格式化运行时间
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days}天 ${hours}小时 ${minutes}分钟`
}

// 进度条
function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div
        className={`h-2.5 rounded-full ${className || 'bg-blue-600'}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

// 服务状态Badge
function ServiceStatusBadge({ status }: { status: 'healthy' | 'unhealthy' | 'degraded' }) {
  const config = {
    healthy: {
      icon: CheckCircle,
      className: 'bg-green-100 text-green-800',
      label: '正常',
    },
    unhealthy: {
      icon: XCircle,
      className: 'bg-red-100 text-red-800',
      label: '异常',
    },
    degraded: {
      icon: AlertTriangle,
      className: 'bg-yellow-100 text-yellow-800',
      label: '降级',
    },
  }
  const { icon: Icon, className, label } = config[status]
  return (
    <Badge className={className}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </Badge>
  )
}

export function MonitoringDashboard() {
  const { metrics, services, system, isLoading } = useSystemMonitoring(true)

  // 加载状态
  if (isLoading || !metrics) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 系统信息卡片 */}
      {system && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">系统信息</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">主机名</p>
              <p className="font-medium">{system.hostname}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">操作系统</p>
              <p className="font-medium">{system.platform}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">系统运行时间</p>
              <p className="font-medium">{formatUptime(system.uptime)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">进程运行时间</p>
              <p className="font-medium">{formatUptime(system.processUptime)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 资源监控卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold">CPU</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">使用率</span>
                <span className="text-2xl font-bold text-blue-600">
                  {metrics.cpu.usage.toFixed(1)}%
                </span>
              </div>
              <ProgressBar
                value={metrics.cpu.usage}
                className={
                  metrics.cpu.usage > 80
                    ? 'bg-red-600'
                    : metrics.cpu.usage > 60
                      ? 'bg-yellow-500'
                      : 'bg-blue-600'
                }
              />
            </div>
            <div className="text-sm text-gray-600">
              <p>核心数: {metrics.cpu.cores}</p>
              {metrics.cpu.temperature && <p>温度: {metrics.cpu.temperature}°C</p>}
            </div>
          </div>
        </Card>

        {/* 内存 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <MemoryStick className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold">内存</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">使用率</span>
                <span className="text-2xl font-bold text-green-600">
                  {metrics.memory.usage.toFixed(1)}%
                </span>
              </div>
              <ProgressBar
                value={metrics.memory.usage}
                className={
                  metrics.memory.usage > 80
                    ? 'bg-red-600'
                    : metrics.memory.usage > 60
                      ? 'bg-yellow-500'
                      : 'bg-green-600'
                }
              />
            </div>
            <div className="text-sm text-gray-600">
              <p>已用: {formatBytes(metrics.memory.used)}</p>
              <p>总计: {formatBytes(metrics.memory.total)}</p>
            </div>
          </div>
        </Card>

        {/* 磁盘 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold">磁盘</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">使用率</span>
                <span className="text-2xl font-bold text-purple-600">
                  {metrics.disk.usage.toFixed(1)}%
                </span>
              </div>
              <ProgressBar
                value={metrics.disk.usage}
                className={
                  metrics.disk.usage > 80
                    ? 'bg-red-600'
                    : metrics.disk.usage > 60
                      ? 'bg-yellow-500'
                      : 'bg-purple-600'
                }
              />
            </div>
            <div className="text-sm text-gray-600">
              <p>已用: {formatBytes(metrics.disk.used)}</p>
              <p>总计: {formatBytes(metrics.disk.total)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 网络流量 */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-semibold">网络流量</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">接收</p>
            <p className="text-xl font-bold text-orange-600">
              {formatBytes(metrics.network.bytesReceived)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">发送</p>
            <p className="text-xl font-bold text-orange-600">
              {formatBytes(metrics.network.bytesSent)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">接收包</p>
            <p className="text-xl font-bold">{metrics.network.packetsReceived.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">发送包</p>
            <p className="text-xl font-bold">{metrics.network.packetsSent.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* 服务健康状态 */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold">服务状态</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-700">服务名称</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">状态</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">响应时间</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">运行时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {services.map((service) => (
                <tr key={service.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{service.name}</td>
                  <td className="px-4 py-3">
                    <ServiceStatusBadge status={service.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{service.responseTime}ms</td>
                  <td className="px-4 py-3 text-gray-600">{formatUptime(service.uptime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
