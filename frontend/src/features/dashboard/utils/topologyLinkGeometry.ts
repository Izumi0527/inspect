import type { TopologyPoint } from '../types'
import { NODE_H, NODE_W } from './topologyLayout'
import { abbreviatePort } from './topologyPorts'

export const PORT_LABEL_HEIGHT = 14
export const PORT_LABEL_CHAR_W = 5.6
export const PORT_LABEL_PAD = 8
export const PORT_LABEL_STAGGER = 18
export const PORT_LABEL_SLOTS = 3

const MIN_DESIRED_DIST = 70
const NODE_BOX_PAD = 6
const CURVE_BOX_PAD = 4
const LABEL_GAP = 6
const CURVE_T_MIN = 0.05
const CURVE_T_MAX = 0.44
const CURVE_T_STEP = 0.02
const ORTHO_STAGGER = 8

export interface LinkGeometryParams {
  from: TopologyPoint
  to: TopologyPoint
  curved: boolean
  sourcePort: string
  targetPort: string
  sourceSlot: number
  targetSlot: number
}

export interface LinkGeometryResult {
  d: string
  curved: boolean
  sourceAt: TopologyPoint
  targetAt: TopologyPoint
}

export const estimatePortLabelWidth = (port: string): number => {
  const short = abbreviatePort(port)
  return short === '' ? 0 : short.length * PORT_LABEL_CHAR_W + PORT_LABEL_PAD
}

export const shouldCurveLink = (
  sameLogicalTier: boolean,
  from: TopologyPoint,
  to: TopologyPoint
): boolean => sameLogicalTier && Math.abs(from.y - to.y) < NODE_H * 0.6

const rayExitDist = (ux: number, uy: number, halfW: number, halfH: number): number => {
  const tx = Math.abs(ux) > 1e-6 ? halfW / Math.abs(ux) : Infinity
  const ty = Math.abs(uy) > 1e-6 ? halfH / Math.abs(uy) : Infinity
  return Math.min(tx, ty)
}

const computeMinBetween = (ux: number, uy: number, wSource: number, wTarget: number): number => {
  if (wSource <= 0 || wTarget <= 0) return 0
  const tx = Math.abs(ux) > 1e-6 ? (wSource / 2 + wTarget / 2 + LABEL_GAP) / Math.abs(ux) : Infinity
  const ty = Math.abs(uy) > 1e-6 ? (PORT_LABEL_HEIGHT + LABEL_GAP) / Math.abs(uy) : Infinity
  return Math.min(tx, ty)
}

const quadPoint = (a: TopologyPoint, c: TopologyPoint, b: TopologyPoint, t: number): TopologyPoint => {
  const mt = 1 - t
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  }
}

const resolveStraightDistances = (
  chord: number, nodeExit: number, minBetween: number,
  dSource: number, dTarget: number, safeSource: number, safeTarget: number
): [number, number] | null => {
  const budget = chord - minBetween
  if (dSource + dTarget <= budget) return [dSource, dTarget]
  if (safeSource + safeTarget <= budget) {
    const availSource = Math.max(0, dSource - safeSource)
    const availTarget = Math.max(0, dTarget - safeTarget)
    const totalAvail = availSource + availTarget
    if (totalAvail <= 0) return [safeSource, safeTarget]
    const excess = dSource + dTarget - budget
    return [dSource - excess * (availSource / totalAvail), dTarget - excess * (availTarget / totalAvail)]
  }
  if (chord - 2 * nodeExit >= minBetween + 4) {
    const slack = budget - 2 * nodeExit
    return [nodeExit + slack / 2, nodeExit + slack / 2]
  }
  return null
}

