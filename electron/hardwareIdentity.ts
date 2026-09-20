import type {
  BatteryIdentity,
  BiosIdentity,
  CpuIdentity,
  DataSource,
  GpuIdentity,
  HardwareIdentitySnapshot,
  HardwareValue,
  MemoryModuleIdentity,
  MotherboardIdentity,
  NetworkAdapterIdentity,
  PhysicalDiskIdentity,
} from '../src/shared/hardware'
import { HARDWARE_DATABASE_VERSION } from '../src/data/hardware-db/schema'
import { scanSpdViaHelper, clearSpdSessionCache } from './spdHelper'
import { mergeSpdIntoMemoryModules, withEmptySpdFields } from './spdMerge'

const JUNK = [
  /^to be filled by o\.?e\.?m\.?$/i,
  /^default string$/i,
  /^system product name$/i,
  /^system manufacturer$/i,
  /^system serial number$/i,
  /^system version$/i,
  /^chassis serial number$/i,
  /^base board serial number$/i,
  /^none$/i,
  /^n\/?a$/i,
  /^unknown$/i,
  /^not available$/i,
  /^not specified$/i,
  /^undefined$/i,
  /^null$/i,
  /^0+$/,
]

const FLAG_HIGHLIGHT = [
  'SSE',
  'SSE2',
  'SSE4.1',
  'SSE4_1',
  'SSE4.2',
  'SSE4_2',
  'AVX',
  'AVX2',
  'AVX512',
  'AVX512F',
  'AES',
  'AES-NI',
  'VMX',
  'SVM',
]

