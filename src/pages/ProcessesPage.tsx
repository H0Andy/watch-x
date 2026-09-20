import type { MetricsSnapshot } from '../shared/types'
import { formatBytes, formatPercent } from '../lib/format'
import { Panel } from '../components/ui'

export function ProcessesPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { processes } = metrics
  return (
    <Panel title="占用最高进程" sub="按 CPU 排序，约每 2 秒刷新">
      {processes.length === 0 ? (
        <div className="empty">暂无进程列表</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>PID</th>
                <th>名称</th>
                <th>用户</th>
                <th>CPU</th>
                <th>内存 %</th>
                <th>内存</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((proc) => (
                <tr key={`${proc.pid}-${proc.name}`}>
                  <td className="mono">{proc.pid}</td>
                  <td>{proc.name}</td>
                  <td>{proc.user || '—'}</td>
                  <td className="mono">{formatPercent(proc.cpuPercent, 1)}</td>
                  <td className="mono">{formatPercent(proc.memPercent, 1)}</td>
                  <td className="mono">{formatBytes(proc.memBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
