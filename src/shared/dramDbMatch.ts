/**
 * Offline DRAM / module variant matcher.
 *
 * Rules:
 * - Never invent die names.
 * - Never let database overwrite SPD-measured manufacturer / profiles.
 * - Speed/timings are optional match filters only — never sole die proof.
 * - Same module PN may map to multiple variants; ambiguous → die unknown.
 */

import {
  HARDWARE_DATABASE_VERSION,
  type DatabaseConfidence,
  type DramModuleVariantEntry,
} from '../data/hardware-db/schema'
import { dramDatabaseFiles } from '../data/hardware-db/dram/catalog'
import type { DatabaseIdentification, IdentificationEvidenceItem } from './hardware'
import { decodeKingstonFuryDdr5Pn, type KingstonPnDecodeResult } from './kingstonPnDecode'

export interface ModuleFactsForDb {
  moduleManufacturer: string | null
  modulePartNumber: string | null
  memoryType: string | null
  capacityBytes: number | null
  rank: number | null
  spdRevision: string | null
  dramManufacturer: string | null
  dramManufacturerId: string | null
  moduleRevision: number | null
  dramStepping: number | null
  xmpDataRateMTs: number | null
  xmpCL: number | null
}

export interface DramDbMatchResult {
  hardwareDatabaseVersion: string
  vendorPn: KingstonPnDecodeResult
  matchedEntries: DramModuleVariantEntry[]
  selectedEntry: DramModuleVariantEntry | null
  ambiguous: boolean
  dramDie: DatabaseIdentification<string>
  dieDensity: DatabaseIdentification<string>
  icPartNumber: DatabaseIdentification<string>
  processGeneration: DatabaseIdentification<string>
  evidence: IdentificationEvidenceItem[]
  conclusion: string
}

function loadEntries(): DramModuleVariantEntry[] {
  return dramDatabaseFiles.flatMap((f) => f.entries ?? [])
}

function normPn(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim().toUpperCase().replace(/\s+/g, '')
  return t || null
}

function pnMatches(entry: DramModuleVariantEntry, pn: string): boolean {
  const n = normPn(pn)!
  return entry.modulePartNumbers.some((p) => {
    const e = normPn(p)!
    return n === e || n.startsWith(e) || e.startsWith(n)
  })
}

function capacityGB(bytes: number | null): number | null {
  if (bytes == null || !Number.isFinite(bytes)) return null
  return Math.round(bytes / (1024 * 1024 * 1024))
}

function eqIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Score how well facts fit an entry. Higher = better. Negative = hard mismatch. */
export function scoreVariant(entry: DramModuleVariantEntry, facts: ModuleFactsForDb): number {
  const m = entry.match
  let score = 0

  if (m.memoryType && facts.memoryType) {
    if (!eqIgnoreCase(m.memoryType, facts.memoryType)) return -1000
    score += 10
  }
  const cap = capacityGB(facts.capacityBytes)
  if (m.capacityGB != null && cap != null) {
    if (m.capacityGB !== cap) return -1000
    score += 10
  }
  if (m.rank != null && facts.rank != null) {
    if (m.rank !== facts.rank) return -1000
    score += 15
  }
  if (m.spdRevision && facts.spdRevision) {
    if (m.spdRevision !== facts.spdRevision) return -50
    score += 5
  }
  if (m.dramManufacturerId && facts.dramManufacturerId) {
    const want = m.dramManufacturerId.toUpperCase().replace(/^0X/, '')
    const got = facts.dramManufacturerId.toUpperCase().replace(/0X/g, '')
    if (!got.includes(want)) return -1000
    score += 25
  }
  if (m.dramManufacturer && facts.dramManufacturer) {
    if (!eqIgnoreCase(m.dramManufacturer, facts.dramManufacturer)) return -1000
    score += 20
  }
  if (m.moduleRevision != null && facts.moduleRevision != null) {
    if (m.moduleRevision !== facts.moduleRevision) return -100
    score += 8
  }
  if (m.dramStepping != null && facts.dramStepping != null) {
    if (m.dramStepping !== facts.dramStepping) return -80
    score += 8
  }
  // Optional soft filters — never decisive alone for die.
  if (m.xmpDataRateMTs != null && facts.xmpDataRateMTs != null) {
    if (m.xmpDataRateMTs === facts.xmpDataRateMTs) score += 3
    else score -= 5
  }
  if (m.xmpCL != null && facts.xmpCL != null) {
    if (m.xmpCL === facts.xmpCL) score += 2
    else score -= 3
  }

  return score
}

function emptyId<T>(evidence: string[]): DatabaseIdentification<T> {
  return {
    value: null,
    confidence: 'unknown',
    source: 'database',
    evidence,
    databaseVersion: HARDWARE_DATABASE_VERSION,
  }
}

function fieldId(
  value: string | null,
  confidence: DatabaseConfidence,
  evidence: string[],
  entry: DramModuleVariantEntry | null,
): DatabaseIdentification<string> {
  return {
    value,
    confidence: value ? confidence : 'unknown',
    source: 'database',
    evidence,
    databaseId: entry?.id,
    databaseVersion: HARDWARE_DATABASE_VERSION,
  }
}

