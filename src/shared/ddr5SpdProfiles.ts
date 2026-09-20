/**
 * DDR5 SPD profile decode (JEDEC base + Intel XMP 3.0 + AMD EXPO).
 *
 * ## Provenance
 * - JEDEC base timing offsets: JESD400-5 / spdr `timing.rs`
 *   (tCKAVGmin@20, tAA@30, tRCD@32, tRP@34, tRAS@36, tRC@38), picoseconds LE u16.
 * - XMP 3.0: magic `0x0C 0x4A` @640; enable @643; names @654/+16/+32;
 *   profiles @704 and @768 (64-byte blocks). Field order from memtest86plus spd.c
 *   / edlf DDR5SPDEditor / spdr `vendor.rs`.
 * - EXPO: ASCII `EXPO` @832; profiles @842 and @882 (40-byte). Same sources.
 * - Voltage byte: upper 3 bits = whole volts, lower 5 bits × 50 mV
 *   (DDR5SPDEditor ConvertByteToVoltageDDR5).
 * - Data rate: MT/s = round_to_100(2_000_000 / tCK_ps) (spdr `data_rate_mt_s`).
 *
 * RAMSPDToolkit exposes JEDEC `SDRAMTimings` (ns) but has **no** XMP/EXPO API;
 * vendor profiles are parsed here from the raw 1024-byte image.
 *
 * These profiles are **SPD-advertised support**, not the active runtime profile.
 */

export type MemoryTimingProfileType = 'jedec' | 'xmp' | 'expo'

export interface MemoryTimingFields {
  tCL: number | null
  tRCD: number | null
  tRP: number | null
  tRAS: number | null
  tRC: number | null
}

export interface MemoryTimingProfile {
  type: MemoryTimingProfileType
  index: number | null
  name: string | null
  dataRateMTs: number | null
  voltageMv: number | null
  timings: MemoryTimingFields
  source: 'spd'
}

export interface Ddr5SpdProfileParseResult {
  jedecProfiles: MemoryTimingProfile[]
  xmpProfiles: MemoryTimingProfile[]
  expoProfiles: MemoryTimingProfile[]
  xmpVersion: string | null
  expoVersion: string | null
  xmpDetected: boolean
  expoDetected: boolean
  /** Soft integrity notes (CRC mismatch, derived timings, etc.) — never thrown. */
  warnings: string[]
}

// --- JEDEC base (JESD400-5) -------------------------------------------------
const OFF_TCKAVG_MIN = 20
const OFF_TAA = 30
const OFF_TRCD = 32
const OFF_TRP = 34
const OFF_TRAS = 36
const OFF_TRC = 38

// --- XMP 3.0 (bytes 640..=831) ---------------------------------------------
const OFF_XMP_MAGIC = 640
const XMP_MAGIC0 = 0x0c
const XMP_MAGIC1 = 0x4a
/** XMP revision / major nibble lives at 642 on observed DDR5 modules (0x30 → 3.0). */
const OFF_XMP_REVISION = 642
const OFF_XMP_ENABLE = 643
const OFF_XMP_NAME1 = 654
const XMP_BLOCK_LEN = 64
const OFF_XMP_PROFILE1 = 704
const XMP_VPP = 0
const XMP_VDD = 1
const XMP_TCK = 5
const XMP_TAA = 13
const XMP_TRCD = 15
const XMP_TRP = 17
const XMP_TRAS = 19
const XMP_TRC = 21

// --- EXPO (bytes 832..=959) ------------------------------------------------
const OFF_EXPO_MAGIC = 832
const EXPO_MAGIC = [0x45, 0x58, 0x50, 0x4f] // "EXPO"
const OFF_EXPO_PROFILE1 = 842
const EXPO_PROFILE_LEN = 40
const EXPO_VDD = 0
const EXPO_TCK = 4
const EXPO_TAA = 6
const EXPO_TRCD = 8
const EXPO_TRP = 10
const EXPO_TRAS = 12
const EXPO_TRC = 14

function u16le(buf: Uint8Array, offset: number): number | null {
  if (offset + 1 >= buf.length) return null
  return buf[offset]! | (buf[offset + 1]! << 8)
}

/** MT/s from tCK in picoseconds, rounded to nearest 100 (spdr). */
export function dataRateFromTckPs(tckPs: number): number | null {
  if (!Number.isFinite(tckPs) || tckPs <= 0) return null
  const raw = 2_000_000 / tckPs
  return Math.floor((raw + 50) / 100) * 100
}

/** Upper 3 bits = volts, lower 5 bits × 50 mV. */
export function decodeDdr5VoltageByte(raw: number): number {
  const volts = (raw >> 5) & 0x7
  const steps = raw & 0x1f
  return volts * 1000 + steps * 50
}

function clocksFromPs(timePs: number | null, tckPs: number | null): number | null {
  if (timePs == null || tckPs == null || tckPs <= 0) return null
  return Math.round(timePs / tckPs)
}

