declare const __dirname: string
declare const __filename: string

declare module 'macos-temperature-sensor' {
  export function temperature(): {
    cpu?: number
    soc?: number
    gpu?: number
    cpuDieTemps?: number[]
    probeGroupsTemps?: number[]
    gpuDieTemps?: number[]
  }
  export function fans(): Array<{
    label?: string
    key?: string
    rpm?: number | null
    min?: number | null
    max?: number | null
    pwm?: number | null
  }>
  export function version(): string
}

declare module 'osx-temperature-sensor' {
  export function temperature(): number | { main?: number; cores?: number[]; max?: number }
  export function cpuTemperature(): number
}
