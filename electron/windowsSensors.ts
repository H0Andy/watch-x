import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface WindowsThermalReading {
  name: string
  celsius: number
}

export interface WindowsDiskIo {
  readBytesPerSec: number
  writeBytesPerSec: number
  readIops: number
  writeIops: number
}

export interface WindowsNetRate {
  name: string
  rxBytesPerSec: number
  txBytesPerSec: number
  bandwidthBps: number | null
}

export interface WindowsMemoryExtras {
  cacheBytes: number
  standbyBytes: number
  modifiedBytes: number
  committedBytes: number
  commitLimitBytes: number
}

export interface WindowsDisplayInfo {
  name: string
  width: number
  height: number
  refreshRate: number
  driverVersion: string | null
}

export interface WindowsBaseboard {
  manufacturer: string | null
  model: string | null
}

async function powershellJson<T>(command: string): Promise<T | null> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout: 12000, maxBuffer: 8 * 1024 * 1024 },
    )
    const text = stdout.trim()
    if (!text) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function kelvinTenthsToC(highPrecision: number | null | undefined, temperature: number | null | undefined): number | null {
  let celsius: number | null = null
  if (typeof highPrecision === 'number' && highPrecision > 1000) {
    celsius = highPrecision / 10 - 273.15
  } else if (typeof temperature === 'number') {
    // Some hosts expose tenths-Kelvin in Temperature; others already Celsius.
    if (temperature > 200) celsius = temperature / 10 - 273.15
    else if (temperature > 0 && temperature < 120) celsius = temperature
  }
  if (celsius == null || celsius < 1 || celsius > 125) return null
  return Math.round(celsius * 10) / 10
}

export async function collectWindowsThermals(): Promise<WindowsThermalReading[]> {
  const rows = asArray(
    await powershellJson<{ Name?: string; Temperature?: number; HighPrecisionTemperature?: number } | Array<{
      Name?: string
      Temperature?: number
      HighPrecisionTemperature?: number
    }>>(
      'Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object Name,Temperature,HighPrecisionTemperature | ConvertTo-Json -Compress',
    ),
  )

  const readings: WindowsThermalReading[] = []
  for (const row of rows) {
    const celsius = kelvinTenthsToC(row.HighPrecisionTemperature, row.Temperature)
    if (celsius == null || celsius < 1 || celsius > 125) continue
    readings.push({
      name: (row.Name || 'ThermalZone').replace(/^\\+/, ''),
      celsius,
    })
  }

  if (readings.length) return readings

  // Fallback ACPI thermal zone (tenths of Kelvin)
  const acpi = asArray(
    await powershellJson<{ InstanceName?: string; CurrentTemperature?: number } | Array<{
      InstanceName?: string
      CurrentTemperature?: number
    }>>(
      "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object InstanceName,CurrentTemperature | ConvertTo-Json -Compress",
    ),
  )
  for (const row of acpi) {
    const raw = row.CurrentTemperature
    if (typeof raw !== 'number') continue
    const celsius = raw / 10 - 273.15
    if (celsius < 1 || celsius > 125) continue
    readings.push({
      name: row.InstanceName || 'ACPI Thermal',
      celsius,
    })
  }
  return readings
}

export async function collectWindowsDiskIo(): Promise<WindowsDiskIo | null> {
  const row = await powershellJson<{
    DiskReadBytesPersec?: number
    DiskWriteBytesPersec?: number
    DiskReadsPersec?: number
    DiskWritesPersec?: number
  }>(
    "Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -eq '_Total' } | Select-Object DiskReadBytesPersec,DiskWriteBytesPersec,DiskReadsPersec,DiskWritesPersec | ConvertTo-Json -Compress",
  )
  if (!row) return null
  return {
    readBytesPerSec: Math.max(0, Number(row.DiskReadBytesPersec) || 0),
    writeBytesPerSec: Math.max(0, Number(row.DiskWriteBytesPersec) || 0),
    readIops: Math.max(0, Number(row.DiskReadsPersec) || 0),
    writeIops: Math.max(0, Number(row.DiskWritesPersec) || 0),
  }
}

export async function collectWindowsNetRates(): Promise<WindowsNetRate[]> {
  const rows = asArray(
    await powershellJson<{
      Name?: string
      BytesReceivedPersec?: number
      BytesSentPersec?: number
      CurrentBandwidth?: number
    } | Array<{
      Name?: string
      BytesReceivedPersec?: number
      BytesSentPersec?: number
      CurrentBandwidth?: number
    }>>(
      'Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Select-Object Name,BytesReceivedPersec,BytesSentPersec,CurrentBandwidth | ConvertTo-Json -Compress',
    ),
  )
  return rows
    .map((row) => ({
      name: row.Name || '',
      rxBytesPerSec: Math.max(0, Number(row.BytesReceivedPersec) || 0),
      txBytesPerSec: Math.max(0, Number(row.BytesSentPersec) || 0),
      bandwidthBps: row.CurrentBandwidth != null ? Number(row.CurrentBandwidth) || null : null,
    }))
    .filter((row) => row.name)
}

