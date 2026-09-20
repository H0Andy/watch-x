/**
 * JESD400-5 DDR5 SPD — module organization.
 *
 * Package ranks per channel: **byte 234**, bits [5:3], 0-based → ranks = 1 + code.
 * Bit 6 = asymmetric rank mix.
 *
 * Byte 4 is First SDRAM density/package — do NOT use it for Rank.
 * References: coreboot spd_bin DDR5, spdr IdentityAndBase (OFF_MODULE_ORGANIZATION = 234).
 */

export const DDR5_MODULE_ORGANIZATION_OFFSET = 234

export interface Ddr5PackageRankInfo {
  ranks: number
  asymmetric: boolean
  raw: number
}

export function decodeDdr5PackageRanks(byte234: number): Ddr5PackageRankInfo {
  const raw = byte234 & 0xff
  const ranks = 1 + ((raw >> 3) & 0x7)
  const asymmetric = ((raw >> 6) & 0x1) === 1
  return { ranks, asymmetric, raw }
}

export function formatRankLabel(ranks: number | null | undefined): string | null {
  if (ranks == null || !Number.isFinite(ranks) || ranks < 1) return null
  return `${ranks}R`
}
