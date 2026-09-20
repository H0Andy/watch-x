import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import si from 'systeminformation'
import type {
  BatterySnapshot,
  CpuSnapshot,
  DiskIoSnapshot,
  DiskSnapshot,
  DisplaySnapshot,
  GpuSnapshot,
  MemorySnapshot,
  MetricsSnapshot,
  NetworkSnapshot,
  ProcessSnapshot,
  SensorReading,
  SystemSnapshot,
} from '../src/shared/types'
import { collectMacSensors, detectMacArch, isAppleSiliconCpu } from './macosSensors'
import {
  collectHardwareIdentity,
  getCachedHardwareIdentity,
  refreshHardwareIdentityIfNeeded,
} from './hardwareIdentity'
import {
  collectWindowsBaseboard,
  collectWindowsCpuPackagePower,
  collectWindowsCpuPackageTemp,
  collectWindowsDiskIo,
  collectWindowsDisplays,
  collectWindowsMemoryExtras,
  collectWindowsNetRates,
  collectWindowsThermals,
  collectWindowsVideoControllers,
} from './windowsSensors'

const execFileAsync = promisify(execFile)

let prevCpus = os.cpus()
let cachedCpuInfo: Awaited<ReturnType<typeof si.cpu>> | null = null
let cachedOsInfo: Awaited<ReturnType<typeof si.osInfo>> | null = null
let cachedSystem: Awaited<ReturnType<typeof si.system>> | null = null
let cachedGraphics: Awaited<ReturnType<typeof si.graphics>> | null = null
let lastCpuInfoAt = 0
let lastGraphicsAt = 0
let processTick = 0
let lastProcessList: ProcessSnapshot[] = []
let cachedBaseboard: { manufacturer: string | null; model: string | null } | null = null
let loadEma: [number, number, number] = [0, 0, 0]
let loadEmaReady = false
let lastWinDisplays: DisplaySnapshot[] | null = null
let lastWinDisplaysAt = 0

function num(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (value == null) return null
  const text = String(value).trim()
  if (!text || /^\[?n\/a\]?$/i.test(text) || text === '-') return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function validTemp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 1 && value < 125
}

function validRpm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 20000
}

async function readTrim(filePath: string): Promise<string | null> {
  try {
    return (await readFile(filePath, 'utf8')).trim()
  } catch {
    return null
  }
}

async function readNum(filePath: string): Promise<number | null> {
  const text = await readTrim(filePath)
  return text == null ? null : num(text)
}

function cpuUsageFromDelta(): { overall: number; perCore: { usagePercent: number; speedMhz: number }[] } {
  const current = os.cpus()
  const perCore = current.map((cpu, index) => {
    const previous = prevCpus[index] ?? cpu
    const prevTotal = Object.values(previous.times).reduce((sum, part) => sum + part, 0)
    const nextTotal = Object.values(cpu.times).reduce((sum, part) => sum + part, 0)
    const totalDelta = nextTotal - prevTotal
    const idleDelta = cpu.times.idle - previous.times.idle
    const usagePercent = totalDelta > 0 ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) : 0
    return { usagePercent, speedMhz: cpu.speed }
  })
  prevCpus = current
  const overall = perCore.length
    ? perCore.reduce((sum, core) => sum + core.usagePercent, 0) / perCore.length
    : 0
  return { overall, perCore }
}

async function refreshStaticInfo(force = false): Promise<void> {
  const now = Date.now()
  const tasks: Promise<void>[] = []
  if (force || !cachedCpuInfo || now - lastCpuInfoAt > 30_000) {
    tasks.push(
      si.cpu().then((info) => {
        cachedCpuInfo = info
        lastCpuInfoAt = Date.now()
      }),
    )
  }
  if (force || !cachedOsInfo) {
    tasks.push(
      si.osInfo().then((info) => {
        cachedOsInfo = info
      }),
    )
  }
  if (force || !cachedSystem) {
    tasks.push(
      si.system().then((info) => {
        cachedSystem = info
      }),
    )
  }
  if (force || !cachedGraphics || now - lastGraphicsAt > 15_000) {
    tasks.push(
      si
        .graphics()
        .then((info) => {
          cachedGraphics = info
          lastGraphicsAt = Date.now()
        })
        .catch(() => {
          cachedGraphics = cachedGraphics ?? { controllers: [], displays: [] }
        }),
    )
  }
  if (tasks.length) await Promise.all(tasks)
}

