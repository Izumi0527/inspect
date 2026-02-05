import type {
  SystemPerformanceDataPoint,
  TemperatureDataPoint,
  DeviceStatusDistribution,
  AvailabilityData,
  NetworkTrafficDataPoint,
  StatCardData,
  Alert,
  MonitoringDataV2,
} from '../types'

/**
 * 生成随机数(指定范围)
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/**
 * 生成随机整数(指定范围)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(randomInRange(min, max))
}

/**
 * 根据时间范围计算数据点数量和时间间隔
 */
function getTimeRangeConfig(timeRange: string): { count: number; intervalMinutes: number } {
  switch (timeRange) {
    case '1h':
      return { count: 12, intervalMinutes: 5 } // 每5分钟一个点
    case '6h':
      return { count: 36, intervalMinutes: 10 } // 每10分钟一个点
    case '24h':
      return { count: 48, intervalMinutes: 30 } // 每30分钟一个点
    case '7d':
      return { count: 168, intervalMinutes: 60 } // 每小时一个点
    default:
      return { count: 48, intervalMinutes: 30 } // 默认24小时
  }
}

/**
 * 生成系统性能历史数据
 */
export function generateMockSystemPerformance(timeRange: string): SystemPerformanceDataPoint[] {
  const { count, intervalMinutes } = getTimeRangeConfig(timeRange)
  const data: SystemPerformanceDataPoint[] = []
  const now = new Date()

  // 生成基础趋势
  let cpuBase = randomInRange(40, 60)
  let memoryBase = randomInRange(50, 70)
  let networkBase = randomInRange(100, 300)

  for (let i = count - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000)

    // 添加随机波动和趋势
    cpuBase += randomInRange(-5, 5)
    memoryBase += randomInRange(-3, 3)
    networkBase += randomInRange(-20, 20)

    // 限制范围
    const cpu = Math.max(20, Math.min(95, cpuBase))
    const memory = Math.max(30, Math.min(90, memoryBase))
    const network = Math.max(50, Math.min(500, networkBase))

    data.push({
      timestamp: timestamp.toISOString(),
      cpu: Number(cpu.toFixed(1)),
      memory: Number(memory.toFixed(1)),
      network: Number(network.toFixed(1)),
    })
  }

  return data
}

/**
 * 生成设备温度历史数据
 */
export function generateMockTemperatureHistory(timeRange: string): TemperatureDataPoint[] {
  const { count, intervalMinutes } = getTimeRangeConfig(timeRange)
  const data: TemperatureDataPoint[] = []
  const now = new Date()

  // 5个设备的温度基准
  const devices = ['Router-01', 'Switch-02', 'Firewall-03', 'Server-04', 'AP-05']
  const deviceTemps = devices.reduce(
    (acc, device) => {
      acc[device] = randomInRange(45, 65)
      return acc
    },
    {} as Record<string, number>
  )

  for (let i = count - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000)
    const deviceData: Record<string, number> = {}

    devices.forEach((device) => {
      // 温度缓慢变化
      deviceTemps[device] += randomInRange(-2, 2)
      deviceTemps[device] = Math.max(40, Math.min(80, deviceTemps[device]))
      deviceData[device] = Number(deviceTemps[device].toFixed(1))
    })

    data.push({
      timestamp: timestamp.toISOString(),
      devices: deviceData,
    })
  }

  return data
}

/**
 * 生成设备状态分布数据
 */
export function generateMockDeviceStatusDistribution(): DeviceStatusDistribution {
  const total = randomInt(80, 120)
  const healthy = randomInt(Math.floor(total * 0.6), Math.floor(total * 0.8))
  const warning = randomInt(Math.floor(total * 0.1), Math.floor(total * 0.2))
  const critical = randomInt(0, Math.floor(total * 0.05))
  const offline = total - healthy - warning - critical

  return {
    healthy,
    warning,
    critical,
    offline: Math.max(0, offline),
  }
}

/**
 * 生成整体可用性数据
 */
export function generateMockAvailability(): AvailabilityData {
  const current = randomInRange(98.5, 99.99)
  const target = 99.9
  const diff = current - target
  let trend: 'up' | 'down' | 'stable' = 'stable'

  if (diff > 0.1) trend = 'up'
  else if (diff < -0.1) trend = 'down'

  return {
    current: Number(current.toFixed(2)),
    target,
    trend,
    lastUpdate: new Date().toISOString(),
  }
}

/**
 * 生成网络流量历史数据(堆叠面积图)
 */
