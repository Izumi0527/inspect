// @ts-nocheck
import React, { useState } from 'react'
import { Settings, Plus, Edit, Copy, AlertCircle, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Loading } from '@/components/atoms'
import { useCustomReportConfigs, useGenerateFromConfig } from '../hooks/useReports'
import { ConfigPreviewModal } from './ConfigPreviewModal'
import { downloadWithAuth } from '@/utils/download'
import { downloadReport as fetchDownloadUrl } from '../api/reports.api'

interface Props {
  searchText: string
}

export const CustomReports: React.FC<Props> = ({ searchText }) => {
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [previewConfigId, setPreviewConfigId] = useState<number | null>(null)

  // 使用真实 API 获取配置列表
  const { data: configsData, isLoading, error } = useCustomReportConfigs()
  const generateReport = useGenerateFromConfig()

  // 提取配置列表
  const customConfigs = configsData || []

  // 搜索过滤
  const normalizedKeyword = searchText.trim().toLowerCase()
  const filteredConfigs = normalizedKeyword
    ? customConfigs.filter((config) =>
        config.name.toLowerCase().includes(normalizedKeyword) ||
        config.description?.toLowerCase().includes(normalizedKeyword)
      )
    : customConfigs

  // 处理生成报表
  const handleGenerate = async (configId: string) => {
    try {
      setGeneratingId(configId)
      const result = await generateReport.mutateAsync({
        configId: Number(configId),
        parameters: {
          // 可以添加默认参数，或打开参数配置对话框
          dateRange: {
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
          }
        },
        format: 'pdf'
      })

      try {
        const url = result?.downloadUrl || (await fetchDownloadUrl(result.id))
        if (!url) {
          toast.error('暂无可用的下载链接')
          return
        }

        const format = String(result.format || 'pdf').toLowerCase()
        const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : format
        const filename = `${result.title || result.name || 'custom-report'}.${ext}`
        await downloadWithAuth(url, filename)
        toast.success('自定义报表已生成并开始下载')
      } catch (err) {
        console.error('下载自定义报表失败:', err)
        toast.error('自定义报表生成成功，但下载失败')
      }
    } catch (error) {
      console.error('Failed to generate report:', error)
      toast.error('生成报表失败')
    } finally {
      setGeneratingId(null)
    }
  }

  // 处理编辑配置
  const handleEdit = (configId: string) => {
    console.log('Edit config:', configId)
    // TODO: 打开编辑对话框或导航到编辑页面
  }

  // 处理复制配置
  const handleCopy = (configId: string) => {
    console.log('Copy config:', configId)
    // TODO: 复制配置并打开编辑对话框
  }

  // 处理创建新配置
  const handleCreate = () => {
    console.log('Create new config')
    // TODO: 打开创建配置对话框
  }

  // 处理导入模板
  const handleImport = () => {
    console.log('Import template')
    // TODO: 打开导入模板对话框
  }

  // 处理预览配置
  const handlePreview = (configId: string) => {
    setPreviewConfigId(Number(configId))
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading />
        <span className="ml-2 text-muted-foreground">加载配置中...</span>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400 mr-2" />
        <span className="text-red-600 dark:text-red-400">加载配置失败: {error.message}</span>
      </div>
    )
  }

  // 空状态
  if (customConfigs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            创建自定义报表
          </Button>
          <Button variant="outline" onClick={handleImport}>导入模板</Button>
        </div>
        <div className="bg-muted/40 rounded-lg p-8 text-center">
          <Settings className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">暂无报表配置</h3>
          <p className="text-muted-foreground mb-4">
            创建您的第一个自定义报表配置，或从模板库导入。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" />
          创建自定义报表
        </Button>
        <Button variant="outline" onClick={handleImport}>导入模板</Button>
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
                  <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
                </div>
                <Badge variant={config.type === 'template' ? 'primary' : 'secondary'}>
                  {config.type === 'template' ? '模板' : '自定义'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">最后使用：</span>
                  <span>{config.lastUsed || '从未使用'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">使用次数：</span>
                  <span>{config.usageCount || 0} 次</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePreview(config.id)}
                    title="预览报表数据"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleGenerate(config.id)}
                    disabled={generatingId === config.id}
                  >
                    {generatingId === config.id ? (
                      <>
                        <Loading size="sm" className="mr-2" />
                        生成中...
                      </>
                    ) : (
                      '生成报表'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(config.id)}
                    disabled={config.isDefault}
                    title={config.isDefault ? '默认模板不可编辑' : '编辑配置'}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(config.id)}
                    title="复制配置"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 无搜索结果 */}
      {filteredConfigs.length === 0 && customConfigs.length > 0 && (
        <div className="bg-muted/40 rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            没有找到匹配 "{searchText}" 的配置
          </p>
        </div>
      )}

      {/* 报表生成器 */}
      <Card>
        <CardHeader>
          <CardTitle>自定义报表生成器</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/40 rounded-lg p-8 text-center">
            <Settings className="w-12 h-12 text-muted-foreground/80 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">报表生成器</h3>
            <p className="text-muted-foreground mb-4">
              可视化报表生成器正在开发中，即将支持拖拽式报表设计。
            </p>
            <Button disabled>进入生成器</Button>
          </div>
        </CardContent>
      </Card>

      {/* 报表预览模态框 */}
      {previewConfigId !== null && (
        <ConfigPreviewModal
          configId={previewConfigId}
          parameters={{
            dateRange: {
              startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              endDate: new Date().toISOString().split('T')[0]
            }
          }}
          onClose={() => setPreviewConfigId(null)}
          onGenerate={() => {
            if (previewConfigId) handleGenerate(String(previewConfigId))
            setPreviewConfigId(null)
          }}
        />
      )}
    </div>
  )
}