const computeStraightGeometry = (params: LinkGeometryParams): LinkGeometryResult => {
  const { from, to, sourcePort, targetPort, sourceSlot, targetSlot } = params
  const dx = to.x - from.x
  const dy = to.y - from.y
  const rawLen = Math.hypot(dx, dy)
  const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  if (rawLen < 1e-6) {
    return { d, curved: false, sourceAt: { x: from.x - 16, y: from.y - ORTHO_STAGGER }, targetAt: { x: to.x + 16, y: to.y + ORTHO_STAGGER } }
  }
  const chord = Math.max(1, rawLen)
  const ux = dx / chord
  const uy = dy / chord
  const wSource = estimatePortLabelWidth(sourcePort)
  const wTarget = estimatePortLabelWidth(targetPort)
  const nodeExit = rayExitDist(ux, uy, NODE_W / 2, NODE_H / 2)
  const safeDist = (w: number) =>
    w > 0 ? rayExitDist(ux, uy, NODE_W / 2 + w / 2 + NODE_BOX_PAD, NODE_H / 2 + PORT_LABEL_HEIGHT / 2 + NODE_BOX_PAD) : nodeExit + 8
  const desired = (slot: number, w: number) =>
    Math.max(MIN_DESIRED_DIST, safeDist(w)) + (slot % PORT_LABEL_SLOTS) * PORT_LABEL_STAGGER

  const resolved = resolveStraightDistances(
    chord, nodeExit, computeMinBetween(ux, uy, wSource, wTarget),
    desired(sourceSlot, wSource), desired(targetSlot, wTarget), safeDist(wSource), safeDist(wTarget)
  )
  if (!resolved) {
    const nx = -uy
    const ny = ux
    return {
      d,
      curved: false,
      sourceAt: { x: from.x + ux * (chord * 0.34) + nx * ORTHO_STAGGER, y: from.y + uy * (chord * 0.34) + ny * ORTHO_STAGGER },
      targetAt: { x: from.x + ux * (chord * 0.66) - nx * ORTHO_STAGGER, y: from.y + uy * (chord * 0.66) - ny * ORTHO_STAGGER },
    }
  }
  return { d, curved: false, sourceAt: { x: from.x + ux * resolved[0], y: from.y + uy * resolved[0] }, targetAt: { x: to.x - ux * resolved[1], y: to.y - uy * resolved[1] } }
}

const findCurveT = (
  anchor: TopologyPoint, from: TopologyPoint, control: TopologyPoint, to: TopologyPoint,
  labelW: number, slot: number, chord: number, reverse: boolean
): number => {
  const halfW = NODE_W / 2 + labelW / 2 + CURVE_BOX_PAD
  const halfH = NODE_H / 2 + PORT_LABEL_HEIGHT / 2 + CURVE_BOX_PAD
  let baseT = CURVE_T_MAX
  for (let t = CURVE_T_MIN; t <= CURVE_T_MAX + 1e-6; t += CURVE_T_STEP) {
    const pt = quadPoint(from, control, to, reverse ? 1 - t : t)
    if (Math.abs(pt.x - anchor.x) > halfW || Math.abs(pt.y - anchor.y) > halfH) {
      baseT = t
      break
    }
  }
  const slotShift = (slot % PORT_LABEL_SLOTS) * (PORT_LABEL_STAGGER / Math.max(1, chord))
  return Math.min(CURVE_T_MAX, baseT + slotShift)
}

const computeCurvedGeometry = (params: LinkGeometryParams): LinkGeometryResult => {
  const { from, to, sourcePort, targetPort, sourceSlot, targetSlot } = params
  const chord = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y))
  const bow = Math.min(160, Math.max(48, chord * 0.3))
  const control = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + bow }
  const tSource = findCurveT(from, from, control, to, estimatePortLabelWidth(sourcePort), sourceSlot, chord, false)
  const tTarget = findCurveT(to, from, control, to, estimatePortLabelWidth(targetPort), targetSlot, chord, true)
  return {
    d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
    curved: true,
    sourceAt: quadPoint(from, control, to, tSource),
    targetAt: quadPoint(from, control, to, 1 - tTarget),
  }
}

export const computeLinkGeometry = (params: LinkGeometryParams): LinkGeometryResult =>
  params.curved ? computeCurvedGeometry(params) : computeStraightGeometry(params)