function hw<T>(value: T | null | undefined, source: DataSource): HardwareValue<T> {
  if (value == null) return { value: null, source }
  if (typeof value === 'string') {
    const cleaned = cleanString(value)
    return { value: cleaned as T | null, source }
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return { value: null, source }
  return { value, source }
}

function hwStr(value: unknown, source: DataSource): HardwareValue<string> {
  if (typeof value === 'string') return hw(cleanString(value), source)
  if (value == null) return { value: null, source }
  return hw(cleanString(String(value)), source)
}

function hwNum(value: unknown, source: DataSource): HardwareValue<number> {
  return hw(num(value), source)
}

function hwBool(value: unknown, source: DataSource): HardwareValue<boolean> {
  return hw(bool(value), source)
}

export function cleanString(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const text = String(raw).trim()
  if (!text) return null
  if (JUNK.some((re) => re.test(text))) return null
  return text
}

function num(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() && !/\[?not supported\]?/i.test(raw)) {
    const n = Number(raw.replace(/[^\d.+-eE]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function bool(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw
  return null
}

function cacheKb(bytesOrKb: unknown): number | null {
  const n = num(bytesOrKb)
  if (n == null || n <= 0) return null
  // systeminformation often returns bytes for L2/L3 and KB for L1
  if (n >= 1024 * 64) return Math.round(n / 1024)
  return Math.round(n)
}

function highlightFlags(raw: string | null): string[] {
  if (!raw) return []
  const tokens = new Set(
    raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.toUpperCase()),
  )
  const out: string[] = []
  const push = (label: string, ...aliases: string[]) => {
    if (aliases.some((a) => tokens.has(a.toUpperCase())) || tokens.has(label.toUpperCase())) {
      if (!out.includes(label)) out.push(label)
    }
  }
  push('SSE', 'SSE')
  push('SSE2', 'SSE2')
  push('SSE4.1', 'SSE4.1', 'SSE4_1', 'SSE41')
  push('SSE4.2', 'SSE4.2', 'SSE4_2', 'SSE42')
  push('AVX', 'AVX')
  push('AVX2', 'AVX2')
  push('AVX-512', 'AVX512', 'AVX512F', 'AVX-512')
  push('AES', 'AES', 'AES-NI', 'AESNI')
  push('VT-x', 'VMX')
  push('AMD-V', 'SVM')
  void FLAG_HIGHLIGHT
  return out
}

type Si = typeof import('systeminformation')

async function loadSi(): Promise<Si> {
  return import('systeminformation')
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    console.warn(`[hardware] ${label} unavailable`, error instanceof Error ? error.message : error)
    return fallback
  }
}

function buildCpu(
  cpu: Awaited<ReturnType<Si['cpu']>>,
  cache: Awaited<ReturnType<Si['cpuCache']>> | null,
  flags: string,
): CpuIdentity {
  const src: DataSource = 'systeminformation'
  const l1d = cacheKb(cache?.l1d ?? cpu.cache?.l1d)
  const l1i = cacheKb(cache?.l1i ?? cpu.cache?.l1i)
  const l2 = cacheKb(cache?.l2 ?? cpu.cache?.l2)
  const l3 = cacheKb(cache?.l3 ?? cpu.cache?.l3)
  const flagsClean = cleanString(flags)
  return {
    manufacturer: hwStr(cpu.manufacturer, src),
    brand: hwStr(cpu.brand, src),
    vendor: hwStr(cpu.vendor, src),
    family: hwStr(cpu.family != null ? String(cpu.family) : null, src),
    model: hwStr(cpu.model != null ? String(cpu.model) : null, src),
    stepping: hwStr(cpu.stepping != null ? String(cpu.stepping) : null, src),
    revision: hwStr(cpu.revision != null ? String(cpu.revision) : null, src),
    socket: hwStr(cpu.socket, src),
    physicalCores: hwNum(cpu.physicalCores, src),
    cores: hwNum(cpu.cores, src),
    performanceCores: hwNum(cpu.performanceCores, src),
    efficiencyCores: hwNum(cpu.efficiencyCores, src),
    processors: hwNum(cpu.processors, src),
    speedGhz: hwNum(cpu.speed, src),
    speedMinGhz: hwNum(cpu.speedMin, src),
    speedMaxGhz: hwNum(cpu.speedMax, src),
    virtualization: hwBool(cpu.virtualization, src),
    cache: {
      l1DataKb: hwNum(l1d, src),
      l1InstructionKb: hwNum(l1i, src),
      l2Kb: hwNum(l2, src),
      l3Kb: hwNum(l3, src),
    },
    flagsRaw: hwStr(flagsClean, src),
    flagsHighlighted: { value: highlightFlags(flagsClean), source: src },
  }
}

function buildMotherboard(board: Awaited<ReturnType<Si['baseboard']>>): MotherboardIdentity {
  const src: DataSource = 'smbios'
  return {
    manufacturer: hwStr(board.manufacturer, src),
    model: hwStr(board.model, src),
    version: hwStr(board.version, src),
    serialNumber: hwStr(board.serial, src),
    memSlots: hwNum(board.memSlots, src),
    memMaxBytes: hwNum(board.memMax, src),
  }
}

function buildBios(bios: Awaited<ReturnType<Si['bios']>>): BiosIdentity {
  const src: DataSource = 'smbios'
  return {
    vendor: hwStr(bios.vendor, src),
    version: hwStr(bios.version, src),
    releaseDate: hwStr(bios.releaseDate, src),
    revision: hwStr(bios.revision, src),
  }
}

function buildMemoryModules(rows: Awaited<ReturnType<Si['memLayout']>>): MemoryModuleIdentity[] {
  const src: DataSource = 'smbios'
  return withEmptySpdFields(
    (rows ?? [])
      .filter((row) => num(row.size) != null && (row.size as number) > 0)
      .map((row) => {
        const bank = cleanString(row.bank)
        const locator = cleanString((row as { locator?: string }).locator)
        const configured = num((row as { configuredClockSpeed?: number }).configuredClockSpeed)
        return {
          bank,
          locator,
          manufacturer: hwStr(row.manufacturer, src),
          partNumber: hwStr(row.partNum, src),
          serialNumber: hwStr(row.serialNum, src),
          capacityBytes: hwNum(row.size, src),
          type: hwStr(row.type, src),
          formFactor: hwStr(row.formFactor, src),
          clockSpeedMhz: hwNum(row.clockSpeed, src),
          configuredClockSpeedMhz: hwNum(configured, src),
          ecc: hwBool(row.ecc, src),
          voltageConfigured: hwNum(row.voltageConfigured, src),
          voltageMin: hwNum(row.voltageMin, src),
          voltageMax: hwNum(row.voltageMax, src),
          spd: null,
          dramManufacturer: hwStr(null, 'spd'),
          rank: hwNum(null, 'spd'),
          rankLabel: hwStr(null, 'spd'),
          spdRevision: hwStr(null, 'spd'),
          jedecProfiles: [],
          xmpProfiles: [],
          expoProfiles: [],
          xmpVersion: hwStr(null, 'spd'),
          expoVersion: hwStr(null, 'spd'),
        }
      }),
  )
}

function buildPhysicalDisks(rows: Awaited<ReturnType<Si['diskLayout']>>): PhysicalDiskIdentity[] {
  const src: DataSource = 'systeminformation'
  return (rows ?? []).map((row, index) => {
    const name = cleanString(row.name)
    const vendor = cleanString(row.vendor)
    return {
      id: cleanString(row.serialNum) || cleanString(row.device) || `disk-${index}`,
      name: hwStr(name, src),
      vendor: hwStr(vendor, src),
      model: hwStr(name, src),
      serialNumber: hwStr(row.serialNum, src),
      firmwareRevision: hwStr(row.firmwareRevision, src),
      type: hwStr(row.type, src),
      interfaceType: hwStr(row.interfaceType, src),
      sizeBytes: hwNum(row.size, src),
      temperatureC: hwNum(row.temperature, src),
      smartStatus: hwStr(row.smartStatus, src),
      device: hwStr(row.device, src),
    }
  })
}

async function nvidiaIdentities(): Promise<GpuIdentity[]> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=index,name,driver_version,uuid,pci.bus_id,vbios_version,pstate,memory.total,power.limit,power.default_limit,power.max_limit',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 3500, windowsHide: true },
    )
    const src: DataSource = 'nvidia-smi'
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim())
        const [
          index,
          name,
          driver,
          uuid,
          pci,
          vbios,
          pstate,
          memTotal,
          powerLimit,
          powerDefault,
          powerMax,
        ] = parts
        return {
          id: `nvidia-${index ?? uuid ?? name}`,
          vendor: hwStr('NVIDIA', src),
          model: hwStr(name, src),
          driver: hwStr(driver, src),
          bus: hwStr('PCIe', src),
          uuid: hwStr(uuid, src),
          pciBusId: hwStr(pci, src),
          vbiosVersion: hwStr(vbios, src),
          pstate: hwStr(pstate, src),
          powerLimitW: hwNum(powerLimit, src),
          powerDefaultLimitW: hwNum(powerDefault, src),
          powerMaxLimitW: hwNum(powerMax, src),
          memoryTotalMb: hwNum(memTotal, src),
          source: src,
        } satisfies GpuIdentity
      })
  } catch (error) {
    console.warn('[hardware] nvidia-smi identity unavailable', error instanceof Error ? error.message : error)
    return []
  }
}