function readAsciiName(buf: Uint8Array, offset: number, len: number): string | null {
  if (offset + len > buf.length) return null
  let s = ''
  for (let i = 0; i < len; i++) {
    const c = buf[offset + i]!
    if (c === 0) break
    if (c >= 32 && c < 127) s += String.fromCharCode(c)
  }
  s = s.replace(/\s+/g, ' ').trim()
  return s || null
}

/**
 * CRC-16/XMODEM (poly 0x1021, init 0), used by DDR5SPDEditor / spdr for SPD blocks.
 */
export function crc16Xmodem(data: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc & 0xffff
}

function emptyTimings(): MemoryTimingFields {
  return { tCL: null, tRCD: null, tRP: null, tRAS: null, tRC: null }
}

function buildProfile(
  type: MemoryTimingProfileType,
  index: number | null,
  name: string | null,
  tckPs: number,
  taaPs: number | null,
  trcdPs: number | null,
  trpPs: number | null,
  trasPs: number | null,
  trcPs: number | null,
  voltageMv: number | null,
): MemoryTimingProfile | null {
  const dataRateMTs = dataRateFromTckPs(tckPs)
  if (dataRateMTs == null) return null
  return {
    type,
    index,
    name,
    dataRateMTs,
    voltageMv,
    timings: {
      tCL: clocksFromPs(taaPs, tckPs),
      tRCD: clocksFromPs(trcdPs, tckPs),
      tRP: clocksFromPs(trpPs, tckPs),
      tRAS: clocksFromPs(trasPs, tckPs),
      tRC: clocksFromPs(trcPs, tckPs),
    },
    source: 'spd',
  }
}

function parseJedec(buf: Uint8Array, warnings: string[]): MemoryTimingProfile[] {
  if (buf.length < 40) return []
  const tck = u16le(buf, OFF_TCKAVG_MIN)
  if (tck == null || tck === 0) return []

  let taa = u16le(buf, OFF_TAA)
  let trcd = u16le(buf, OFF_TRCD)
  let trp = u16le(buf, OFF_TRP)
  let tras = u16le(buf, OFF_TRAS)
  let trc = u16le(buf, OFF_TRC)

  // Some modules leave tRCD/tRP/tRAS/tRC zero in the base block; RAMSPDToolkit
  // still reports ns values equal to tAA / 2×tAA / tAA+tRAS. Mirror that only
  // when tAA is present so we do not invent CL from nothing.
  if (taa && taa > 0) {
    if (!trcd) {
      trcd = taa
      warnings.push('jedec: tRCD derived from tAA (raw byte zero)')
    }
    if (!trp) {
      trp = taa
      warnings.push('jedec: tRP derived from tAA (raw byte zero)')
    }
    if (!tras) {
      tras = taa * 2
      warnings.push('jedec: tRAS derived as 2×tAA (raw byte zero)')
    }
    if (!trc) {
      trc = (tras || 0) + (trp || 0)
      warnings.push('jedec: tRC derived as tRAS+tRP (raw byte zero)')
    }
  }

  const profile = buildProfile('jedec', 1, 'JEDEC', tck, taa, trcd, trp, tras, trc, null)
  return profile ? [profile] : []
}

function parseXmp(buf: Uint8Array, warnings: string[]): {
  profiles: MemoryTimingProfile[]
  version: string | null
  detected: boolean
} {
  if (buf.length < 832) return { profiles: [], version: null, detected: false }
  if (buf[OFF_XMP_MAGIC] !== XMP_MAGIC0 || buf[OFF_XMP_MAGIC + 1] !== XMP_MAGIC1) {
    return { profiles: [], version: null, detected: false }
  }

  const rev = buf[OFF_XMP_REVISION] ?? 0
  const major = (rev >> 4) & 0xf
  const minor = rev & 0xf
  const version = major > 0 ? `${major}.${minor}` : null
  const enable = buf[OFF_XMP_ENABLE] ?? 0
  const profiles: MemoryTimingProfile[] = []

  for (let slot = 0; slot < 2; slot++) {
    const enabled = ((enable >> slot) & 1) === 1
    const base = OFF_XMP_PROFILE1 + slot * XMP_BLOCK_LEN
    const tck = u16le(buf, base + XMP_TCK)
    if (!tck) {
      if (enabled) warnings.push(`xmp: profile ${slot + 1} enabled but tCK=0 — skipped`)
      continue
    }
    // Prefer enable bit; if bit clear but slot populated, still skip (do not invent).
    if (!enabled) {
      warnings.push(`xmp: profile slot ${slot + 1} has tCK but enable bit clear — skipped`)
      continue
    }

    const block = buf.subarray(base, base + XMP_BLOCK_LEN)
    if (block.length === XMP_BLOCK_LEN) {
      const stored = u16le(buf, base + XMP_BLOCK_LEN - 2)
      const calc = crc16Xmodem(block.subarray(0, XMP_BLOCK_LEN - 2))
      if (stored != null && stored !== 0 && stored !== calc) {
        warnings.push(
          `xmp: profile ${slot + 1} CRC mismatch stored=0x${stored.toString(16)} calc=0x${calc.toString(16)}`,
        )
      }
    }

    const nameSlot = readAsciiName(buf, OFF_XMP_NAME1 + slot * 16, 16)
    // Kingston (and others) often put the human name only in name slot 0 while the
    // populated timing block sits in profile slot 1 — prefer a clean name.
    const nameFallback = readAsciiName(buf, OFF_XMP_NAME1, 16)
    const name =
      nameSlot && nameSlot.length > 2
        ? nameSlot
        : nameFallback && nameFallback.length > 2
          ? nameFallback
          : `Profile ${slot + 1}`
    const vdd = decodeDdr5VoltageByte(buf[base + XMP_VDD] ?? 0)
    const profile = buildProfile(
      'xmp',
      slot + 1,
      name,
      tck,
      u16le(buf, base + XMP_TAA),
      u16le(buf, base + XMP_TRCD),
      u16le(buf, base + XMP_TRP),
      u16le(buf, base + XMP_TRAS),
      u16le(buf, base + XMP_TRC),
      vdd > 0 ? vdd : null,
    )
    if (profile) profiles.push(profile)
  }

  return { profiles, version, detected: true }
}

