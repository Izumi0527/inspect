import { useSyncExternalStore } from 'react'

/**
 * 图表主题单一来源：网格线配色与暗色主题探测。
 *
 * 图表原子（折线/柱状/饼图）与自绘 SVG 的接口流量图共用这里，保证同一页面内网格观感一致、
 * 切主题时一起跟随。刻意放在 lib 而非图表原子模块里：部分测试会把整个图表原子模块替换成
 * 只含折线图的替身，自绘图表若从图表原子导入这些工具，替身一缺导出就会崩。
 */

/**
 * 网格线强度：subdued 是全域默认（近乎背景纹理），prominent 供监控中心这类需要清晰读数的折线图使用。
 */
export type ChartGridTone = 'subdued' | 'prominent'

/**
 * 网格线配色：subdued 保持各页面既有观感，prominent 只加深一档。
 * prominent 不能继续加深——设备调色板里最浅的橙色（#F59E0B，白底对比度约 2.1:1）
 * 是最弱的一条数据线，网格一旦超过它，格子就会盖住曲线，读数反而变差。
 */
const CHART_GRID_PALETTE: Record<ChartGridTone, { light: string; dark: string }> = {
  subdued: { light: '#e5e7eb', dark: '#374151' },
  prominent: { light: '#bcc6d2', dark: '#4b5563' },
}

/** 虚线节奏：prominent 用更长的划线段，视觉上从"细密噪点"变成"明确的虚线" */
const CHART_GRID_DASH: Record<ChartGridTone, string> = {
  subdued: '3,3',
  prominent: '6,5',
}

/** 网格线样式：颜色随主题、虚线节奏随强度 */
export function resolveChartGridStyle(
  tone: ChartGridTone,
  isDark: boolean
): { stroke: string; dasharray: string } {
  const palette = CHART_GRID_PALETTE[tone]
  return { stroke: isDark ? palette.dark : palette.light, dasharray: CHART_GRID_DASH[tone] }
}

// 订阅 <html> 的 class 变化：主题切换只改 class、不会触发图表重渲染，
// 仅在渲染时读一次会让上一个主题的颜色残留到下次重渲染（加深后的网格尤其明显）。
function subscribeDocumentClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const readDocumentDark = () => document.documentElement.classList.contains('dark')
const readServerDark = () => false

/** 当前是否暗色主题（随 <html class="dark"> 实时更新）；判定依据与原先的 classList 读法一致 */
export function useDocumentDarkClass(): boolean {
  return useSyncExternalStore(subscribeDocumentClass, readDocumentDark, readServerDark)
}
