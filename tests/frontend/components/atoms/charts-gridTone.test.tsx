import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { LineChartComponent } from '@/components/atoms/charts'

// jsdom 不实现 SVG 文本测量，@visx/axis 会 console.warn；补一个固定宽度让坐标轴标签静默渲染
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 40,
  })
})

const data = [
  { time: '12:00', value: 10 },
  { time: '12:03', value: 20 },
  { time: '12:06', value: 15 },
]
const lines = [{ key: 'value', name: '值', color: '#0891B2' }]
const xTickValues = ['12:00', '12:06']

/** 网格线是唯一带 strokeDasharray 的图元，可据此把它们与数据线、坐标轴区分开 */
const gridLines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('line[stroke-dasharray]'))

const horizontal = (nodes: Element[]) =>
  nodes.filter((node) => node.getAttribute('y1') === node.getAttribute('y2'))
const vertical = (nodes: Element[]) =>
  nodes.filter((node) => node.getAttribute('x1') === node.getAttribute('x2'))

describe('LineChartComponent 网格线强度（gridTone）', () => {
  it('缺省 subdued：保持全域既有的浅色细虚线，横竖都有', () => {
    const { container } = render(
      <LineChartComponent data={data} xKey="time" lines={lines} xTickValues={xTickValues} />
    )

    const grids = gridLines(container)
    expect(horizontal(grids).length).toBeGreaterThan(0)
    expect(vertical(grids).length).toBeGreaterThan(0)
    for (const node of grids) {
      expect(node.getAttribute('stroke')).toBe('#e5e7eb')
      expect(node.getAttribute('stroke-dasharray')).toBe('3,3')
    }
  })

  it('prominent：横竖网格线都换成更醒目虚线（颜色更深、划线段更长）', () => {
    const { container } = render(
      <LineChartComponent
        data={data}
        xKey="time"
        lines={lines}
        xTickValues={xTickValues}
        gridTone="prominent"
      />
    )

    const grids = gridLines(container)
    expect(horizontal(grids).length).toBeGreaterThan(0)
    expect(vertical(grids).length).toBeGreaterThan(0)
    for (const node of grids) {
      expect(node.getAttribute('stroke')).toBe('#bcc6d2')
      expect(node.getAttribute('stroke-dasharray')).toBe('6,5')
      // 网格线保持 1px 细线：醒目 ≠ 加粗，加粗会让它盖过曲线
      expect(node.getAttribute('stroke-width') ?? '1').toBe('1')
    }
  })

  it('暗色主题下 prominent 用深色网格线，仍是虚线', () => {
    document.documentElement.classList.add('dark')
    try {
      const { container } = render(
        <LineChartComponent
          data={data}
          xKey="time"
          lines={lines}
          xTickValues={xTickValues}
          gridTone="prominent"
        />
      )

      const grids = gridLines(container)
      expect(grids.length).toBeGreaterThan(0)
      for (const node of grids) {
        expect(node.getAttribute('stroke')).toBe('#4b5563')
        expect(node.getAttribute('stroke-dasharray')).toBe('6,5')
      }
    } finally {
      document.documentElement.classList.remove('dark')
    }
  })

  // 浏览器实测缺陷：主题只在渲染时读一次，切到浅色后暗色网格（#4b5563）残留在白底上，压过数据线；
  // 网格颜色必须跟随 <html> 上 dark 类的变化重新渲染，不能等到刷新页面。
  it('运行中切换主题时网格颜色随之更新，无需刷新页面', async () => {
    document.documentElement.classList.add('dark')
    try {
      const { container } = render(
        <LineChartComponent
          data={data}
          xKey="time"
          lines={lines}
          xTickValues={xTickValues}
          gridTone="prominent"
        />
      )
      expect(gridLines(container)[0].getAttribute('stroke')).toBe('#4b5563')

      await act(async () => {
        document.documentElement.classList.remove('dark')
      })

      await waitFor(() => {
        for (const node of gridLines(container)) {
          expect(node.getAttribute('stroke')).toBe('#bcc6d2')
        }
      })
    } finally {
      document.documentElement.classList.remove('dark')
    }
  })
})
