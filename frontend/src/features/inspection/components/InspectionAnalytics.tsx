import React, { useState } from 'react'
import {
  TrendingUp,
  BarChart3,
  Activity,
  Target,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/atoms'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import {
  useInspectionTrends,
  useInspectionStats,
  useDeviceDistribution,
  useProblemDistribution
} from '../hooks/useInspection'

export const InspectionAnalytics: React.FC = () => {
  const [timePeriod, setTimePeriod] = useState<'day' | 'week' | 'month'>('week')
  const [dateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })

  const { data: stats, isLoading: statsLoading } = useInspectionStats()
  const { data: trends, isLoading: trendsLoading } = useInspectionTrends({
    period: timePeriod,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  })
  const { data: deviceDistribution, isLoading: deviceLoading } = useDeviceDistribution()
  const { data: problemDistribution, isLoading: problemLoading } = useProblemDistribution()

  const handlePeriodChange = (value: string) => {
    if (value === 'day' || value === 'week' || value === 'month') {
      setTimePeriod(value)
    }
  }

  if (statsLoading || trendsLoading || deviceLoading || problemLoading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-64 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">统计分析</h3>
          <p className="text-gray-600 text-sm">巡检数据的趋势分析和统计报告</p>
        </div>
        <div className="flex gap-2">
          <Select value={timePeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="时间周期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">按天</SelectItem>
              <SelectItem value="week">按周</SelectItem>
              <SelectItem value="month">按月</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            导出报告
          </Button>
        </div>
      </div>

      {/* KPI 指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            title: '总执行次数',
            value: stats?.todayExecutions || 0,
            change: stats?.changes?.executionsChange || '0.0%',
            trend: 'up',
            icon: Activity,
            color: 'blue'
          },
          {
            title: '成功率',
            value: `${stats?.successRate?.toFixed(1) || 0}%`,
            change: stats?.changes?.successRateChange || '0.0%',
            trend: 'up',
            icon: Target,
            color: 'green'
          },
          {
            title: '平均评分',
            value: stats?.avgScore?.toFixed(1) || 0,
            change: stats?.changes?.avgScoreChange || '0.0%',
            trend: 'up',
            icon: TrendingUp,
            color: 'purple'
          },
          {
            title: '活跃策略',
            value: stats?.activeStrategies || 0,
            change: stats?.changes?.strategiesChange || '0',
            trend: 'up',
            icon: BarChart3,
            color: 'orange'
          }
        ].map((metric) => (
          <Card key={metric.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{metric.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className={`w-4 h-4 text-${metric.color}-500`} />
                    <span className={`text-sm font-medium text-${metric.color}-600`}>
                      {metric.change}
                    </span>
                    <span className="text-sm text-gray-500">vs 上周</span>
                  </div>
                </div>
                <div className={`p-3 bg-${metric.color}-100 rounded-lg`}>
                  <metric.icon className={`w-6 h-6 text-${metric.color}-600`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 执行趋势图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 执行次数趋势 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              执行次数趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trends || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="executions"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.1}
                  name="总执行"
                />
                <Area
                  type="monotone"
                  dataKey="success"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.1}
                  name="成功执行"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 巡检评分趋势 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              巡检评分趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  stroke="#8B5CF6"
                  strokeWidth={3}
                  dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                  name="平均评分"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 设备分布和问题分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 设备类型分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-600" />
              设备类型分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={deviceDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(deviceDistribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}台`, '数量']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 问题分布统计 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-red-600" />
              常见问题分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={problemDistribution || []} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 12 }}
                  width={80}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 详细数据表格 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            最近执行详情
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">日期</th>
                  <th className="text-left p-3">执行次数</th>
                  <th className="text-left p-3">成功率</th>
                  <th className="text-left p-3">平均评分</th>
                  <th className="text-left p-3">问题数</th>
                </tr>
              </thead>
              <tbody>
                {(trends || []).slice(-7).map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3">{new Date(item.date).toLocaleDateString()}</td>
                    <td className="p-3">{item.executions}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        (item.success / item.executions * 100) >= 90
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {((item.success / item.executions) * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${
                        item.avgScore >= 90 ? 'text-green-600' :
                        item.avgScore >= 70 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {item.avgScore}
                      </span>
                    </td>
                    <td className="p-3">{item.failed}</td>
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
