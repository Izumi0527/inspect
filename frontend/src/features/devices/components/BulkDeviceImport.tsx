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
import { DeviceImportData, ImportResult } from '../types'
import {
  IMPORT_FIELD_DEFINITIONS,
  ImportFieldKey,
  ParsedCsv,
  RawImportRow,
  buildImportDevice,
  decodeCsvBytes,
  detectImportField,
  parseCsv,
} from '../utils/deviceImportCsv'

type ImportStep = 'upload' | 'mapping' | 'preview' | 'result'

interface BulkDeviceImportProps {
  isOpen: boolean
  onClose: () => void
  onImport: (devices: DeviceImportData[]) => Promise<ImportResult>
}

type FieldMapping = Record<string, ImportFieldKey | ''>

const UNMAPPED_FIELD_VALUE = '__unmapped__'

const CLI_PROTOCOL_LABELS: Record<NonNullable<DeviceImportData['cli_protocol']>, string> = {
  ssh: 'SSH',
  telnet: 'Telnet',
  none: '无',
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

/** 行级校验：必填、IP 格式，以及"选了 CLI 协议却没给用户名"这类会让巡检必然失败的组合。 */
export const validateImportDevice = (device: DeviceImportData): string[] => {
  const errors: string[] = []
  if (!device.name.trim()) errors.push('设备名称不能为空')
  if (!device.ip.trim()) {
    errors.push('IP 地址不能为空')
  } else if (!isValidIpAddress(device.ip)) {
    errors.push('IP 地址格式不正确')
  }
  if (device.cli_protocol === 'ssh' && !device.ssh_username) errors.push('CLI 协议为 SSH 时必须填写 SSH 用户名')
  if (device.cli_protocol === 'telnet' && !device.telnet_username) errors.push('CLI 协议为 Telnet 时必须填写 Telnet 用户名')
  return errors
}

export const BulkDeviceImport: React.FC<BulkDeviceImportProps> = ({ isOpen, onClose, onImport }) => {
  const [step, setStep] = useState<ImportStep>('upload')
  const [csvData, setCsvData] = useState<ParsedCsv | null>(null)
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [mappingErrors, setMappingErrors] = useState<string[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const mappedDevices = useMemo(() => {
    if (!csvData) return []
    return csvData.rows.map(row => {
      const raw: RawImportRow = {}
      csvData.headers.forEach((header, index) => {
        const target = fieldMapping[header]
        if (target) {
          raw[target] = row[index] ?? ''
        }
      })
      return buildImportDevice(raw)
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
        const buffer = e.target?.result
        const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array()
        const parsed = parseCsv(decodeCsvBytes(bytes))
        const defaultMapping: FieldMapping = {}
        parsed.headers.forEach(header => {
          defaultMapping[header] = detectImportField(header)
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
    // 按字节读取再自行判定编码：Excel 另存的 ANSI(GBK) CSV 用 readAsText('utf-8') 会全部乱码
    reader.readAsArrayBuffer(file)
  }, [])

  const handleMappingConfirm = () => {
    const mappedKeys = Object.values(fieldMapping)
    const missing = IMPORT_FIELD_DEFINITIONS
      .filter(field => field.required)
      .filter(field => !mappedKeys.includes(field.key))
      .map(field => `缺少必填字段映射：${field.label}`)

    const seen = new Map<ImportFieldKey, string[]>()
    Object.entries(fieldMapping).forEach(([header, key]) => {
      if (!key) return
      seen.set(key, [...(seen.get(key) ?? []), header])
    })
    const duplicated = Array.from(seen.entries())
      .filter(([, headers]) => headers.length > 1)
      .map(([key, headers]) => {
        const label = IMPORT_FIELD_DEFINITIONS.find(field => field.key === key)?.label ?? key
        return `字段「${label}」被多列同时映射：${headers.join('、')}`
      })

    const problems = [...missing, ...duplicated]
    if (problems.length > 0) {
      setMappingErrors(problems)
      return
    }

    setMappingErrors([])
    setStep('preview')
  }

  const handleImport = async () => {
    setIsProcessing(true)
    try {
      // 前置校验：避免后端 422 导致整批失败
      const validationErrors = mappedDevices
        .map((device, index) => {
          const errors = validateImportDevice(device)
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
                点击上传 CSV 文件（UTF-8 或 Excel 另存的 ANSI 编码均可）。请先使用主界面的"下载模板"按钮获取模板文件。
              </div>
              <div className="text-xs text-muted-foreground">
                设备类型可填 switch/router/firewall/ap 或中文；厂商可填 huawei/h3c/other 或中文；CLI 协议留空时按填写的 SSH/Telnet 用户名自动判断。
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
      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
        {csvData?.headers.map(header => (
          <div key={header} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <p className="text-sm font-medium text-foreground">{header}</p>
              <p className="text-xs text-muted-foreground">来自 CSV 文件</p>
            </div>
            <div className="md:col-span-2">
              <Select
                value={fieldMapping[header] || UNMAPPED_FIELD_VALUE}
                onValueChange={value => {
                  if (value === UNMAPPED_FIELD_VALUE) {
                    setFieldMapping(prev => ({ ...prev, [header]: '' }))
                    return
                  }
                  setFieldMapping(prev => ({ ...prev, [header]: value as ImportFieldKey }))
                }}
              >
                <SelectTrigger aria-label={`CSV列字段映射-${header}`}>
                  <SelectValue placeholder="请选择对应字段" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNMAPPED_FIELD_VALUE}>不映射（忽略该列）</SelectItem>
                  {IMPORT_FIELD_DEFINITIONS.map(field => (
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
    const columns = ['名称', 'IP 地址', '类型', '厂商', 'SNMP', 'CLI', '位置']
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
            {columns.map(column => (
              <span key={column}>{column}</span>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto divide-y">
            {previewDevices.map((device, index) => {
              const snmpSummary = device.snmp_version === 'v3'
                ? 'v3'
                : `v2c · ${device.snmp_community ? '已填团体串' : '默认 public'}`
              const cliUser = device.cli_protocol === 'ssh'
                ? device.ssh_username
                : device.cli_protocol === 'telnet'
                  ? device.telnet_username
                  : ''
              const cliSummary = `${CLI_PROTOCOL_LABELS[device.cli_protocol ?? 'none']}${cliUser ? ` · ${cliUser}` : ''}`
              return (
                <div key={`${device.name || device.ip || 'device'}-${index}`} className="grid grid-cols-7 px-4 py-2 text-xs text-foreground/90">
                  <span className="truncate" title={device.name}>{device.name || '-'}</span>
                  <span>{device.ip || '-'}</span>
                  <span>{device.device_type}</span>
                  <span>{device.vendor}</span>
                  <span>{snmpSummary}</span>
                  <span className="truncate" title={cliSummary}>{cliSummary}</span>
                  <span className="truncate" title={device.location ?? ''}>{device.location || '-'}</span>
                </div>
              )
            })}
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
