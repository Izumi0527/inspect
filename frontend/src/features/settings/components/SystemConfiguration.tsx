import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Upload, 
  Download, 
  Edit, 
  Check, 
  X,
  AlertCircle,
  Info
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ConfirmModal
} from '@/components/atoms'
import {
  useConfigGroups,
  useSystemConfigs,
  useUpdateConfig,
  useUpdateConfigs,
  useResetConfig,
  useSettingsEditor
} from '../hooks'
import { SystemConfig } from '../types'
import { systemConfigApi } from '../api/settings.api'
import toast from 'react-hot-toast'

interface Props {
  searchText: string
}

export const SystemConfiguration: React.FC<Props> = ({ searchText }) => {
  const [selectedGroup, setSelectedGroup] = useState('system')
  const [importModal, setImportModal] = useState(false)
  const [resetConfirm, setResetConfirm] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)

  const { data: configGroups, isLoading: groupsLoading } = useConfigGroups()
  const { data: configs, isLoading: configsLoading } = useSystemConfigs(selectedGroup)
  const updateConfig = useUpdateConfig()
  const updateConfigs = useUpdateConfigs()
  const resetConfig = useResetConfig()
  const { editingConfig, pendingChanges, hasPendingChanges, startEditing, stopEditing, updatePendingChange } = useSettingsEditor()

  const groups = configGroups || []
  const filteredConfigs = (configs || []).filter(config =>
    config.label.toLowerCase().includes(searchText.toLowerCase()) ||
    config.description.toLowerCase().includes(searchText.toLowerCase())
  )

  const handleEditConfig = (config: SystemConfig) => {
    startEditing(config.key)
    updatePendingChange(config.key, config.value)
  }

  const handleSaveConfig = async (config: SystemConfig) => {
    const newValue = pendingChanges[config.key]
    if (newValue !== undefined && newValue !== config.value) {
      try {
        await updateConfig.mutateAsync({ key: config.key, value: newValue })
        stopEditing()
      } catch (error) {
        console.error('Save config failed:', error)
      }
    } else {
      stopEditing()
    }
  }

  const handleSaveAllChanges = async () => {
    if (!hasPendingChanges) return

    const configsToUpdate = Object.entries(pendingChanges)
      .filter((entry): entry is [string, SystemConfig['value']] => {
        const [key, value] = entry
        if (value === undefined) return false
        const config = filteredConfigs.find(c => c.key === key)
        return !!config && value !== config.value
      })
      .map(([key, value]) => ({ key, value }))

    if (configsToUpdate.length > 0) {
      try {
        await updateConfigs.mutateAsync(configsToUpdate)
        stopEditing()
      } catch (error) {
        console.error('Save configs failed:', error)
      }
    }
  }

  const handleResetConfig = async (configKey: string) => {
    try {
      await resetConfig.mutateAsync(configKey)
      setResetConfirm(null)
    } catch (error) {
      console.error('Reset config failed:', error)
    }
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const blob = await systemConfigApi.exportConfigs(selectedGroup === 'general' ? undefined : selectedGroup)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
      a.download = `settings_export_${selectedGroup}_${timestamp}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('配置已导出为JSON文件')
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('导出失败，请稍后重试')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.json')) {
        toast.error('文件格式错误，仅支持 JSON 格式文件')
        return
      }
      setImportFile(file)
    }
  }

  const handleImport = async () => {
    if (!importFile) {
      toast.error('请先选择要导入的配置文件')
      return
    }

    try {
      setIsImporting(true)
      const result = await systemConfigApi.importConfigs(importFile)

      toast.success(result.message || '配置已成功导入')

      // 关闭模态框并清空文件
      setImportModal(false)
      setImportFile(null)

      // 刷新配置列表
      window.location.reload()
    } catch (error) {
      console.error('Import failed:', error)
      toast.error(error instanceof Error ? error.message : '导入失败，请稍后重试')
    } finally {
      setIsImporting(false)
    }
  }

  const renderConfigValue = (config: SystemConfig) => {
    const isEditing = editingConfig === config.key
    const currentValue = isEditing ? (pendingChanges[config.key] ?? config.value) : config.value

    if (config.readonly) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-gray-900">{String(currentValue)}</span>
          <Badge variant="secondary" size="sm">只读</Badge>
        </div>
      )
    }

    if (isEditing) {
      switch (config.type) {
        case 'boolean':
          return (
            <div className="flex items-center gap-2">
              <Select
                value={String(currentValue)}
                onValueChange={(value) => updatePendingChange(config.key, value === 'true')}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">启用</SelectItem>
                  <SelectItem value="false">禁用</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => handleSaveConfig(config)}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={stopEditing}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )

        case 'number':
          return (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={typeof currentValue === 'number' ? currentValue : Number(currentValue ?? 0)}
                onChange={(e) => updatePendingChange(config.key, Number(e.target.value))}
                min={config.validation?.min}
                max={config.validation?.max}
                className="w-32"
              />
              <Button size="sm" onClick={() => handleSaveConfig(config)}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={stopEditing}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )

        case 'array':
          if (config.validation?.options) {
            return (
              <div className="flex items-center gap-2">
                <Select
                  value={Array.isArray(currentValue) ? currentValue.join(',') : String(currentValue)}
                  onValueChange={(value) => updatePendingChange(config.key, value.split(','))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.validation.options.map((option) => (
                      <SelectItem key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => handleSaveConfig(config)}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={stopEditing}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )
          }
          break

        default:
          return (
            <div className="flex items-center gap-2">
              <Input
                value={String(currentValue)}
                onChange={(e) => updatePendingChange(config.key, e.target.value)}
                className="w-48"
                pattern={config.validation?.pattern}
              />
              <Button size="sm" onClick={() => handleSaveConfig(config)}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={stopEditing}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )
      }
    }

    // 只读显示
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-900">
            {config.type === 'boolean' 
              ? (currentValue ? '启用' : '禁用')
              : Array.isArray(currentValue) 
                ? currentValue.join(', ')
                : String(currentValue)
            }
          </span>
          {config.type === 'boolean' && (
            <div className={`w-2 h-2 rounded-full ${currentValue ? 'bg-green-500' : 'bg-gray-400'}`} />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditConfig(config)}
            disabled={config.readonly}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setResetConfirm(config.key)}
            disabled={config.readonly}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (groupsLoading || configsLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold">系统配置管理</h3>
          {hasPendingChanges && (
            <Badge variant="warning">
              {Object.keys(pendingChanges).length} 项待保存
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {hasPendingChanges && (
            <>
              <Button variant="outline" onClick={stopEditing}>
                取消修改
              </Button>
              <Button onClick={handleSaveAllChanges}>
                <Save className="w-4 h-4 mr-2" />
                保存全部
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setImportModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            导入配置
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? '导出中...' : '导出配置'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 配置分组侧边栏 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">配置分组</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-1">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroup(group.name)}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                      selectedGroup === group.name
                        ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{group.displayName}</span>
                      <Badge variant="outline" size="sm">
                        {group.configs.length}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 配置项列表 */}
        <div className="lg:col-span-3">
          <div className="space-y-4">
            {filteredConfigs.length > 0 ? (
              filteredConfigs.map((config) => (
                <motion.div
                  key={config.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className={`${editingConfig === config.key ? 'ring-2 ring-blue-500' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-base font-medium text-gray-900">
                              {config.label}
                            </h4>
                            {config.required && (
                              <Badge variant="primary" size="sm">必需</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-3">
                            {config.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>配置键: {config.key}</span>
                            <span>•</span>
                            <span>类型: {config.type}</span>
                            <span>•</span>
                            <span>最后更新: {new Date(config.updatedAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 min-w-[200px]">
                          {renderConfigValue(config)}
                        </div>
                      </div>
                      
                      {config.validation && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                            <div className="text-xs text-blue-700">
                              <div className="font-medium mb-1">验证规则:</div>
                              <ul className="space-y-1">
                                {config.validation.min !== undefined && (
                                  <li>最小值: {config.validation.min}</li>
                                )}
                                {config.validation.max !== undefined && (
                                  <li>最大值: {config.validation.max}</li>
                                )}
                                {config.validation.pattern && (
                                  <li>格式: {config.validation.pattern}</li>
                                )}
                                {config.validation.options && (
                                  <li>可选项: {config.validation.options.map(o => o.label).join(', ')}</li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchText ? '没有找到匹配的配置' : '暂无配置项'}
                  </h3>
                  <p className="text-gray-600">
                    {searchText ? '尝试调整搜索条件' : '该分组暂时没有可配置的项目'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* 重置确认弹窗 */}
      <ConfirmModal
        isOpen={!!resetConfirm}
        onClose={() => setResetConfirm(null)}
        onConfirm={() => resetConfirm && handleResetConfig(resetConfirm)}
        title="重置配置"
        description="确定要将此配置重置为默认值吗？此操作无法撤销。"
        confirmText="重置"
        cancelText="取消"
        variant="default"
      />

      {/* 导入配置弹窗 */}
      {importModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full"
          >
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">导入配置文件</h3>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-2">
                    {importFile ? `已选择: ${importFile.name}` : '拖拽文件到此处或点击选择'}
                  </p>
                  <input
                    type="file"
                    accept=".json,.yaml,.yml"
                    className="hidden"
                    id="config-file"
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor="config-file"
                    className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm rounded cursor-pointer hover:bg-blue-700"
                  >
                    {importFile ? '重新选择' : '选择文件'}
                  </label>
                </div>
                <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                  <div className="text-xs text-yellow-700">
                    <div className="font-medium mb-1">注意事项:</div>
                    <ul className="space-y-1">
                      <li>• 仅支持 JSON 和 YAML 格式</li>
                      <li>• 导入前会验证配置格式</li>
                      <li>• 建议先备份现有配置</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportModal(false)
                    setImportFile(null)
                  }}
                  disabled={isImporting}
                >
                  取消
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || !importFile}
                >
                  {isImporting ? '导入中...' : '导入'}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}