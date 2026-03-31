import React, { useCallback, useMemo, useState } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Loading
} from '@/components/atoms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { DeviceImportData, ImportResult, DeviceType } from '../types'

type ImportStep = 'upload' | 'mapping' | 'preview' | 'result'

interface BulkDeviceImportProps {
  isOpen: boolean
  onClose: () => void
  onImport: (devices: DeviceImportData[]) => Promise<ImportResult>
}

interface ParsedCSVData {
  headers: string[]
  rows: string[][]
}

interface FieldDefinition {
  key: keyof DeviceImportData
  label: string
  required: boolean
}

const DEVICE_TYPE_ALIASES: Record<string, DeviceType> = {
  switch: 'switch',
  router: 'router',
  firewall: 'firewall',
  wirelessap: 'wireless_ap',
  wireless_ap: 'wireless_ap',
  accesspoint: 'wireless_ap',
  ap: 'wireless_ap',
}

const normalizeDeviceType = (value?: string | DeviceType): DeviceType => {
  if (!value) {
    return 'switch'
  }
  const normalized = value.toString().toLowerCase().replace(/[^a-z0-9]/g, '')
  return DEVICE_TYPE_ALIASES[normalized] ?? 'switch'
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'name', label: '设备名称', required: true },
  { key: 'ip', label: 'IP 地址', required: true },
  { key: 'device_type', label: '设备类型', required: true },
  { key: 'vendor', label: '厂商', required: false },
  { key: 'location', label: '位置', required: false },
  { key: 'description', label: '描述', required: false },
  { key: 'snmp_community', label: 'SNMP 团体字符串', required: false },
  { key: 'ssh_username', label: 'SSH 用户名', required: false },
  { key: 'ssh_password', label: 'SSH 密码', required: false }
]

const HEADER_HINTS: Record<string, keyof DeviceImportData> = {
  name: 'name',
  '设备名称': 'name',
  ip: 'ip',
  'ip地址': 'ip',
  'ip 地址': 'ip',
  device_type: 'device_type',
  '设备类型': 'device_type',
  type: 'device_type',
  vendor: 'vendor',
  '厂商': 'vendor',
  '厂牌': 'vendor',
  location: 'location',
  '位置': 'location',
  description: 'description',
  '描述': 'description',
  snmp: 'snmp_community',
  'snmp 团体字符串': 'snmp_community',
  snmp_community: 'snmp_community',
  'ssh 用户名': 'ssh_username',
  ssh_username: 'ssh_username',
  'ssh 密码': 'ssh_password',
  ssh_password: 'ssh_password'
}

const UNMAPPED_FIELD_VALUE = '__unmapped__'

const normalizeDevice = (partial: Partial<DeviceImportData>): DeviceImportData => ({
  name: partial.name ?? '',
  ip: partial.ip ?? '',
  device_type: normalizeDeviceType(partial.device_type),
  vendor: typeof partial.vendor === 'string' && partial.vendor.trim().length > 0 ? partial.vendor.trim() : undefined,
  location: partial.location ?? '',
  description: partial.description ?? '',
  snmp_community: partial.snmp_community ?? '',
  ssh_username: partial.ssh_username ?? '',
  ssh_password: partial.ssh_password ?? ''
})

const detectField = (header: string): keyof DeviceImportData | '' => {
  const normalized = header.toLowerCase().replace(/\s+/g, '')
  const matchedEntry = Object.entries(HEADER_HINTS).find(([key]) =>
    normalized.includes(key.toLowerCase().replace(/\s+/g, ''))
  )
  return matchedEntry ? matchedEntry[1] : ''
}

