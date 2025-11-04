import React from 'react'
import { Settings, Plus, Edit, Copy } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/atoms'

interface Props {
  searchText: string
}

export const CustomReports: React.FC<Props> = ({ searchText }) => {
  const customConfigs = [
    {
      id: '1',
      name: '月度综合报告',
      description: '包含设备状态、性能指标和趋势分析的综合报告',
      type: 'template',
      lastUsed: '2024-01-15',
      usageCount: 12
    },
    {
      id: '2', 
      name: '故障分析报告',
      description: '专注于故障分析和根因排查的专业报告',
      type: 'custom',
      lastUsed: '2024-01-12',
      usageCount: 8
    },
    {
      id: '3',
      name: '性能评估报告',
      description: '设备性能评估和优化建议报告',
      type: 'template',
      lastUsed: '2024-01-10',
      usageCount: 15
    }
  ]

  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredConfigs = normalizedKeyword
    ? customConfigs.filter((config) =>
        config.name.toLowerCase().includes(normalizedKeyword) ||
        config.description.toLowerCase().includes(normalizedKeyword)
      )
    : customConfigs

  return (
    <div className="space-y-6">
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          创建自定义报表
        </Button>
        <Button variant="outline">导入模板</Button>
      </div>

      {/* 自定义报表配置列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredConfigs.map((config) => (
          <Card key={config.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    {config.name}
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">{config.description}</p>
                </div>
                <Badge variant={config.type === 'template' ? 'primary' : 'secondary'}>
                  {config.type === 'template' ? '模板' : '自定义'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">最后使用：</span>
                  <span>{config.lastUsed}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">使用次数：</span>
                  <span>{config.usageCount} 次</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1">生成报表</Button>
                  <Button size="sm" variant="outline">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 报表生成器 */}
      <Card>
        <CardHeader>
          <CardTitle>自定义报表生成器</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">报表生成器</h3>
            <p className="text-gray-600 mb-4">
              可视化报表生成器正在开发中，即将支持拖拽式报表设计。
            </p>
            <Button disabled>进入生成器</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}