export async function collectWindowsMemoryExtras(): Promise<WindowsMemoryExtras | null> {
  const row = await powershellJson<{
    CacheBytes?: number
    ModifiedPageListBytes?: number
    StandbyCacheCoreBytes?: number
    StandbyCacheNormalPriorityBytes?: number
    StandbyCacheReserveBytes?: number
    CommittedBytes?: number
    CommitLimit?: number
  }>(
    'Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object CacheBytes,ModifiedPageListBytes,StandbyCacheCoreBytes,StandbyCacheNormalPriorityBytes,StandbyCacheReserveBytes,CommittedBytes,CommitLimit | ConvertTo-Json -Compress',
  )
  if (!row) return null
  const standby =
    (Number(row.StandbyCacheCoreBytes) || 0) +
    (Number(row.StandbyCacheNormalPriorityBytes) || 0) +
    (Number(row.StandbyCacheReserveBytes) || 0)
  return {
    cacheBytes: Number(row.CacheBytes) || 0,
    standbyBytes: standby,
    modifiedBytes: Number(row.ModifiedPageListBytes) || 0,
    committedBytes: Number(row.CommittedBytes) || 0,
    commitLimitBytes: Number(row.CommitLimit) || 0,
  }
}

export async function collectWindowsDisplays(): Promise<WindowsDisplayInfo[]> {
  const rows = asArray(
    await powershellJson<{
      Name?: string
      CurrentHorizontalResolution?: number
      CurrentVerticalResolution?: number
      CurrentRefreshRate?: number
      DriverVersion?: string
    } | Array<{
      Name?: string
      CurrentHorizontalResolution?: number
      CurrentVerticalResolution?: number
      CurrentRefreshRate?: number
      DriverVersion?: string
    }>>(
      "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Remote' -and $_.CurrentHorizontalResolution -gt 0 } | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate,DriverVersion | ConvertTo-Json -Compress",
    ),
  )
  return rows
    .map((row) => ({
      name: row.Name || 'Display',
      width: Number(row.CurrentHorizontalResolution) || 0,
      height: Number(row.CurrentVerticalResolution) || 0,
      refreshRate: Number(row.CurrentRefreshRate) || 0,
      driverVersion: row.DriverVersion || null,
    }))
    .filter((row) => row.width > 0 && row.height > 0)
}

export async function collectWindowsBaseboard(): Promise<WindowsBaseboard> {
  const row = await powershellJson<{ Manufacturer?: string; Product?: string; Model?: string }>(
    'Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product | ConvertTo-Json -Compress',
  )
  return {
    manufacturer: row?.Manufacturer || null,
    model: row?.Product || row?.Model || null,
  }
}

export async function collectWindowsVideoControllers(): Promise<
  Array<{ name: string; driverVersion: string | null; adapterRam: number | null }>
> {
  const rows = asArray(
    await powershellJson<{
      Name?: string
      DriverVersion?: string
      AdapterRAM?: number
    } | Array<{
      Name?: string
      DriverVersion?: string
      AdapterRAM?: number
    }>>(
      "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Remote' } | Select-Object Name,DriverVersion,AdapterRAM | ConvertTo-Json -Compress",
    ),
  )
  return rows.map((row) => ({
    name: row.Name || '',
    driverVersion: row.DriverVersion || null,
    adapterRam: typeof row.AdapterRAM === 'number' && row.AdapterRAM > 0 ? row.AdapterRAM : null,
  }))
}

export async function collectWindowsCpuPackageTemp(): Promise<number | null> {
  // Prefer LibreHardwareMonitor / OpenHardwareMonitor if installed
  for (const ns of ['root/LibreHardwareMonitor', 'root/OpenHardwareMonitor']) {
    const rows = asArray(
      await powershellJson<{ Name?: string; SensorType?: string; Value?: number; Parent?: string } | Array<{
        Name?: string
        SensorType?: string
        Value?: number
        Parent?: string
      }>>(
        `Get-CimInstance -Namespace ${ns} -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Temperature' } | Select-Object Name,SensorType,Value,Parent | ConvertTo-Json -Compress`,
      ),
    )
    const cpu = rows.find((row) => /package|cpu|tdie|tctl/i.test(`${row.Name} ${row.Parent}`))
    if (cpu && typeof cpu.Value === 'number' && cpu.Value > 1 && cpu.Value < 125) {
      return cpu.Value
    }
  }
  const thermals = await collectWindowsThermals()
  if (!thermals.length) return null
  return Math.max(...thermals.map((item) => item.celsius))
}