export function generateMockNetworkTrafficHistory(timeRange: string): NetworkTrafficDataPoint[] {
  const { count, intervalMinutes } = getTimeRangeConfig(timeRange)
  const data: NetworkTrafficDataPoint[] = []
  const now = new Date()

  let inboundBase = randomInRange(200, 400)
  let outboundBase = randomInRange(100, 300)

  for (let i = count - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000)

    // 模拟日间/夜间流量变化
    const hour = timestamp.getHours()
    const dayFactor = hour >= 9 && hour <= 18 ? 1.5 : 0.7

    inboundBase += randomInRange(-30, 30)
    outboundBase += randomInRange(-20, 20)

    const inbound = Math.max(50, Math.min(800, inboundBase * dayFactor))
    const outbound = Math.max(30, Math.min(600, outboundBase * dayFactor))

    data.push({
      timestamp: timestamp.toISOString(),
      inbound: Number(inbound.toFixed(1)),
      outbound: Number(outbound.toFixed(1)),
    })
  }

  return data
}

/**
 * 生成统计卡片数据(6个)
 */
export function generateMockStatsV2(): StatCardData[] {
  return [
    {
      id: 'total_devices',
      title: '总设备',
      value: randomInt(80, 120),
      change: `+${randomInt(1, 5)}`,
      trend: 'up',
      icon: 'devices',
      color: 'blue',
    },
    {
      id: 'availability',
      title: '整体可用性',
      value: `${randomInRange(98, 99.99).toFixed(2)}%`,
      change: `+${randomInRange(0.1, 0.5).toFixed(2)}%`,
      trend: 'up',
      icon: 'check',
      color: 'green',
    },
    {
      id: 'active_alerts',
      title: '活跃告警',
      value: randomInt(2, 15),
      change: `-${randomInt(1, 3)}`,
      trend: 'down',
      icon: 'alert',
      color: 'red',
    },
    {
      id: 'avg_cpu',
      title: '平均 CPU 使用率',
      value: `${randomInRange(45, 75).toFixed(1)}%`,
      change: `${randomInRange(-5, 5).toFixed(1)}%`,
      trend: randomInRange(0, 1) > 0.5 ? 'up' : 'down',
      icon: 'cpu',
      color: 'purple',
    },
    {
      id: 'avg_memory',
      title: '平均内存使用率',
      value: `${randomInRange(50, 80).toFixed(1)}%`,
      change: `${randomInRange(-3, 3).toFixed(1)}%`,
      trend: randomInRange(0, 1) > 0.5 ? 'up' : 'stable',
      icon: 'memory',
      color: 'orange',
    },
    {
      id: 'avg_network',
      title: '峰值流量',
      value: `${randomInRange(300, 800).toFixed(0)} Mbps`,
      change: `+${randomInRange(10, 50).toFixed(0)} Mbps`,
      trend: 'up',
      icon: 'network',
      color: 'cyan',
    },
  ]
}

/**
 * 生成实时告警列表
 */
export function generateMockRealtimeAlerts(count: number = 5): Alert[] {
  const severities: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info']
  const devices = ['Router-01', 'Switch-02', 'Firewall-03', 'Server-04', 'AP-05', 'Gateway-06']
  const messages = [
    'CPU 使用率过高 (85%)',
    '接口 eth0/1 连接断开',
    '异常登录尝试检测',
    '内存使用率达到阈值 (90%)',
    '磁盘空间不足 (剩余 5%)',
    '温度过高警告 (78°C)',
    '网络延迟异常 (200ms)',
    'SNMP 连接超时',
    '固件更新可用',
    '备份任务失败',
  ]

  const alerts: Alert[] = []
  const now = new Date()

  for (let i = 0; i < count; i++) {
    const minutesAgo = randomInt(1, 30)
    const timestamp = new Date(now.getTime() - minutesAgo * 60 * 1000)

    alerts.push({
      id: i + 1,
      severity: severities[randomInt(0, severities.length)],
      deviceName: devices[randomInt(0, devices.length)],
      message: messages[randomInt(0, messages.length)],
      time: `${minutesAgo}分钟前`,
      timestamp: timestamp.toISOString(),
    })
  }

  // 按时间倒序排序(最新的在前)
  return alerts.sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
}

/**
 * 生成完整的 v2 监控数据
 */
export function generateMockMonitoringDataV2(timeRange: string = '24h'): Partial<MonitoringDataV2> {
  return {
    systemPerformance: generateMockSystemPerformance(timeRange),
    temperatureHistory: generateMockTemperatureHistory(timeRange),
    deviceStatusDistribution: generateMockDeviceStatusDistribution(),
    availability: generateMockAvailability(),
    networkTrafficHistory: generateMockNetworkTrafficHistory(timeRange),
    statsV2: generateMockStatsV2(),
    realtimeAlerts: generateMockRealtimeAlerts(5),
    lastUpdate: new Date().toISOString(),
  }
}
