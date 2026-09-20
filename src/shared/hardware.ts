/** Provenance for hardware identity fields (not realtime sensors). */
export type DataSource =
  | 'sensor'
  | 'systeminformation'
  | 'smbios'
  | 'wmi'
  | 'nvidia-smi'
  | 'os'
  | 'spd'
  | 'database'
  | 'unknown'

/** Why SPD advanced identity is or is not present. */
export type SpdAvailability =
  | 'available'
  | 'unavailable'
  | 'permission-required'
  | 'busy'
  | 'unsupported'
  | 'read-error'
  | 'not-attempted'

export interface HardwareValue<T> {
  value: T | null
  source: DataSource
}

export interface CpuCacheIdentity {
  l1DataKb: HardwareValue<number>
  l1InstructionKb: HardwareValue<number>
  l2Kb: HardwareValue<number>
  l3Kb: HardwareValue<number>
}

export interface CpuIdentity {
  manufacturer: HardwareValue<string>
  brand: HardwareValue<string>
  vendor: HardwareValue<string>
  family: HardwareValue<string>
  model: HardwareValue<string>
  stepping: HardwareValue<string>
  revision: HardwareValue<string>
  socket: HardwareValue<string>
  physicalCores: HardwareValue<number>
  cores: HardwareValue<number>
  performanceCores: HardwareValue<number>
  efficiencyCores: HardwareValue<number>
  processors: HardwareValue<number>
  speedGhz: HardwareValue<number>
  speedMinGhz: HardwareValue<number>
  speedMaxGhz: HardwareValue<number>
  virtualization: HardwareValue<boolean>
  cache: CpuCacheIdentity
  /** Full flag string from OS/SI — UI should only surface a curated subset. */
  flagsRaw: HardwareValue<string>
  flagsHighlighted: HardwareValue<string[]>
}

export interface MotherboardIdentity {
  manufacturer: HardwareValue<string>
  model: HardwareValue<string>
  version: HardwareValue<string>
  serialNumber: HardwareValue<string>
  memSlots: HardwareValue<number>
  memMaxBytes: HardwareValue<number>
}

export interface BiosIdentity {
  vendor: HardwareValue<string>
  version: HardwareValue<string>
  releaseDate: HardwareValue<string>
  revision: HardwareValue<string>
}

/** Parsed SPD fields for one DIMM. Raw 1024B stays in main-process cache only. */
export interface SpdMemoryModuleIdentity {
  spdAddress: HardwareValue<string>
  spdSize: HardwareValue<number>
  memoryType: HardwareValue<string>
  spdRevision: HardwareValue<string>
  moduleManufacturer: HardwareValue<string>
  modulePartNumber: HardwareValue<string>
  moduleSerialNumber: HardwareValue<string>
  dramManufacturer: HardwareValue<string>
  dramManufacturerId: HardwareValue<string>
  capacityBytes: HardwareValue<number>
  /** Package ranks per channel (JEDEC). Null if not confirmed. */
  rank: HardwareValue<number>
  rankLabel: HardwareValue<string>
  /** DDR5 byte 234 (module organization). */
  rawOrganization: HardwareValue<number>
  jedecProfiles: MemoryTimingProfile[]
  xmpProfiles: MemoryTimingProfile[]
  expoProfiles: MemoryTimingProfile[]
  xmpVersion: HardwareValue<string>
  expoVersion: HardwareValue<string>
  /** Reserved — always null until later phases. */
  timings: null
  pmic: null
  spdHub: null
}

export interface MemoryTimingFields {
  tCL: number | null
  tRCD: number | null
  tRP: number | null
  tRAS: number | null
  tRC: number | null
}

export interface MemoryTimingProfile {
  type: 'jedec' | 'xmp' | 'expo'
  index: number | null
  name: string | null
  dataRateMTs: number | null
  voltageMv: number | null
  timings: MemoryTimingFields
  source: 'spd'
}

/** Offline DB identification with explicit confidence (never invent values). */
export type DatabaseConfidence =
  | 'confirmed'
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown'

export interface DatabaseIdentification<T> {
  value: T | null
  confidence: DatabaseConfidence
  source: 'database'
  evidence: string[]
  databaseId?: string
  databaseVersion?: string
}

export interface IdentificationEvidenceItem {
  ok: boolean
  label: string
  detail?: string
}

/** Kingston (or other) official PN decode — documentation only; does not override SPD. */
export interface VendorPartNumberDecode {
  productLine: string | null
  marketedSpeedMTs: number | null
  casLatency: number | null
  totalCapacityGB: number | null
  encodesDramManufacturer: boolean
  encodesDramDie: boolean
  documentationUrl: string | null
  notes: string[]
  source: 'vendor-part-number-decoder'
}