async function nvidiaGpus(): Promise<GpuSnapshot[]> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=index,name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu,fan.speed,power.draw,power.limit,clocks.gr,clocks.mem',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 2500, windowsHide: true },
    )
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((part) => part.trim())
        const [
          index,
          name,
          driver,
          usage,
          memUsed,
          memTotal,
          temp,
          fan,
          power,
          powerLimit,
          clockCore,
          clockMemory,
        ] = parts
        return {
          id: `nvidia-${index ?? name}`,
          vendor: 'NVIDIA',
          model: name || 'NVIDIA GPU',
          bus: 'PCIe',
          driver: driver || null,
          usagePercent: num(usage),
          memoryUsedMb: num(memUsed),
          memoryTotalMb: num(memTotal),
          temperatureC: num(temp),
          fanPercent: num(fan),
          powerDrawW: num(power),
          powerLimitW: num(powerLimit),
          clockCoreMhz: num(clockCore),
          clockMemoryMhz: num(clockMemory),
          cores: null,
          metalVersion: null,
          source: 'nvidia-smi',
        } satisfies GpuSnapshot
      })
  } catch {
    return []
  }
}

async function readMilliC(filePath: string): Promise<number | null> {
  const raw = await readNum(filePath)
  if (raw == null) return null
  const celsius = raw > 200 ? raw / 1000 : raw
  return validTemp(celsius) ? celsius : null
}

async function linuxDrmGpus(): Promise<GpuSnapshot[]> {
  if (process.platform !== 'linux') return []
  const gpus: GpuSnapshot[] = []
  let entries: string[] = []
  try {
    entries = await readdir('/sys/class/drm')
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!/^card\d+$/.test(entry)) continue
    const device = `/sys/class/drm/${entry}/device`
    const vendorId = (await readTrim(path.join(device, 'vendor')))?.toLowerCase()
    const deviceId = await readTrim(path.join(device, 'device'))
    const busy = await readNum(path.join(device, 'gpu_busy_percent'))
    const vramTotal = await readNum(path.join(device, 'mem_info_vram_total'))
    const vramUsed = await readNum(path.join(device, 'mem_info_vram_used'))
    if (busy == null && vramTotal == null) continue

    let vendor = 'GPU'
    if (vendorId === '0x1002') vendor = 'AMD'
    else if (vendorId === '0x10de') vendor = 'NVIDIA'
    else if (vendorId === '0x8086') vendor = 'Intel'

    let temperatureC: number | null = null
    let fanPercent: number | null = null
    try {
      const hwmonRoot = path.join(device, 'hwmon')
      const hwmonEntries = await readdir(hwmonRoot)
      for (const hwmon of hwmonEntries) {
        temperatureC = temperatureC ?? (await readMilliC(path.join(hwmonRoot, hwmon, 'temp1_input')))
        const pwm = await readNum(path.join(hwmonRoot, hwmon, 'pwm1'))
        if (pwm != null) fanPercent = Math.round((pwm / 255) * 100)
      }
    } catch {
      // Optional hwmon nodes are not always present.
    }

    const uevent = await readTrim(path.join(device, 'uevent'))
    const driverLine = uevent?.split('\n').find((line) => line.startsWith('DRIVER='))

    gpus.push({
      id: `drm-${entry}`,
      vendor,
      model: `${vendor} ${entry}${deviceId ? ` (${deviceId})` : ''}`,
      bus: 'PCIe',
      driver: driverLine ? driverLine.slice(7) : null,
      usagePercent: busy,
      memoryUsedMb: vramUsed != null ? Math.round(vramUsed / 1024 / 1024) : null,
      memoryTotalMb: vramTotal != null ? Math.round(vramTotal / 1024 / 1024) : null,
      temperatureC,
      fanPercent,
      powerDrawW: null,
      powerLimitW: null,
      clockCoreMhz: null,
      clockMemoryMhz: null,
      cores: null,
      metalVersion: null,
      source: 'sysfs',
    })
  }
  return gpus
}

