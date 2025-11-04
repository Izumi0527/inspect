import React from 'react'
import { Monitor, Activity, Database, Settings } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { useQuickActions } from '../hooks/useDashboard'

interface QuickActionsCardProps {
  onActionComplete?: (actionType: string) => void
}

export const QuickActionsCard: React.FC<QuickActionsCardProps> = ({ 
  onActionComplete 
}) => {
  const { loading, error, executeAction } = useQuickActions()

  const actions = [
    {
      key: 'deviceScan',
      title: '设备扫描',
      icon: Monitor,
      description: '扫描网络中的设备',
      colorScheme: {
        hover: 'hover:bg-blue-50 hover:text-blue-600',
        text: 'text-blue-600'
      }
    },
    {
      key: 'performanceTest',
      title: '性能测试',
      icon: Activity,
      description: '测试网络性能',
      colorScheme: {
        hover: 'hover:bg-green-50 hover:text-green-600',
        text: 'text-green-600'
      }
    },
    {
      key: 'generateReport',
      title: '生成报表',
      icon: Database,
      description: '生成系统报表',
      colorScheme: {
        hover: 'hover:bg-purple-50 hover:text-purple-600',
        text: 'text-purple-600'
      }
    },
    {
      key: 'systemConfig',
      title: '系统配置',
      icon: Settings,
      description: '配置系统参数',
      colorScheme: {
        hover: 'hover:bg-orange-50 hover:text-orange-600',
        text: 'text-orange-600'
      }
    }
  ]

  const handleActionClick = async (actionKey: string) => {
    try {
      await executeAction(actionKey)
      onActionComplete?.(actionKey)
    } catch (err) {
      console.error(`执行操作 ${actionKey} 失败:`, err)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>快速操作</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          {actions.map((action) => {
            const IconComponent = action.icon
            const isLoading = loading[action.key]
            
            return (
              <Button
                key={action.key}
                variant="outline"
                disabled={isLoading}
                onClick={() => handleActionClick(action.key)}
                className={`h-20 flex flex-col items-center justify-center gap-2 ${action.colorScheme.hover} transition-colors`}
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                ) : (
                  <IconComponent className="w-6 h-6" />
                )}
                <span className="text-sm font-medium">
                  {isLoading ? '执行中...' : action.title}
                </span>
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}