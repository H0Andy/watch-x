const si = require('systeminformation')
const { execFile } = require('child_process')
const { promisify } = require('util')
const exec = promisify(execFile)

async function ps(command) {
  const { stdout } = await exec(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true, timeout: 15000, maxBuffer: 5 * 1024 * 1024 },
  )
  return stdout.trim()
}

;(async () => {
  await si.networkStats()
  await new Promise((r) => setTimeout(r, 1100))
  console.log('nets', JSON.stringify(await si.networkStats(), null, 2))

  try {
    console.log('fsStats1', await si.fsStats())
    await new Promise((r) => setTimeout(r, 1100))
    console.log('fsStats2', await si.fsStats())
  } catch (e) {
    console.log('fsStats err', e.message)
  }

  try {
    console.log('disksIO', await si.disksIO())
  } catch (e) {
    console.log('disksIO err', e.message)
  }

  console.log(
    'memPerf',
    await ps(
      'Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object CacheBytes,ModifiedPageListBytes,StandbyCacheCoreBytes,StandbyCacheNormalPriorityBytes,StandbyCacheReserveBytes,AvailableBytes,CommittedBytes,CommitLimit | ConvertTo-Json -Compress',
    ),
  )

  console.log(
    'thermal',
    await ps(
      'Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object Name,Temperature,HighPrecisionTemperature | ConvertTo-Json -Compress',
    ),
  )

  console.log(
    'diskPerf',
    await ps(
      "Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -eq '_Total' } | Select-Object DiskReadBytesPersec,DiskWriteBytesPersec,DiskReadsPersec,DiskWritesPersec | ConvertTo-Json -Compress",
    ),
  )

  console.log(
    'netBytes',
    await ps(
      'Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Select-Object Name,BytesReceivedPersec,BytesSentPersec,CurrentBandwidth | ConvertTo-Json -Compress',
    ),
  )

  console.log(
    'display',
    await ps(
      "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Remote' -and $_.CurrentHorizontalResolution } | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate,DriverVersion,AdapterRAM | ConvertTo-Json -Compress",
    ),
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
