/**
 * 巡检模板 Excel (.xlsx) 工具集
 *
 * 用途：替代 JSON 作为模板导入导出格式，让运维 IT 用户用 Excel/WPS 编辑
 *
 * 文件结构（双 Sheet + 单模板单文件）：
 * - Sheet1 "模板信息"：仅 1 行数据，A=name B=description C=category D=deviceType
 *   - C 列下拉：network / system / security / custom
 *   - D 列下拉：交换机 / 路由器 / 防火墙 / 服务器（每个模板只适用一种，导出中文，导入中英文皆可）
 * - Sheet2 "检查项"：≥1 行数据，A=name B=type C=config D=weight E=metric
 *   - B 列下拉：snmp / ssh / http / ping / script
 *   - E 列为 SNMP 采集指标（执行端按它分派取数），追加在末尾，旧版 4 列文件仍可导入
 * - Sheet3 "使用说明"：纯文本指引（仅在下载模板时附带）
 *
 * 解析规则：
 * - 按列号读取（A/B/C/D/E），用户改坏表头不致命
 * - config 列空字符串视为 {}，否则用 JSON.parse 校验
 * - 校验错误按 sheet + row + column 定位
 */

import ExcelJS from 'exceljs'

import {
  INSPECTABLE_DEVICE_TYPE_OPTIONS,
  getDeviceTypeLabel,
  normalizeDeviceType,
  type InspectableDeviceType,
} from '@/utils/deviceTypes'
import type {
  CheckItemType,
  InspectionTemplate,
  TemplateCategory,
} from '../types'

const SHEET_INFO = '模板信息'
const SHEET_ITEMS = '检查项'
const SHEET_HELP = '使用说明'

const TEMPLATE_CATEGORIES: ReadonlyArray<TemplateCategory> = [
  'network',
  'system',
  'security',
  'custom',
]
const CHECK_ITEM_TYPES: ReadonlyArray<CheckItemType> = [
  'snmp',
  'ssh',
  'http',
  'ping',
  'script',
]

const INFO_HEADERS = ['模板名称 name', '描述 description', '分类 category', '适用设备类型 deviceType（只能一种）']
const ITEM_HEADERS = ['检查项名称 name', '类型 type', '配置 config（JSON）', '权重 weight', '采集指标 metric（SNMP 必填）']

const DEVICE_TYPE_LABEL_CHOICES = INSPECTABLE_DEVICE_TYPE_OPTIONS.map(option => option.label)

/** 设备类型单元格 → 取值：接受中文名或英文取值（大小写与空白不敏感），不可巡检的返回 undefined */
const parseDeviceTypeCell = (raw: string): InspectableDeviceType | undefined => {
  const token = normalizeDeviceType(raw)
  return INSPECTABLE_DEVICE_TYPE_OPTIONS.find(option => option.value === token || option.label.toLowerCase() === token)?.value
}

/** 表头黄底加粗样式（统一） */
const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF3CD' },
  },
  alignment: { vertical: 'middle', horizontal: 'left' },
}

export interface ParsedTemplate {
  name: string
  description: string
  category: TemplateCategory
  deviceTypes: string[]
  checkItems: Array<{
    name: string
    type: CheckItemType
    config: Record<string, unknown>
    weight: number
    metric: string
  }>
}

export interface ParseError {
  sheet: string
  row: number
  column: string
  message: string
}

export interface ParseResult {
  template: ParsedTemplate | null
  errors: ParseError[]
}

/**
 * 生成模板 Excel 文件（Blob）。
 * - 不传 template：返回带 1 行示例数据的"空白模板"
 * - 传 template：返回填好的"导出文件"
 */
export async function buildTemplateXlsx(
  template?: InspectionTemplate
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '巡检系统'
  workbook.created = new Date()

  buildInfoSheet(workbook, template)
  buildItemsSheet(workbook, template)
  if (!template) buildHelpSheet(workbook)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * 解析上传的模板 Excel 文件。
 * - 校验失败时 errors 非空，template 可能仍为部分数据（便于在 UI 显示已识别的字段）
 * - 任何关键字段缺失返回 template=null
 */
export async function parseTemplateXlsx(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)

  const errors: ParseError[] = []
  const infoSheet = workbook.getWorksheet(SHEET_INFO)
  const itemsSheet = workbook.getWorksheet(SHEET_ITEMS)

  if (!infoSheet) {
    errors.push({ sheet: SHEET_INFO, row: 0, column: '-', message: `缺少 Sheet "${SHEET_INFO}"` })
  }
  if (!itemsSheet) {
    errors.push({ sheet: SHEET_ITEMS, row: 0, column: '-', message: `缺少 Sheet "${SHEET_ITEMS}"` })
  }
  if (!infoSheet || !itemsSheet) {
    return { template: null, errors }
  }

  const info = parseInfoRow(infoSheet, errors)
  const checkItems = parseItemsRows(itemsSheet, errors)

  if (!info || checkItems.length === 0) {
    return { template: null, errors }
  }

  return {
    template: {
      name: info.name,
      description: info.description,
      category: info.category,
      deviceTypes: info.deviceTypes,
      checkItems,
    },
    errors,
  }
}

