// 系统资源指标
export interface SystemMetrics {
  cpu: {
    usage: number // CPU使用率 0-100
    cores: number // CPU核心数
    temperature?: number // CPU温度
  }
  memory: {
    total: number // 总内存（字节）
    used: number // 已使用内存（字节）
    free: number // 空闲内存（字节）
    usage: number // 内存使用率 0-100
  }
  disk: {
    total: number // 总磁盘空间（字节）
    used: number // 已使用空间（字节）
    free: number // 空闲空间（字节）
    usage: number // 磁盘使用率 0-100
  }
  network: {
    bytesReceived: number // 接收字节数
    bytesSent: number // 发送字节数
    packetsReceived: number // 接收数据包数
    packetsSent: number // 发送数据包数
  }
}

// 服务健康状态
export interface ServiceHealth {
  name: string
  status: 'healthy' | 'unhealthy' | 'degraded'
  responseTime: number // 响应时间（毫秒）
  uptime: number // 运行时间（秒）
  lastCheck: string // 最后检查时间
  errorMessage?: string
}

// 系统信息
export interface SystemInfo {
  hostname: string
  platform: string
  osVersion: string
  nodeVersion: string
  uptime: number // 系统运行时间（秒）
  processUptime: number // 进程运行时间（秒）
}

// 监控响应
export interface MonitoringResponse {
  metrics: SystemMetrics
  services: ServiceHealth[]
  system: SystemInfo
  timestamp: string
}

// 历史数据点
export interface MetricDataPoint {
  timestamp: string
  value: number
}

// 历史数据
export interface MetricHistory {
  cpu: MetricDataPoint[]
  memory: MetricDataPoint[]
  disk: MetricDataPoint[]
}
