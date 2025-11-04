'use client'

import React, { useState, useCallback, useMemo, useRef } from 'react'
import { Upload, Download, AlertTriangle, CheckCircle, User, Mail, Lock } from 'lucide-react'
import { Button, Card, CardContent, Badge, Table, type Column } from '@/components/atoms'
import {
  UserBulkImport as UserBulkImportPayload,
  UserBulkImportResult,
  UserBulkImportError,
  UserRole
} from '../types'

interface Props {
  onSubmit: (data: UserBulkImportPayload) => Promise<UserBulkImportResult | void>
  onCancel: () => void
}

interface ImportUser {
  username: string
  email: string
  fullName?: string
  role: UserRole
  password?: string
  errors?: string[]
}

const TEMPLATE_DATA: ImportUser[] = [
  {
    username: 'john.doe',
    email: 'john.doe@example.com',
    fullName: 'John Doe',
    role: 'operator',
    password: ''
  },
  {
    username: 'jane.smith',
    email: 'jane.smith@example.com',
    fullName: 'Jane Smith',
    role: 'viewer',
    password: ''
  }
]

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  operator: '操作员',
  viewer: '查看员'
}

const PREVIEW_LIMIT = 20

const buildSuccessResult = (count: number): UserBulkImportResult => ({
  total: count,
  success: count,
  failed: 0,
  errors: []
})

