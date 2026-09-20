import type { MetricsSnapshot } from '../shared/types'
import { formatMhz, formatPercent, formatTemp, formatWatts, usageTone, tempTone } from '../lib/format'
import { Kv, Metric, Panel, RingMetric } from '../components/ui'

export function CpuPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { cpu } = metrics
  const archLabel =
    cpu.macArch === 'apple-silicon'
      ? 'Apple Silicon (M 系列)'
      : cpu.macArch === 'intel'
        ? 'Intel macOS'
        : metrics.system.platform === 'darwin'
          ? 'macOS'
          : 'Windows / Linux'

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-4">
        <Panel title="Utilization" sub={cpu.brand}>
          <RingMetric
            value={formatPercent(cpu.usagePercent, 1)}
            label={archLabel}
            percent={cpu.usagePercent}
            tone={usageTone(cpu.usagePercent)}
          />
        </Panel>
        <Panel title="Temperature" sub={cpu.socTemperatureC != null ? `SoC ${formatTemp(cpu.socTemperatureC)}` : 'Package / zone'}>
          <Metric value={formatTemp(cpu.temperatureC)} label="CPU" tone={tempTone(cpu.temperatureC)} xl />
        </Panel>
        <Panel title="Package Power" sub={metrics.system.platform === 'win32' ? 'Windows Energy Meter / RAPL' : '平台支持时显示'}>
          <Metric
            value={formatWatts(cpu.powerDrawW)}
            label={cpu.powerDrawW != null ? 'Package' : '暂无读数'}
            tone={cpu.powerDrawW != null ? 'ok' : 'muted'}
            xl
          />
        </Panel>
        <Panel title="Load" sub={metrics.system.platform === 'win32' ? 'Windows EMA · 1 / 5 / 15 min' : '1 / 5 / 15 min'}>
          <Metric
            value={cpu.loadAvg.map((v) => v.toFixed(2)).join(' · ')}
            label={`${cpu.physicalCores} physical / ${cpu.cores} logical`}
            tone="muted"
          />
        </Panel>
      </div>

      <div className="grid cols-2">
        <Panel title="Architecture">
          <Kv
            rows={[
              ['厂商', cpu.manufacturer || '—'],
              ['型号', cpu.brand],
              ['平台架构', metrics.system.arch],
              ['Mac CPU', cpu.macArch === 'apple-silicon' ? 'Apple Silicon' : cpu.macArch === 'intel' ? 'Intel' : '不适用'],
              ['性能核', cpu.performanceCores != null && cpu.performanceCores > 0 ? String(cpu.performanceCores) : '系统未单独上报'],
              ['能效核', cpu.efficiencyCores != null && cpu.efficiencyCores > 0 ? String(cpu.efficiencyCores) : '系统未单独上报'],
              ['当前均频', cpu.perCore[0] ? `${(cpu.perCore[0].speedMhz / 1000).toFixed(2)} GHz` : '—'],
              ['频率范围', `${cpu.speedMinGhz ?? '—'} – ${cpu.speedMaxGhz ?? '—'} GHz`],
            ]}
          />
        </Panel>
        <Panel title="Per-core" sub="Realtime sample">
          <div className="core-grid">
            {cpu.perCore.map((core, index) => (
              <div className="core-cell" key={index}>
                <strong className={`tone-${usageTone(core.usagePercent)}`}>
                  {formatPercent(core.usagePercent, 0)}
                </strong>
                <span>
                  #{index + 1}
                  {cpu.coreTemperatures[index] != null ? ` · ${formatTemp(cpu.coreTemperatures[index])}` : ''}
                </span>
                <span>{formatMhz(core.speedMhz)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
