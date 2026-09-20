import type { HardwareIdentitySnapshot } from './hardware'

export interface CpuCoreSnapshot {
  usagePercent: number
  speedMhz: number
}

export interface CpuSnapshot {
  manufacturer: string
  brand: string
  vendor: string
  cores: number
  physicalCores: number
  performanceCores: number | null
  efficiencyCores: number | null
  speedMaxGhz: number | null
  speedMinGhz: number | null
  usagePercent: number
  perCore: CpuCoreSnapshot[]
  temperatureC: number | null
  /** Package / SoC power draw in watts when the platform exposes it (Windows EMI/RAPL, etc.). */
  powerDrawW: number | null
  coreTemperatures: number[]
  loadAvg: [number, number, number]
  /** macOS: apple-silicon | intel | null on other platforms */
  macArch: 'apple-silicon' | 'intel' | null
  socTemperatureC: number | null
}

export interface GpuSnapshot {
  id: string
  vendor: string
  model: string
  bus: string | null
  driver: string | null
  usagePercent: number | null
  memoryUsedMb: number | null
  memoryTotalMb: number | null
  temperatureC: number | null
  fanPercent: number | null
  powerDrawW: number | null
  powerLimitW: number | null
  clockCoreMhz: number | null
  clockMemoryMhz: number | null
  cores: number | null
  metalVersion: string | null
  source: string
}

export interface MemorySnapshot {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  activeBytes: number
  cachedBytes: number
  buffcacheBytes: number
  freeBytes: number
  swapTotalBytes: number
  swapUsedBytes: number
  usagePercent: number
  swapPercent: number
}

export interface SensorReading {
  id: string
  label: string
  value: number
  unit: 'C' | 'rpm' | '%'
  source: string
}

export interface DiskSnapshot {
  id: string
  fs: string
  type: string
  mount: string
  sizeBytes: number
  usedBytes: number
  availableBytes: number
  usagePercent: number
}

export interface DiskIoSnapshot {
  readBytesPerSec: number
  writeBytesPerSec: number
  readIops: number
  writeIops: number
}

export interface NetworkSnapshot {
  iface: string
  ifaceName: string
  operstate: string
  type: string
  ip4: string | null
  ip6: string | null
  mac: string | null
  speedMbps: number | null
  rxBytesPerSec: number
  txBytesPerSec: number
  rxSec: number
  txSec: number
}

export interface BatterySnapshot {
  hasBattery: boolean
  isCharging: boolean
  percent: number | null
  remainingMinutes: number | null
  acConnected: boolean | null
  cycleCount: number | null
  healthPercent: number | null
  type: string | null
  model: string | null
}

export interface ProcessSnapshot {
  pid: number
  name: string
  cpuPercent: number
  memPercent: number
  memBytes: number
  user: string
}

export interface DisplaySnapshot {
  id: string
  model: string
  connection: string | null
  main: boolean
  builtin: boolean
  resolutionX: number | null
  resolutionY: number | null
  currentRefreshRate: number | null
  sizeInch: number | null
}

export interface SystemSnapshot {
  hostname: string
  distro: string
  release: string
  arch: string
  platform: NodeJS.Platform
  uptimeSec: number
  manufacturer: string | null
  model: string | null
}

export interface MetricsSnapshot {
  collectedAt: number
  system: SystemSnapshot
  cpu: CpuSnapshot
  memory: MemorySnapshot
  gpus: GpuSnapshot[]
  disks: DiskSnapshot[]
  diskIo: DiskIoSnapshot
  networks: NetworkSnapshot[]
  battery: BatterySnapshot
  processes: ProcessSnapshot[]
  displays: DisplaySnapshot[]
  temperatures: SensorReading[]
  fans: SensorReading[]
  /** Static hardware identity; refreshed on a slow cadence, may be null on first ticks. */
  hardwareIdentity: HardwareIdentitySnapshot | null
}

export type PageId =
  | 'overview'
  | 'cpu'
  | 'gpu'
  | 'memory'
  | 'disk'
  | 'network'
  | 'thermal'
  | 'battery'
  | 'processes'
