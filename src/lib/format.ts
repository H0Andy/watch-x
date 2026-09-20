import type { DataSource, HardwareValue } from '../shared/hardware'

export function hwText(field: HardwareValue<string | number | boolean> | null | undefined, fallback = '暂无'): string {
  if (!field || field.value == null || field.value === '') return fallback
  if (typeof field.value === 'boolean') return field.value ? '是' : '否'
  return String(field.value)
}

export function hwSourceLabel(source: DataSource | undefined): string {
  switch (source) {
    case 'smbios':
      return 'SMBIOS'
    case 'systeminformation':
      return '系统接口'
    case 'nvidia-smi':
      return 'nvidia-smi'
    case 'wmi':
      return 'WMI'
    case 'sensor':
      return '传感器'
    case 'os':
      return '操作系统'
    case 'spd':
      return 'SPD'
    case 'database':
      return '数据库识别'
    default:
      return '未知来源'
  }
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatTemp(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(0)}°C`
}

export function formatRpm(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(value)} RPM`
}

export function formatMhz(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} GHz`
  return `${Math.round(value)} MHz`
}

export function formatWatts(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)} W`
}

export function formatBytes(bytes: number | null | undefined, digits?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.abs(bytes)
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  const precision = digits ?? (value >= 10 || index === 0 ? 1 : 2)
  return `${value.toFixed(precision)} ${units[index]}`
}

export function formatRate(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec)) return '—'
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—'
  if (minutes < 60) return `${Math.round(minutes)} 分钟`
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours} 小时 ${mins} 分钟`
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${minutes} 分钟`
}

export function platformLabel(platform: string): string {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform
}

export function usageTone(value: number | null | undefined): 'ok' | 'warn' | 'hot' | 'muted' {
  if (value == null) return 'muted'
  if (value >= 90) return 'hot'
  if (value >= 75) return 'warn'
  return 'ok'
}

export function tempTone(value: number | null | undefined): 'ok' | 'warn' | 'hot' | 'muted' {
  if (value == null) return 'muted'
  if (value >= 80) return 'hot'
  if (value >= 60) return 'warn'
  return 'ok'
}
