import { describeVRPModule } from '@/lib/plain-language/dictionary'

describe('FutureMatrix 新增 VRP 日志模块中文词典', () => {
  it('覆盖 CLOUDMNG / IFMCOMM / SYSMNG / WEBM', () => {
    expect(describeVRPModule('CLOUDMNG')).toBe('云管理')
    expect(describeVRPModule('ifmcomm')).toBe('接口公共管理')
    expect(describeVRPModule('SYSMNG')).toBe('系统管理')
    expect(describeVRPModule('webm')).toBe('Web 网管')
  })
})
