import type {
  DataSource,
  DramDatabaseMatchSummary,
  HardwareValue,
  MemoryModuleIdentity,
  SpdMemoryModuleIdentity,
  VendorPartNumberDecode,
} from '../src/shared/hardware'
import { formatRankLabel } from '../src/shared/ddr5SpdDecode'
import { parseDdr5SpdProfiles } from '../src/shared/ddr5SpdProfiles'
import { emptyDramDbFields, matchDramDatabase } from '../src/shared/dramDbMatch'
import type { SpdHelperEnvelope, SpdHelperModuleDto } from './spdHelper'
import { getRawSpdByFile } from './spdHelper'

function hw<T>(value: T | null | undefined, source: DataSource): HardwareValue<T> {
  if (value == null || value === '') return { value: null, source }
  return { value, source }
}

function normSerial(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  return t || null
}

function normPart(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toUpperCase().replace(/\s+/g, '')
  return t || null
}

function emptyDbAttach(): Pick<
  MemoryModuleIdentity,
  'dramDie' | 'dieDensity' | 'dramIcPartNumber' | 'dramProcessGeneration' | 'dramDatabaseMatch'
> {
  const empty = emptyDramDbFields()
  return {
    dramDie: empty.dramDie,
    dieDensity: empty.dieDensity,
    dramIcPartNumber: empty.icPartNumber,
    dramProcessGeneration: empty.processGeneration,
    dramDatabaseMatch: null,
  }
}

function emptySpdFields(): Pick<
  MemoryModuleIdentity,
  | 'spd'
  | 'dramManufacturer'
  | 'rank'
  | 'rankLabel'
  | 'spdRevision'
  | 'jedecProfiles'
  | 'xmpProfiles'
  | 'expoProfiles'
  | 'xmpVersion'
  | 'expoVersion'
  | 'dramDie'
  | 'dieDensity'
  | 'dramIcPartNumber'
  | 'dramProcessGeneration'
  | 'dramDatabaseMatch'
> {
  return {
    spd: null,
    dramManufacturer: hw(null, 'spd'),
    rank: hw(null, 'spd'),
    rankLabel: hw(null, 'spd'),
    spdRevision: hw(null, 'spd'),
    jedecProfiles: [],
    xmpProfiles: [],
    expoProfiles: [],
    xmpVersion: hw(null, 'spd'),
    expoVersion: hw(null, 'spd'),
    ...emptyDbAttach(),
  }
}

function resolveRaw(dto: SpdHelperModuleDto): Buffer | null {
  if (dto.rawFile) {
    const fromCache = getRawSpdByFile(dto.rawFile)
    if (fromCache) return fromCache
  }
  if (dto.rawBase64) {
    try {
      return Buffer.from(dto.rawBase64, 'base64')
    } catch {
      return null
    }
  }
  return null
}

