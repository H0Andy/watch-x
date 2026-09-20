import { useEffect, useState } from 'react'
import type { MetricsSnapshot } from '../shared/types'
import { formatPercent, formatTemp, tempTone } from '../lib/format'

function Row({
  label,
  usage,
  temp,
}: {
  label: string
  usage: number | null | undefined
  temp: number | null | undefined
}) {
  const tone = tempTone(temp)
  return (
    <div className="hud-row">
      <span className="hud-label">{label}</span>
      <span className="hud-usage">{usage == null ? '—' : formatPercent(usage, 0)}</span>
      <span className={`hud-temp tone-${tone}`}>{temp == null ? '—' : formatTemp(temp)}</span>
    </div>
  )
}

/** Tiny always-on-top desktop strip — CPU / GPU / Memory usage + temp. */
export function OverlayHud() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('hud-mode')
    return () => document.documentElement.classList.remove('hud-mode')
  }, [])

  useEffect(() => {
    if (!window.watchx) return
    return window.watchx.subscribe(setMetrics)
  }, [])

  const cpu = metrics?.cpu
  const gpu = metrics?.gpus[0]
  const mem = metrics?.memory

  return (
    <div className="hud-root">
      <div className="hud-shell">
        <button
          type="button"
          className="hud-brand"
          title="打开 Watch X"
          onClick={() => window.watchx.restoreMain?.()}
        >
          Watch X
        </button>
        <div className="hud-rows">
          <Row label="CPU" usage={cpu?.usagePercent} temp={cpu?.temperatureC} />
          <Row label="GPU" usage={gpu?.usagePercent} temp={gpu?.temperatureC} />
          <Row label="MEM" usage={mem?.usagePercent} temp={null} />
        </div>
      </div>
    </div>
  )
}
