const { execFile } = require('child_process')
const { promisify } = require('util')
const exec = promisify(execFile)

async function ps(command) {
  const { stdout } = await exec(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
  )
  return stdout.trim()
}

;(async () => {
  console.log(
    'intel',
    await ps(
      "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'Intel' } | Select-Object Name,DriverVersion,AdapterRAM,VideoProcessor | ConvertTo-Json -Compress",
    ),
  )
  console.log(
    'gpuEngine',
    await ps(
      'Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Select-Object Name,UtilizationPercentage | ConvertTo-Json -Compress',
    ),
  )
  console.log(
    'gpuAdapter',
    await ps(
      'Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -ErrorAction SilentlyContinue | Select-Object Name,DedicatedUsage,SharedUsage,TotalCommitted | ConvertTo-Json -Compress',
    ),
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
