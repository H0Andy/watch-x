import os from 'node:os'
import { createRequire } from 'node:module'
import type { SensorReading } from '../src/shared/types'

// Works in both ESM source and the CJS Electron main bundle.
const require = createRequire(__filename)

export type MacArchKind = 'apple-silicon' | 'intel' | 'other'

export function detectMacArch(): MacArchKind {
  if (process.platform !== 'darwin') return 'other'
  const arch = os.arch()
  if (arch === 'arm64') return 'apple-silicon'
  if (arch === 'x64') return 'intel'
  return 'other'
}

export function isAppleSiliconCpu(brand: string, manufacturer = ''): boolean {
  const text = `${brand} ${manufacturer}`.toLowerCase()
  return (
    text.includes('apple') ||
    /\bm[1-9]\b/.test(text) ||
    text.includes('apple m') ||
    detectMacArch() === 'apple-silicon'
  )
}

interface AppleSiliconTemp {
  cpu?: number
  soc?: number
  gpu?: number
  cpuDieTemps?: number[]
  probeGroupsTemps?: number[]
  gpuDieTemps?: number[]
}

interface AppleSiliconFan {
  label?: string
  key?: string
  rpm?: number | null
  min?: number | null
  max?: number | null
  pwm?: number | null
}

interface AppleSiliconSensorModule {
  temperature?: () => AppleSiliconTemp
  fans?: () => AppleSiliconFan[]
}

interface IntelSensorModule {
  temperature?: () => number | { main?: number; cores?: number[]; max?: number }
  cpuTemperature?: () => number
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validTemp(value: number | null): value is number {
  return value != null && value > 1 && value < 125
}

function tryLoad<T>(id: string): T | null {
  try {
    return require(id) as T
  } catch {
    return null
  }
}

export async function collectMacSensors(): Promise<{
  arch: MacArchKind
  cpuTempMain: number | null
  cpuCoreTemps: number[]
  socTemp: number | null
  gpuTemp: number | null
  temperatures: SensorReading[]
  fans: SensorReading[]
  source: string | null
}> {
  const arch = detectMacArch()
  const empty = {
    arch,
    cpuTempMain: null as number | null,
    cpuCoreTemps: [] as number[],
    socTemp: null as number | null,
    gpuTemp: null as number | null,
    temperatures: [] as SensorReading[],
    fans: [] as SensorReading[],
    source: null as string | null,
  }

  if (process.platform !== 'darwin') return empty

  if (arch === 'apple-silicon') {
    const mod = tryLoad<AppleSiliconSensorModule & { default?: AppleSiliconSensorModule }>('macos-temperature-sensor')
    if (!mod) return empty
    try {
      const api = mod.default ?? mod
      const temp = api.temperature?.() ?? {}
      const temperatures: SensorReading[] = []
      const cpu = asNumber(temp.cpu)
      const soc = asNumber(temp.soc)
      const gpu = asNumber(temp.gpu)
      const dieTemps = (temp.cpuDieTemps ?? []).map(asNumber).filter(validTemp)
      const probeTemps = (temp.probeGroupsTemps ?? []).map(asNumber).filter(validTemp)
      const gpuDieTemps = (temp.gpuDieTemps ?? []).map(asNumber).filter(validTemp)

      if (validTemp(cpu)) {
        temperatures.push({
          id: 'mac-cpu',
          label: 'CPU (Apple Silicon)',
          value: cpu,
          unit: 'C',
          source: 'macos-temperature-sensor',
        })
      }
      if (validTemp(soc)) {
        temperatures.push({
          id: 'mac-soc',
          label: 'SoC',
          value: soc,
          unit: 'C',
          source: 'macos-temperature-sensor',
        })
      }
      if (validTemp(gpu)) {
        temperatures.push({
          id: 'mac-gpu',
          label: 'GPU',
          value: gpu,
          unit: 'C',
          source: 'macos-temperature-sensor',
        })
      }
      dieTemps.forEach((value, index) => {
        temperatures.push({
          id: `mac-cpu-die-${index}`,
          label: `CPU Die ${index + 1}`,
          value,
          unit: 'C',
          source: 'macos-temperature-sensor',
        })
      })
      probeTemps.forEach((value, index) => {
        temperatures.push({
          id: `mac-probe-${index}`,
          label: `Probe ${index + 1}`,
          value,
          unit: 'C',
          source: 'macos-temperature-sensor',
        })
      })
      gpuDieTemps.forEach((value, index) => {
        temperatures.push({
          id: `mac-gpu-die-${index}`,
          label: `GPU Die ${index + 1}`,
          value,
          unit: 'C',
          source: 'macos-temperature-sensor',
        })
      })

      const fans: SensorReading[] = []
      try {
        const fanList = api.fans?.() ?? []
        fanList.forEach((fan, index) => {
          const rpm = asNumber(fan.rpm)
          if (rpm != null && rpm >= 0 && rpm < 20000) {
            fans.push({
              id: `mac-fan-${index}`,
              label: fan.label || fan.key || `风扇 ${index + 1}`,
              value: rpm,
              unit: 'rpm',
              source: 'macos-temperature-sensor',
            })
          }
          const pwm = asNumber(fan.pwm)
          if (pwm != null) {
            fans.push({
              id: `mac-fan-pwm-${index}`,
              label: `${fan.label || fan.key || `风扇 ${index + 1}`} PWM`,
              value: pwm,
              unit: '%',
              source: 'macos-temperature-sensor',
            })
          }
        })
      } catch {
        // fans() may be unavailable on some chips
      }

      return {
        arch,
        cpuTempMain: validTemp(cpu) ? cpu : validTemp(soc) ? soc : dieTemps[0] ?? null,
        cpuCoreTemps: dieTemps.length ? dieTemps : probeTemps,
        socTemp: validTemp(soc) ? soc : null,
        gpuTemp: validTemp(gpu) ? gpu : gpuDieTemps[0] ?? null,
        temperatures,
        fans,
        source: 'macos-temperature-sensor',
      }
    } catch {
      return empty
    }
  }

  if (arch === 'intel') {
    const mod = tryLoad<IntelSensorModule & { default?: IntelSensorModule }>('osx-temperature-sensor')
    if (!mod) return empty
    try {
      const api = mod.default ?? mod
      const raw = api.temperature?.() ?? api.cpuTemperature?.()
      let main: number | null = null
      let cores: number[] = []

      if (typeof raw === 'number') {
        main = asNumber(raw)
      } else if (raw && typeof raw === 'object') {
        main = asNumber(raw.main) ?? asNumber(raw.max)
        cores = (raw.cores ?? []).map(asNumber).filter(validTemp)
      }

      const temperatures: SensorReading[] = []
      if (validTemp(main)) {
        temperatures.push({
          id: 'mac-intel-cpu',
          label: 'CPU (Intel)',
          value: main,
          unit: 'C',
          source: 'osx-temperature-sensor',
        })
      }
      cores.forEach((value, index) => {
        temperatures.push({
          id: `mac-intel-core-${index}`,
          label: `CPU 核心 ${index + 1}`,
          value,
          unit: 'C',
          source: 'osx-temperature-sensor',
        })
      })

      return {
        arch,
        cpuTempMain: validTemp(main) ? main : cores[0] ?? null,
        cpuCoreTemps: cores,
        socTemp: null,
        gpuTemp: null,
        temperatures,
        fans: [],
        source: 'osx-temperature-sensor',
      }
    } catch {
      return empty
    }
  }

  return empty
}
