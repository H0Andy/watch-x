/**
 * Kingston official Memory Part Number Decoder — product-line specific.
 * Source: https://www.kingston.com/en/memory/memory-part-number-decoder
 *
 * FURY (KF*) rules do NOT include DRAM manufacturer / die.
 * Server Premier (KSM*) and Design-In (CBD*) DO — those parsers are separate
 * and must never be applied to KF* strings.
 */

export type KingstonProductLine = 'fury' | 'server-premier' | 'valueram' | 'design-in' | 'unknown'

export interface KingstonFuryDdr5Decode {
  productLine: 'fury'
  technology: 'DDR5' | null
  /** Marketed speed from PN digits — may disagree with SPD XMP; SPD wins for measured profiles. */
  marketedSpeedMTs: number | null
  moduleType: string | null
  casLatency: number | null
  series: string | null
  heatSpreader: string | null
  profileTypeHint: string | null
  revision: number | null
  rgb: boolean | null
  kitModules: number | null
  totalCapacityGB: number | null
  raw: string
  source: 'vendor-part-number-decoder'
  documentationUrl: string
  /** Explicitly: Fury PN cannot supply these. */
  encodesDramManufacturer: false
  encodesDramDie: false
}

export interface KingstonPnDecodeResult {
  productLine: KingstonProductLine
  fury: KingstonFuryDdr5Decode | null
  /** True if a Server Premier / Design-In die letter rule was intentionally NOT applied. */
  refusedCrossProductLineDieDecode: boolean
  notes: string[]
}

const DOC_URL = 'https://www.kingston.com/en/memory/memory-part-number-decoder'

const FURY_SPEED: Record<string, number> = {
  '48': 4800,
  '52': 5200,
  '56': 5600,
  '60': 6000,
  '64': 6400,
  '68': 6800,
  '72': 7200,
  '76': 7600,
  '80': 8000,
  '84': 8400,
  '88': 8800,
}

const FURY_CL: Record<string, number> = {
  '30': 30,
  '32': 32,
  '36': 36,
  '38': 38,
  '40': 40,
  '42': 42,
}

function normalizePn(pn: string): string {
  return pn.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Parse Kingston FURY DDR5 KF… part numbers only.
 * Example: KF556C40BB-16 → 5600 MT/s marketed, CL40, 16GB, Beast/Black.
 */
export function decodeKingstonFuryDdr5Pn(partNumber: string | null | undefined): KingstonPnDecodeResult {
  const notes: string[] = []
  if (!partNumber) {
    return {
      productLine: 'unknown',
      fury: null,
      refusedCrossProductLineDieDecode: false,
      notes: ['No part number'],
    }
  }

  const raw = normalizePn(partNumber)

  if (raw.startsWith('KSM')) {
    notes.push('Server Premier (KSM*) PN may encode DRAM manufacturer/die — not applied to identity die field without dedicated KSM parser + confirmation')
    return {
      productLine: 'server-premier',
      fury: null,
      refusedCrossProductLineDieDecode: true,
      notes,
    }
  }
  if (raw.startsWith('CBD')) {
    notes.push('Design-In (CBD*) PN may encode DRAM manufacturer/die — not applied here')
    return {
      productLine: 'design-in',
      fury: null,
      refusedCrossProductLineDieDecode: true,
      notes,
    }
  }
  if (raw.startsWith('KVR')) {
    return {
      productLine: 'valueram',
      fury: null,
      refusedCrossProductLineDieDecode: false,
      notes: ['ValueRAM decoder not used for Die identification'],
    }
  }
  if (!raw.startsWith('KF')) {
    return {
      productLine: 'unknown',
      fury: null,
      refusedCrossProductLineDieDecode: false,
      notes: [`Unrecognized Kingston PN prefix: ${raw}`],
    }
  }

  // KF 5 56 C 40 [series][color][E?][rev?][A?][K#]? - capacity
  const m = /^KF(5)(\d{2})(C|S|R|CU|RH)(\d{2})([BIR]?)([BSW]?)(E?)([123]?)(A?)(K[248])?-(\d{1,3})$/.exec(raw)
  // Also accept truncated SMBIOS forms like KF556C40-16 (missing series/color)
  const loose = m
    ? null
    : /^KF(5)(\d{2})(C|S|R|CU|RH)(\d{2})(?:[A-Z0-9]*)?-(\d{1,3})$/.exec(raw)

  if (!m && !loose) {
    notes.push(`KF* string did not match FURY DDR5 decoder patterns: ${raw}`)
    return {
      productLine: 'fury',
      fury: null,
      refusedCrossProductLineDieDecode: true,
      notes: [
        ...notes,
        'Refused to apply Server Premier / Design-In die letter rules to FURY PN',
      ],
    }
  }

  const tech = (m?.[1] ?? loose?.[1]) === '5' ? 'DDR5' : null
  const speedKey = m?.[2] ?? loose?.[2] ?? ''
  const mod = m?.[3] ?? loose?.[3] ?? null
  const clKey = m?.[4] ?? loose?.[4] ?? ''
  const capacity = Number(m?.[11] ?? loose?.[5] ?? NaN)

  const moduleTypeMap: Record<string, string> = {
    C: 'UDIMM (Non-ECC Unbuffered)',
    S: 'SODIMM (Non-ECC Unbuffered)',
    R: 'EC8 RDIMM',
    CU: 'CUDIMM',
    RH: 'EC8 RDIMM w/Heat Spreader',
  }
  const seriesMap: Record<string, string> = { B: 'Beast', I: 'Impact', R: 'Renegade' }
  const colorMap: Record<string, string> = {
    B: 'Black',
    S: 'Black & Silver',
    W: 'White or White & Silver',
  }

  notes.push('Decoded via Kingston FURY DDR5 official part number rules')
  notes.push('FURY PN does not encode DRAM manufacturer or die revision')
  if (!m) {
    notes.push('PN matched loose form (series/color letters absent or truncated in SPD/SMBIOS)')
  }

  const fury: KingstonFuryDdr5Decode = {
    productLine: 'fury',
    technology: tech,
    marketedSpeedMTs: FURY_SPEED[speedKey] ?? null,
    moduleType: mod ? moduleTypeMap[mod] ?? mod : null,
    casLatency: FURY_CL[clKey] ?? null,
    series: m?.[5] ? seriesMap[m[5]] ?? m[5] : null,
    heatSpreader: m?.[6] ? colorMap[m[6]] ?? m[6] : null,
    profileTypeHint: m?.[7] === 'E' ? 'AMD EXPO & Intel XMP' : 'Intel XMP / PnP / AMD EXPO & Intel XMP (blank)',
    revision: m?.[8] ? Number(m[8]) : 1,
    rgb: m?.[9] === 'A' ? true : m ? false : null,
    kitModules: m?.[10] ? Number(m[10].slice(1)) : 1,
    totalCapacityGB: Number.isFinite(capacity) ? capacity : null,
    raw,
    source: 'vendor-part-number-decoder',
    documentationUrl: DOC_URL,
    encodesDramManufacturer: false,
    encodesDramDie: false,
  }

  return {
    productLine: 'fury',
    fury,
    refusedCrossProductLineDieDecode: true,
    notes,
  }
}