// ─── 内部：写入逻辑 ───────────────────────────────────────────

function buildInfoSheet(workbook: ExcelJS.Workbook, template?: InspectionTemplate) {
  const sheet = workbook.addWorksheet(SHEET_INFO)
  sheet.columns = [
    { header: INFO_HEADERS[0], key: 'name', width: 28 },
    { header: INFO_HEADERS[1], key: 'description', width: 40 },
    { header: INFO_HEADERS[2], key: 'category', width: 14 },
    { header: INFO_HEADERS[3], key: 'deviceTypes', width: 28 },
  ]
  sheet.getRow(1).eachCell(cell => Object.assign(cell, HEADER_STYLE))

  const row = template
    ? {
        name: template.name,
        description: template.description ?? '',
        category: template.category,
        deviceTypes: (template.deviceTypes ?? []).map(getDeviceTypeLabel).join('、'),
      }
    : {
        name: '示例：核心交换机日常巡检',
        description: '请按本行格式修改后保存上传',
        category: 'network',
        deviceTypes: '交换机',
      }
  sheet.addRow(row)

  // C 列下拉：分类（仅作用于 C2，避免整列下拉文件偏大）
  sheet.getCell('C2').dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`"${TEMPLATE_CATEGORIES.join(',')}"`],
    showErrorMessage: true,
    errorTitle: '分类无效',
    error: `请从以下值中选择：${TEMPLATE_CATEGORIES.join(' / ')}`,
  }

  // D 列下拉：适用设备类型，只能一种
  sheet.getCell('D2').dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`"${DEVICE_TYPE_LABEL_CHOICES.join(',')}"`],
    showErrorMessage: true,
    errorTitle: '设备类型无效',
    error: `每个模板只能适用一种设备类型，请从以下值中选择：${DEVICE_TYPE_LABEL_CHOICES.join(' / ')}`,
  }
}

function buildItemsSheet(workbook: ExcelJS.Workbook, template?: InspectionTemplate) {
  const sheet = workbook.addWorksheet(SHEET_ITEMS)
  sheet.columns = [
    { header: ITEM_HEADERS[0], key: 'name', width: 28 },
    { header: ITEM_HEADERS[1], key: 'type', width: 12 },
    { header: ITEM_HEADERS[2], key: 'config', width: 50 },
    { header: ITEM_HEADERS[3], key: 'weight', width: 10 },
    { header: ITEM_HEADERS[4], key: 'metric', width: 26 },
  ]
  sheet.getRow(1).eachCell(cell => Object.assign(cell, HEADER_STYLE))

  const rows = template
    ? template.checkItems.map(item => ({
        name: item.name,
        type: item.type,
        config: JSON.stringify(item.config ?? {}),
        weight: item.weight,
        metric: item.metric ?? '',
      }))
    : [
        { name: '设备连通性', type: 'ping', config: '{}', weight: 8, metric: '' },
        { name: 'CPU 使用率', type: 'snmp', config: '{"threshold":{"warning":70,"critical":85}}', weight: 10, metric: 'cpu' },
      ]
  rows.forEach(r => sheet.addRow(r))

  // B 列下拉：检查项类型（覆盖 B2:B201，足以应付常规规模）
  for (let i = 2; i <= 201; i++) {
    sheet.getCell(`B${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CHECK_ITEM_TYPES.join(',')}"`],
      showErrorMessage: true,
      errorTitle: '类型无效',
      error: `请从以下值中选择：${CHECK_ITEM_TYPES.join(' / ')}`,
    }
  }
}

function buildHelpSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(SHEET_HELP)
  sheet.columns = [{ width: 24 }, { width: 80 }]
  const lines: Array<[string, string]> = [
    ['字段', '说明'],
    ['name', '模板名称，必填，≤ 100 字'],
    ['description', '模板描述，可空'],
    ['category', '分类，从下拉选择：network / system / security / custom'],
    ['deviceType', `适用设备类型，只能一种，从下拉选择：${DEVICE_TYPE_LABEL_CHOICES.join(' / ')}（也可填 switch / router / firewall / server）`],
    ['检查项 name', '检查项名称，必填'],
    ['检查项 type', '类型，从下拉选择：snmp / ssh / http / ping / script'],
    ['检查项 config', 'JSON 字符串，可空填 {}。阈值示例：{"threshold":{"warning":70,"critical":85}}'],
    ['检查项 weight', '权重数字，默认 1，越大权重越高'],
    ['检查项 metric', 'SNMP 检查项必填的采集指标，如 cpu / memory / interface / disk_usage；可参照内置模板导出文件的 E 列'],
  ]
  lines.forEach((line, idx) => {
    const row = sheet.addRow(line)
    if (idx === 0) row.eachCell(cell => Object.assign(cell, HEADER_STYLE))
  })
}

