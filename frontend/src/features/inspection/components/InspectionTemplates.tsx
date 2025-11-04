import React from 'react'
import { motion } from 'framer-motion'
import { 
  Plus, 
  Edit, 
  Copy, 
  Trash2, 
  Eye, 
  FileText, 
  Shield, 
  Monitor, 
  Settings,
  AlertCircle
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Table,
  Column
} from '@/components/atoms'
import type { BadgeProps } from '@/components/atoms'
import { 
  useInspectionTemplates, 
  useCloneTemplate 
} from '../hooks/useInspection'
import { InspectionTemplate } from '../types'

interface Props {
  searchText: string
}

export const InspectionTemplates: React.FC<Props> = ({ searchText }) => {
  const { data: templatesData, isLoading } = useInspectionTemplates()
  const cloneTemplate = useCloneTemplate()

  const templates: InspectionTemplate[] = templatesData?.templates ?? []

  // 过滤模板列表
  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredTemplates = templates.filter(template => {
    const name = template.name?.toLowerCase() ?? ''
    const description = template.description?.toLowerCase() ?? ''
    return (
      !normalizedKeyword ||
      name.includes(normalizedKeyword) ||
      description.includes(normalizedKeyword)
    )
  })

  const handleCloneTemplate = async (template: InspectionTemplate) => {
    try {
      await cloneTemplate.mutateAsync({
        id: template.id,
        name: `${template.name} - 副本`
      })
    } catch (error) {
      console.error('Clone template failed:', error)
    }
  }

  const getCategoryIcon = (category: InspectionTemplate['category']) => {
    switch (category) {
      case 'network':
        return <Monitor className="w-4 h-4" />
      case 'system':
        return <Settings className="w-4 h-4" />
      case 'security':
        return <Shield className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getCategoryLabel = (category: InspectionTemplate['category']) => {
    const labels = {
      network: '网络监控',
      system: '系统检查',
      security: '安全检测',
      custom: '自定义'
    }
    return labels[category as keyof typeof labels] || category
  }

  const getCategoryBadgeVariant = (category: InspectionTemplate['category']): BadgeProps['variant'] => {
    switch (category) {
      case 'network':
        return 'primary'
      case 'system':
        return 'secondary'
      case 'security':
        return 'warning'
      default:
        return 'outline'
    }
  }

  const columns: Column<InspectionTemplate>[] = [
    {
      key: 'name',
      title: '模板名称',
      render: (_value, template) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            {getCategoryIcon(template.category)}
            <span className="font-medium text-gray-900">{template.name}</span>
            {template.isBuiltIn && (
              <Badge variant="success" size="sm">内置</Badge>
            )}
          </div>
          <span className="text-sm text-gray-500 line-clamp-2 mt-1">{template.description}</span>
        </div>
      )
    },
    {
      key: 'category',
      title: '类别',
      render: (_value, template) => (
        <Badge variant={getCategoryBadgeVariant(template.category)}>
          {getCategoryLabel(template.category)}
        </Badge>
      )
    },
    {
      key: 'deviceTypes',
      title: '支持设备',
      render: (_value, template) => {
        const deviceTypes = template.deviceTypes ?? []
        return (
          <div className="flex flex-wrap gap-1">
            {deviceTypes.slice(0, 3).map((type: string) => (
              <Badge key={type} variant="outline" size="sm">
                {type}
              </Badge>
            ))}
            {deviceTypes.length > 3 && (
              <Badge variant="outline" size="sm">
                +{deviceTypes.length - 3}
              </Badge>
            )}
          </div>
        )
      }
    },
    {
      key: 'checkItems',
      title: '检查项',
      render: (_value, template) => (
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="font-medium">{template.checkItems.length}</span>
        </div>
      )
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      render: (_value, template) => (
        <div className="text-sm text-gray-600">
          {new Date(template.updatedAt).toLocaleDateString()}
        </div>
      )
    },
    {
      key: 'actions',
      title: '操作',
      render: (_value, template) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => console.log('查看模板详情:', template.id)}
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleCloneTemplate(template)}
            disabled={cloneTemplate.isPending}
            title="复制模板"
          >
            <Copy className="w-4 h-4" />
          </Button>
          {!template.isBuiltIn && (
            <>
              <Button
                size="sm"
                variant="ghost"
                title="编辑"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => console.log('删除模板', template.id)}
                title="删除"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </>
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
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">巡检模板管理</h3>
          <Badge variant="secondary">{filteredTemplates.length} 项</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Copy className="w-4 h-4 mr-2" />
            导入模板
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            创建模板
          </Button>
        </div>
      </div>

      {/* 快速统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: '网络监控', count: templates.filter(t => t.category === 'network').length, icon: Monitor, color: 'blue' },
          { label: '系统检查', count: templates.filter(t => t.category === 'system').length, icon: Settings, color: 'green' },
          { label: '安全检测', count: templates.filter(t => t.category === 'security').length, icon: Shield, color: 'red' },
          { label: '自定义', count: templates.filter(t => t.category === 'custom').length, icon: FileText, color: 'purple' }
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${item.color}-100`}>
                  <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{item.count}</div>
                  <div className="text-sm text-gray-600">{item.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 模板列表 */}
      {filteredTemplates.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Table
            data={filteredTemplates}
            columns={columns}
            className="bg-white rounded-lg shadow-sm"
          />
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-gray-400" />
              <div>
                <h3 className="text-lg font-medium text-gray-900">暂无巡检模板</h3>
                <p className="text-gray-500 mt-1">
                  {searchText ? '没有找到匹配的模板' : '开始创建您的第一个巡检模板'}
                </p>
              </div>
              {!searchText && (
                <Button className="mt-2">
                  <Plus className="w-4 h-4 mr-2" />
                  创建模板
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}