async function graphicsFallbackIdentities(si: Si): Promise<GpuIdentity[]> {
  const graphics = await safe('graphics', () => si.graphics(), { controllers: [], displays: [] })
  const src: DataSource = 'systeminformation'
  return (graphics.controllers ?? [])
    .filter((c) => c.model || c.vendor)
    .map((c, index) => ({
      id: `gpu-${index}-${c.model || c.vendor}`,
      vendor: hwStr(c.vendor, src),
      model: hwStr(c.model, src),
      driver: hwStr(c.driverVersion, src),
      bus: hwStr(c.bus, src),
      uuid: hwStr(null, src),
      pciBusId: hwStr(c.pciBus, src),
      vbiosVersion: hwStr(null, src),
      pstate: hwStr(null, src),
      powerLimitW: hwNum(null, src),
      powerDefaultLimitW: hwNum(null, src),
      powerMaxLimitW: hwNum(null, src),
      memoryTotalMb: hwNum(c.vram, src),
      source: src,
    }))
}

function buildNetworkAdapters(
  ifaces: Awaited<ReturnType<Si['networkInterfaces']>>,
): NetworkAdapterIdentity[] {
  const src: DataSource = 'systeminformation'
  const list = Array.isArray(ifaces) ? ifaces : ifaces ? [ifaces] : []
  return list.map((iface, index) => {
    const name = cleanString(iface.ifaceName) || cleanString(iface.iface) || `adapter-${index}`
    const manufacturer = cleanString((iface as { manufacturer?: string }).manufacturer)
    const driver = cleanString((iface as { driver?: string }).driver)
    const driverVersion = cleanString((iface as { driverVersion?: string }).driverVersion)
    return {
      id: `${iface.iface || name}-${iface.mac || index}`,
      iface: iface.iface || name,
      name: hwStr(name, src),
      manufacturer: hwStr(manufacturer, src),
      mac: hwStr(iface.mac && iface.mac !== '00:00:00:00:00:00' ? iface.mac : null, src),
      ip4: hwStr(iface.ip4 || null, src),
      ip6: hwStr(iface.ip6 || null, src),
      speedMbps: hwNum(iface.speed, src),
      type: hwStr(iface.type || null, src),
      operstate: hwStr(iface.operstate || null, src),
      driver: hwStr(driver, src),
      driverVersion: hwStr(driverVersion, src),
    }
  })
}