/** Cumulative RAPL energy sample (picowatt-hours) for package-power derivation. */
interface WindowsEnergySample {
  /** Sum of RAPL_*_PKG Energy counters (picowatt-hours). */
  energyPWh: number
  atMs: number
}

let lastCpuEnergySample: WindowsEnergySample | null = null

function sanePackageWatts(watts: number): number | null {
  if (!Number.isFinite(watts) || watts < 0.2 || watts > 800) return null
  return Math.round(watts * 10) / 10
}

/**
 * CPU package power on Windows via Energy Meter (EMI/RAPL) performance counters.
 * Prefer RAPL_*_PKG only — never sum PP0/PP1/DRAM with PKG (double-counts).
 * Falls back to LibreHardwareMonitor / OpenHardwareMonitor Power sensors.
 */
export async function collectWindowsCpuPackagePower(): Promise<number | null> {
  type CounterRow = { InstanceName?: string; Path?: string; CookedValue?: number }
  const rows = asArray(
    await powershellJson<CounterRow | CounterRow[]>(
      [
        "$ErrorActionPreference='SilentlyContinue'",
        "$c = Get-Counter '\\Energy Meter(*)\\Energy','\\Energy Meter(*)\\Power'",
        "if (-not $c) { '' ; exit }",
        "$c.CounterSamples | Select-Object InstanceName,Path,CookedValue | ConvertTo-Json -Compress",
      ].join('; '),
    ),
  )

  const energyPkg: { name: string; value: number }[] = []
  const powerPkg: { name: string; value: number }[] = []
  for (const row of rows) {
    const name = (row.InstanceName || '').toLowerCase()
    const path = (row.Path || '').toLowerCase()
    const value = typeof row.CookedValue === 'number' ? row.CookedValue : NaN
    if (!Number.isFinite(value)) continue
    // Package domain only (PKG). Skip _Total / PP0 / PP1 / DRAM.
    if (!/rapl_package\d+_pkg/.test(name)) continue
    if (path.endsWith('\\energy')) energyPkg.push({ name, value })
    else if (path.endsWith('\\power')) powerPkg.push({ name, value })
  }

  const now = Date.now()
  if (energyPkg.length) {
    const energyPWh = energyPkg.reduce((sum, row) => sum + row.value, 0)
    const prev = lastCpuEnergySample
    lastCpuEnergySample = { energyPWh, atMs: now }
    if (prev && energyPWh >= prev.energyPWh) {
      const dtSec = (now - prev.atMs) / 1000
      if (dtSec >= 0.4) {
        // AbsoluteEnergy is picowatt-hours → joules = pWh * 3.6e-9; P = ΔJ / Δt.
        const watts = ((energyPWh - prev.energyPWh) * 3.6e-9) / dtSec
        const ok = sanePackageWatts(watts)
        if (ok != null) return ok
      }
    }
  }

  // Instantaneous Power counter is milliwatts on current Windows EMI builds.
  if (powerPkg.length) {
    const mw = powerPkg.reduce((sum, row) => sum + row.value, 0)
    const fromMw = sanePackageWatts(mw / 1000)
    if (fromMw != null) return fromMw
    const asWatts = sanePackageWatts(mw)
    if (asWatts != null) return asWatts
  }

  for (const ns of ['root/LibreHardwareMonitor', 'root/OpenHardwareMonitor']) {
    const sensors = asArray(
      await powershellJson<{ Name?: string; SensorType?: string; Value?: number; Parent?: string } | Array<{
        Name?: string
        SensorType?: string
        Value?: number
        Parent?: string
      }>>(
        `Get-CimInstance -Namespace ${ns} -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Power' } | Select-Object Name,SensorType,Value,Parent | ConvertTo-Json -Compress`,
      ),
    )
    const ranked = sensors
      .filter((row) => typeof row.Value === 'number' && Number.isFinite(row.Value))
      .map((row) => {
        const label = `${row.Name} ${row.Parent}`
        let score = 0
        if (/package|ppt|cpu package/i.test(label)) score += 30
        if (/cpu/i.test(label)) score += 10
        if (/core|ia |gt |dram|soc/i.test(label)) score -= 20
        return { score, value: row.Value as number, label }
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
    const best = ranked[0]
    if (best) {
      const ok = sanePackageWatts(best.value)
      if (ok != null) return ok
    }
  }

  return null
}

