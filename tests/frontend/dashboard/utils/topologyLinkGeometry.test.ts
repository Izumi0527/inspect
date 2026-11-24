import {
  computeLinkGeometry,
  estimatePortLabelWidth,
  PORT_LABEL_HEIGHT,
  shouldCurveLink,
} from '@/features/dashboard/utils/topologyLinkGeometry'
import { NODE_H, NODE_W } from '@/features/dashboard/utils/topologyLayout'

describe('topologyLinkGeometry', () => {
  describe('shouldCurveLink', () => {
    it('仅同层且纵向偏移小于 0.6 倍节点高度时画弧线', () => {
      expect(shouldCurveLink(true, { x: 0, y: 100 }, { x: 200, y: 100 })).toBe(true)
      expect(shouldCurveLink(true, { x: 0, y: 100 }, { x: 200, y: 150 })).toBe(true)
      // 同层垂直级联（|dy| >= 57.6）走直线
      expect(shouldCurveLink(true, { x: 100, y: 100 }, { x: 100, y: 158 })).toBe(false)
      expect(shouldCurveLink(true, { x: 100, y: 100 }, { x: 100, y: 232 })).toBe(false)
      // 跨层即使在同一 y 也走直线
      expect(shouldCurveLink(false, { x: 0, y: 100 }, { x: 200, y: 100 })).toBe(false)
    })
  })

  describe('computeLinkGeometry', () => {
    it('极短垂直级联链路（净距 36px / 中心距 132px）两个接口标签均在节点外且互不重叠', () => {
      const from = { x: 200, y: 72 }
      const to = { x: 200, y: 204 }
      const result = computeLinkGeometry({
        from,
        to,
        curved: false,
        sourcePort: 'GigabitEthernet0/0/48',
        targetPort: 'GigabitEthernet0/0/49',
        sourceSlot: 0,
        targetSlot: 0,
      })

      expect(result.curved).toBe(false)
      expect(result.d).toBe('M 200 72 L 200 204')
      // 标签中心必须在两节点矩形之外（距中心 > NODE_H / 2 = 48）
      expect(result.sourceAt.y - from.y).toBeGreaterThan(NODE_H / 2)
      expect(to.y - result.targetAt.y).toBeGreaterThan(NODE_H / 2)
      // 两标签垂直间距 >= PORT_LABEL_HEIGHT + 6
      expect(result.targetAt.y - result.sourceAt.y).toBeGreaterThanOrEqual(PORT_LABEL_HEIGHT + 6)
    })

    it('极端紧贴节点（净距 4px / 中心距 100px）采用 0.34/0.66 与正交错位防止标签叠在一起', () => {
      const from = { x: 200, y: 100 }
      const to = { x: 200, y: 200 }
      const result = computeLinkGeometry({
        from,
        to,
        curved: false,
        sourcePort: 'GE0/0/1',
        targetPort: 'GE0/0/2',
        sourceSlot: 0,
        targetSlot: 0,
      })

      expect(result.sourceAt.y).toBeCloseTo(134)
      expect(result.targetAt.y).toBeCloseTo(166)
      expect(Math.abs(result.sourceAt.x - result.targetAt.x)).toBeCloseTo(16)
    })

    it('跨层斜向链路标签落在节点扩展包围盒之外，不压节点角', () => {
      const from = { x: 200, y: 72 }
      const to = { x: 368, y: 280 }
      const wSource = estimatePortLabelWidth('GigabitEthernet0/0/1')
      const wTarget = estimatePortLabelWidth('GigabitEthernet0/0/24')
      const result = computeLinkGeometry({
        from,
        to,
        curved: false,
        sourcePort: 'GigabitEthernet0/0/1',
        targetPort: 'GigabitEthernet0/0/24',
        sourceSlot: 0,
        targetSlot: 0,
      })

      const outsideSource =
        Math.abs(result.sourceAt.x - from.x) >= NODE_W / 2 + wSource / 2 + 5.9 ||
        Math.abs(result.sourceAt.y - from.y) >= NODE_H / 2 + PORT_LABEL_HEIGHT / 2 + 5.9
      const outsideTarget =
        Math.abs(result.targetAt.x - to.x) >= NODE_W / 2 + wTarget / 2 + 5.9 ||
        Math.abs(result.targetAt.y - to.y) >= NODE_H / 2 + PORT_LABEL_HEIGHT / 2 + 5.9

      expect(outsideSource).toBe(true)
      expect(outsideTarget).toBe(true)
    })

    it('同层水平弧线标签离开节点扩展包围盒，不压节点底边', () => {
      const from = { x: 100, y: 200 }
      const to = { x: 436, y: 200 }
      const wSource = estimatePortLabelWidth('GigabitEthernet0/0/48')
      const result = computeLinkGeometry({
        from,
        to,
        curved: true,
        sourcePort: 'GigabitEthernet0/0/48',
        targetPort: 'GigabitEthernet0/0/48',
        sourceSlot: 0,
        targetSlot: 0,
      })

      expect(result.curved).toBe(true)
      expect(result.d).toMatch(/^M 100 200 Q /)
      const outsideSource =
        Math.abs(result.sourceAt.x - from.x) > NODE_W / 2 + wSource / 2 + 4 ||
        Math.abs(result.sourceAt.y - from.y) > NODE_H / 2 + PORT_LABEL_HEIGHT / 2 + 4
      const outsideTarget =
        Math.abs(result.targetAt.x - to.x) > NODE_W / 2 + wSource / 2 + 4 ||
        Math.abs(result.targetAt.y - to.y) > NODE_H / 2 + PORT_LABEL_HEIGHT / 2 + 4
      expect(outsideSource).toBe(true)
      expect(outsideTarget).toBe(true)
    })
  })
})
