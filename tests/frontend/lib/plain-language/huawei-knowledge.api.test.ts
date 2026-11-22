import { api } from '@/lib/api-client'
import {
  clearHuaweiKnowledgeCache,
  hasHuaweiKnowledgeSignal,
  lookupHuaweiKnowledge,
} from '@/lib/plain-language/huawei-knowledge.api'

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(),
  },
}))

describe('huawei-knowledge.api', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearHuaweiKnowledgeCache()
  })

  describe('hasHuaweiKnowledgeSignal', () => {
    it('识别华为/标准 OID 与 VRP 日志头特征', () => {
      expect(hasHuaweiKnowledgeSignal('SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.2.3')).toBe(true)
      expect(hasHuaweiKnowledgeSignal('OID 1.0.8802.1.1.2.0.0.1 triggered')).toBe(true)
      expect(hasHuaweiKnowledgeSignal('linkDown 1.3.6.1.6.3.1.1.5.3')).toBe(true)
      expect(hasHuaweiKnowledgeSignal('%%01VOSCPU/4/CPU_USAGE_HIGH(l)[123]:CPU high')).toBe(true)
      expect(hasHuaweiKnowledgeSignal('IFNET/4/IF_STATE(l)[0]:Port down')).toBe(true)
    })

    it('普通纯文本、IPv4 地址与普通路径不误触发请求', () => {
      expect(hasHuaweiKnowledgeSignal('')).toBe(false)
      expect(hasHuaweiKnowledgeSignal('Device 10.0.0.1 unreachable')).toBe(false)
      expect(hasHuaweiKnowledgeSignal('普通文本告警描述，不含 OID 或 VRP 日志头')).toBe(false)
      expect(hasHuaweiKnowledgeSignal('GET /api/v1/0/healthcheck')).toBe(false)
    })
  })

  describe('lookupHuaweiKnowledge', () => {
    it('支持 { success: true, data } 解包并命中内存缓存', async () => {
      const mockPayload = {
        matched: true,
        kind: 'alarm',
        alarm: {
          oid: '1.3.6.1.4.1.2011.5.25.219.2.14.1',
          module: 'HUAWEI-ENTITY-TRAP-MIB',
          alarm_name: 'hwCPUUtilizationRisingAlarm',
          meaning: 'CPU 利用率超过阈值',
          causes: ['控制平面报文突发'],
          procedures: ['执行 display cpu-usage 查看高占用进程'],
        },
      }
      ;(api.get as jest.Mock).mockResolvedValueOnce({
        success: true,
        data: mockPayload,
      })

      const controller = new AbortController()
      const first = await lookupHuaweiKnowledge(
        { oid: '1.3.6.1.4.1.2011.5.25.219.2.14.1' },
        controller.signal
      )
      const second = await lookupHuaweiKnowledge(
        { oid: ' 1.3.6.1.4.1.2011.5.25.219.2.14.1 ' },
        controller.signal
      )

      expect(first).toEqual(mockPayload)
      expect(second).toEqual(mockPayload)
      expect(api.get).toHaveBeenCalledTimes(1)
      expect(api.get).toHaveBeenCalledWith('/knowledge/huawei/lookup', {
        params: { oid: '1.3.6.1.4.1.2011.5.25.219.2.14.1' },
        signal: controller.signal,
        retry: 0,
      })
    })

    it('缓存上限 200 条执行 FIFO 淘汰', async () => {
      ;(api.get as jest.Mock).mockImplementation(async () => ({
        success: true,
        data: { matched: false, kind: '' },
      }))

      for (let i = 0; i < 205; i += 1) {
        await lookupHuaweiKnowledge({ oid: `1.3.6.1.4.1.2011.5.25.1.1.${i}` })
      }
      expect(api.get).toHaveBeenCalledTimes(205)

      // 第 204 条仍在缓存中，不触发请求
      await lookupHuaweiKnowledge({ oid: '1.3.6.1.4.1.2011.5.25.1.1.204' })
      expect(api.get).toHaveBeenCalledTimes(205)

      // 第 0 条已被 FIFO 淘汰，重新请求
      await lookupHuaweiKnowledge({ oid: '1.3.6.1.4.1.2011.5.25.1.1.0' })
      expect(api.get).toHaveBeenCalledTimes(206)
    })

    it('请求异常或信号已中止时静默降级返回 null，不抛出错误', async () => {
      ;(api.get as jest.Mock).mockRejectedValueOnce(new Error('network down'))

      const failed = await lookupHuaweiKnowledge({ message: '%%01VOSCPU/4/CPU_USAGE_HIGH:high' })
      expect(failed).toBeNull()

      const controller = new AbortController()
      controller.abort()
      const aborted = await lookupHuaweiKnowledge(
        { oid: '1.3.6.1.4.1.2011.5.25.219.2.2.3' },
        controller.signal
      )
      expect(aborted).toBeNull()
      expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('超长中英文混合日志（>3000 字节）按 UTF-8 2048 字节围绕 OID / VRP 信号安全截断并保留特征', async () => {
      ;(api.get as jest.Mock).mockResolvedValue({
        success: true,
        data: { matched: true, kind: 'log' },
      })

      const prefix = '前置冗长业务日志内容_LogPrefix_'.repeat(120) // > 3500 bytes
      const tailOid = 'SNMP Trap 1.3.6.1.4.1.2011.5.25.219.2.14.1 触发告警，后缀补充信息。'
      const longOidMessage = `${prefix}${tailOid}`
      expect(Buffer.byteLength(longOidMessage, 'utf8')).toBeGreaterThan(3000)

      await lookupHuaweiKnowledge({ message: longOidMessage })

      const oidCallParams = (api.get as jest.Mock).mock.calls[0][1].params as {
        message: string
      }
      expect(Buffer.byteLength(oidCallParams.message, 'utf8')).toBeLessThanOrEqual(2048)
      expect(oidCallParams.message).toContain('1.3.6.1.4.1.2011.5.25.219.2.14.1')

      const tailVrp =
        '%%01VOSCPU/4/CPU_USAGE_HIGH(l)[123]:The CPU usage exceeded the threshold.'
      const longVrpMessage = `${prefix}${tailVrp}`
      expect(Buffer.byteLength(longVrpMessage, 'utf8')).toBeGreaterThan(3000)

      await lookupHuaweiKnowledge({ message: longVrpMessage })

      const vrpCallParams = (api.get as jest.Mock).mock.calls[1][1].params as {
        message: string
      }
      expect(Buffer.byteLength(vrpCallParams.message, 'utf8')).toBeLessThanOrEqual(2048)
      expect(vrpCallParams.message).toContain('%%01VOSCPU/4/CPU_USAGE_HIGH')
    })
  })
})
