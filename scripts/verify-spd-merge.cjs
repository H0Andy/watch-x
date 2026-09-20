/**
 * Offline merge verification: SMBIOS (systeminformation) + spd-helper JSON → MemoryModule[].
 * Usage: node scripts/verify-spd-merge.cjs <spd-helper-scan.json>
 */
const fs = require('fs')
const path = require('path')
const si = require('systeminformation')

function normSerial(s) {
  if (!s) return null
  const t = String(s).trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  return t || null
}
function normPart(s) {
  if (!s) return null
  const t = String(s).trim().toUpperCase().replace(/\s+/g, '')
  return t || null
}
function formatRankLabel(ranks) {
  if (ranks == null || !Number.isFinite(ranks) || ranks < 1) return null
  return `${ranks}R`
}

async function main() {
  const jsonPath = process.argv[2] || path.join(process.env.APPDATA || '', 'Watch X', 'spd-helper-scan.json')
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing SPD JSON:', jsonPath)
    process.exit(1)
  }
  const envelope = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const rows = (await si.memLayout()).filter((r) => r.size > 0)

  const smbios = rows.map((row) => ({
    manufacturer: row.manufacturer,
    partNumber: row.partNum,
    serialNumber: row.serialNum,
    capacityBytes: row.size,
    type: row.type,
    clockSpeedMhz: row.clockSpeed,
  }))

  const unused = new Set(envelope.modules.map((_, i) => i))
  const merged = smbios.map((mod) => {
    let best = null
    for (const i of unused) {
      const spd = envelope.modules[i]
      const sSerial = normSerial(mod.serialNumber)
      const pSerial = normSerial(spd.moduleSerialNumber)
      let score = 0
      if (sSerial && pSerial && sSerial === pSerial) score = 100
      else {
        if (normPart(mod.partNumber) === normPart(spd.modulePartNumber)) score += 40
        const pCap = spd.capacityGb != null ? Math.round(spd.capacityGb * 1024 ** 3) : null
        if (pCap != null && Math.abs(mod.capacityBytes - pCap) < 16 * 1024 * 1024) score += 20
      }
      if (score >= 40 && (!best || score > best.score)) best = { i, spd, score }
    }
    if (!best) {
      return {
        manufacturer: { value: mod.manufacturer, source: 'smbios' },
        partNumber: { value: mod.partNumber, source: 'smbios' },
        serialNumber: { value: mod.serialNumber, source: 'smbios' },
        capacityBytes: { value: mod.capacityBytes, source: 'smbios' },
        type: { value: mod.type, source: 'smbios' },
        dramManufacturer: { value: null, source: 'spd' },
        rank: { value: null, source: 'spd' },
        spd: null,
      }
    }
    unused.delete(best.i)
    const spd = best.spd
    const rank = spd.rankSource === 'jedec-byte234' ? spd.rank : null
    return {
      manufacturer: { value: mod.manufacturer, source: 'smbios' },
      partNumber: { value: mod.partNumber, source: 'smbios' },
      serialNumber: { value: mod.serialNumber, source: 'smbios' },
      capacityBytes: { value: mod.capacityBytes, source: 'smbios' },
      type: { value: mod.type, source: 'smbios' },
      clockSpeedMhz: { value: mod.clockSpeedMhz, source: 'smbios' },
      dramManufacturer: { value: spd.dramManufacturer || null, source: 'spd' },
      rank: { value: rank, source: 'spd' },
      rankLabel: { value: formatRankLabel(rank), source: 'spd' },
      spdRevision: { value: spd.spdRevision || null, source: 'spd' },
      spd: {
        spdAddress: { value: spd.spdAddress, source: 'spd' },
        spdSize: { value: spd.spdSize, source: 'spd' },
        memoryType: { value: spd.memoryType, source: 'spd' },
        moduleSerialNumber: { value: spd.moduleSerialNumber, source: 'spd' },
        dramManufacturerId: {
          value: [spd.dramManufacturerContinuation, spd.dramManufacturerId].filter(Boolean).join('/'),
          source: 'spd',
        },
        rawOrganization: { value: spd.rawOrganization ?? null, source: 'spd' },
        jedecProfiles: null,
        xmpProfiles: null,
        expoProfiles: null,
        timings: null,
        pmic: null,
        spdHub: null,
      },
    }
  })

  const out = {
    spdStatus: envelope.status,
    spdDetail: envelope.detail,
    modules: merged,
  }
  const outPath = path.join(__dirname, '..', 'helpers', 'spd-helper', 'merged-memory-modules.json')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  console.log('Wrote', outPath)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
