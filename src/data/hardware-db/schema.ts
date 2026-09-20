/**
 * Offline hardware database schema (DRAM / module variants).
 *
 * Priority (highest first) — DB must never override higher sources:
 * 1. SPD / JEDEC measured fields
 * 2. Vendor official documentation
 * 3. Vendor official Part Number Decoder (product-line specific)
 * 4. Local human-confirmed hardware DB
 * 5. Reliable third-party references
 * 6. Community anecdotes
 */

export const HARDWARE_DATABASE_VERSION = '2026.09.20.1'

export type DatabaseConfidence =
  | 'confirmed'
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown'

/** Provenance class for a DB entry claim (not the live HardwareValue.source). */
export type DatabaseEntrySourceKind =
  | 'spd-measured'
  | 'vendor-documentation'
  | 'vendor-part-number-decoder'
  | 'local-confirmed'
  | 'third-party'
  | 'community'

export interface DramModuleMatchCriteria {
  memoryType?: string | null
  capacityGB?: number | null
  rank?: number | null
  spdRevision?: string | null
  /** JEDEC DRAM manufacturer ID code, e.g. "0xCE". */
  dramManufacturerId?: string | null
  dramManufacturer?: string | null
  /** Module revision byte @551 when known. */
  moduleRevision?: number | null
  /** DRAM stepping byte @554 when known (0x00/0xFF still may be unusable for die naming). */
  dramStepping?: number | null
  /** Optional XMP advertised MT/s — match filter only, never sole die proof. */
  xmpDataRateMTs?: number | null
  /** Optional XMP primary CL — match filter only. */
  xmpCL?: number | null
}

export interface DramIdentificationFields {
  /** Marketing die name (A/B/D/M-die). Null unless uniquely evidenced. */
  die: string | null
  dieDensity: string | null
  icPartNumber: string | null
  processGeneration: string | null
}

export interface DramModuleVariantEntry {
  id: string
  createdAt: string
  updatedAt: string
  moduleManufacturer: string
  /**
   * Canonical / prefix part numbers that may match SMBIOS or SPD PN strings.
   * Same marketing PN may have multiple variants (bin swaps).
   */
  modulePartNumbers: string[]
  dramManufacturer: string | null
  match: DramModuleMatchCriteria
  identification: DramIdentificationFields
  evidence: string[]
  sources: DatabaseEntrySourceKind[]
  confidence: DatabaseConfidence
  notes?: string
}

export interface DramDatabaseFile {
  schemaVersion: 1
  databaseVersion: string
  productLineNotes?: string
  entries: DramModuleVariantEntry[]
}
