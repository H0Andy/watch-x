import { useId } from 'react'
import { clamp } from '../lib/format'

function seriesPoints(values: number[], w: number, h: number, scaleMax: number, pad = 2) {
  const data = values.length ? values : [0]
  const max = Math.max(scaleMax, ...data, 1)
  const step = data.length > 1 ? w / (data.length - 1) : w
  return data.map((value, index) => {
    const x = index * step
    const y = h - (clamp(value, 0, max) / max) * (h - pad * 2) - pad
    return { x, y }
  })
}

function toLine(points: Array<{ x: number; y: number }>) {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}

function toArea(points: Array<{ x: number; y: number }>, w: number, h: number) {
  if (!points.length) return `0,${h} ${w},${h}`
  return `0,${h} ${toLine(points)} ${w},${h}`
}

/** Card sparkline: stroke + soft fill. */
export function AreaSpark({
  values,
  color,
  scaleMax = 100,
  fillOpacity = 0.18,
}: {
  values: number[]
  color: string
  scaleMax?: number
  fillOpacity?: number
}) {
  const id = useId().replace(/:/g, '')
  const w = 240
  const h = 44
  const points = seriesPoints(values, w, h, scaleMax)
  const line = toLine(points)
  const area = toArea(points, w, h)

  return (
    <svg className="ov-area-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#fill-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Tiny spark for thermal cells / network. */
export function MiniSpark({
  values,
  color,
  scaleMax = 100,
  fill = true,
}: {
  values: number[]
  color: string
  scaleMax?: number
  fill?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const w = 120
  const h = 36
  const points = seriesPoints(values, w, h, scaleMax, 3)
  const line = toLine(points)
  const area = toArea(points, w, h)

  return (
    <svg className="ov-mini-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {fill ? (
        <>
          <defs>
            <linearGradient id={`mfill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#mfill-${id})`} />
        </>
      ) : null}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export type LoadSeries = { id: string; values: number[]; color: string; fill?: boolean }

/** System load chart with Y/X labels rendered outside via CSS. */
export function LoadChart({ series }: { series: LoadSeries[] }) {
  const id = useId().replace(/:/g, '')
  const w = 800
  const h = 220
  const max = 100

  return (
    <div className="ov-load-chart">
      <div className="ov-load-y" aria-hidden>
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>
      <div className="ov-load-plot">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
          <defs>
              {series.map((s) => (
                <linearGradient key={s.id} id={`lfill-${id}-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={s.id === 'memory' ? '0.22' : '0.12'} />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1="0"
              x2={w}
              y1={h * t}
              y2={h * t}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((s) => {
            const points = seriesPoints(s.values, w, h, max, 4)
            const line = toLine(points)
            const area = toArea(points, w, h)
            return (
              <g key={s.id}>
                {s.fill ? <polygon points={area} fill={`url(#lfill-${id}-${s.id})`} /> : null}
                <polyline
                  points={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}
        </svg>
        <div className="ov-load-x" aria-hidden>
          <span>60s</span>
          <span>50s</span>
          <span>40s</span>
          <span>30s</span>
          <span>20s</span>
          <span>10s</span>
          <span>0s</span>
        </div>
      </div>
    </div>
  )
}