// ─── 内部：解析逻辑 ───────────────────────────────────────────

function parseInfoRow(sheet: ExcelJS.Worksheet, errors: ParseError[]) {
  const dataRow = sheet.getRow(2)
  const name = cellText(dataRow.getCell(1))
  const description = cellText(dataRow.getCell(2))
  const categoryRaw = cellText(dataRow.getCell(3)).toLowerCase()
  const deviceTypesRaw = cellText(dataRow.getCell(4))

  if (!name) {
    errors.push({ sheet: SHEET_INFO, row: 2, column: 'A', message: '模板名称 (A2) 不能为空' })
  }
  if (name.length > 100) {
    errors.push({ sheet: SHEET_INFO, row: 2, column: 'A', message: '模板名称 (A2) 不能超过 100 字' })
  }

  let category: TemplateCategory = 'custom'
  if (categoryRaw) {
    if (!TEMPLATE_CATEGORIES.includes(categoryRaw as TemplateCategory)) {
      errors.push({
        sheet: SHEET_INFO,
        row: 2,
        column: 'C',
        message: `分类 (C2) "${categoryRaw}" 不在 ${TEMPLATE_CATEGORIES.join('/')} 中`,
      })
    } else {
      category = categoryRaw as TemplateCategory
    }
  }

  // 每个模板只能适用一种可巡检设备类型（后端保存时同样校验），这里提前按单元格定位报错
  const tokens = deviceTypesRaw.split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
  const deviceType = tokens.length === 1 ? parseDeviceTypeCell(tokens[0]) : undefined
  if (!deviceType) {
    errors.push({
      sheet: SHEET_INFO,
      row: 2,
      column: 'D',
      message: tokens.length > 1
        ? `适用设备类型 (D2) 只能填写一种，当前为「${deviceTypesRaw}」`
        : `适用设备类型 (D2) 须为以下之一：${DEVICE_TYPE_LABEL_CHOICES.join(' / ')}${deviceTypesRaw ? `，当前为「${deviceTypesRaw}」` : ''}`,
    })
  }

  if (!name || !deviceType) return null

  return { name, description, category, deviceTypes: [deviceType] }
}

function parseItemsRows(sheet: ExcelJS.Worksheet, errors: ParseError[]) {
  const items: ParsedTemplate['checkItems'] = []
  // 从第 2 行开始，到 rowCount
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const name = cellText(row.getCell(1))
    const typeRaw = cellText(row.getCell(2)).toLowerCase()
    const configRaw = cellText(row.getCell(3))
    const weightRaw = row.getCell(4).value
    const metric = cellText(row.getCell(5)).toLowerCase()

    // 整行空：跳过
    if (!name && !typeRaw && !configRaw && weightRaw == null && !metric) continue

    if (!name) {
      errors.push({ sheet: SHEET_ITEMS, row: r, column: 'A', message: '检查项名称不能为空' })
      continue
    }
    if (!typeRaw || !CHECK_ITEM_TYPES.includes(typeRaw as CheckItemType)) {
      errors.push({
        sheet: SHEET_ITEMS,
        row: r,
        column: 'B',
        message: `类型 "${typeRaw}" 不在 ${CHECK_ITEM_TYPES.join('/')} 中`,
      })
      continue
    }
    // SNMP 按 metric 分派取数，缺了后端会拒绝整个模板，这里按行定位
    if (typeRaw === 'snmp' && !metric) {
      errors.push({ sheet: SHEET_ITEMS, row: r, column: 'E', message: `SNMP 检查项「${name}」缺少采集指标 metric` })
      continue
    }

    let config: Record<string, unknown> = {}
    if (configRaw.trim()) {
      try {
        const parsed = JSON.parse(configRaw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          config = parsed as Record<string, unknown>
        } else {
          errors.push({ sheet: SHEET_ITEMS, row: r, column: 'C', message: 'config 必须是 JSON 对象，如 {}' })
          continue
        }
      } catch (e) {
        errors.push({
          sheet: SHEET_ITEMS,
          row: r,
          column: 'C',
          message: `config 不是合法 JSON：${e instanceof Error ? e.message : '解析错误'}`,
        })
        continue
      }
    }

    const weight = typeof weightRaw === 'number' ? weightRaw : Number(weightRaw) || 1

    items.push({ name, type: typeRaw as CheckItemType, config, weight, metric })
  }

  if (items.length === 0 && !errors.some(e => e.sheet === SHEET_ITEMS)) {
    errors.push({ sheet: SHEET_ITEMS, row: 2, column: '-', message: '至少需要 1 个检查项' })
  }
  return items
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object' && 'text' in v && typeof (v as { text: unknown }).text === 'string') {
    return ((v as { text: string }).text).trim()
  }
  if (typeof v === 'object' && 'result' in v) {
    return String((v as { result: unknown }).result ?? '').trim()
  }
  return String(v).trim()
}