function toSpdIdentity(dto: SpdHelperModuleDto): SpdMemoryModuleIdentity {
  const capacityBytes =
    dto.capacityGb != null && Number.isFinite(dto.capacityGb)
      ? Math.round(dto.capacityGb * 1024 * 1024 * 1024)
      : null
  const rank = dto.rankSource === 'jedec-byte234' && dto.rank != null ? dto.rank : null
  const rankLabel = formatRankLabel(rank)
  const dramId =
    dto.dramManufacturerId || dto.dramManufacturerContinuation
      ? [dto.dramManufacturerContinuation, dto.dramManufacturerId].filter(Boolean).join('/')
      : null

  const raw = resolveRaw(dto)
  const profiles = parseDdr5SpdProfiles(raw ?? undefined)

  console.log(
    `[spd] DIMM ${dto.spdAddress ?? '?'} ${dto.memoryType ?? ''} rev=${dto.spdRevision ?? '?'} size=${dto.spdSize ?? raw?.length ?? 0}`,
  )
  console.log(`[spd] DIMM ${dto.spdAddress ?? '?'} JEDEC profiles=${profiles.jedecProfiles.length}`)
  console.log(
    `[spd] DIMM ${dto.spdAddress ?? '?'} XMP version=${profiles.xmpVersion ?? 'n/a'} profiles=${profiles.xmpProfiles.length}`,
  )
  console.log(
    `[spd] DIMM ${dto.spdAddress ?? '?'} EXPO=${profiles.expoDetected ? `profiles=${profiles.expoProfiles.length}` : 'not-detected'}`,
  )
  if (profiles.warnings.length) {
    for (const w of profiles.warnings) console.warn(`[spd] DIMM ${dto.spdAddress ?? '?'} ${w}`)
  }

  return {
    spdAddress: hw(dto.spdAddress ?? null, 'spd'),
    spdSize: hw(dto.spdSize ?? raw?.length ?? null, 'spd'),
    memoryType: hw(dto.memoryType ?? null, 'spd'),
    spdRevision: hw(dto.spdRevision ?? null, 'spd'),
    moduleManufacturer: hw(dto.moduleManufacturer || null, 'spd'),
    modulePartNumber: hw(dto.modulePartNumber || null, 'spd'),
    moduleSerialNumber: hw(dto.moduleSerialNumber || null, 'spd'),
    dramManufacturer: hw(dto.dramManufacturer || null, 'spd'),
    dramManufacturerId: hw(dramId, 'spd'),
    capacityBytes: hw(capacityBytes, 'spd'),
    rank: hw(rank, 'spd'),
    rankLabel: hw(rankLabel, 'spd'),
    rawOrganization: hw(dto.rawOrganization ?? null, 'spd'),
    jedecProfiles: profiles.jedecProfiles,
    xmpProfiles: profiles.xmpProfiles,
    expoProfiles: profiles.expoProfiles,
    xmpVersion: hw(profiles.xmpVersion, 'spd'),
    expoVersion: hw(profiles.expoDetected ? profiles.expoVersion : null, 'spd'),
    timings: null,
    pmic: null,
    spdHub: null,
  }
}

function applyDramDb(
  module: MemoryModuleIdentity,
  spd: SpdMemoryModuleIdentity,
  raw: Buffer | null,
): Pick<
  MemoryModuleIdentity,
  'dramDie' | 'dieDensity' | 'dramIcPartNumber' | 'dramProcessGeneration' | 'dramDatabaseMatch'
> {
  const moduleRevision = raw && raw.length > 551 ? raw[551]! : null
  const dramStepping = raw && raw.length > 554 ? raw[554]! : null
  const xmp = spd.xmpProfiles[0]

  const match = matchDramDatabase({
    moduleManufacturer: module.manufacturer.value ?? spd.moduleManufacturer.value,
    modulePartNumber: module.partNumber.value ?? spd.modulePartNumber.value,
    memoryType: spd.memoryType.value ?? module.type.value,
    capacityBytes: spd.capacityBytes.value ?? module.capacityBytes.value,
    rank: spd.rank.value,
    spdRevision: spd.spdRevision.value,
    dramManufacturer: spd.dramManufacturer.value,
    dramManufacturerId: spd.dramManufacturerId.value,
    moduleRevision,
    dramStepping,
    xmpDataRateMTs: xmp?.dataRateMTs ?? null,
    xmpCL: xmp?.timings.tCL ?? null,
  })

  console.log(
    `[db] DIMM ${spd.spdAddress.value ?? '?'} entry=${match.selectedEntry?.id ?? 'none'} die=${match.dramDie.value ?? 'unknown'} conf=${match.dramDie.confidence}`,
  )

  const vendorPn: VendorPartNumberDecode | null = match.vendorPn.fury
    ? {
        productLine: match.vendorPn.productLine,
        marketedSpeedMTs: match.vendorPn.fury.marketedSpeedMTs,
        casLatency: match.vendorPn.fury.casLatency,
        totalCapacityGB: match.vendorPn.fury.totalCapacityGB,
        encodesDramManufacturer: false,
        encodesDramDie: false,
        documentationUrl: match.vendorPn.fury.documentationUrl,
        notes: match.vendorPn.notes,
        source: 'vendor-part-number-decoder',
      }
    : {
        productLine: match.vendorPn.productLine,
        marketedSpeedMTs: null,
        casLatency: null,
        totalCapacityGB: null,
        encodesDramManufacturer: false,
        encodesDramDie: false,
        documentationUrl: null,
        notes: match.vendorPn.notes,
        source: 'vendor-part-number-decoder',
      }

  const summary: DramDatabaseMatchSummary = {
    hardwareDatabaseVersion: match.hardwareDatabaseVersion,
    entryId: match.selectedEntry?.id ?? null,
    ambiguous: match.ambiguous,
    matchedEntryCount: match.matchedEntries.length,
    evidence: match.evidence,
    conclusion: match.conclusion,
    vendorPn,
  }

  return {
    dramDie: match.dramDie,
    dieDensity: match.dieDensity,
    dramIcPartNumber: match.icPartNumber,
    dramProcessGeneration: match.processGeneration,
    dramDatabaseMatch: summary,
  }
}