function buildKnownEvidence(facts: ModuleFactsForDb, vendorPn: KingstonPnDecodeResult): IdentificationEvidenceItem[] {
  const items: IdentificationEvidenceItem[] = []
  const push = (ok: boolean, label: string, detail?: string) => {
    items.push({ ok, label, detail })
  }

  push(!!facts.dramManufacturer, `${facts.dramManufacturer ?? 'DRAM'} manufacturer`, 'SPD')
  push(!!facts.memoryType, facts.memoryType ?? 'Memory type', 'SPD')
  const cap = capacityGB(facts.capacityBytes)
  push(cap != null, cap != null ? `${cap} GB` : 'Capacity', 'SPD/SMBIOS')
  push(facts.rank === 1, facts.rank != null ? (facts.rank === 1 ? 'Single Rank (1R)' : `${facts.rank}R`) : 'Rank', 'SPD')
  push(!!facts.modulePartNumber, `${facts.moduleManufacturer ?? ''} ${facts.modulePartNumber ?? ''}`.trim() || 'Module PN', 'SMBIOS/SPD')
  push(!!facts.spdRevision, `SPD Revision ${facts.spdRevision ?? ''}`.trim(), 'SPD')
  if (facts.xmpDataRateMTs != null) {
    push(true, `XMP advertised DDR5-${facts.xmpDataRateMTs}${facts.xmpCL != null ? ` CL${facts.xmpCL}` : ''}`, 'SPD')
  }
  if (vendorPn.fury?.marketedSpeedMTs != null) {
    push(
      true,
      `Kingston FURY PN marketed DDR5-${vendorPn.fury.marketedSpeedMTs} (documentation; does not override SPD profiles)`,
      'vendor-part-number-decoder',
    )
  }
  if (vendorPn.refusedCrossProductLineDieDecode) {
    push(true, 'Refused Server Premier/Design-In die letter rules on FURY PN', 'policy')
  }
  return items
}

export function matchDramDatabase(facts: ModuleFactsForDb): DramDbMatchResult {
  const vendorPn = decodeKingstonFuryDdr5Pn(facts.modulePartNumber)
  const evidenceBase = [
    facts.dramManufacturer ? `DRAM manufacturer: ${facts.dramManufacturer} (SPD)` : 'DRAM manufacturer unknown',
    facts.modulePartNumber ? `Module PN: ${facts.modulePartNumber}` : 'Module PN unknown',
  ]

  const known = buildKnownEvidence(facts, vendorPn)
  const pn = normPn(facts.modulePartNumber)
  const candidates = pn ? loadEntries().filter((e) => pnMatches(e, pn)) : []

  const scored = candidates
    .map((entry) => ({ entry, score: scoreVariant(entry, facts) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)

  const topScore = scored[0]?.score ?? -1
  const top = scored.filter((x) => x.score === topScore && x.score >= 20)
  const ambiguous = top.length > 1
  const selected = !ambiguous && top.length === 1 ? top[0]!.entry : null

  const dieValue = selected?.identification.die ?? null
  // Never promote die from speed alone; require entry die non-null AND confidence not unknown
  const canClaimDie =
    dieValue != null &&
    selected != null &&
    selected.confidence !== 'unknown' &&
    !ambiguous

  const dieEvidence = [
    ...evidenceBase,
    ...(selected?.evidence ?? []),
    ...(canClaimDie ? [] : ['Current database has no unique confirmed die mapping for this module']),
  ]

  let conclusion: string
  if (canClaimDie) {
    conclusion = `Die identified as ${dieValue} via database entry ${selected!.id} (confidence ${selected!.confidence}).`
  } else if (ambiguous) {
    conclusion = `Multiple database variants match (${top.map((t) => t.entry.id).join(', ')}); Die cannot be uniquely determined.`
  } else if (selected && selected.identification.die == null) {
    conclusion = '当前数据库没有足够证据唯一确定 Die。'
  } else if (candidates.length === 0) {
    conclusion = 'No local database entry matched this module part number.'
  } else {
    conclusion = '当前数据库没有足够证据唯一确定 Die。'
  }

  const conf: DatabaseConfidence = canClaimDie ? selected!.confidence : 'unknown'

  return {
    hardwareDatabaseVersion: HARDWARE_DATABASE_VERSION,
    vendorPn,
    matchedEntries: scored.map((s) => s.entry),
    selectedEntry: selected,
    ambiguous,
    dramDie: fieldId(canClaimDie ? dieValue : null, conf, dieEvidence, selected),
    dieDensity: fieldId(
      canClaimDie ? selected!.identification.dieDensity : null,
      conf,
      dieEvidence,
      selected,
    ),
    icPartNumber: fieldId(
      canClaimDie ? selected!.identification.icPartNumber : null,
      conf,
      dieEvidence,
      selected,
    ),
    processGeneration: fieldId(
      canClaimDie ? selected!.identification.processGeneration : null,
      conf,
      dieEvidence,
      selected,
    ),
    evidence: known,
    conclusion,
  }
}

export function emptyDramDbFields(): Pick<
  DramDbMatchResult,
  'dramDie' | 'dieDensity' | 'icPartNumber' | 'processGeneration' | 'evidence' | 'conclusion' | 'hardwareDatabaseVersion'
> {
  const empty = emptyId<string>(['SPD advanced identity unavailable'])
  return {
    hardwareDatabaseVersion: HARDWARE_DATABASE_VERSION,
    dramDie: empty,
    dieDensity: empty,
    icPartNumber: empty,
    processGeneration: empty,
    evidence: [],
    conclusion: 'SPD 高级信息不可用，无法进行颗粒数据库匹配。',
  }
}