function parseExpo(buf: Uint8Array, warnings: string[]): {
  profiles: MemoryTimingProfile[]
  version: string | null
  detected: boolean
} {
  if (buf.length < 832 + 4) return { profiles: [], version: null, detected: false }
  for (let i = 0; i < 4; i++) {
    if (buf[OFF_EXPO_MAGIC + i] !== EXPO_MAGIC[i]) {
      return { profiles: [], version: null, detected: false }
    }
  }

  const profiles: MemoryTimingProfile[] = []
  for (let slot = 0; slot < 2; slot++) {
    const base = OFF_EXPO_PROFILE1 + slot * EXPO_PROFILE_LEN
    const tck = u16le(buf, base + EXPO_TCK)
    if (!tck) continue
    const vdd = decodeDdr5VoltageByte(buf[base + EXPO_VDD] ?? 0)
    const profile = buildProfile(
      'expo',
      slot + 1,
      null,
      tck,
      u16le(buf, base + EXPO_TAA),
      u16le(buf, base + EXPO_TRCD),
      u16le(buf, base + EXPO_TRP),
      u16le(buf, base + EXPO_TRAS),
      u16le(buf, base + EXPO_TRC),
      vdd > 0 ? vdd : null,
    )
    if (profile) profiles.push(profile)
  }

  if (profiles.length === 0) {
    warnings.push('expo: magic present but no populated profiles')
  }

  return { profiles, version: 'EXPO', detected: true }
}

/** Parse DDR5 SPD image. Never throws — malformed input yields empty profiles + warnings. */
export function parseDdr5SpdProfiles(raw: Uint8Array | Buffer | null | undefined): Ddr5SpdProfileParseResult {
  const empty: Ddr5SpdProfileParseResult = {
    jedecProfiles: [],
    xmpProfiles: [],
    expoProfiles: [],
    xmpVersion: null,
    expoVersion: null,
    xmpDetected: false,
    expoDetected: false,
    warnings: [],
  }

  try {
    if (!raw || raw.length < 64) {
      empty.warnings.push('spd image too short')
      return empty
    }
    const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
    // DDR5 key byte / host bus protocol at byte 2 is typically 0x12
    if (buf[2] !== 0x12 && buf[2] !== 0x13) {
      empty.warnings.push(`unexpected DDR5 key byte 0x${(buf[2] ?? 0).toString(16)} — continuing cautiously`)
    }

    const warnings: string[] = []
    const jedecProfiles = parseJedec(buf, warnings)
    const xmp = parseXmp(buf, warnings)
    const expo = parseExpo(buf, warnings)

    return {
      jedecProfiles,
      xmpProfiles: xmp.profiles,
      expoProfiles: expo.profiles,
      xmpVersion: xmp.version,
      expoVersion: expo.detected ? expo.version : null,
      xmpDetected: xmp.detected,
      expoDetected: expo.detected,
      warnings,
    }
  } catch (error) {
    empty.warnings.push(`parse exception: ${error instanceof Error ? error.message : String(error)}`)
    return empty
  }
}

export function formatTimingTriplet(p: MemoryTimingProfile): string {
  const { tCL, tRCD, tRP, tRAS } = p.timings
  if (tCL == null || tRCD == null || tRP == null) return '—'
  if (tRAS == null) return `CL${tCL}-${tRCD}-${tRP}`
  return `CL${tCL}-${tRCD}-${tRP}-${tRAS}`
}

export function formatProfileSpeed(p: MemoryTimingProfile): string {
  if (p.dataRateMTs == null) return '—'
  return `DDR5-${p.dataRateMTs}`
}

export function formatVoltage(mv: number | null | undefined): string {
  if (mv == null || !Number.isFinite(mv)) return '—'
  return `${(mv / 1000).toFixed(2)} V`
}