function matchScore(smbios: MemoryModuleIdentity, spd: SpdHelperModuleDto): number {
  const sSerial = normSerial(smbios.serialNumber.value)
  const pSerial = normSerial(spd.moduleSerialNumber)
  if (sSerial && pSerial && sSerial === pSerial) return 100

  const sPart = normPart(smbios.partNumber.value)
  const pPart = normPart(spd.modulePartNumber)
  const sCap = smbios.capacityBytes.value
  const pCap =
    spd.capacityGb != null ? Math.round(spd.capacityGb * 1024 * 1024 * 1024) : null

  let score = 0
  if (sPart && pPart && sPart === pPart) score += 40
  if (sCap != null && pCap != null && Math.abs(sCap - pCap) < 16 * 1024 * 1024) score += 20
  return score
}

/**
 * Merge SPD helper modules into SMBIOS memory modules.
 * Prefer Serial, then PartNumber+Capacity. Never rely on array index alone.
 * Profile parse + offline DRAM DB match run here (not elevated helper).
 */
export function mergeSpdIntoMemoryModules(
  smbiosModules: MemoryModuleIdentity[],
  envelope: SpdHelperEnvelope | null,
): MemoryModuleIdentity[] {
  const base = smbiosModules.map((m) => ({ ...m, ...emptySpdFields() }))
  if (!envelope?.modules?.length) return base

  const unused = envelope.modules.map((m, i) => ({ m, i }))
  const used = new Set<number>()

  return base.map((module) => {
    let best: { m: SpdHelperModuleDto; i: number; score: number } | null = null
    for (const item of unused) {
      if (used.has(item.i)) continue
      const score = matchScore(module, item.m)
      if (score < 40) continue
      if (!best || score > best.score) best = { ...item, score }
    }
    if (!best) return module
    used.add(best.i)
    try {
      const spd = toSpdIdentity(best.m)
      const raw = resolveRaw(best.m)
      const db = applyDramDb(module, spd, raw)
      return {
        ...module,
        spd,
        dramManufacturer: spd.dramManufacturer,
        rank: spd.rank,
        rankLabel: spd.rankLabel,
        spdRevision: spd.spdRevision,
        jedecProfiles: spd.jedecProfiles,
        xmpProfiles: spd.xmpProfiles,
        expoProfiles: spd.expoProfiles,
        xmpVersion: spd.xmpVersion,
        expoVersion: spd.expoVersion,
        ...db,
      }
    } catch (error) {
      console.warn(
        `[spd] profile merge failed for ${best.m.spdAddress}`,
        error instanceof Error ? error.message : error,
      )
      return module
    }
  })
}

/** Ensure SMBIOS-built modules always carry SPD + DB placeholder fields. */
export function withEmptySpdFields(modules: MemoryModuleIdentity[]): MemoryModuleIdentity[] {
  return modules.map((m) => ({
    ...m,
    ...emptySpdFields(),
    spd: m.spd ?? null,
    dramManufacturer: m.dramManufacturer ?? hw(null, 'spd'),
    rank: m.rank ?? hw(null, 'spd'),
    rankLabel: m.rankLabel ?? hw(null, 'spd'),
    spdRevision: m.spdRevision ?? hw(null, 'spd'),
    jedecProfiles: m.jedecProfiles ?? [],
    xmpProfiles: m.xmpProfiles ?? [],
    expoProfiles: m.expoProfiles ?? [],
    xmpVersion: m.xmpVersion ?? hw(null, 'spd'),
    expoVersion: m.expoVersion ?? hw(null, 'spd'),
    dramDie: m.dramDie ?? emptyDbAttach().dramDie,
    dieDensity: m.dieDensity ?? emptyDbAttach().dieDensity,
    dramIcPartNumber: m.dramIcPartNumber ?? emptyDbAttach().dramIcPartNumber,
    dramProcessGeneration: m.dramProcessGeneration ?? emptyDbAttach().dramProcessGeneration,
    dramDatabaseMatch: m.dramDatabaseMatch ?? null,
  }))
}
