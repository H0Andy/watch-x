/**
 * Standalone probe for Phase-1 hardware identity (no Electron required).
 * Run: node scripts/verify-hardware-identity.cjs
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

async function main() {
  // Compile-free: reimplement a light probe using systeminformation directly
  // and mirror the collector shape for verification output.
  const si = require('systeminformation')
  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execFileAsync = promisify(execFile)

  const junk = [
    /^to be filled by o\.?e\.?m\.?$/i,
    /^default string$/i,
    /^system product name$/i,
    /^system manufacturer$/i,
    /^system serial number$/i,
    /^none$/i,
    /^n\/?a$/i,
    /^unknown$/i,
  ]
  const clean = (v) => {
    if (v == null) return null
    const t = String(v).trim()
    if (!t || junk.some((re) => re.test(t))) return null
    return t
  }

  const [cpu, cache, flags, board, bios, mem, disk, net, bat] = await Promise.all([
    si.cpu(),
    si.cpuCache().catch(() => null),
    si.cpuFlags().catch(() => ''),
    si.baseboard(),
    si.bios(),
    si.memLayout(),
    si.diskLayout(),
    si.networkInterfaces(),
    si.battery(),
  ])

  let nvidia = null
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=index,name,driver_version,uuid,pci.bus_id,vbios_version,pstate,memory.total,power.limit,power.default_limit,power.max_limit',
        '--format=csv,noheader,nounits',
      ],
      { windowsHide: true, timeout: 4000 },
    )
    nvidia = stdout.trim()
  } catch (e) {
    nvidia = `unavailable: ${e.message}`
  }

  const report = {
    cpu: {
      manufacturer: clean(cpu.manufacturer),
      brand: clean(cpu.brand),
      family: cpu.family,
      model: cpu.model,
      stepping: cpu.stepping,
      socket: clean(cpu.socket),
      cache,
      flagsSample: String(flags).slice(0, 120),
      flagsHasAvx: /\bavx\b/i.test(String(flags)),
    },
    motherboard: {
      manufacturer: clean(board.manufacturer),
      model: clean(board.model),
      version: clean(board.version),
      serial: clean(board.serial),
      memSlots: board.memSlots,
    },
    bios: {
      vendor: clean(bios.vendor),
      version: clean(bios.version),
      releaseDate: clean(bios.releaseDate),
      revision: clean(bios.revision),
      serialCleaned: clean(bios.serial),
    },
    memoryModules: (mem || []).map((m) => ({
      bank: clean(m.bank),
      manufacturer: clean(m.manufacturer),
      partNum: clean(m.partNum),
      serial: clean(m.serialNum),
      sizeGB: m.size / 1024 ** 3,
      type: clean(m.type),
      clockSpeed: m.clockSpeed,
      configuredClockSpeed: m.configuredClockSpeed ?? null,
      voltageConfigured: m.voltageConfigured,
    })),
    physicalDisks: (disk || []).map((d) => ({
      name: clean(d.name),
      vendor: clean(d.vendor),
      serial: clean(d.serialNum),
      firmware: clean(d.firmwareRevision),
      type: clean(d.type),
      interfaceType: clean(d.interfaceType),
      sizeGB: d.size / 1024 ** 3,
      smartStatus: clean(d.smartStatus),
      temperature: d.temperature,
    })),
    network: (Array.isArray(net) ? net : [])
      .filter((n) => n.operstate === 'up')
      .map((n) => ({
        name: clean(n.ifaceName) || clean(n.iface),
        mac: clean(n.mac),
        ip4: clean(n.ip4),
        ip6: clean(n.ip6),
        speed: n.speed,
        type: clean(n.type),
      })),
    battery: {
      hasBattery: bat.hasBattery,
      manufacturer: clean(bat.manufacturer),
      model: clean(bat.model),
      serial: clean(bat.serial),
      voltage: bat.voltage,
      designedCapacity: bat.designedCapacity,
      maxCapacity: bat.maxCapacity,
    },
    nvidia,
  }

  const out = path.join(__dirname, '..', 'release', 'hardware-identity-probe.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log('\nWrote', out)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
