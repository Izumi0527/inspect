import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Database, Monitor, Play, Settings } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/atoms'
import { usePermission } from '@/lib/contexts/auth-context'
import { Permission } from '@/lib/types/auth.types'

export const QuickActionsCard: React.FC = () => {
  const router = useRouter()
  const canReadDevices = usePermission(Permission.DEVICES_READ)
  const canReadInspections = usePermission(Permission.INSPECTIONS_READ)
  const canReadReports = usePermission(Permission.REPORTS_READ)
  const canConfigSystem = usePermission(Permission.SYSTEM_CONFIG)

  const actions = [
    {
      key: 'deviceScan',
      title: '设备扫描',
      icon: Monitor,
      description: '前往设备中心发起扫描',
      colorScheme: {
        hover: 'hover:bg-blue-50 hover:text-blue-600',
        text: 'text-blue-600'
      },
      targetPath: '/devices',
      visible: canReadDevices,
    },
    {
      key: 'manualInspection',
      title: '手动巡检',
      icon: Play,
      description: '前往巡检中心执行任务',
      colorScheme: {
        hover: 'hover:bg-green-50 hover:text-green-600',
        text: 'text-green-600'
      },
      targetPath: '/inspection',
      visible: canReadInspections,
    },
    {
      key: 'generateReport',
      title: '生成报表',
      icon: Database,
      description: '前往报表中心创建报表',
      colorScheme: {
        hover: 'hover:bg-purple-50 hover:text-purple-600',
        text: 'text-purple-600'
      },
      targetPath: '/reports',
      visible: canReadReports,
    },
    {
      key: 'systemConfig',
      title: '系统配置',
      icon: Settings,
      description: '配置系统参数',
      colorScheme: {
        hover: 'hover:bg-orange-50 hover:text-orange-600',
        text: 'text-orange-600'
      },
      targetPath: '/settings',
      visible: canConfigSystem,
    }
  ]
  const visibleActions = actions.filter((action) => action.visible)

  const handleActionClick = (targetPath: string) => {
    router.push(targetPath)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>快捷入口</CardTitle>
      </CardHeader>
      <CardContent>
        {visibleActions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">当前账号暂无可用快捷入口</p>
            <p className="mt-2 text-xs text-muted-foreground">
              可进入模块会随角色授权自动更新。
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-4">
          {visibleActions.map((action) => {
            const IconComponent = action.icon

            return (
              <Button
                key={action.key}
                variant="outline"
                aria-label={action.title}
                onClick={() => handleActionClick(action.targetPath)}
                className={`h-20 flex flex-col items-center justify-center gap-2 ${action.colorScheme.hover} transition-colors`}
              >
                <IconComponent className="w-6 h-6" />
                <span className="text-sm font-medium">{action.title}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  进入模块
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Button>
            )
          })}
        </div>
        )}
      </CardContent>
    </Card>
  )
}
