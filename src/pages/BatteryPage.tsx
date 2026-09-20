import type { MetricsSnapshot } from '../shared/types'
import { formatMinutes, formatPercent } from '../lib/format'
import { Kv, Metric, Panel } from '../components/ui'

export function BatteryPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { battery } = metrics
  if (!battery.hasBattery) {
    return (
      <div className="grid cols-2" style={{ gap: 16 }}>
        <Panel title="电源状态" sub="当前设备没有可更换电池">
          <Metric
            value={battery.acConnected === false ? '电池模式' : 'AC 供电'}
            label={battery.model || '台式 / 工位机常见形态'}
            tone="ok"
          />
        </Panel>
        <Panel title="详情">
          <Kv
            rows={[
              ['电池', '无'],
              ['电源适配器', battery.acConnected === false ? '未连接' : '已连接'],
              ['类型', battery.type || 'AC'],
              ['说明', '台式机或外接电源直供，电池页展示电源状态而非电量'],
            ]}
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="grid cols-2" style={{ gap: 16 }}>
      <Panel title="电量" sub={battery.isCharging ? '充电中' : '放电中'}>
        <Metric
          value={formatPercent(battery.percent, 0)}
          label={battery.acConnected ? '已接电源' : '使用电池'}
          tone="ok"
          percent={battery.percent}
        />
      </Panel>
      <Panel title="详情">
        <Kv
          rows={[
            ['剩余时间', formatMinutes(battery.remainingMinutes)],
            ['循环次数', battery.cycleCount != null ? String(battery.cycleCount) : '—'],
            ['健康度', battery.healthPercent != null ? formatPercent(battery.healthPercent, 0) : '—'],
            ['型号', battery.model || '—'],
            ['类型', battery.type || '—'],
          ]}
        />
      </Panel>
    </div>
  )
}
