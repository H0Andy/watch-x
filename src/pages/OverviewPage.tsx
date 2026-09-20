import type { MetricsSnapshot, PageId } from '../shared/types'
import {
  formatBytes,
  formatPercent,
  formatRate,
  formatTemp,
  formatUptime,
  formatWatts,
  tempTone,
} from '../lib/format'
import { AreaSpark, LoadChart, MiniSpark } from '../components/overview'

export type OverviewHistory = {
  cpu: number[]
  gpu: number[]
  memory: number[]
  disk: number[]
  cpuTemp: number[]
  gpuTemp: number[]
  cpuPower: number[]
  gpuPower: number[]
  netRx: number[]
  netTx: number[]
}

const MOD = {
  cpu: '#10b981',
  gpu: '#3b82f6',
  mem: '#8b5cf6',
  disk: '#f59e0b',
} as const

function pct(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(0)}%`
}

function tempClass(value: number | null | undefined) {
  return `ov-temp-${tempTone(value)}`
}

function CoreCard({
  mod,
  label,
  badge,
  primary,
  secondary,
  secondaryClass,
  showBar,
  percent,
  spark,
  footerLeft,
  footerRight,
  onClick,
}: {
  mod: keyof typeof MOD
  label: string
  badge: string
  primary: string
  secondary?: string
  secondaryClass?: string
  showBar?: boolean
  percent: number | null | undefined
  spark: number[]
  footerLeft: string
  footerRight?: string
  onClick: () => void
}) {
  const color = MOD[mod]
  const width = percent == null || Number.isNaN(percent) ? 0 : Math.min(100, Math.max(0, percent))

  return (
    <button type="button" className={`ov-card ov-card-${mod}`} onClick={onClick}>
      <div className="ov-card-top">
        <span className="ov-card-mark" style={{ background: `${color}22`, color }} aria-hidden>
          <i style={{ background: color }} />
        </span>
        <span className="ov-card-name">{label}</span>
        <span className="ov-card-badge" title={badge}>
          {badge}
        </span>
      </div>

      <div className={`ov-card-metrics ${secondary ? '' : 'is-single'}`}>
        <strong style={{ color }}>{primary}</strong>
        {secondary ? <strong className={secondaryClass}>{secondary}</strong> : null}
      </div>

      {showBar ? (
        <div className="ov-card-bar" aria-hidden>
          <i style={{ width: `${width}%`, background: color }} />
        </div>
      ) : null}

      <div className="ov-card-spark">
        <AreaSpark values={spark} color={color} fillOpacity={0.22} />
      </div>

      <div className="ov-card-foot">
        <span title={footerLeft}>{footerLeft || '—'}</span>
        {footerRight ? <span title={footerRight}>{footerRight}</span> : null}
      </div>
    </button>
  )
}

function ThermalCell({
  label,
  value,
  valueClass,
  spark,
  color,
  scaleMax,
  empty,
  icon,
}: {
  label: string
  value: string
  valueClass?: string
  spark: number[]
  color: string
  scaleMax?: number
  empty?: boolean
  icon: 'temp' | 'bolt'
}) {
  return (
    <div className="ov-therm-cell">
      <div className="ov-therm-label">
        <span className="ov-therm-ico" style={{ color }} aria-hidden>
          {icon === 'bolt' ? '⚡' : '◎'}
        </span>
        {label}
      </div>
      <div className="ov-therm-body">
        <strong className={empty ? 'is-empty' : valueClass}>{value}</strong>
        <div className="ov-therm-spark">
          {empty ? (
            <div className="ov-therm-empty-spark" />
          ) : (
            <MiniSpark values={spark} color={color} scaleMax={scaleMax} />
          )}
        </div>
      </div>
    </div>
  )
}

function MeterRow({
  label,
  value,
  percent,
  color,
}: {
  label: string
  value: string
  percent: number | null | undefined
  color: string
}) {
  const width = percent == null || Number.isNaN(percent) ? 0 : Math.min(100, Math.max(0, percent))
  return (
    <div className="ov-meter-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="ov-meter-track" aria-hidden>
        <i style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

function IconUser() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 19c1.8-3.2 4-4.8 7-4.8S17.2 15.8 19 19"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconDisplay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconPower() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7.5 6.5a7 7 0 1 0 9 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconTemp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 14.5V6.5a2 2 0 1 1 4 0v8a3 3 0 1 1-4 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 8v4.5L15 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function OverviewPage({
  metrics,
  history,
  onNavigate,
}: {
  metrics: MetricsSnapshot
  history: OverviewHistory
  onNavigate: (page: PageId) => void
}) {
  const { cpu, memory, gpus, disks, networks, battery, temperatures, fans } = metrics
  const topGpu = gpus[0]
  const topDisk = disks[0]
  const topProc = metrics.processes[0]
  const netRx = networks.reduce((sum, n) => sum + n.rxBytesPerSec, 0)
  const netTx = networks.reduce((sum, n) => sum + n.txBytesPerSec, 0)
  const display = metrics.displays[0]
  const board = [metrics.system.manufacturer, metrics.system.model || metrics.system.hostname]
    .filter(Boolean)
    .join(' ')

  const avgMhz =
    cpu.perCore.length > 0
      ? cpu.perCore.reduce((sum, core) => sum + (core.speedMhz || 0), 0) / cpu.perCore.length
      : null
  const freqLabel =
    avgMhz && avgMhz > 0
      ? `${(avgMhz / 1000).toFixed(1)} GHz`
      : cpu.speedMaxGhz != null
        ? `${cpu.speedMaxGhz.toFixed(1)} GHz`
        : '—'

  const boardTemp = temperatures.find((t) => /主板|board|motherboard|system/i.test(t.label))
  const boardTempValue = boardTemp?.value ?? null
  const hottest = temperatures.reduce<number | null>((max, item) => {
    if (item.unit !== 'C') return max
    return max == null ? item.value : Math.max(max, item.value)
  }, null)

  const fanRpm = fans.find((f) => Number.isFinite(f.value))?.value ?? null
  const fanPercent = fanRpm != null ? Math.min(100, (fanRpm / 3000) * 100) : 0

  const gpuVram =
    topGpu?.memoryUsedMb != null && topGpu.memoryTotalMb != null
      ? `${(topGpu.memoryUsedMb / 1024).toFixed(1)} / ${(topGpu.memoryTotalMb / 1024).toFixed(1)} GB`
      : '—'

  const powerMax = Math.max(
    60,
    ...(history.cpuPower.length ? history.cpuPower : [0]),
    ...(history.gpuPower.length ? history.gpuPower : [0]),
  )
  const netMax = Math.max(1, ...history.netRx, ...history.netTx, netRx, netTx)
  const stamp = new Date(metrics.collectedAt)
  const stampText = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(
    stamp.getDate(),
  ).padStart(2, '0')} ${stamp.toLocaleTimeString()}`

  return (
    <div className="ov">
      <header className="ov-header">
        <div className="ov-header-left">
          <div className="ov-kicker">
            <i className="ov-kicker-dot" />
            Watch X / 主机状态
          </div>
          <h1 title={board}>{board}</h1>
          <p title={`${cpu.brand}${topGpu ? ` · ${topGpu.model}` : ''}`}>
            {cpu.brand}
            {topGpu ? ` · ${topGpu.model}` : ''}
          </p>
        </div>
        <div className="ov-header-chips">
          <span className="ov-chip" title={metrics.system.hostname}>
            <IconUser />
            {metrics.system.hostname}
          </span>
          <span className="ov-chip">
            <IconDisplay />
            {display
              ? `${display.resolutionX} × ${display.resolutionY}${
                  display.currentRefreshRate != null ? ` · ${display.currentRefreshRate}Hz` : ''
                }`
              : '—'}
          </span>
          <span className="ov-chip">
            <IconPower />
            {battery.hasBattery
              ? `${formatPercent(battery.percent, 0)}${battery.isCharging ? ' 充电' : ''}`
              : 'AC 供电'}
          </span>
          <span className={`ov-chip ${tempClass(hottest)}`}>
            <IconTemp />
            {formatTemp(hottest)}
          </span>
          <span className="ov-chip">
            <IconClock />
            运行 {formatUptime(metrics.system.uptimeSec)}
          </span>
        </div>
      </header>

      <section className="ov-core">
        <CoreCard
          mod="cpu"
          label="CPU"
          badge={`${cpu.physicalCores} 核 / ${cpu.cores} 线程`}
          primary={pct(cpu.usagePercent)}
          secondary={formatTemp(cpu.temperatureC)}
          secondaryClass={tempClass(cpu.temperatureC)}
          percent={cpu.usagePercent}
          spark={history.cpu}
          footerLeft={freqLabel}
          footerRight={cpu.powerDrawW != null ? formatWatts(cpu.powerDrawW) : cpu.brand}
          onClick={() => onNavigate('cpu')}
        />
        <CoreCard
          mod="gpu"
          label="GPU"
          badge={topGpu?.model || '未检测到独立显卡'}
          primary={pct(topGpu?.usagePercent)}
          secondary={formatTemp(topGpu?.temperatureC)}
          secondaryClass={tempClass(topGpu?.temperatureC)}
          percent={topGpu?.usagePercent}
          spark={history.gpu}
          footerLeft={gpuVram}
          footerRight={topGpu?.powerDrawW != null ? formatWatts(topGpu.powerDrawW) : '—'}
          onClick={() => onNavigate('gpu')}
        />
        <CoreCard
          mod="mem"
          label="内存"
          badge={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
          primary={pct(memory.usagePercent)}
          showBar
          percent={memory.usagePercent}
          spark={history.memory}
          footerLeft={`可用 ${formatBytes(memory.availableBytes)}`}
          onClick={() => onNavigate('memory')}
        />
        <CoreCard
          mod="disk"
          label="磁盘"
          badge={
            topDisk
              ? `${formatBytes(topDisk.usedBytes)} / ${formatBytes(topDisk.sizeBytes)}`
              : '—'
          }
          primary={topDisk ? pct(topDisk.usagePercent) : '—'}
          percent={topDisk?.usagePercent}
          spark={history.disk}
          footerLeft={`读取 ${formatRate(metrics.diskIo.readBytesPerSec)}`}
          footerRight={`写入 ${formatRate(metrics.diskIo.writeBytesPerSec)}`}
          onClick={() => onNavigate('disk')}
        />
      </section>

      <section className="ov-mid">
        <div className="ov-panel ov-panel-load">
          <div className="ov-panel-head">
            <h2>系统负载趋势</h2>
            <div className="ov-legend">
              <span>
                <i style={{ background: MOD.cpu }} />
                CPU {pct(cpu.usagePercent)}
              </span>
              <span>
                <i style={{ background: MOD.gpu }} />
                GPU {pct(topGpu?.usagePercent)}
              </span>
              <span>
                <i style={{ background: MOD.mem }} />
                内存 {pct(memory.usagePercent)}
              </span>
            </div>
          </div>
          <LoadChart
            series={[
              { id: 'cpu', values: history.cpu, color: MOD.cpu, fill: true },
              { id: 'gpu', values: history.gpu, color: MOD.gpu, fill: true },
              { id: 'memory', values: history.memory, color: MOD.mem, fill: true },
            ]}
          />
        </div>

        <div className="ov-panel ov-panel-thermal">
          <div className="ov-panel-head">
            <h2>温度与功耗</h2>
          </div>
          <div className="ov-therm-grid">
            <ThermalCell
              label="CPU 温度"
              icon="temp"
              value={formatTemp(cpu.temperatureC)}
              valueClass={tempClass(cpu.temperatureC)}
              spark={history.cpuTemp}
              color={MOD.cpu}
              scaleMax={100}
            />
            <ThermalCell
              label="GPU 温度"
              icon="temp"
              value={formatTemp(topGpu?.temperatureC)}
              valueClass={tempClass(topGpu?.temperatureC)}
              spark={history.gpuTemp}
              color={MOD.gpu}
              scaleMax={100}
            />
            <ThermalCell
              label="CPU 功耗"
              icon="bolt"
              value={formatWatts(metrics.cpu.powerDrawW)}
              spark={history.cpuPower}
              color={MOD.disk}
              scaleMax={powerMax}
              empty={metrics.cpu.powerDrawW == null}
            />
            <ThermalCell
              label="GPU 功耗"
              icon="bolt"
              value={formatWatts(topGpu?.powerDrawW)}
              spark={history.gpuPower}
              color={MOD.cpu}
              scaleMax={powerMax}
              empty={topGpu?.powerDrawW == null}
            />
          </div>
        </div>
      </section>

      <section className="ov-foot">
        <button type="button" className="ov-foot-card" onClick={() => onNavigate('network')}>
          <span className="ov-foot-label">网络</span>
          <div className="ov-net-main">
            <div className="ov-net-rates">
              <strong className="is-down">↓ {formatRate(netRx)}</strong>
              <strong className="is-up">↑ {formatRate(netTx)}</strong>
            </div>
            <MiniSpark
              values={history.netRx.map((rx, i) => Math.max(rx, history.netTx[i] ?? 0))}
              color={MOD.gpu}
              scaleMax={netMax}
            />
          </div>
          <p title={networks[0]?.ifaceName || networks[0]?.iface}>
            {networks[0]?.ifaceName || networks[0]?.iface || '—'}
          </p>
          <p className="ov-foot-sub">
            {networks[0]?.speedMbps != null ? `链路 ${networks[0].speedMbps} Mbps` : '链路 —'}
          </p>
        </button>

        <button type="button" className="ov-foot-card" onClick={() => onNavigate('thermal')}>
          <span className="ov-foot-label">散热</span>
          <div className="ov-foot-meters">
            <MeterRow
              label="CPU"
              value={formatTemp(cpu.temperatureC)}
              percent={cpu.temperatureC}
              color={MOD.cpu}
            />
            <MeterRow
              label="GPU"
              value={formatTemp(topGpu?.temperatureC)}
              percent={topGpu?.temperatureC ?? null}
              color={MOD.gpu}
            />
            <MeterRow
              label="主板"
              value={formatTemp(boardTempValue)}
              percent={boardTempValue}
              color={MOD.cpu}
            />
            <MeterRow
              label="风扇"
              value={fanRpm != null ? `${Math.round(fanRpm)} RPM` : '0 RPM'}
              percent={fanPercent}
              color={MOD.disk}
            />
          </div>
        </button>

        <button type="button" className="ov-foot-card" onClick={() => onNavigate('battery')}>
          <span className="ov-foot-label">显示与电源</span>
          <strong className="ov-display-res">
            {display ? `${display.resolutionX} × ${display.resolutionY}` : '—'}
          </strong>
          <div className="ov-display-meta">
            <span>{display?.currentRefreshRate != null ? `${display.currentRefreshRate} Hz` : '—'}</span>
            <span className="ov-ac">
              <i />
              {battery.hasBattery ? (battery.isCharging ? '充电中' : '电池供电') : 'AC 供电'}
            </span>
          </div>
        </button>

        <button type="button" className="ov-foot-card" onClick={() => onNavigate('processes')}>
          <span className="ov-foot-label">资源占用最高的进程</span>
          <strong className="ov-proc-name" title={topProc?.name}>
            <span className="ov-proc-ico" aria-hidden>
              ◈
            </span>
            {topProc?.name || '—'}
          </strong>
          <div className="ov-foot-meters">
            <MeterRow
              label="CPU"
              value={topProc ? formatPercent(topProc.cpuPercent, 0) : '—'}
              percent={topProc?.cpuPercent}
              color={MOD.cpu}
            />
            <MeterRow
              label="内存"
              value={topProc ? formatPercent(topProc.memPercent, 0) : '—'}
              percent={topProc?.memPercent}
              color={MOD.mem}
            />
          </div>
        </button>
      </section>

      <footer className="ov-status">
        <span>{stampText}</span>
        <span className="ov-status-ok">
          <i />
          数据正常
        </span>
      </footer>
    </div>
  )
}
