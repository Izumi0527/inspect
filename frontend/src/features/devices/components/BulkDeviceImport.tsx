import React, { useCallback, useMemo, useState } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react'
import {
  Modal,
  ModalContent,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Loading
} from '@/components/atoms'
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
  { key: 'location', label: '位置', required: false },
  { key: 'description', label: '描述', required: false },
  { key: 'snmp_community', label: 'SNMP 团体字符串', required: false },
  { key: 'ssh_username', label: 'SSH 用户名', required: false },
  { key: 'ssh_password', label: 'SSH 密码', required: false }
]

const _DEVICE_TYPES: Array<{ value: DeviceType; label: string }> = [
  { value: 'switch', label: '交换机' },
  { value: 'router', label: '路由器' },
  { value: 'firewall', label: '防火墙' },
  { value: 'wireless_ap', label: '无线 AP' }
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

const normalizeDevice = (partial: Partial<DeviceImportData>): DeviceImportData => ({
  name: partial.name ?? '',
  ip: partial.ip ?? '',
  device_type: normalizeDeviceType(partial.device_type),
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
  }

  const handleClose = () => {
    if (isProcessing) return
    resetState()
    onClose()
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
        setStep('mapping')
      } catch (error) {
        console.error('CSV 解析失败:', error)
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

  const _downloadTemplate = () => {
    const headerLine = '设备名称,IP地址,设备类型,位置,描述,SNMP团体字符串,SSH用户名,SSH密码'
    const sampleLines = [
      '核心交换机1,192.168.1.1,switch,数据中心A,核心网络设备,public,admin,',
      '路由器网关1,192.168.1.254,router,数据中心A,主网关路由器,public,admin,',
      '边界防火墙1,192.168.1.100,firewall,数据中心B,边界防护设备,public,admin,'
    ]
    const csvContent = [headerLine, ...sampleLines].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '设备导入模板.csv'
    link.click()
  }

  const handleImport = async () => {
    setIsProcessing(true)
    try {
      const result = await onImport(mappedDevices)
      setImportResult(result)
      setStep('result')
    } catch (error) {
      console.error('导入失败:', error)
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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">批量导入设备</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">通过上传 CSV 文件批量导入设备信息。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">CSV 文件导入</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <label className="flex flex-col gap-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              <FileText className="h-10 w-10 mx-auto text-blue-500" />
              <div className="text-sm text-gray-600 dark:text-gray-400">
                点击上传或将文件拖拽到此区域，支持 CSV 格式。请先使用主界面的"下载模板"按钮获取模板文件。
              </div>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderMappingStep = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">字段映射</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">请确认 CSV 列与系统字段的对应关系。</p>
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
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{header}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">来自 CSV 文件</p>
            </div>
            <div className="md:col-span-2">
              <Select
                value={fieldMapping[header] ?? ''}
                onValueChange={value =>
                  setFieldMapping(prev => ({ ...prev, [header]: value ? (value as keyof DeviceImportData) : '' }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择对应字段" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">忽略该列</SelectItem>
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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入预览</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">共有 {previewDevices.length} 条记录将被导入。</p>
          </div>
          <Button variant="ghost" onClick={() => setStep('mapping')} disabled={isProcessing}>
            返回修改
          </Button>
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">
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
              <div key={`${device.name || device.ip || 'device'}-${index}`} className="grid grid-cols-7 px-4 py-2 text-xs text-gray-700 dark:text-gray-300">
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

  const renderResultStep = () => (
    <div className="space-y-6 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="h-10 w-10 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入完成</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">已导入 {importResult?.imported_count ?? 0} 条设备数据。</p>
      </div>
      {importResult && importResult.errors.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 text-left text-sm text-yellow-800 dark:text-yellow-200">
          <h4 className="font-medium mb-2">以下记录导入失败：</h4>
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

  return (
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
  )
}
