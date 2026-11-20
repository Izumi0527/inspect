import type { HostSparklinePoint } from '../../types/zabbix-monitoring.types'

interface HostSparklineProps {
  points: HostSparklinePoint[]
  value?: number
}

export function HostSparkline({ points, value }: HostSparklineProps) {
  const values = points
    .map((pt) => pt.cpu)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  if (values.length < 2) {
    return null
  }

  const width = 56
  const height = 18
  const minVal = Math.min(...values, 0)
  const maxVal = Math.max(...values, 100)
  const span = Math.max(1, maxVal - minVal)

  const coords = values.map((val, idx) => {
    const x = (idx / (values.length - 1)) * (width - 2) + 1
    const y = height - 2 - ((val - minVal) / span) * (height - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const latest = value ?? values[values.length - 1]
  const strokeClass =
    latest >= 90 ? 'stroke-danger' : latest >= 75 ? 'stroke-warning' : 'stroke-primary'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <polyline
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClass}
        points={coords.join(' ')}
      />
    </svg>
  )
}
