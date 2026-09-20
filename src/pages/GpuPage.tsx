import type { MetricsSnapshot } from '../shared/types'
import {
  formatBytes,
  formatMhz,
  formatPercent,
  formatTemp,
  formatWatts,
  usageTone,
  tempTone,
} from '../lib/format'
import { Kv, Metric, Panel } from '../components/ui'

function sensorText(value: string | null | undefined, fallback: string): string {
  if (value == null || value === '' || value === '—') return fallback
  return value
}

export function GpuPage({ metrics }: { metrics: MetricsSnapshot }) {
  if (!metrics.gpus.length) {
    return (
      <Panel title="GPU">
        <div className="empty">未检测到独立显卡。Windows 上 NVIDIA 建议安装驱动并确保 nvidia-smi 可用；主板核显已默认隐藏。</div>
      </Panel>
    )
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {metrics.gpus.map((gpu) => (
        <div className="grid cols-2" key={gpu.id}>
          <Panel title={gpu.model} sub={`${gpu.vendor}${gpu.driver ? ` · ${gpu.driver}` : ''}`}>
            <div className="grid cols-2">
              <Metric
                value={gpu.usagePercent != null ? formatPercent(gpu.usagePercent, 0) : '—'}
                label="GPU 占用"
                tone={usageTone(gpu.usagePercent)}
                percent={gpu.usagePercent}
              />
              <Metric
                value={gpu.temperatureC != null ? formatTemp(gpu.temperatureC) : '—'}
                label="温度"
                tone={tempTone(gpu.temperatureC)}
              />
            </div>
          </Panel>
          <Panel title="详细信息" sub={gpu.source}>
            <Kv
              rows={[
                ['总线', gpu.bus || '—'],
                [
                  '显存',
                  gpu.memoryTotalMb != null
                    ? `${formatBytes((gpu.memoryUsedMb ?? 0) * 1024 * 1024)} / ${formatBytes(gpu.memoryTotalMb * 1024 * 1024)}`
                    : '—',
                ],
                ['核心时钟', gpu.clockCoreMhz != null ? formatMhz(gpu.clockCoreMhz) : '驱动未提供'],
                ['显存时钟', gpu.clockMemoryMhz != null ? formatMhz(gpu.clockMemoryMhz) : '驱动未提供'],
                [
                  '功耗',
                  gpu.powerDrawW != null
                    ? `${formatWatts(gpu.powerDrawW)}${gpu.powerLimitW != null ? ` / ${formatWatts(gpu.powerLimitW)}` : ''}`
                    : '驱动未提供',
                ],
                ['风扇', gpu.fanPercent != null ? formatPercent(gpu.fanPercent, 0) : '驱动未提供'],
                ['GPU 核心数', gpu.cores != null ? String(gpu.cores) : '驱动未提供'],
                [
                  'Metal',
                  sensorText(gpu.metalVersion, metrics.system.platform === 'darwin' ? '未读取到' : '仅 macOS 适用'),
                ],
              ]}
            />
          </Panel>
        </div>
      ))}
    </div>
  )
}