export const BulkDeviceImport: React.FC<BulkDeviceImportProps> = ({ isOpen, onClose, onImport }) => {
  const [step, setStep] = useState<ImportStep>('upload')
  const [csvData, setCsvData] = useState<ParsedCSVData | null>(null)
  const [fieldMapping, setFieldMapping] = useState<Record<string, keyof DeviceImportData | ''>>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [mappingErrors, setMappingErrors] = useState<string[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const mappedDevices = useMemo(() => {
    if (!csvData) return []
    return csvData.rows.map(row => {
      const partial: Partial<DeviceImportData> = {}
      csvData.headers.forEach((header, index) => {
        const target = fieldMapping[header]
        if (target) {
          const rawValue = row[index]?.trim() ?? ''
          if (target === 'device_type') {
            partial.device_type = normalizeDeviceType(rawValue)
          } else {
            partial[target] = rawValue as never
          }
        }
      })
      return normalizeDevice(partial)
    })
  }, [csvData, fieldMapping])

  const resetState = () => {
    setStep('upload')
    setCsvData(null)
    setFieldMapping({})
    setImportResult(null)
    setMappingErrors([])
    setUploadErrors([])
  }

  const handleClose = () => {
    if (isProcessing) return
    resetState()
    onClose()
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const parseCSV = (content: string): ParsedCSVData => {
    const lines = content
      .split('\n')
      .map(line => line.replace(/\r$/, ''))
      .filter(line => line.trim().length > 0)

    if (lines.length <= 1) {
      throw new Error('CSV 内容为空或缺少数据行')
    }

    const headers = lines[0]
      .split(',')
      .map(cell => cell.trim().replace(/^"|"$/g, ''))

    const rows = lines.slice(1).map(line =>
      line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    )

    return { headers, rows }
  }

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 允许用户重复选择同一个文件
    event.target.value = ''

    const fileName = file.name?.toLowerCase?.() ?? ''
    if (!fileName.endsWith('.csv')) {
      setUploadErrors(['仅支持 CSV 文件（.csv）。请先使用“下载模板”生成模板文件。'])
      return
    }

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const content = (e.target?.result ?? '') as string
        const parsed = parseCSV(content)
        const defaultMapping: Record<string, keyof DeviceImportData | ''> = {}
        parsed.headers.forEach(header => {
          defaultMapping[header] = detectField(header)
        })
        setCsvData(parsed)
        setFieldMapping(defaultMapping)
        setMappingErrors([])
        setUploadErrors([])
        setStep('mapping')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'CSV 解析失败'
        console.error('CSV 解析失败:', error)
        setCsvData(null)
        setFieldMapping({})
        setMappingErrors([])
        setUploadErrors([`${message}。请检查文件编码与分隔符（需为英文逗号“,”）。`])
        setStep('upload')
      }
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const handleMappingConfirm = () => {
    const missing = FIELD_DEFINITIONS
      .filter(field => field.required)
      .filter(field => !Object.values(fieldMapping).includes(field.key))
      .map(field => field.label)

    if (missing.length > 0) {
      setMappingErrors(missing.map(label => `缺少必填字段映射：${label}`))
      return
    }

    setMappingErrors([])
    setStep('preview')
  }

  const isValidIpAddress = (candidate: string): boolean => {
    const value = candidate.trim()
    if (!value) return false

    const ipv4Segment = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
    const ipv4Pattern = new RegExp(`^${ipv4Segment}(\\.${ipv4Segment}){3}$`)
    if (ipv4Pattern.test(value)) return true

    // 简化的 IPv6 校验：允许常见的 :: 压缩形式；不做过度严格校验，避免误伤合法地址
    if (value.includes(':')) {
      const ipv6Pattern = /^[0-9a-fA-F:]+$/
      if (!ipv6Pattern.test(value)) return false
      if (value.split(':').length > 9) return false
      return true
    }

    return false
  }

  const handleImport = async () => {
    setIsProcessing(true)
    try {
      // 前置校验：避免后端 422 导致整批失败
      const validationErrors = mappedDevices
        .map((device, index) => {
          const errors: string[] = []
          if (!device.name.trim()) errors.push('设备名称不能为空')
          if (!device.ip.trim()) {
            errors.push('IP 地址不能为空')
          } else if (!isValidIpAddress(device.ip)) {
            errors.push('IP 地址格式不正确')
          }

          return errors.length > 0
            ? { row: index + 2, data: device, error: errors.join('；') }
            : null
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (validationErrors.length > 0) {
        setImportResult({
          success: false,
          imported_count: 0,
          skipped_count: 0,
          errors: validationErrors,
          message: '导入失败：存在无效数据，请修正后重试',
        })
        setStep('result')
        return
      }

      const result = await onImport(mappedDevices)
      setImportResult(result)
      setStep('result')
    } catch (error) {
      const message = error instanceof Error ? error.message : '设备导入失败'
      console.error('导入失败:', error)
      setImportResult({
        success: false,
        imported_count: 0,
        skipped_count: 0,
        errors: mappedDevices.slice(0, 1).map(data => ({ row: 0, data, error: message })),
        message,
      })
      setStep('result')
    } finally {
      setIsProcessing(false)
    }
  }

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
          <Upload className="h-8 w-8 text-blue-600" />
        </div>
      </div>
      <ModalHeader className="text-center">
        <ModalTitle>批量导入设备</ModalTitle>
        <ModalDescription>通过上传 CSV 文件批量导入设备信息。</ModalDescription>
      </ModalHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">CSV 文件导入</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {uploadErrors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm rounded-lg p-4 space-y-1">
                {uploadErrors.map(errorMessage => (
                  <div key={errorMessage} className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{errorMessage}</span>
                  </div>
                ))}
              </div>
            )}
            <div
              onClick={handleUploadClick}
              className="flex flex-col gap-3 border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
            >
              <FileText className="h-10 w-10 mx-auto text-blue-500" />
              <div className="text-sm text-muted-foreground">
                点击上传或将文件拖拽到此区域，支持 CSV 格式。请先使用主界面的"下载模板"按钮获取模板文件。
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderMappingStep = () => (
    <div className="space-y-6">
      <ModalHeader>
        <ModalTitle>字段映射</ModalTitle>
        <ModalDescription>请确认 CSV 列与系统字段的对应关系。</ModalDescription>
      </ModalHeader>
      {mappingErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm rounded-lg p-4 space-y-1">
          {mappingErrors.map(errorMessage => (
            <div key={errorMessage} className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{errorMessage}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-4">
        {csvData?.headers.map(header => (
          <div key={header} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <p className="text-sm font-medium text-foreground">{header}</p>
              <p className="text-xs text-muted-foreground">来自 CSV 文件</p>
            </div>
            <div className="md:col-span-2">
              <Select
                value={fieldMapping[header] ?? ''}
                onValueChange={value => {
                  if (value === UNMAPPED_FIELD_VALUE) {
                    setFieldMapping(prev => ({ ...prev, [header]: '' }))
                    return
                  }
                  setFieldMapping(prev => ({ ...prev, [header]: value as keyof DeviceImportData }))
                }}
              >
                <SelectTrigger aria-label={`CSV列字段映射-${header}`}>
                  <SelectValue placeholder="请选择对应字段" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNMAPPED_FIELD_VALUE}>不映射（忽略该列）</SelectItem>
                  {FIELD_DEFINITIONS.map(field => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label}
                      {field.required ? '（必填）' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setStep('upload')} disabled={isProcessing}>
          上一步
        </Button>
        <Button onClick={handleMappingConfirm} disabled={isProcessing}>
          下一步
        </Button>
      </div>
    </div>
  )

  const renderPreviewStep = () => {
    const previewDevices = mappedDevices
    return (
      <div className="space-y-6">
        <ModalHeader>
          <ModalTitle>导入预览</ModalTitle>
          <ModalDescription>共有 {previewDevices.length} 条记录将被导入。</ModalDescription>
        </ModalHeader>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => setStep('mapping')} disabled={isProcessing}>
            返回修改
          </Button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>名称</span>
            <span>IP 地址</span>
            <span>类型</span>
            <span>位置</span>
            <span>描述</span>
            <span>SNMP 团体字符串</span>
            <span>SSH 用户名</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y">
            {previewDevices.map((device, index) => (
              <div key={`${device.name || device.ip || 'device'}-${index}`} className="grid grid-cols-7 px-4 py-2 text-xs text-foreground/90">
                <span>{device.name || '-'}</span>
                <span>{device.ip || '-'}</span>
                <span>{device.device_type}</span>
                <span>{device.location || '-'}</span>
                <span className="truncate" title={device.description ?? ''}>{device.description || '-'}</span>
                <span>{device.snmp_community || '-'}</span>
                <span>{device.ssh_username || '-'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setStep('mapping')} disabled={isProcessing}>
            上一步
          </Button>
          <Button
            onClick={handleImport}
            disabled={isProcessing || mappedDevices.length === 0}
          >
            {isProcessing ? <Loading size="sm" /> : '开始导入'}
          </Button>
        </div>
      </div>
    )
  }

  const renderResultStep = () => {
    const success = importResult?.success === true
    const hasErrors = (importResult?.errors?.length ?? 0) > 0

    const title = success ? (hasErrors ? '导入完成（部分记录未导入）' : '导入完成') : '导入失败'
    const description = importResult?.message
      ? importResult.message
      : success
        ? `已导入 ${importResult?.imported_count ?? 0} 条设备数据。`
        : '设备导入失败'

    return (
      <div className="space-y-6 text-center">
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${success ? 'bg-green-100' : 'bg-red-100'}`}>
          {success ? (
            <CheckCircle className="h-10 w-10 text-green-600" />
          ) : (
            <AlertCircle className="h-10 w-10 text-red-600" />
          )}
        </div>
        <ModalHeader className="text-center">
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{description}</ModalDescription>
        </ModalHeader>
        {importResult && importResult.errors.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-left text-sm text-yellow-800 dark:text-yellow-200">
            <h4 className="font-medium mb-2">以下记录未导入：</h4>
            <ul className="space-y-1 list-disc list-inside">
              {importResult.errors.map((errorItem, index) => (
                <li key={`error-${errorItem.row}-${index}`}>
                  第 {errorItem.row} 行 - {errorItem.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setStep('upload')
              setCsvData(null)
            }}
          >
            继续导入
          </Button>
          <Button onClick={handleClose}>完成</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 关键修改: 将 input 移到 Modal 外部，不受 Portal 卸载影响 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileUpload}
      />
      <Modal
        open={isOpen}
        onOpenChange={open => {
          if (!open) {
            handleClose()
          }
        }}
      >
        <ModalContent className="max-w-4xl">
          <div className="space-y-6">
            {step === 'upload' && renderUploadStep()}
            {step === 'mapping' && renderMappingStep()}
            {step === 'preview' && renderPreviewStep()}
            {step === 'result' && renderResultStep()}
          </div>
        </ModalContent>
      </Modal>
    </>
  )
}
