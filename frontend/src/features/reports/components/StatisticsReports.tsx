import React from 'react'
import { BarChart3, Users, Target, Activity } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  searchText: string
}

export const StatisticsReports: React.FC<Props> = ({ searchText }) => {
  // 模拟统计数据
  const deviceStats = [
    { name: '路由器', count: 25, online: 23, offline: 2 },
    { name: '交换机', count: 18, online: 17, offline: 1 },
    { name: '防火墙', count: 12, online: 11, offline: 1 },
    { name: '服务器', count: 8, online: 8, offline: 0 }
  ]

  const performanceStats = [
    { name: '优秀', value: 45, color: '#10B981' },
    { name: '良好', value: 32, color: '#3B82F6' },
    { name: '一般', value: 18, color: '#F59E0B' },
    { name: '较差', value: 5, color: '#EF4444' }
  ]

  const rankingData = [
    { rank: 1, name: 'Router-001', type: '路由器', availability: 99.8, score: 95.2, status: '优秀' },
    { rank: 2, name: 'Switch-003', type: '交换机', availability: 99.5, score: 92.1, status: '优秀' },
    { rank: 3, name: 'Firewall-002', type: '防火墙', availability: 98.9, score: 89.7, status: '良好' },
    { rank: 4, name: 'Server-005', type: '服务器', availability: 98.2, score: 87.3, status: '良好' },
    { rank: 5, name: 'Router-007', type: '路由器', availability: 96.8, score: 83.5, status: '一般' }
  ]

  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredDeviceStats = normalizedKeyword
    ? deviceStats.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : deviceStats
  const filteredPerformanceStats = normalizedKeyword
    ? performanceStats.filter((item) => item.name.toLowerCase().includes(normalizedKeyword))
    : performanceStats
  const filteredRankingData = normalizedKeyword
    ? rankingData.filter((item) =>
        item.name.toLowerCase().includes(normalizedKeyword) ||
        item.type.toLowerCase().includes(normalizedKeyword) ||
        item.status.toLowerCase().includes(normalizedKeyword)
      )
    : rankingData

  return (
    <div className="space-y-6">
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button>生成统计报表</Button>
        <Button variant="outline">导出数据</Button>
      </div>

      {/* KPI指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { title: '设备总数', value: '63', change: '+2', icon: Users, color: 'blue' },
          { title: '在线率', value: '93.7%', change: '+1.2%', icon: Activity, color: 'green' },
          { title: '平均评分', value: '87.5', change: '+2.3', icon: Target, color: 'purple' },
          { title: '故障率', value: '6.3%', change: '-0.5%', icon: BarChart3, color: 'red' }
        ].map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{kpi.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{kpi.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`text-sm font-medium text-${kpi.color}-600`}>
                      {kpi.change}
                    </span>
                    <span className="text-sm text-gray-500">vs 上月</span>
                  </div>
                </div>
                <div className={`p-3 bg-${kpi.color}-100 rounded-lg`}>
                  <kpi.icon className={`w-6 h-6 text-${kpi.color}-600`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 统计图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>设备类型分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filteredDeviceStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="online" stackId="a" fill="#10B981" name="在线" />
                <Bar dataKey="offline" stackId="a" fill="#EF4444" name="离线" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>性能评级分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={filteredPerformanceStats}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {filteredPerformanceStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 排名表格 */}
      <Card>
        <CardHeader>
          <CardTitle>设备性能排名</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">排名</th>
                  <th className="text-left p-3">设备名称</th>
                  <th className="text-left p-3">类型</th>
                  <th className="text-left p-3">可用性</th>
                  <th className="text-left p-3">性能评分</th>
                  <th className="text-left p-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredRankingData.map((item) => (
                  <tr key={item.rank} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">#{item.rank}</td>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3">{item.type}</td>
                    <td className="p-3">{item.availability}%</td>
                    <td className="p-3">{item.score}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === '优秀' ? 'bg-green-100 text-green-800' :
                        item.status === '良好' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}