function buildBattery(raw: Awaited<ReturnType<Si['battery']>>): BatteryIdentity {
  const src: DataSource = 'systeminformation'
  const hasBattery = Boolean(raw.hasBattery)
  if (!hasBattery) {
    return {
      hasBattery: false,
      manufacturer: hwStr(null, src),
      model: hwStr(null, src),
      serialNumber: hwStr(null, src),
      type: hwStr(null, src),
      voltage: hwNum(null, src),
      designedCapacity: hwNum(null, src),
      maxCapacity: hwNum(null, src),
      currentCapacity: hwNum(null, src),
      capacityUnit: hwStr(null, src),
      cycleCount: hwNum(null, src),
    }
  }
  return {
    hasBattery: true,
    manufacturer: hwStr(raw.manufacturer, src),
    model: hwStr(raw.model, src),
    serialNumber: hwStr(raw.serial, src),
    type: hwStr(raw.type, src),
    voltage: hwNum(num(raw.voltage) != null && (raw.voltage as number) > 0 ? raw.voltage : null, src),
    designedCapacity: hwNum(
      num(raw.designedCapacity) != null && (raw.designedCapacity as number) > 0 ? raw.designedCapacity : null,
      src,
    ),
    maxCapacity: hwNum(num(raw.maxCapacity) != null && (raw.maxCapacity as number) > 0 ? raw.maxCapacity : null, src),
    currentCapacity: hwNum(
      num(raw.currentCapacity) != null && (raw.currentCapacity as number) > 0 ? raw.currentCapacity : null,
      src,
    ),
    capacityUnit: hwStr(raw.capacityUnit, src),
    cycleCount: hwNum(num(raw.cycleCount) != null && (raw.cycleCount as number) > 0 ? raw.cycleCount : null, src),
  }
}

let cached: HardwareIdentitySnapshot | null = null
let collecting = false
let lastAt = 0

const IDENTITY_TTL_MS = 5 * 60 * 1000

export function getCachedHardwareIdentity(): HardwareIdentitySnapshot | null {
  return cached
}

export async function collectHardwareIdentity(force = false): Promise<HardwareIdentitySnapshot> {
  if (!force && cached && Date.now() - lastAt < IDENTITY_TTL_MS) return cached
  if (collecting && cached) return cached
  collecting = true
  try {
    if (force) clearSpdSessionCache()

    const si = await loadSi()
    const [cpuSettled, cacheSettled, flagsSettled, boardSettled, biosSettled, memSettled, diskSettled, netSettled, batSettled, nvidia, spdScan] =
      await Promise.all([
        safe('cpu', () => si.cpu(), null),
        safe('cpuCache', () => si.cpuCache(), null),
        safe('cpuFlags', () => si.cpuFlags(), ''),
        safe('baseboard', () => si.baseboard(), null),
        safe('bios', () => si.bios(), null),
        safe('memLayout', () => si.memLayout(), []),
        safe('diskLayout', () => si.diskLayout(), []),
        safe('networkInterfaces', () => si.networkInterfaces(), []),
        safe('battery', () => si.battery(), { hasBattery: false } as Awaited<ReturnType<Si['battery']>>),
        nvidiaIdentities(),
        // SPD: one-shot via elevated helper — never in the 1s metrics loop.
        safe('spd-helper', () => scanSpdViaHelper(force), {
          status: 'unavailable' as const,
          detail: 'SPD scan skipped',
          envelope: null,
          rawCacheDir: null,
        }),
      ])

    let gpus = nvidia
    if (!gpus.length) {
      gpus = await graphicsFallbackIdentities(si)
    }

    const smbiosModules = buildMemoryModules(memSettled ?? [])
    const memoryModules = mergeSpdIntoMemoryModules(smbiosModules, spdScan.envelope)

    const snapshot: HardwareIdentitySnapshot = {
      collectedAt: Date.now(),
      cpu: cpuSettled ? buildCpu(cpuSettled, cacheSettled, typeof flagsSettled === 'string' ? flagsSettled : '') : null,
      motherboard: boardSettled ? buildMotherboard(boardSettled) : null,
      bios: biosSettled ? buildBios(biosSettled) : null,
      memoryModules,
      physicalDisks: buildPhysicalDisks(diskSettled ?? []),
      gpus,
      networkAdapters: buildNetworkAdapters(netSettled ?? []),
      battery: batSettled ? buildBattery(batSettled) : null,
      spdStatus: spdScan.status,
      spdStatusDetail: spdScan.detail,
      hardwareDatabaseVersion: HARDWARE_DATABASE_VERSION,
    }
    cached = snapshot
    lastAt = Date.now()
    console.log(
      `[hardware] identity ready modules=${snapshot.memoryModules.length} disks=${snapshot.physicalDisks.length} gpus=${snapshot.gpus.length} spd=${snapshot.spdStatus}`,
    )
    return snapshot
  } finally {
    collecting = false
  }
}

export async function refreshHardwareIdentityIfNeeded(): Promise<void> {
  if (cached && Date.now() - lastAt < IDENTITY_TTL_MS) return
  if (collecting) return
  void collectHardwareIdentity(false)
}
