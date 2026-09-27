import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util'
import ExcelJS from 'exceljs'
import { buildTemplateXlsx, parseTemplateXlsx } from '@/features/inspection/utils/templateExcel'
import type { InspectionTemplate } from '@/features/inspection/types'

// jsdom 不带 TextEncoder/TextDecoder 与 setImmediate，exceljs（经 jszip）要用；浏览器里原生存在
beforeAll(() => {
  Object.assign(globalThis, {
    TextEncoder: NodeTextEncoder,
    TextDecoder: NodeTextDecoder,
    setImmediate: (fn: () => void) => setTimeout(fn, 0),
  })
})

// jsdom 的 Blob 没有 arrayBuffer()，用 FileReader 读
const readBlob = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })

// 解析入口只用到 File.arrayBuffer
const asFile = (data: Blob | ArrayBuffer): File =>
  ({ arrayBuffer: async () => (data instanceof Blob ? readBlob(data) : data) }) as unknown as File

/** 按导入文件的列布局手工拼一个工作簿：模板信息 A-D，检查项 A-E（E 列 metric 可省略） */
const buildWorkbook = async (deviceTypes: string, items: Array<Array<string | number>>) => {
  const workbook = new ExcelJS.Workbook()
  const info = workbook.addWorksheet('模板信息')
  info.addRow(['name', 'description', 'category', 'deviceTypes'])
  info.addRow(['自建模板', '', 'network', deviceTypes])
  const sheet = workbook.addWorksheet('检查项')
  sheet.addRow(['name', 'type', 'config', 'weight', 'metric'])
  items.forEach(item => sheet.addRow(item))
  return asFile(await workbook.xlsx.writeBuffer() as ArrayBuffer)
}

const template: InspectionTemplate = {
  id: '14', name: '服务器巡检（副本）', description: '主机资源', category: 'system', deviceTypes: ['server'],
  isBuiltIn: false, isActive: true, createdAt: '', updatedAt: '',
  checkItems: [
    { id: 'connectivity', name: '设备连通性', type: 'ping', metric: '', weight: 8, config: {} },
    { id: 'disk_usage', name: '磁盘使用率', type: 'snmp', metric: 'disk_usage', weight: 10, config: { threshold: { warning: 80, critical: 90 } } },
  ],
}

describe('模板 Excel 导出与导入', () => {
  // 旧版导出没有 metric 列，导出后再导入的 SNMP 检查项会被后端拒绝
  it('导出后再导入，设备类型与采集指标不丢', async () => {
    const blob = await buildTemplateXlsx(template)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await readBlob(blob))
    expect(workbook.getWorksheet('模板信息')?.getCell('D2').value).toBe('服务器')
    expect(workbook.getWorksheet('检查项')?.getCell('E3').value).toBe('disk_usage')

    const { template: parsed, errors } = await parseTemplateXlsx(asFile(blob))
    expect(errors).toEqual([])
    expect(parsed?.deviceTypes).toEqual(['server'])
    expect(parsed?.checkItems[1]).toEqual(expect.objectContaining({ type: 'snmp', metric: 'disk_usage' }))
  })

  it('设备类型接受中文或英文取值', async () => {
    for (const [raw, want] of [['路由器', 'router'], [' Firewall ', 'firewall'], ['交换机', 'switch']]) {
      const { template: parsed, errors } = await parseTemplateXlsx(await buildWorkbook(raw, [['设备连通性', 'ping', '{}', 1]]))
      expect(errors).toEqual([])
      expect(parsed?.deviceTypes).toEqual([want])
    }
  })

  it('设备类型只能填一种可巡检类型', async () => {
    for (const raw of ['switch, router', '无线AP', 'storage', '']) {
      const { template: parsed, errors } = await parseTemplateXlsx(await buildWorkbook(raw, [['设备连通性', 'ping', '{}', 1]]))
      expect(parsed).toBeNull()
      expect(errors).toEqual([expect.objectContaining({ sheet: '模板信息', column: 'D' })])
    }
  })

  it('SNMP 检查项缺采集指标时按行报错；非 SNMP 项可不填', async () => {
    const { errors } = await parseTemplateXlsx(await buildWorkbook('交换机', [
      ['设备连通性', 'ping', '{}', 1],
      ['CPU 使用率', 'snmp', '{}', 1],
    ]))
    expect(errors).toEqual([expect.objectContaining({ sheet: '检查项', row: 3, column: 'E' })])
  })
})
