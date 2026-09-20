import type { ReactNode } from 'react'
import { clamp } from '../lib/format'

export function Panel({
  title,
  sub,
  children,
  action,
  hero = false,
  className = '',
}: {
  title?: string
  sub?: string
  children: ReactNode
  action?: ReactNode
  hero?: boolean
  className?: string
}) {
  return (
    <section className={`surface ${hero ? 'hero' : ''} ${className}`.trim()}>
      {(title || action) && (
        <div className="surface-head">
          <div>
            {title ? <h3>{title}</h3> : null}
            {sub ? <p className="sub">{sub}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Metric({
  value,
  label,
  tone = 'ok',
  percent,
  xl = false,
}: {
  value: string
  label: string
  tone?: 'ok' | 'warn' | 'hot' | 'muted' | 'accent'
  percent?: number | null
  xl?: boolean
}) {
  const barTone = tone === 'warn' || tone === 'hot' ? tone : ''
  return (
    <div className="gauge-card">
      <div className={`metric-value ${xl ? 'xl' : ''} tone-${tone}`}>{value}</div>
      <div className="metric-label">{label}</div>
      {percent != null ? (
        <div className={`bar ${barTone}`}>
          <span style={{ width: `${clamp(percent)}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function RingMetric({
  value,
  label,
  percent,
  tone = 'ok',
}: {
  value: string
  label: string
  percent: number | null | undefined
  tone?: 'ok' | 'warn' | 'hot' | 'muted' | 'accent'
}) {
  const p = clamp(percent ?? 0)
  const color =
    tone === 'hot' ? 'var(--hot)' : tone === 'warn' ? 'var(--warn)' : tone === 'accent' ? 'var(--accent)' : 'var(--ok)'
  const r = 42
  const c = 2 * Math.PI * r
  const dash = (p / 100) * c
  return (
    <div className="metric-row">
      <div>
        <div className={`metric-value tone-${tone}`}>{value}</div>
        <div className="metric-label">{label}</div>
      </div>
      <div className="ring-wrap" aria-hidden>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ transition: 'stroke-dasharray 480ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="ring-center">{Math.round(p)}%</div>
      </div>
    </div>
  )
}

export function Kv({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="kv">
      {rows.map(([label, value]) => (
        <div className="kv-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

export function Sparkline({ values }: { values: number[] }) {
  const data = values.length ? values : [0]
  const w = 240
  const h = 56
  const max = Math.max(100, ...data)
  const step = data.length > 1 ? w / (data.length - 1) : w
  const points = data
    .map((value, index) => {
      const x = index * step
      const y = h - (clamp(value, 0, max) / max) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  const area = `0,${h} ${points} ${w},${h}`

  return (
    <svg className="spark-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(212,165,116,0.35)" />
          <stop offset="100%" stopColor="rgba(212,165,116,0)" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sparkFill)" />
      <polyline
        points={points}
        fill="none"
        stroke="rgba(212,165,116,0.95)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
