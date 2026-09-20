import type { MetricsSnapshot } from '../shared/types'
import { formatBytes, formatPercent, formatRate, usageTone } from '../lib/format'
import { Metric, Panel } from '../components/ui'

export function DiskPage({ metrics }: { metrics: MetricsSnapshot }) {
  const { disks, diskIo } = metrics
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-2">
        <Panel title="读取吞吐">
          <Metric value={formatRate(diskIo.readBytesPerSec)} label={`读 IOPS ${diskIo.readIops}`} tone="ok" />
        </Panel>
        <Panel title="写入吞吐">
          <Metric value={formatRate(diskIo.writeBytesPerSec)} label={`写 IOPS ${diskIo.writeIops}`} tone="ok" />
        </Panel>
      </div>
      <Panel title="分区 / 卷">
        {disks.length === 0 ? (
          <div className="empty">暂无磁盘信息</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>挂载点</th>
                <th>文件系统</th>
                <th>已用</th>
                <th>容量</th>
                <th>占用</th>
              </tr>
            </thead>
            <tbody>
              {disks.map((disk) => (
                <tr key={disk.id}>
                  <td>{disk.mount}</td>
                  <td>{disk.type || disk.fs}</td>
                  <td className="mono">{formatBytes(disk.usedBytes)}</td>
                  <td className="mono">{formatBytes(disk.sizeBytes)}</td>
                  <td className={`mono tone-${usageTone(disk.usagePercent)}`}>
                    {formatPercent(disk.usagePercent, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
