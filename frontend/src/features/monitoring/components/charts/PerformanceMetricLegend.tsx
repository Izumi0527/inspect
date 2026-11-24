import { cn } from '@/utils/cn'

export type PerformanceMetricKey = 'cpu' | 'memory'

interface PerformanceMetricDefinition {
  key: PerformanceMetricKey
  label: string
  /** 线型：内存用虚线与 CPU 区分，颜色维度留给设备 */
  strokeDasharray?: string
}

/** 性能趋势图展示的指标（网络流量已有独立图表，不再纳入） */
export const PERFORMANCE_METRICS: readonly PerformanceMetricDefinition[] = [
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: '内存', strokeDasharray: '6 4' },
]

export type PerformanceMetricLegendVariant = 'line-style' | 'color'

interface PerformanceMetricLegendProps {
  hiddenMetrics: ReadonlySet<PerformanceMetricKey>
  onToggle: (metric: PerformanceMetricKey) => void
  variant?: PerformanceMetricLegendVariant
}

/**
 * 性能趋势指标图例（放在卡片标题右侧）
 *
 * 点击圆点切换该指标曲线的显示/隐藏：
 * - line-style 模式：CPU 为实心圆点（实线），内存为虚线圆环（虚线），颜色留给设备维度
 * - color 模式：CPU 为品牌色圆点，内存为信息色圆点，与全网聚合态势配色一致
 */
export function PerformanceMetricLegend({
  hiddenMetrics,
  onToggle,
  variant = 'line-style',
}: PerformanceMetricLegendProps) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label="指标显隐">
      {PERFORMANCE_METRICS.map((metric) => {
        const visible = !hiddenMetrics.has(metric.key)
        const isColor = variant === 'color'
        const dotColor = metric.key === 'cpu' ? 'var(--brand)' : 'var(--info)'
        return (
          <button
            key={metric.key}
            type="button"
            aria-pressed={visible}
            title={visible ? `隐藏${metric.label}曲线` : `显示${metric.label}曲线`}
            onClick={() => onToggle(metric.key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-opacity hover:bg-muted/60',
              !visible && 'opacity-40'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-3 w-3 rounded-full',
                !isColor && (metric.strokeDasharray ? 'border-2 border-dashed border-foreground' : 'bg-foreground')
              )}
              style={isColor ? { backgroundColor: dotColor } : undefined}
            />
            <span className={cn(!visible && 'line-through')}>{metric.label}</span>
          </button>
        )
      })}
    </div>
  )
}
