import { useEffect, useMemo, useState } from 'react'
import type { MetricsSnapshot, PageId } from './shared/types'
import { formatUptime, platformLabel } from './lib/format'
import icon128 from './assets/icon-128.png'
import { OverviewPage, type OverviewHistory } from './pages/OverviewPage'
import { CpuPage } from './pages/CpuPage'
import { GpuPage } from './pages/GpuPage'
import { MemoryPage } from './pages/MemoryPage'
import { DiskPage } from './pages/DiskPage'
import { NetworkPage } from './pages/NetworkPage'
import { ThermalPage } from './pages/ThermalPage'
import { BatteryPage } from './pages/BatteryPage'
import { ProcessesPage } from './pages/ProcessesPage'

const NAV: { id: PageId; label: string; icon: string }[] = [
  { id: 'overview', label: '总览', icon: '◈' },
  { id: 'cpu', label: 'CPU', icon: '▣' },
  { id: 'gpu', label: 'GPU', icon: '▦' },
  { id: 'memory', label: '内存', icon: '▤' },
  { id: 'disk', label: '磁盘', icon: '▥' },
  { id: 'network', label: '网络', icon: '⇄' },
  { id: 'thermal', label: '热力', icon: '◎' },
  { id: 'battery', label: '电源', icon: '⚡' },
  { id: 'processes', label: '进程', icon: '☰' },
]

const TITLES: Record<PageId, { title: string; desc: string }> = {
  overview: { title: '系统总览', desc: '当前主机健康度与关键子系统状态' },
  cpu: { title: '处理器', desc: '占用、频率、负载与架构细节' },
  gpu: { title: '图形处理器', desc: '负载、显存、功耗与温度' },
  memory: { title: '内存', desc: '物理内存、缓存与交换分区' },
  disk: { title: '存储', desc: '分区容量与读写吞吐' },
  network: { title: '网络', desc: '链路状态与实时上下行' },
  thermal: { title: '热力与风扇', desc: '温度传感器与风扇读数' },
  battery: { title: '电源', desc: '电池或交流供电状态' },
  processes: { title: '进程', desc: '当前占用最高的工作负载' },
}

const HISTORY_LEN = 60

const EMPTY_HISTORY: OverviewHistory = {
  cpu: [],
  gpu: [],
  memory: [],
  disk: [],
  cpuTemp: [],
  gpuTemp: [],
  cpuPower: [],
  gpuPower: [],
  netRx: [],
  netTx: [],
}

function pushSample(prev: number[], value: number | null | undefined) {
  const next = value == null || Number.isNaN(value) ? 0 : value
  return [...prev.slice(-(HISTORY_LEN - 1)), next]
}

export default function App() {
  const [page, setPage] = useState<PageId>('overview')
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [history, setHistory] = useState<OverviewHistory>(EMPTY_HISTORY)
  const [bridgeError, setBridgeError] = useState<string | null>(null)

  useEffect(() => {
    if (!window.watchx) {
      setBridgeError('未能连接桌面桥接（preload）。请重启 npm run dev。')
      return
    }
    return window.watchx.subscribe((snapshot) => {
      setMetrics(snapshot)
      const gpu = snapshot.gpus[0]
      const disk = snapshot.disks[0]
      setHistory((prev) => ({
        cpu: pushSample(prev.cpu, snapshot.cpu.usagePercent),
        gpu: pushSample(prev.gpu, gpu?.usagePercent),
        memory: pushSample(prev.memory, snapshot.memory.usagePercent),
        disk: pushSample(prev.disk, disk?.usagePercent),
        cpuTemp: pushSample(prev.cpuTemp, snapshot.cpu.temperatureC),
        gpuTemp: pushSample(prev.gpuTemp, gpu?.temperatureC),
        cpuPower: pushSample(prev.cpuPower, snapshot.cpu.powerDrawW),
        gpuPower: pushSample(prev.gpuPower, gpu?.powerDrawW),
        netRx: pushSample(
          prev.netRx,
          snapshot.networks.reduce((sum, n) => sum + n.rxBytesPerSec, 0),
        ),
        netTx: pushSample(
          prev.netTx,
          snapshot.networks.reduce((sum, n) => sum + n.txBytesPerSec, 0),
        ),
      }))
    })
  }, [])

  const heading = TITLES[page]
  const meta = useMemo(() => {
    if (!metrics) return null
    return {
      platform: platformLabel(metrics.system.platform),
      host: metrics.system.hostname,
      uptime: formatUptime(metrics.system.uptimeSec),
    }
  }, [metrics])

  if (!metrics) {
    return <div className="loading">{bridgeError ?? 'Calibrating sensors'}</div>
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand-mark" title="Watch X">
          <img src={icon128} alt="" width={28} height={28} />
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? 'active' : ''}
              onClick={() => setPage(item.id)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">v1.0.0</div>
      </aside>

      <div className="workspace">
        {page !== 'overview' ? (
          <header className="topbar">
            <div className="topbar-title">
              <p className="eyebrow">Watch X · Instrumentation</p>
              <h2>{heading.title}</h2>
              <p>{heading.desc}</p>
            </div>
            <div className="top-meta">
              <span className="chip">{meta?.host}</span>
              <span className="chip">
                {meta?.platform} · {metrics.system.arch}
              </span>
              <span className="chip">UP {meta?.uptime}</span>
              <span className="chip">
                <span className="live-dot" />
                {new Date(metrics.collectedAt).toLocaleTimeString()}
              </span>
            </div>
          </header>
        ) : null}

        <main className={`main ${page === 'overview' ? 'main-fit' : ''}`}>
          {page === 'overview' && (
            <OverviewPage metrics={metrics} history={history} onNavigate={setPage} />
          )}
          {page === 'cpu' && <CpuPage metrics={metrics} />}
          {page === 'gpu' && <GpuPage metrics={metrics} />}
          {page === 'memory' && <MemoryPage metrics={metrics} />}
          {page === 'disk' && <DiskPage metrics={metrics} />}
          {page === 'network' && <NetworkPage metrics={metrics} />}
          {page === 'thermal' && <ThermalPage metrics={metrics} />}
          {page === 'battery' && <BatteryPage metrics={metrics} />}
          {page === 'processes' && <ProcessesPage metrics={metrics} />}
        </main>
      </div>
    </div>
  )
}