export const UserBulkImport: React.FC<Props> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'completed'>('upload')
  const [sendEmail, setSendEmail] = useState(true)
  const [forcePasswordChange, setForcePasswordChange] = useState(true)
  const [validUsers, setValidUsers] = useState<ImportUser[]>([])
  const [invalidUsers, setInvalidUsers] = useState<ImportUser[]>([])
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<UserBulkImportResult | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resetState = useCallback(() => {
    setStep('upload')
    setValidUsers([])
    setInvalidUsers([])
    setImportProgress(0)
    setImportResult(null)
    setSelectedFileName('')
    setUploadError(null)
    setSendEmail(true)
    setForcePasswordChange(true)
  }, [])

  const downloadTemplate = useCallback(() => {
    const csvContent = [
      'username,email,fullName,role,password',
      ...TEMPLATE_DATA.map(user =>
        `${user.username},${user.email},${user.fullName ?? ''},${user.role},${user.password ?? ''}`
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'user_import_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  // 校验并拆分导入数据
  const validateUsers = useCallback((users: ImportUser[]) => {
    const valid: ImportUser[] = []
    const invalid: ImportUser[] = []

    const usernameMap = new Map<string, ImportUser[]>()
    const emailMap = new Map<string, ImportUser[]>()

    users.forEach(rawUser => {
      const normalized: ImportUser = {
        username: rawUser.username.trim(),
        email: rawUser.email.trim(),
        fullName: rawUser.fullName?.trim() || undefined,
        role: rawUser.role,
        password: rawUser.password?.trim() || undefined
      }

      const errors: string[] = []

      if (!normalized.username) {
        errors.push('用户名不能为空')
      } else if (!/^[a-zA-Z0-9_-]+$/.test(normalized.username)) {
        errors.push('用户名格式无效')
      }

      if (!normalized.email) {
        errors.push('邮箱不能为空')
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
        errors.push('邮箱格式无效')
      }

      if (!['admin', 'operator', 'viewer'].includes(normalized.role)) {
        errors.push('角色无效')
        normalized.role = 'viewer'
      }

      if (errors.length > 0) {
        invalid.push({ ...normalized, errors })
        return
      }

      valid.push(normalized)

      usernameMap.set(normalized.username, [...(usernameMap.get(normalized.username) ?? []), normalized])
      emailMap.set(normalized.email, [...(emailMap.get(normalized.email) ?? []), normalized])
    })

    const duplicateMap = new Map<ImportUser, Set<string>>()
    const markDuplicate = (list: ImportUser[], message: string) => {
      if (list.length < 2) return
      list.forEach(user => {
        if (!duplicateMap.has(user)) {
          duplicateMap.set(user, new Set<string>())
        }
        duplicateMap.get(user)!.add(message)
      })
    }

    usernameMap.forEach(list => markDuplicate(list, '用户名重复'))
    emailMap.forEach(list => markDuplicate(list, '邮箱重复'))

    const filteredValid = valid.filter(user => !duplicateMap.has(user))
    const duplicateInvalid = Array.from(duplicateMap.entries()).map(([user, messages]) => ({
      ...user,
      errors: Array.from(messages)
    }))

    setValidUsers(filteredValid)
    setInvalidUsers([...invalid, ...duplicateInvalid])
  }, [])

  const parseCSVContent = useCallback((content: string) => {
    try {
      setUploadError(null)

      const lines = content.split(/\r?\n/).filter(line => line.trim())
      if (lines.length < 2) {
        throw new Error('文件内容格式不正确或无有效数据')
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const requiredHeaders = ['username', 'email']
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))

      if (missingHeaders.length > 0) {
        throw new Error(`缺少必需的列: ${missingHeaders.join(', ')}`)
      }

      const users: ImportUser[] = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i]
          .split(',')
          .map(value => value.trim().replace(/^"|"$/g, ''))

        if (values.every(value => value === '')) {
          continue
        }

        const user: ImportUser = {
          username: '',
          email: '',
          role: 'viewer'
        }

        headers.forEach((header, index) => {
          const value = values[index] ?? ''
          switch (header) {
            case 'username':
              user.username = value
              break
            case 'email':
              user.email = value
              break
            case 'fullname':
            case 'full_name':
              if (value) {
                user.fullName = value
              }
              break
            case 'role':
              if (['admin', 'operator', 'viewer'].includes(value)) {
                user.role = value as UserRole
              }
              break
            case 'password':
              if (value) {
                user.password = value
              }
              break
            default:
              break
          }
        })

        if (user.username || user.email) {
          users.push(user)
        }
      }

      if (users.length === 0) {
        throw new Error('未解析到任何用户数据，请检查文件内容')
      }

      validateUsers(users)
      setImportResult(null)
      setImportProgress(0)
      setStep('preview')
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件解析失败，请检查文件格式'
      setUploadError(message)
      window.console.error('解析文件失败:', error)
    }
  }, [validateUsers])

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFileName(file.name)
    const reader = new FileReader()

    reader.onload = e => {
      const content = (e.target?.result ?? '') as string
      parseCSVContent(content)
    }

    reader.onerror = () => {
      setUploadError('读取文件失败，请重试')
      window.console.error('读取导入文件失败')
    }

    reader.readAsText(file)
    event.target.value = ''
  }, [parseCSVContent])

  const handleBackToUpload = useCallback(() => {
    setStep('upload')
    setValidUsers([])
    setInvalidUsers([])
    setImportProgress(0)
    setImportResult(null)
    setSelectedFileName('')
    setUploadError(null)
  }, [])

  const handleCancel = useCallback(() => {
    resetState()
    onCancel()
  }, [onCancel, resetState])

  const handleStartOver = useCallback(() => {
    resetState()
  }, [resetState])

  const handleImport = useCallback(async () => {
    if (validUsers.length === 0) {
      return
    }

    const payload: UserBulkImportPayload = {
      users: validUsers.map(({ username, email, fullName, role, password }) => ({
        username,
        email,
        fullName,
        role,
        password
      })),
      sendEmail,
      forcePasswordChange
    }

    setStep('importing')
    setImportProgress(0)
    setImportResult(null)

    let timerId: number | null = null

    try {
      timerId = window.setInterval(() => {
        setImportProgress(prev => (prev >= 90 ? prev : prev + 5))
      }, 200)

      const result = await onSubmit(payload)

      if (timerId !== null) {
        window.clearInterval(timerId)
      }

      setImportProgress(100)
      setImportResult(result ?? buildSuccessResult(payload.users.length))
    } catch (error) {
      if (timerId !== null) {
        window.clearInterval(timerId)
      }

      setImportProgress(100)
      const message = error instanceof Error ? error.message : '批量导入失败'
      const fallback: UserBulkImportResult = {
        total: payload.users.length,
        success: 0,
        failed: payload.users.length,
        errors: [
          {
            row: 0,
            error: message
          }
        ]
      }
      setImportResult(fallback)
      window.console.error('批量导入失败:', error)
    } finally {
      setStep('completed')
    }
  }, [validUsers, sendEmail, forcePasswordChange, onSubmit])

  const totalUsers = useMemo(() => validUsers.length + invalidUsers.length, [validUsers, invalidUsers])
  const previewValidUsers = useMemo(() => validUsers.slice(0, PREVIEW_LIMIT), [validUsers])
  const previewInvalidUsers = useMemo(() => invalidUsers.slice(0, PREVIEW_LIMIT), [invalidUsers])

  const validColumns = useMemo<Column<ImportUser>[]>(() => [
    {
      key: 'username',
      title: '用户名'
    },
    {
      key: 'email',
      title: '邮箱'
    },
    {
      key: 'fullName',
      title: '姓名',
      render: value => (value ? String(value) : '-')
    },
    {
      key: 'role',
      title: '角色',
      render: (_value, record) => (
        <Badge variant="outline">{roleLabels[record.role]}</Badge>
      )
    }
  ], [])

  const invalidColumns = useMemo<Column<ImportUser>[]>(() => [
    {
      key: 'username',
      title: '用户名'
    },
    {
      key: 'email',
      title: '邮箱'
    },
    {
      key: 'errors',
      title: '错误详情',
      render: (_value, record) => (
        <div className="flex flex-wrap gap-2">
          {(record.errors ?? ['未知错误']).map((message, index) => (
            <Badge key={`${record.username}-${index}`} variant="error">
              {message}
            </Badge>
          ))}
        </div>
      )
    }
  ], [])

  const resultErrorColumns = useMemo<Column<UserBulkImportError>[]>(() => [
    {
      key: 'row',
      title: '行号',
      width: '80px'
    },
    {
      key: 'error',
      title: '错误信息'
    }
  ], [])

  return (
    <div className="space-y-6">
      {step === 'upload' && (
        <>
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">上传 CSV 文件</h3>
                <p className="text-sm text-gray-600">
                  仅支持 UTF-8 编码的 CSV 文件，第一行需要包含列名。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  选择 CSV 文件
                </Button>
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  下载模板
                </Button>
                {selectedFileName && (
                  <span className="text-sm text-gray-600">已选择：{selectedFileName}</span>
                )}
              </div>

              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>用户名仅允许字母、数字、下划线或中划线。</li>
                <li>邮箱必须符合标准格式，系统会自动去重重复记录。</li>
                <li>未指定角色时系统会默认设置为查看员。</li>
              </ul>

              {uploadError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {uploadError}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleCancel}>
              取消
            </Button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">数据校验结果</h3>
                  <p className="text-sm text-gray-600">系统已完成基础校验，请确认后继续导入。</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">解析总数</p>
                      <p className="text-base font-semibold">{totalUsers} 条</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-xs text-gray-500">可导入</p>
                      <p className="text-base font-semibold">{validUsers.length} 条</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-xs text-gray-500">需修复</p>
                      <p className="text-base font-semibold">{invalidUsers.length} 条</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl border border-gray-200/80 px-4 py-3 transition-colors hover:border-purple-300">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={event => setSendEmail(event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-gray-900">
                      <Mail className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">导入后发送欢迎邮件</span>
                    </div>
                    <p className="text-sm text-gray-600">系统会为成功导入的用户发送账号开通通知。</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-gray-200/80 px-4 py-3 transition-colors hover:border-purple-300">
                  <input
                    type="checkbox"
                    checked={forcePasswordChange}
                    onChange={event => setForcePasswordChange(event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-gray-900">
                      <Lock className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">首次登录强制修改密码</span>
                    </div>
                    <p className="text-sm text-gray-600">提升账号安全性，确保用户在首次登录时设置个人密码。</p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {validUsers.length > 0 && (
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold">可导入用户</h4>
                    <p className="text-sm text-gray-600">以下数据将提交到服务端执行导入。</p>
                  </div>
                  <Badge variant="success">{validUsers.length} 条</Badge>
                </div>
                <Table
                  size="small"
                  data={previewValidUsers}
                  columns={validColumns}
                />
                {validUsers.length > PREVIEW_LIMIT && (
                  <p className="text-xs text-gray-500">仅展示前 {PREVIEW_LIMIT} 条记录，全部数据将在导入时处理。</p>
                )}
              </CardContent>
            </Card>
          )}

          {invalidUsers.length > 0 && (
            <Card>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-yellow-700">存在问题的记录</h4>
                    <p className="text-sm text-gray-600">以下记录将在本次导入中被跳过，请修复后重新上传。</p>
                  </div>
                  <Badge variant="warning">{invalidUsers.length} 条</Badge>
                </div>
                <Table
                  size="small"
                  data={previewInvalidUsers}
                  columns={invalidColumns}
                />
                {invalidUsers.length > PREVIEW_LIMIT && (
                  <p className="text-xs text-gray-500">仅展示前 {PREVIEW_LIMIT} 条记录，建议修复全部问题后重新导入。</p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={handleBackToUpload}>
              重新上传
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button onClick={handleImport} disabled={validUsers.length === 0}>
                开始导入
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 'importing' && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-purple-500 animate-pulse" />
              <div>
                <h3 className="text-lg font-semibold">正在导入用户</h3>
                <p className="text-sm text-gray-600">系统正在批量创建账号，请耐心等待。</p>
              </div>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200/80">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-200"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">导入过程中请勿关闭此窗口。</p>
          </CardContent>
        </Card>
      )}

      {step === 'completed' && (
        <>
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">导入完成</h3>
                  <p className="text-sm text-gray-600">共处理 {importResult?.total ?? 0} 条记录。</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-xs text-gray-500">导入成功</p>
                      <p className="text-base font-semibold">{importResult?.success ?? 0} 条</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-xs text-gray-500">导入失败</p>
                      <p className="text-base font-semibold">{importResult?.failed ?? 0} 条</p>
                    </div>
                  </div>
                </div>
              </div>

              {importResult?.errors.length ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
                    部分记录导入失败，请根据下方提示修复后重新尝试。
                  </div>
                  <Table
                    size="small"
                    data={importResult.errors}
                    columns={resultErrorColumns}
                    rowKey="row"
                  />
                </div>
              ) : (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                  所有用户均已成功导入。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={handleStartOver}>
              继续导入新文件
            </Button>
            <Button onClick={handleCancel}>
              关闭
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
