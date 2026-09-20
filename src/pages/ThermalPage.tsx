import type { MetricsSnapshot } from '../shared/types'
import { formatPercent, formatRpm, formatTemp, tempTone, usageTone } from '../lib/format'
import { Metric, Panel } from '../components/ui'

export function ThermalPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { temperatures, fans, cpu } = metrics
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-3">
        <Panel title="CPU 温度" sub={cpu.macArch === 'apple-silicon' ? 'Apple Silicon 传感器' : cpu.macArch === 'intel' ? 'Intel 传感器' : '主传感器'}>
          <Metric value={formatTemp(cpu.temperatureC)} label="CPU" tone={tempTone(cpu.temperatureC)} />
        </Panel>
        <Panel title="SoC" sub="主要适用于 Apple Silicon">
          <Metric value={formatTemp(cpu.socTemperatureC)} label="片上系统" tone={tempTone(cpu.socTemperatureC)} />
        </Panel>
        <Panel title="风扇数量">
          <Metric value={String(fans.length)} label="当前可读风扇通道" tone="muted" />
        </Panel>
      </div>

      <div className="grid cols-2">
        <Panel title="温度传感器">
          {temperatures.length === 0 ? (
            <div className="empty">
              暂无温度读数。macOS 请安装对应可选依赖：M 系列用 macos-temperature-sensor，Intel 用 osx-temperature-sensor。Windows 温度取决于主板驱动/权限。
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>传感器</th>
                  <th>读数</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {temperatures.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td className={`mono tone-${tempTone(item.value)}`}>{formatTemp(item.value)}</td>
                    <td>{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="风扇">
          {fans.length === 0 ? (
            <div className="empty">
              当前读不到机箱风扇转速。已尝试 GPU 风扇（NVIDIA）与 macOS SMC；若需要更多主板风扇，可安装 LibreHardwareMonitor 并开启 WMI。
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>风扇</th>
                  <th>读数</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {fans.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td className={`mono tone-${usageTone(item.unit === '%' ? item.value : null)}`}>
                      {item.unit === '%' ? formatPercent(item.value, 0) : formatRpm(item.value)}
                    </td>
                    <td>{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {fans.some((f) => f.unit === '%' && f.value === 0) ? (
            <p className="sub" style={{ marginTop: 12 }}>
              风扇 0% 在低温怠速时是正常现象（很多显卡会停转）。
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  )
}