async function linuxHwmonSensors(): Promise<{ temperatures: SensorReading[]; fans: SensorReading[] }> {
  const temperatures: SensorReading[] = []
  const fans: SensorReading[] = []
  if (process.platform !== 'linux') return { temperatures, fans }

  let monitors: string[] = []
  try {
    monitors = await readdir('/sys/class/hwmon')
  } catch {
    return { temperatures, fans }
  }

  for (const monitor of monitors) {
    const root = path.join('/sys/class/hwmon', monitor)
    const chip = (await readTrim(path.join(root, 'name'))) || monitor
    let files: string[] = []
    try {
      files = await readdir(root)
    } catch {
      continue
    }

    for (const file of files) {
      const tempMatch = file.match(/^temp(\d+)_input$/)
      if (tempMatch) {
        const index = tempMatch[1]
        const label = (await readTrim(path.join(root, `temp${index}_label`))) || `${chip} ${index}`
        const celsius = await readMilliC(path.join(root, file))
        if (celsius != null) {
          temperatures.push({
            id: `hwmon-${monitor}-temp-${index}`,
            label,
            value: celsius,
            unit: 'C',
            source: `hwmon:${chip}`,
          })
        }
      }

      const fanMatch = file.match(/^fan(\d+)_input$/)
      if (fanMatch) {
        const index = fanMatch[1]
        const label = (await readTrim(path.join(root, `fan${index}_label`))) || `${chip} 风扇 ${index}`
        const rpm = await readNum(path.join(root, file))
        if (validRpm(rpm)) {
          fans.push({
            id: `hwmon-${monitor}-fan-${index}`,
            label,
            value: rpm,
            unit: 'rpm',
            source: `hwmon:${chip}`,
          })
        }
      }
    }
  }

  return { temperatures, fans }
}

function isJunkGpu(vendor: string, model: string): boolean {
  const text = `${vendor} ${model}`.toLowerCase()
  return (
    text.includes('remote display') ||
    text.includes('microsoft basic render') ||
    (text.includes('virtual') && text.includes('gpu')) ||
    text.includes('citrix') ||
    text.includes('teamviewer') ||
    // Motherboard / CPU iGPU — hide when present; discrete adapters are preferred.
    text.includes('intel') ||
    text.includes('uhd graphics') ||
    text.includes('iris xe') ||
    text.includes('iris plus')
  )
}

