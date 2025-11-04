
import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Mail,
  MessageSquare,
  Webhook,
  Shield,
  Globe,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  TestTube,
  Copy
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Input,
  TextArea,
  LoadingOverlay,
  PageLoading,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SimpleModal,
  ConfirmModal
} from '@/components/atoms'
import {
  useNotificationConfigs,
  useCreateNotificationConfig,
  useUpdateNotificationConfig,
  useDeleteNotificationConfig,
  useTestNotificationConfig
} from '../hooks'
import type { NotificationConfig } from '../types'

const typeMeta: Record<NotificationConfig['type'], {
  label: string
  description: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = {
  email: {
    label: '邮件通知',
    description: '通过 SMTP 邮件发送告警信息',
    icon: Mail
  },
  sms: {
    label: '短信通知',
    description: '调用短信服务进行重要提醒',
    icon: MessageSquare
  },
  webhook: {
    label: 'Webhook',
    description: '向外部系统推送 JSON 数据',
    icon: Webhook
  },
  dingtalk: {
    label: '钉钉机器人',
    description: '使用钉钉群机器人推送告警',
    icon: Shield
  },
  wechat: {
    label: '企业微信',
    description: '向企业微信应用推送消息',
    icon: Globe
  }
}

const defaultTemplates: Record<NotificationConfig['type'], unknown> = {
  email: {
    smtp: {
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      username: 'alert@example.com',
      password: '******'
    },
    from: {
      name: '系统告警',
      email: 'alert@example.com'
    },
    templates: {
      subject: '[系统告警] ${title}',
      body: '告警内容: ${content}'
    }
  },
  sms: {
    provider: 'aliyun',
    accessKey: 'AKID',
    secretKey: 'SECRET',
    signName: '系统告警',
    templateCode: 'SMS_0000001'
  },
  webhook: {
    url: 'https://hooks.example.com/alert',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: '{"title":"${title}","content":"${content}"}',
    timeout: 5
  },
  dingtalk: {
    webhook: 'https://oapi.dingtalk.com/robot/send?access_token=',
    secret: '',
    atMobiles: [],
    atUserIds: [],
    isAtAll: false
  },
  wechat: {
    corpId: 'wwxxxxxxxxxxxx',
    corpSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    agentId: 1000000,
    toUser: '@all',
    toParty: '',
    toTag: ''
  }
}

type CreateState = {
  type: NotificationConfig['type']
  name: string
  enabled: boolean
  testRecipient: string
  configJSON: string
}

type EditState = {
  name: string
  enabled: boolean
  testRecipient: string
  configJSON: string
}

const formatJSON = (value: unknown) => JSON.stringify(value, null, 2)
export const NotificationSettings: React.FC = () => {
  const {
    data: configs,
    isLoading,
    isFetching
  } = useNotificationConfigs()
  const createNotification = useCreateNotificationConfig()
  const updateNotification = useUpdateNotificationConfig()
  const deleteNotification = useDeleteNotificationConfig()
  const testNotification = useTestNotificationConfig()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editJsonError, setEditJsonError] = useState<string>('')
  const [createJsonError, setCreateJsonError] = useState<string>('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createState, setCreateState] = useState<CreateState>({
    type: 'email',
    name: '',
    enabled: true,
    testRecipient: '',
    configJSON: formatJSON(defaultTemplates.email)
  })

  const orderedConfigs = useMemo(() => {
    if (!configs) return []
    return [...configs].sort((a, b) => a.name.localeCompare(b.name))
  }, [configs])

  const currentConfig = useMemo(() => {
    if (!orderedConfigs.length) {
      return null
    }
    if (selectedId) {
      return orderedConfigs.find(item => item.id === selectedId) ?? orderedConfigs[0]
    }
    return orderedConfigs[0]
  }, [orderedConfigs, selectedId])

  useEffect(() => {
    if (currentConfig) {
      setSelectedId(currentConfig.id)
      setEditState({
        name: currentConfig.name,
        enabled: currentConfig.enabled,
        testRecipient: currentConfig.testRecipient ?? '',
        configJSON: formatJSON(currentConfig.config)
      })
      setEditJsonError('')
    }
  }, [currentConfig?.id, currentConfig])

  const summary = useMemo(() => {
    const total = configs?.length ?? 0
    const enabled = configs?.filter(item => item.enabled).length ?? 0
    const byType = Object.entries(typeMeta).map(([type, meta]) => ({
      type: type as NotificationConfig['type'],
      label: meta.label,
      count: configs?.filter(item => item.type === type).length ?? 0
    }))
    return { total, enabled, byType }
  }, [configs])

  const isDirty = useMemo(() => {
    if (!currentConfig || !editState) {
      return false
    }
    const baseJSON = formatJSON(currentConfig.config)
    return (
      editState.name !== currentConfig.name ||
      editState.enabled !== currentConfig.enabled ||
      editState.testRecipient !== (currentConfig.testRecipient ?? '') ||
      editState.configJSON.trim() !== baseJSON.trim()
    )
  }, [currentConfig, editState])

  const handleChangeConfigJSON = (value: string) => {
    setEditState(prev => (prev ? { ...prev, configJSON: value } : prev))
  }

  const handleSave = () => {
    if (!currentConfig || !editState) {
      return
    }
    try {
      const parsed = JSON.parse(editState.configJSON)
      updateNotification.mutate(
        {
          id: currentConfig.id,
          data: {
            name: editState.name,
            enabled: editState.enabled,
            testRecipient: editState.testRecipient || undefined,
            config: parsed
          }
        },
        {
          onSuccess: () => {
            setEditJsonError('')
          },
          onError: error => {
            setEditJsonError(error.message || '通知配置更新失败')
          }
        }
      )
    } catch {
      setEditJsonError('配置 JSON 格式不正确，请检查后重试')
    }
  }

  const handleTest = () => {
    if (!currentConfig) return
    testNotification.mutate({
      id: currentConfig.id,
      recipient: editState?.testRecipient || undefined
    })
  }

  const handleDelete = () => {
    if (!confirmDeleteId) return
    deleteNotification.mutate(confirmDeleteId, {
      onSuccess: () => {
        if (confirmDeleteId === selectedId) {
          setSelectedId(null)
        }
      }
    })
  }

  const resetEditState = () => {
    if (!currentConfig) return
    setEditState({
      name: currentConfig.name,
      enabled: currentConfig.enabled,
      testRecipient: currentConfig.testRecipient ?? '',
      configJSON: formatJSON(currentConfig.config)
    })
    setEditJsonError('')
  }

  const handleCreateSubmit = () => {
    try {
      const parsed = JSON.parse(createState.configJSON)
      createNotification.mutate(
        {
          type: createState.type,
          name: createState.name.trim(),
          enabled: createState.enabled,
          testRecipient: createState.testRecipient.trim() || undefined,
          config: parsed
        },
        {
          onSuccess: created => {
            setCreateJsonError('')
            setCreateOpen(false)
            setCreateState(prev => ({
              type: prev.type,
              name: '',
              enabled: true,
              testRecipient: '',
              configJSON: formatJSON(defaultTemplates[prev.type])
            }))
            setSelectedId(created.id)
          },
          onError: error => setCreateJsonError(error.message || '通知配置创建失败')
        }
      )
    } catch {
      setCreateJsonError('新增配置 JSON 格式不正确')
    }
  }

  if (isLoading && !configs) {
    return <PageLoading message="正在加载通知配置..." />
  }

  const overlayActive = isFetching || updateNotification.isPending || deleteNotification.isPending
  const overlayMessage = updateNotification.isPending
    ? '正在保存通知配置...'
    : deleteNotification.isPending
      ? '正在删除通知配置...'
      : '正在刷新通知配置...'

  const selectedTypeMeta = currentConfig ? typeMeta[currentConfig.type] : null
  return (
    <LoadingOverlay isLoading={overlayActive} message={overlayActive ? overlayMessage : undefined}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-gray-500">通知渠道总数</p>
                <p className="text-2xl font-semibold text-gray-900 mt-2">{summary.total}</p>
              </div>
              <Bell className="h-8 w-8 text-purple-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-gray-500">已启用渠道</p>
                <p className="text-2xl font-semibold text-gray-900 mt-2">{summary.enabled}</p>
              </div>
              <Shield className="h-8 w-8 text-emerald-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-gray-500 mb-3">按类型统计</p>
              <div className="flex flex-wrap gap-2">
                {summary.byType.map(item => {
                  const Icon = typeMeta[item.type].icon
                  return (
                    <Badge key={item.type} variant="outline" className="flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {typeMeta[item.type].label}·{item.count}
                    </Badge>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px,1fr]">
          <Card className="h-full">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>渠道列表</CardTitle>
                <CardDescription>选择要查看或编辑的通知渠道</CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setCreateOpen(true)
                  setCreateState(prev => ({
                    type: prev.type,
                    name: '',
                    enabled: true,
                    testRecipient: '',
                    configJSON: formatJSON(defaultTemplates[prev.type])
                  }))
                  setCreateJsonError('')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />新增渠道
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderedConfigs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  暂无通知渠道，请先新增配置。
                </div>
              ) : (
                orderedConfigs.map(item => {
                  const Icon = typeMeta[item.type].icon
                  const isActive = currentConfig?.id === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        isActive
                          ? 'border-purple-400 bg-purple-50 shadow-sm'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${isActive ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">{typeMeta[item.type].description}</p>
                          </div>
                        </div>
                        <Badge variant={item.enabled ? 'success' : 'outline'} size="sm">
                          {item.enabled ? '启用' : '停用'}
                        </Badge>
                      </div>
                      {item.lastTestStatus && (
                        <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
                          <span>上次测试：</span>
                          <Badge
                            variant={item.lastTestStatus === 'success' ? 'success' : 'danger'}
                            size="sm"
                          >
                            {item.lastTestStatus === 'success' ? '成功' : '失败'}
                          </Badge>
                          {item.lastTestAt && <span>{new Date(item.lastTestAt).toLocaleString()}</span>}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            {currentConfig && editState ? (
              <>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {selectedTypeMeta && (
                      <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
                        <selectedTypeMeta.icon className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <CardTitle>{selectedTypeMeta?.label}</CardTitle>
                      <CardDescription>{selectedTypeMeta?.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(editState.configJSON)
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />复制配置
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(currentConfig.id)}
                      disabled={deleteNotification.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />删除
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-gray-500">渠道名称</label>
                      <Input
                        placeholder="请输入名称"
                        value={editState.name}
                        onChange={event =>
                          setEditState(prev => (prev ? { ...prev, name: event.target.value } : prev))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">测试接收人</label>
                      <Input
                        placeholder="可选，例如邮箱或手机号"
                        value={editState.testRecipient}
                        onChange={event =>
                          setEditState(prev => (prev ? { ...prev, testRecipient: event.target.value } : prev))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">启用状态</p>
                        <p className="text-xs text-gray-500">停用后将暂停该渠道的通知推送</p>
                      </div>
                      <div
                        className={`relative h-6 w-11 rounded-full border transition-colors duration-200 ${
                          editState.enabled ? 'bg-emerald-500 border-emerald-500' : 'bg-gray-200 border-gray-200'
                        }`}
                        role="switch"
                        aria-checked={editState.enabled}
                        onClick={() =>
                          setEditState(prev => (prev ? { ...prev, enabled: !prev.enabled } : prev))
                        }
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                            editState.enabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span>配置详情（JSON）</span>
                      <span>自动替换变量：<code>${'{title}'}</code> / <code>${'{content}'}</code></span>
                    </div>
                    <TextArea
                      rows={16}
                      value={editState.configJSON}
                      onChange={event => handleChangeConfigJSON(event.target.value)}
                    />
                    {editJsonError && (
                      <p className="mt-2 text-xs text-red-600">{editJsonError}</p>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testNotification.isPending}
                  >
                    <TestTube className="mr-2 h-4 w-4" />发送测试
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetEditState}
                    disabled={!isDirty || updateNotification.isPending}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />重置
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={!isDirty || updateNotification.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" />保存修改
                  </Button>
                </CardFooter>
              </>
            ) : (
              <div className="p-10 text-center text-sm text-gray-500">
                请选择左侧的通知渠道以查看详情。
              </div>
            )}
          </Card>
        </div>
      </div>

      <SimpleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新增通知渠道"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-gray-500">渠道类型</label>
              <Select
                value={createState.type}
                onValueChange={value => {
                  const nextType = value as NotificationConfig['type']
                  setCreateState({
                    type: nextType,
                    name: '',
                    enabled: true,
                    testRecipient: '',
                    configJSON: formatJSON(defaultTemplates[nextType])
                  })
                  setCreateJsonError('')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择渠道类型" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeMeta).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500">渠道名称</label>
              <Input
                placeholder="请输入名称"
                value={createState.name}
                onChange={event =>
                  setCreateState(prev => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">测试接收人（可选）</label>
              <Input
                placeholder="例如 test@example.com"
                value={createState.testRecipient}
                onChange={event =>
                  setCreateState(prev => ({ ...prev, testRecipient: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="create-enabled"
                type="checkbox"
                checked={createState.enabled}
                onChange={event =>
                  setCreateState(prev => ({ ...prev, enabled: event.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="create-enabled" className="text-sm text-gray-700">
                创建后立即启用
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">配置详情（JSON）</label>
            <TextArea
              rows={12}
              value={createState.configJSON}
              onChange={event =>
                setCreateState(prev => ({ ...prev, configJSON: event.target.value }))
              }
            />
          </div>

          {createJsonError && (
            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">
              {createJsonError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createNotification.isPending || !createState.name.trim()}>
              <Save className="mr-2 h-4 w-4" />创建
            </Button>
          </div>
        </div>
      </SimpleModal>

      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="删除通知渠道"
        description="删除后将无法恢复，确认要继续吗？"
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
      />
    </LoadingOverlay>
  )
}
