import type { MetricsSnapshot } from '../shared/types'
import { formatRate } from '../lib/format'
import { Panel } from '../components/ui'

export function NetworkPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { networks } = metrics
  return (
    <Panel title="网络接口" sub="上下行速率按秒采样">
      {networks.length === 0 ? (
        <div className="empty">暂无网卡数据</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>接口</th>
              <th>状态</th>
              <th>类型</th>
              <th>IPv4</th>
              <th>下行</th>
              <th>上行</th>
              <th>链路</th>
            </tr>
          </thead>
          <tbody>
            {networks.map((net) => (
              <tr key={net.iface}>
                <td>{net.ifaceName}</td>
                <td>{net.operstate}</td>
                <td>{net.type}</td>
                <td className="mono">{net.ip4 || '—'}</td>
                <td className="mono">{formatRate(net.rxBytesPerSec)}</td>
                <td className="mono">{formatRate(net.txBytesPerSec)}</td>
                <td className="mono">{net.speedMbps != null ? `${net.speedMbps} Mbps` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
