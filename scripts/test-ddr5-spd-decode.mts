import assert from 'node:assert/strict'
import { decodeDdr5PackageRanks, formatRankLabel, DDR5_MODULE_ORGANIZATION_OFFSET } from '../src/shared/ddr5SpdDecode.ts'

assert.equal(DDR5_MODULE_ORGANIZATION_OFFSET, 234)

assert.deepEqual(decodeDdr5PackageRanks(0x00), { ranks: 1, asymmetric: false, raw: 0x00 })
assert.deepEqual(decodeDdr5PackageRanks(0x08), { ranks: 2, asymmetric: false, raw: 0x08 })
assert.deepEqual(decodeDdr5PackageRanks(0x48), { ranks: 2, asymmetric: true, raw: 0x48 })
assert.equal(decodeDdr5PackageRanks(0x10).ranks, 3)
assert.equal(decodeDdr5PackageRanks(0x18).ranks, 4)
assert.equal(decodeDdr5PackageRanks(0x38).ranks, 8)

// Machine fixture: Kingston KF556C40-16 elevated dump byte234=0x00 → 1R
assert.equal(decodeDdr5PackageRanks(0x00).ranks, 1)
assert.equal(formatRankLabel(1), '1R')

// Byte 4 = 0x04 must not be treated as the rank source (density/package).
assert.equal(DDR5_MODULE_ORGANIZATION_OFFSET !== 4, true)

console.log('ddr5SpdDecode tests OK')