function finalizeGpus(gpus: GpuSnapshot[]): GpuSnapshot[] {
  const filtered = gpus.filter((gpu) => !isJunkGpu(gpu.vendor, gpu.model))
  // Prefer NVIDIA / AMD discrete cards; drop duplicates by model.
  const seen = new Set<string>()
  return filtered.filter((gpu) => {
    const key = gpu.model.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function updateLoadAvg(usagePercent: number, logicalCores: number): [number, number, number] {
  const instant = (usagePercent / 100) * Math.max(1, logicalCores)
  if (process.platform !== 'win32') {
    const load = os.loadavg() as [number, number, number]
    return [load[0] ?? instant, load[1] ?? instant, load[2] ?? instant]
  }
  // Windows has no loadavg; keep EMA approximations for 1/5/15 minute windows at ~1Hz sampling.
  const alphas: [number, number, number] = [1 / 60, 1 / 300, 1 / 900]
  if (!loadEmaReady) {
    loadEma = [instant, instant, instant]
    loadEmaReady = true
  } else {
    loadEma = [
      alphas[0] * instant + (1 - alphas[0]) * loadEma[0],
      alphas[1] * instant + (1 - alphas[1]) * loadEma[1],
      alphas[2] * instant + (1 - alphas[2]) * loadEma[2],
    ]
  }
  return loadEma
}

function graphicsFallback(existing: GpuSnapshot[]): GpuSnapshot[] {
  const controllers = cachedGraphics?.controllers ?? []
  const extra: GpuSnapshot[] = []
  for (const [index, controller] of controllers.entries()) {
    const model = controller.model || controller.name || `GPU ${index + 1}`
    const vendor = controller.vendor || 'Unknown'
    if (isJunkGpu(vendor, model)) continue
    const already = existing.some((gpu) => {
      const left = gpu.model.toLowerCase()
      const right = model.toLowerCase()
      return left.includes(right) || right.includes(left) || gpu.model === model
    })
    if (already) continue
    extra.push({
      id: `si-${index}-${model}`,
      vendor,
      model,
      bus: controller.bus || null,
      driver: controller.driverVersion || null,
      usagePercent: num(controller.utilizationGpu),
      memoryUsedMb: num(controller.memoryUsed),
      memoryTotalMb: num(controller.memoryTotal) ?? num(controller.vram),
      temperatureC: num(controller.temperatureGpu),
      fanPercent: num(controller.fanSpeed),
      powerDrawW: num(controller.powerDraw),
      powerLimitW: num(controller.powerLimit),
      clockCoreMhz: num(controller.clockCore),
      clockMemoryMhz: num(controller.clockMemory),
      cores: num(controller.cores),
      metalVersion: controller.metalVersion || null,
      source: 'systeminformation',
    })
  }
  return extra
}

function buildMemory(
  raw: Awaited<ReturnType<typeof si.mem>>,
  winMem?: Awaited<ReturnType<typeof collectWindowsMemoryExtras>>,
): MemorySnapshot {
  const cachedBytes = raw.cached > 0 ? raw.cached : (winMem?.cacheBytes ?? 0) + (winMem?.standbyBytes ?? 0)
  const buffcacheBytes =
    (raw.buffcache ?? 0) > 0 ? raw.buffcache ?? 0 : (winMem?.cacheBytes ?? 0) + (winMem?.standbyBytes ?? 0)
  const usagePercent = raw.total > 0 ? (raw.used / raw.total) * 100 : 0
  const swapPercent = raw.swaptotal > 0 ? (raw.swapused / raw.swaptotal) * 100 : 0
  return {
    totalBytes: raw.total,
    usedBytes: raw.used,
    availableBytes: raw.available,
    activeBytes: raw.active,
    cachedBytes,
    buffcacheBytes,
    freeBytes: raw.free,
    swapTotalBytes: raw.swaptotal,
    swapUsedBytes: raw.swapused,
    usagePercent,
    swapPercent,
  }
}

function buildSystem(): SystemSnapshot {
  const osInfo = cachedOsInfo
  const system = cachedSystem
  const genericModel = !system?.model || /system product name|to be filled|default string|undefined/i.test(system.model)
  return {
    hostname: os.hostname(),
    distro: osInfo?.distro || os.type(),
    release: osInfo?.release || os.release(),
    arch: os.arch(),
    platform: process.platform,
    uptimeSec: os.uptime(),
    manufacturer: cachedBaseboard?.manufacturer || system?.manufacturer || null,
    model: genericModel ? cachedBaseboard?.model || system?.model || null : system?.model || null,
  }
}

function uniqueSensors(sensors: SensorReading[]): SensorReading[] {
  const seen = new Set<string>()
  return sensors.filter((sensor) => {
    const key = `${sensor.label}|${sensor.unit}|${Math.round(sensor.value * 10)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildDisks(raw: Awaited<ReturnType<typeof si.fsSize>>): DiskSnapshot[] {
  return raw
    .filter((disk) => disk.size > 0)
    .map((disk, index) => ({
      id: `${disk.mount || disk.fs || index}`,
      fs: disk.fs || '',
      type: disk.type || '',
      mount: disk.mount || disk.fs || `Volume ${index + 1}`,
      sizeBytes: disk.size,
      usedBytes: disk.used,
      availableBytes: disk.available,
      usagePercent: disk.use ?? (disk.size > 0 ? (disk.used / disk.size) * 100 : 0),
    }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
}

async function buildDiskIoSafe(): Promise<DiskIoSnapshot> {
  if (process.platform === 'win32') {
    const winIo = await collectWindowsDiskIo()
    if (winIo) return winIo
  }
  try {
    const stats = await si.fsStats()
    if (stats && (stats.rx_sec != null || stats.wx_sec != null)) {
      return {
        readBytesPerSec: Math.max(0, stats.rx_sec ?? 0),
        writeBytesPerSec: Math.max(0, stats.wx_sec ?? 0),
        readIops: 0,
        writeIops: 0,
      }
    }
  } catch {
    // continue
  }
  try {
    const io = await si.disksIO()
    return {
      readBytesPerSec: Math.max(0, io.rIO_sec ?? 0),
      writeBytesPerSec: Math.max(0, io.wIO_sec ?? 0),
      readIops: Math.max(0, io.rIO_sec ?? 0),
      writeIops: Math.max(0, io.wIO_sec ?? 0),
    }
  } catch {
    return { readBytesPerSec: 0, writeBytesPerSec: 0, readIops: 0, writeIops: 0 }
  }
}

async function buildNetworksSafe(
  raw: Awaited<ReturnType<typeof si.networkStats>>,
): Promise<NetworkSnapshot[]> {
  const ifaces = await si.networkInterfaces().catch(() => [])
  const ifaceMeta = new Map(
    (Array.isArray(ifaces) ? ifaces : ifaces ? [ifaces] : []).map((item) => [item.iface, item]),
  )

  let networks: NetworkSnapshot[] = raw
    .filter((iface) => iface.iface && !/loopback|lo\d*$/i.test(iface.iface))
    .map((iface) => {
      const meta = ifaceMeta.get(iface.iface)
      return {
        iface: iface.iface,
        ifaceName: iface.ifaceName || meta?.ifaceName || iface.iface,
        operstate: iface.operstate || meta?.operstate || 'unknown',
        type: iface.type || meta?.type || 'unknown',
        ip4: iface.ip4 || meta?.ip4 || null,
        ip6: iface.ip6 || meta?.ip6 || null,
        mac: iface.mac || meta?.mac || null,
        speedMbps: num(iface.speed) ?? num(meta?.speed),
        rxBytesPerSec: Math.max(0, iface.rx_sec ?? 0),
        txBytesPerSec: Math.max(0, iface.tx_sec ?? 0),
        rxSec: Math.max(0, iface.rx_sec ?? 0),
        txSec: Math.max(0, iface.tx_sec ?? 0),
      }
    })

  if (process.platform === 'win32') {
    const winRates = await collectWindowsNetRates()
    if (winRates.length) {
      // Match by normalized name fragments when SI rates are zero/null.
      networks = networks.map((net) => {
        if (net.rxBytesPerSec > 0 || net.txBytesPerSec > 0) return net
        const hit = winRates.find((row) => {
          const left = row.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          const right = `${net.ifaceName} ${net.iface}`.toLowerCase().replace(/[^a-z0-9]/g, '')
          return left.includes(right.slice(0, 12)) || right.includes(left.slice(0, 12))
        })
        if (!hit) return net
        return {
          ...net,
          rxBytesPerSec: hit.rxBytesPerSec,
          txBytesPerSec: hit.txBytesPerSec,
          rxSec: hit.rxBytesPerSec,
          txSec: hit.txBytesPerSec,
          speedMbps: net.speedMbps ?? (hit.bandwidthBps != null ? hit.bandwidthBps / 1_000_000 : null),
        }
      })

      // Ensure at least active adapters from perf counters appear.
      for (const rate of winRates) {
        if (rate.rxBytesPerSec <= 0 && rate.txBytesPerSec <= 0 && (rate.bandwidthBps ?? 0) <= 0) continue
        const exists = networks.some((net) => {
          const left = rate.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          const right = `${net.ifaceName} ${net.iface}`.toLowerCase().replace(/[^a-z0-9]/g, '')
          return left.includes(right.slice(0, 12)) || right.includes(left.slice(0, 12))
        })
        if (exists) continue
        networks.push({
          iface: rate.name,
          ifaceName: rate.name,
          operstate: rate.rxBytesPerSec + rate.txBytesPerSec > 0 ? 'up' : 'unknown',
          type: 'wired',
          ip4: null,
          ip6: null,
          mac: null,
          speedMbps: rate.bandwidthBps != null ? rate.bandwidthBps / 1_000_000 : null,
          rxBytesPerSec: rate.rxBytesPerSec,
          txBytesPerSec: rate.txBytesPerSec,
          rxSec: rate.rxBytesPerSec,
          txSec: rate.txBytesPerSec,
        })
      }
    }
  }

  return networks.sort(
    (a, b) => b.rxBytesPerSec + b.txBytesPerSec - (a.rxBytesPerSec + a.txBytesPerSec),
  )
}

function buildBattery(raw: Awaited<ReturnType<typeof si.battery>>): BatterySnapshot {
  return {
    hasBattery: Boolean(raw.hasBattery),
    isCharging: Boolean(raw.isCharging),
    percent: raw.hasBattery ? num(raw.percent) : null,
    remainingMinutes: raw.hasBattery ? num(raw.timeRemaining) : null,
    acConnected: typeof raw.acConnected === 'boolean' ? raw.acConnected : process.platform === 'win32' ? true : null,
    cycleCount: raw.hasBattery ? num(raw.cycleCount) : null,
    healthPercent:
      raw.hasBattery && num(raw.maxCapacity) && num(raw.designedCapacity) && (raw.designedCapacity as number) > 0
        ? Math.min(100, ((raw.maxCapacity as number) / (raw.designedCapacity as number)) * 100)
        : null,
    type: raw.hasBattery ? raw.type || 'Battery' : 'AC',
    model: raw.hasBattery ? raw.model || null : '台式电源直供',
  }
}

function buildProcesses(raw: Awaited<ReturnType<typeof si.processes>>): ProcessSnapshot[] {
  const ignore = /^(system idle process|idle|registry|memory compression|system interrupts)$/i
  return (raw.list ?? [])
    .map((proc) => ({
      pid: proc.pid,
      name: proc.name || proc.command || `pid-${proc.pid}`,
      cpuPercent: proc.cpu ?? 0,
      memPercent: proc.mem ?? 0,
      memBytes: proc.memRss ? proc.memRss * 1024 : 0,
      user: proc.user || '',
    }))
    .filter((proc) => !ignore.test(proc.name) && proc.pid > 0)
    .sort((a, b) => b.cpuPercent - a.cpuPercent || b.memPercent - a.memPercent)
    .slice(0, 15)
}

function buildDisplaysFromSi(): DisplaySnapshot[] {
  return (cachedGraphics?.displays ?? [])
    .filter((display) => !/remote/i.test(`${display.model} ${display.connection}`))
    .map((display, index) => {
      const sizeX = display.sizeX
      const sizeY = display.sizeY
      let sizeInch: number | null = null
      if (sizeX && sizeY) {
        sizeInch = Math.sqrt(sizeX * sizeX + sizeY * sizeY) / 25.4
      }
      return {
        id: `display-${index}`,
        model: display.model || display.vendor || `显示器 ${index + 1}`,
        connection: display.connection || null,
        main: Boolean(display.main),
        builtin: Boolean(display.builtin),
        resolutionX: display.currentResX ?? display.resolutionX ?? null,
        resolutionY: display.currentResY ?? display.resolutionY ?? null,
        currentRefreshRate: num(display.currentRefreshRate),
        sizeInch,
      }
    })
}

async function buildDisplaysSafe(): Promise<DisplaySnapshot[]> {
  if (process.platform === 'win32') {
    const now = Date.now()
    if (!lastWinDisplays || now - lastWinDisplaysAt > 10_000) {
      const winDisplays = await collectWindowsDisplays()
      if (winDisplays.length) {
        lastWinDisplays = winDisplays.map((display, index) => ({
          id: `win-display-${index}`,
          model: display.name,
          connection: null,
          main: index === 0,
          builtin: false,
          resolutionX: display.width,
          resolutionY: display.height,
          currentRefreshRate: display.refreshRate || null,
          sizeInch: null,
        }))
        lastWinDisplaysAt = now
      }
    }
    if (lastWinDisplays?.length) return lastWinDisplays
  }
  const fromSi = buildDisplaysFromSi()
  return fromSi.length ? fromSi : lastWinDisplays ?? []
}

export async function collectMetrics(): Promise<MetricsSnapshot> {
  await refreshStaticInfo()
  const usage = cpuUsageFromDelta()
  processTick += 1
  const shouldSampleProcesses = processTick % 2 === 1
  const isWin = process.platform === 'win32'

  const [
    mem,
    cpuTemp,
    cpuSpeed,
    nvidia,
    linuxGpus,
    linuxSensors,
    macSensors,
    fsSize,
    diskIo,
    netStats,
    battery,
    processes,
    winThermals,
    winCpuTemp,
    winCpuPower,
    winMem,
    displays,
    winVideos,
  ] = await Promise.all([
    si.mem(),
    si.cpuTemperature().catch(() => ({ main: null, cores: [], max: null, chipset: undefined as number | undefined })),
    si.cpuCurrentSpeed().catch(() => ({ avg: 0, min: 0, max: 0, cores: [] as number[] })),
    nvidiaGpus(),
    linuxDrmGpus(),
    linuxHwmonSensors(),
    collectMacSensors(),
    si.fsSize().catch(() => []),
    buildDiskIoSafe(),
    si.networkStats().catch(() => []),
    si.battery().catch(() => ({
      hasBattery: false,
      cycleCount: 0,
      isCharging: false,
      designedCapacity: 0,
      maxCapacity: 0,
      currentCapacity: 0,
      voltage: 0,
      capacityUnit: '',
      percent: 0,
      timeRemaining: null,
      acConnected: true,
      type: '',
      model: '',
      manufacturer: '',
      serial: '',
    })),
    shouldSampleProcesses
      ? si.processes().catch(() => ({ all: 0, running: 0, blocked: 0, sleeping: 0, unknown: 0, list: [] }))
      : Promise.resolve(null),
    isWin ? collectWindowsThermals() : Promise.resolve([]),
    isWin ? collectWindowsCpuPackageTemp() : Promise.resolve(null),
    isWin ? collectWindowsCpuPackagePower() : Promise.resolve(null),
    isWin ? collectWindowsMemoryExtras() : Promise.resolve(null),
    buildDisplaysSafe(),
    isWin ? collectWindowsVideoControllers() : Promise.resolve([]),
  ])

  if (isWin && !cachedBaseboard) {
    cachedBaseboard = await collectWindowsBaseboard()
  }

  const cpuInfo = cachedCpuInfo
  const brand = cpuInfo?.brand || os.cpus()[0]?.model || 'CPU'
  const macArch = detectMacArch()
  const macArchField = macArch === 'apple-silicon' || macArch === 'intel' ? macArch : null
  const siMainTemp = validTemp(cpuTemp.main) ? cpuTemp.main : null
  const siCoreTemps = (cpuTemp.cores ?? []).filter(validTemp)
  const coreTemps = macSensors.cpuCoreTemps.length ? macSensors.cpuCoreTemps : siCoreTemps
  const winThermalMax = winThermals.length ? Math.max(...winThermals.map((item) => item.celsius)) : null
  const mainTemp =
    macSensors.cpuTempMain ??
    siMainTemp ??
    (validTemp(winCpuTemp) ? winCpuTemp : null) ??
    (validTemp(winThermalMax) ? winThermalMax : null) ??
    (coreTemps.length ? Math.max(...coreTemps) : null)

  const logicalCores = cpuInfo?.cores || os.cpus().length
  const loadAvg = updateLoadAvg(usage.overall, logicalCores)

  // Prefer live current speed; fill per-core MHz when OS reports flat base clocks.
  const perCore = usage.perCore.map((core, index) => ({
    usagePercent: core.usagePercent,
    speedMhz:
      (cpuSpeed.cores?.[index] ? cpuSpeed.cores[index] * 1000 : null) ??
      (cpuSpeed.avg ? cpuSpeed.avg * 1000 : null) ??
      core.speedMhz,
  }))

  const cpu: CpuSnapshot = {
    manufacturer: cpuInfo?.manufacturer || (isAppleSiliconCpu(brand) ? 'Apple' : ''),
    brand,
    vendor: cpuInfo?.vendor || '',
    cores: logicalCores,
    physicalCores: cpuInfo?.physicalCores || os.cpus().length,
    performanceCores: cpuInfo?.performanceCores ?? null,
    efficiencyCores: cpuInfo?.efficiencyCores ?? null,
    speedMaxGhz: cpuInfo?.speedMax || cpuSpeed.max || null,
    speedMinGhz: cpuInfo?.speedMin || cpuSpeed.min || null,
    usagePercent: usage.overall,
    perCore,
    temperatureC: mainTemp,
    powerDrawW: typeof winCpuPower === 'number' ? winCpuPower : null,
    coreTemperatures: coreTemps,
    loadAvg,
    macArch: macArchField,
    socTemperatureC: macSensors.socTemp,
  }

  const gpus = [...nvidia]
  for (const gpu of linuxGpus) {
    if (!gpus.some((item) => item.model.includes(gpu.model) || gpu.model.includes(item.model))) {
      gpus.push(gpu)
    }
  }
  gpus.push(...graphicsFallback(gpus))
  const visibleGpus = finalizeGpus(gpus)

  if (macSensors.gpuTemp != null) {
    for (const gpu of visibleGpus) {
      if (gpu.temperatureC == null && /apple|m[1-9]/i.test(`${gpu.vendor} ${gpu.model}`)) {
        gpu.temperatureC = macSensors.gpuTemp
      }
    }
    if (!visibleGpus.some((gpu) => gpu.temperatureC != null)) {
      visibleGpus.push({
        id: 'apple-gpu',
        vendor: 'Apple',
        model: brand.includes('Apple') ? `${brand} GPU` : 'Apple GPU',
        bus: 'Built-in',
        driver: null,
        usagePercent: null,
        memoryUsedMb: null,
        memoryTotalMb: null,
        temperatureC: macSensors.gpuTemp,
        fanPercent: null,
        powerDrawW: null,
        powerLimitW: null,
        clockCoreMhz: null,
        clockMemoryMhz: null,
        cores: null,
        metalVersion: null,
        source: macSensors.source || 'macos-temperature-sensor',
      })
    }
  }

  // Enrich remaining GPU drivers from Windows video controllers when missing.
  if (isWin && winVideos.length) {
    for (const gpu of visibleGpus) {
      const hit = winVideos.find((video) => {
        if (isJunkGpu(video.name, video.name)) return false
        const left = video.name.toLowerCase()
        const right = gpu.model.toLowerCase()
        return left.includes(right) || right.includes(left)
      })
      if (!hit) continue
      if (!gpu.driver && hit.driverVersion) gpu.driver = hit.driverVersion
    }
  }

  const temperatures: SensorReading[] = [...linuxSensors.temperatures, ...macSensors.temperatures]
  for (const thermal of winThermals) {
    temperatures.push({
      id: `win-thermal-${thermal.name}`,
      label: thermal.name.includes('TZ') ? `主板热区 ${thermal.name}` : thermal.name,
      value: thermal.celsius,
      unit: 'C',
      source: 'Win32_ThermalZone',
    })
  }
  if (cpu.temperatureC != null && !temperatures.some((t) => t.id === 'cpu-main' || t.id.startsWith('mac-cpu'))) {
    temperatures.unshift({
      id: 'cpu-main',
      label: macArchField === 'apple-silicon' ? 'CPU (Apple Silicon)' : macArchField === 'intel' ? 'CPU (Intel)' : 'CPU / 封装',
      value: cpu.temperatureC,
      unit: 'C',
      source: macSensors.source || (isWin ? 'Win32_ThermalZone' : 'cpuTemperature'),
    })
  }
  if (!macSensors.cpuCoreTemps.length) {
    cpu.coreTemperatures.forEach((value, index) => {
      temperatures.push({
        id: `cpu-core-${index}`,
        label: `CPU 核心 ${index + 1}`,
        value,
        unit: 'C',
        source: 'cpuTemperature',
      })
    })
  }
  if (validTemp(cpuTemp.chipset)) {
    temperatures.push({
      id: 'chipset',
      label: '芯片组',
      value: cpuTemp.chipset,
      unit: 'C',
      source: 'cpuTemperature',
    })
  }
  for (const gpu of visibleGpus) {
    if (gpu.temperatureC != null && !temperatures.some((t) => t.label === gpu.model || t.id === `${gpu.id}-temp`)) {
      temperatures.push({
        id: `${gpu.id}-temp`,
        label: gpu.model,
        value: gpu.temperatureC,
        unit: 'C',
        source: gpu.source,
      })
    }
  }

  const fans: SensorReading[] = [...linuxSensors.fans, ...macSensors.fans]
  for (const gpu of visibleGpus) {
    if (gpu.fanPercent != null) {
      fans.push({
        id: `${gpu.id}-fan`,
        label: `${gpu.model} 风扇`,
        value: gpu.fanPercent,
        unit: '%',
        source: gpu.source,
      })
    }
  }

  const processList = processes ? buildProcesses(processes) : lastProcessList
  if (processes) lastProcessList = processList

  const networks = await buildNetworksSafe(netStats)

  void refreshHardwareIdentityIfNeeded()

  return {
    collectedAt: Date.now(),
    system: buildSystem(),
    cpu,
    memory: buildMemory(mem, winMem),
    gpus: visibleGpus,
    disks: buildDisks(fsSize),
    diskIo,
    networks,
    battery: buildBattery(battery as Awaited<ReturnType<typeof si.battery>>),
    processes: processList,
    displays,
    temperatures: uniqueSensors(temperatures),
    fans: uniqueSensors(fans),
    hardwareIdentity: getCachedHardwareIdentity(),
  }
}

export async function warmup(): Promise<void> {
  prevCpus = os.cpus()
  await refreshStaticInfo(true)
  if (process.platform === 'win32') {
    cachedBaseboard = await collectWindowsBaseboard()
  }
  await Promise.all([
    si.networkStats().catch(() => []),
    si.fsStats().catch(() => null),
    si.disksIO().catch(() => null),
    process.platform === 'win32' ? collectWindowsDiskIo() : Promise.resolve(null),
    process.platform === 'win32' ? collectWindowsNetRates() : Promise.resolve(null),
    collectHardwareIdentity(true).catch((error) => {
      console.warn('[hardware] warmup identity failed', error instanceof Error ? error.message : error)
    }),
  ])
  await new Promise((resolve) => setTimeout(resolve, 1100))
  await si.networkStats().catch(() => [])
  prevCpus = os.cpus()
}
