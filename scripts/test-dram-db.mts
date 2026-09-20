/**
 * DRAM DB matcher + Kingston FURY PN decoder tests.
 * Run: node --experimental-strip-types scripts/test-dram-db.mts
 */
import assert from 'node:assert/strict'
import { matchDramDatabase } from '../src/shared/dramDbMatch.ts'
import { decodeKingstonFuryDdr5Pn } from '../src/shared/kingstonPnDecode.ts'
import { HARDWARE_DATABASE_VERSION } from '../src/data/hardware-db/schema.ts'

const fury = decodeKingstonFuryDdr5Pn('KF556C40-16')
assert.equal(fury.productLine, 'fury')
assert.ok(fury.fury)
assert.equal(fury.fury.marketedSpeedMTs, 5600)
assert.equal(fury.fury.casLatency, 40)
assert.equal(fury.fury.totalCapacityGB, 16)
assert.equal(fury.fury.encodesDramDie, false)
assert.equal(fury.refusedCrossProductLineDieDecode, true)

const full = decodeKingstonFuryDdr5Pn('KF556C40BB-16')
assert.equal(full.fury?.series, 'Beast')
assert.equal(full.fury?.heatSpreader, 'Black')

const ksm = decodeKingstonFuryDdr5Pn('KSM56R46BD4PMI-64HAI')
assert.equal(ksm.productLine, 'server-premier')
assert.equal(ksm.fury, null)
assert.equal(ksm.refusedCrossProductLineDieDecode, true)

const facts = {
  moduleManufacturer: 'Kingston',
  modulePartNumber: 'KF556C40-16',
  memoryType: 'DDR5',
  capacityBytes: 16 * 1024 * 1024 * 1024,
  rank: 1,
  spdRevision: '1.2',
  dramManufacturer: 'Samsung',
  dramManufacturerId: '0x00/0xCE',
  moduleRevision: 0,
  dramStepping: 0,
  xmpDataRateMTs: 5200,
  xmpCL: 40,
}

const match = matchDramDatabase(facts)
assert.equal(match.hardwareDatabaseVersion, HARDWARE_DATABASE_VERSION)
assert.equal(match.dramDie.value, null)
assert.equal(match.dramDie.confidence, 'unknown')
assert.equal(match.dramDie.source, 'database')
assert.ok(match.selectedEntry?.id.includes('kf556c40'))
assert.ok(match.conclusion.includes('Die') || match.conclusion.includes('die') || match.conclusion.includes('证据'))
assert.ok(match.evidence.some((e) => e.label.includes('Samsung')))
assert.ok(match.vendorPn.fury?.marketedSpeedMTs === 5600)

// Speed alone must not invent die: entry with die null stays null even with XMP facts
assert.equal(match.dieDensity.value, null)
assert.equal(match.icPartNumber.value, null)

// Unknown PN → no die
const miss = matchDramDatabase({ ...facts, modulePartNumber: 'NO-SUCH-PN-999' })
assert.equal(miss.dramDie.value, null)
assert.equal(miss.selectedEntry, null)

console.log('dram-db tests OK')
