/**
 * Unit tests for DDR5 SPD profile parser using on-disk Kingston dumps.
 * Run: node --experimental-strip-types scripts/test-ddr5-spd-profiles.mts
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  crc16Xmodem,
  dataRateFromTckPs,
  decodeDdr5VoltageByte,
  formatTimingTriplet,
  parseDdr5SpdProfiles,
} from '../src/shared/ddr5SpdProfiles.ts'

assert.equal(dataRateFromTckPs(416), 4800)
assert.equal(dataRateFromTckPs(384), 5200)
assert.equal(dataRateFromTckPs(357), 5600)
assert.equal(decodeDdr5VoltageByte(0x25), 1250)
assert.equal(decodeDdr5VoltageByte(0x30), 1800)

// CRC primitive smoke (empty → 0)
assert.equal(crc16Xmodem(new Uint8Array(0)), 0)

const rawDir = path.join('helpers', 'spd-helper', 'raw-cache')
const files = [
  'dimm_0x50_6222A3C6.bin',
  'dimm_0x51_0C32A39F.bin',
]

for (const file of files) {
  const full = path.join(rawDir, file)
  assert.ok(fs.existsSync(full), `missing fixture ${full}`)
  const buf = fs.readFileSync(full)
  assert.equal(buf.length, 1024)

  const parsed = parseDdr5SpdProfiles(buf)
  assert.equal(parsed.jedecProfiles.length, 1)
  assert.equal(parsed.jedecProfiles[0]!.dataRateMTs, 4800)
  assert.equal(parsed.jedecProfiles[0]!.timings.tCL, 38)

  assert.equal(parsed.xmpDetected, true)
  assert.equal(parsed.xmpVersion, '3.0')
  assert.ok(parsed.xmpProfiles.length >= 1)
  const xmp = parsed.xmpProfiles[0]!
  assert.equal(xmp.dataRateMTs, 5200)
  assert.equal(xmp.voltageMv, 1250)
  assert.equal(xmp.timings.tCL, 40)
  assert.equal(xmp.timings.tRCD, 40)
  assert.equal(xmp.timings.tRP, 40)
  assert.equal(xmp.timings.tRAS, 80)
  assert.equal(formatTimingTriplet(xmp), 'CL40-40-40-80')

  assert.equal(parsed.expoDetected, false)
  assert.equal(parsed.expoProfiles.length, 0)
}

// Malformed: no throw, empty profiles
const bad = parseDdr5SpdProfiles(new Uint8Array([1, 2, 3]))
assert.equal(bad.xmpDetected, false)
assert.equal(bad.jedecProfiles.length, 0)

// No XMP magic → not detected
const noXmp = new Uint8Array(1024)
noXmp[2] = 0x12
noXmp[20] = 0xa0
noXmp[21] = 0x01
noXmp[30] = 0x80
noXmp[31] = 0x3e
const parsedNoXmp = parseDdr5SpdProfiles(noXmp)
assert.equal(parsedNoXmp.xmpDetected, false)
assert.equal(parsedNoXmp.xmpProfiles.length, 0)
assert.equal(parsedNoXmp.jedecProfiles[0]?.dataRateMTs, 4800)

console.log('ddr5SpdProfiles tests OK')