export interface DramDatabaseMatchSummary {
  hardwareDatabaseVersion: string
  entryId: string | null
  ambiguous: boolean
  matchedEntryCount: number
  evidence: IdentificationEvidenceItem[]
  conclusion: string
  vendorPn: VendorPartNumberDecode | null
}

export interface MemoryModuleIdentity {
  bank: string | null
  locator: string | null
  manufacturer: HardwareValue<string>
  partNumber: HardwareValue<string>
  serialNumber: HardwareValue<string>
  capacityBytes: HardwareValue<number>
  type: HardwareValue<string>
  formFactor: HardwareValue<string>
  clockSpeedMhz: HardwareValue<number>
  configuredClockSpeedMhz: HardwareValue<number>
  ecc: HardwareValue<boolean>
  voltageConfigured: HardwareValue<number>
  voltageMin: HardwareValue<number>
  voltageMax: HardwareValue<number>
  /** Merged SPD block when helper scan succeeded and matched this SMBIOS module. */
  spd: SpdMemoryModuleIdentity | null
  /** Convenience: DRAM vendor from SPD (manufacturer only — never die guessing). */
  dramManufacturer: HardwareValue<string>
  rank: HardwareValue<number>
  rankLabel: HardwareValue<string>
  spdRevision: HardwareValue<string>
  jedecProfiles: MemoryTimingProfile[]
  xmpProfiles: MemoryTimingProfile[]
  expoProfiles: MemoryTimingProfile[]
  xmpVersion: HardwareValue<string>
  expoVersion: HardwareValue<string>
  /**
   * Marketing die (A/B/D/M-die etc). Source is always database.
   * value stays null unless uniquely evidenced — never copied from SPD manufacturer.
   */
  dramDie: DatabaseIdentification<string>
  dieDensity: DatabaseIdentification<string>
  dramIcPartNumber: DatabaseIdentification<string>
  dramProcessGeneration: DatabaseIdentification<string>
  dramDatabaseMatch: DramDatabaseMatchSummary | null
}

export interface PhysicalDiskIdentity {
  id: string
  name: HardwareValue<string>
  vendor: HardwareValue<string>
  model: HardwareValue<string>
  serialNumber: HardwareValue<string>
  firmwareRevision: HardwareValue<string>
  type: HardwareValue<string>
  interfaceType: HardwareValue<string>
  sizeBytes: HardwareValue<number>
  temperatureC: HardwareValue<number>
  smartStatus: HardwareValue<string>
  device: HardwareValue<string>
}

export interface GpuIdentity {
  id: string
  vendor: HardwareValue<string>
  model: HardwareValue<string>
  driver: HardwareValue<string>
  bus: HardwareValue<string>
  uuid: HardwareValue<string>
  pciBusId: HardwareValue<string>
  vbiosVersion: HardwareValue<string>
  pstate: HardwareValue<string>
  powerLimitW: HardwareValue<number>
  powerDefaultLimitW: HardwareValue<number>
  powerMaxLimitW: HardwareValue<number>
  memoryTotalMb: HardwareValue<number>
  source: DataSource
}

export interface NetworkAdapterIdentity {
  id: string
  iface: string
  name: HardwareValue<string>
  manufacturer: HardwareValue<string>
  mac: HardwareValue<string>
  ip4: HardwareValue<string>
  ip6: HardwareValue<string>
  speedMbps: HardwareValue<number>
  type: HardwareValue<string>
  operstate: HardwareValue<string>
  driver: HardwareValue<string>
  driverVersion: HardwareValue<string>
}

export interface BatteryIdentity {
  hasBattery: boolean
  manufacturer: HardwareValue<string>
  model: HardwareValue<string>
  serialNumber: HardwareValue<string>
  type: HardwareValue<string>
  voltage: HardwareValue<number>
  designedCapacity: HardwareValue<number>
  maxCapacity: HardwareValue<number>
  currentCapacity: HardwareValue<number>
  capacityUnit: HardwareValue<string>
  cycleCount: HardwareValue<number>
}

export interface HardwareIdentitySnapshot {
  collectedAt: number
  cpu: CpuIdentity | null
  motherboard: MotherboardIdentity | null
  bios: BiosIdentity | null
  memoryModules: MemoryModuleIdentity[]
  physicalDisks: PhysicalDiskIdentity[]
  gpus: GpuIdentity[]
  networkAdapters: NetworkAdapterIdentity[]
  battery: BatteryIdentity | null
  /** Aggregate SPD helper status for the Memory page banner. */
  spdStatus: SpdAvailability
  spdStatusDetail: string | null
  /** Bundled offline hardware DB version (e.g. 2026.09.20.1). */
  hardwareDatabaseVersion: string | null
}
