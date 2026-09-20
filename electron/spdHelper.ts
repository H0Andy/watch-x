import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SpdAvailability } from '../src/shared/hardware'

const execFileAsync = promisify(execFile)

export interface SpdHelperModuleDto {
  spdAddress?: string
  spdAddressByte?: number
  spdSize?: number
  memoryType?: string
  spdRevision?: string
  moduleManufacturer?: string
  modulePartNumber?: string
  moduleSerialNumber?: string
  dramManufacturer?: string
  dramManufacturerContinuation?: string
  dramManufacturerId?: string
  capacityGb?: number | null
  rank?: number | null
  rankAsymmetric?: boolean | null
  rankSource?: string | null
  rawOrganization?: number | null
  rawDensityPackage?: number | null
  rawFile?: string | null
  /** Optional base64 of full SPD image — main-process only, never forwarded to renderer. */
  rawBase64?: string | null
}

export interface SpdHelperEnvelope {
  schemaVersion?: number
  status: SpdAvailability | string
  detail?: string | null
  driver?: string | null
  elevated?: boolean
  modules: SpdHelperModuleDto[]
  error?: string | null
}

export interface SpdScanOutcome {
  status: SpdAvailability
  detail: string | null
  envelope: SpdHelperEnvelope | null
  rawCacheDir: string | null
}

let sessionAttempted = false
let sessionOutcome: SpdScanOutcome | null = null

/** Main-process only — do not put into MetricsSnapshot / renderer. */
const rawSpdCache = new Map<string, Buffer>()

export function getRawSpdCacheSize(): number {
  return rawSpdCache.size
}

export function getRawSpdByFile(fileName: string | null | undefined): Buffer | null {
  if (!fileName) return null
  return rawSpdCache.get(fileName) ?? null
}

export function clearSpdSessionCache(): void {
  sessionAttempted = false
  sessionOutcome = null
  rawSpdCache.clear()
}

function resolveHelperPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'helpers', 'spd-helper.exe'),
    path.join(app.getAppPath(), 'helpers', 'spd-helper', 'dist', 'spd-helper.exe'),
    path.join(app.getAppPath(), 'helpers', 'spd-helper', 'bin', 'Release', 'net8.0-windows', 'spd-helper.exe'),
    path.join(__dirname, '..', 'helpers', 'spd-helper', 'dist', 'spd-helper.exe'),
    path.join(__dirname, '..', 'helpers', 'spd-helper', 'bin', 'Release', 'net8.0-windows', 'spd-helper.exe'),
    path.join(process.cwd(), 'helpers', 'spd-helper', 'dist', 'spd-helper.exe'),
    path.join(process.cwd(), 'helpers', 'spd-helper', 'bin', 'Release', 'net8.0-windows', 'spd-helper.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

function mapStatus(raw: string | undefined | null): SpdAvailability {
  switch (raw) {
    case 'available':
    case 'unavailable':
    case 'permission-required':
    case 'busy':
    case 'unsupported':
    case 'read-error':
      return raw
    default:
      return 'unavailable'
  }
}

/**
 * Run elevated SPD helper once per session (unless force).
 * Watch X main process stays non-admin; UAC applies only to spd-helper.exe.
 */
export async function scanSpdViaHelper(force = false): Promise<SpdScanOutcome> {
  if (!force && sessionAttempted && sessionOutcome) return sessionOutcome
  sessionAttempted = true

  const helper = resolveHelperPath()
  const presetJson = process.env.WATCHX_SPD_JSON
  if (presetJson && fs.existsSync(presetJson)) {
    try {
      const envelope = JSON.parse(fs.readFileSync(presetJson, 'utf8')) as SpdHelperEnvelope
      rawSpdCache.clear()
      const presetRawDir = process.env.WATCHX_SPD_RAW_DIR
      if (presetRawDir && fs.existsSync(presetRawDir)) {
        for (const file of fs.readdirSync(presetRawDir)) {
          if (!file.endsWith('.bin')) continue
          rawSpdCache.set(file, fs.readFileSync(path.join(presetRawDir, file)))
        }
      }
      for (const mod of envelope.modules ?? []) {
        if (mod.rawFile && mod.rawBase64 && !rawSpdCache.has(mod.rawFile)) {
          try {
            rawSpdCache.set(mod.rawFile, Buffer.from(mod.rawBase64, 'base64'))
          } catch {
            /* ignore */
          }
        }
        delete mod.rawBase64
      }
      sessionOutcome = {
        status: mapStatus(envelope.status),
        detail: envelope.detail ?? `Loaded preset ${presetJson}`,
        envelope,
        rawCacheDir: presetRawDir ?? null,
      }
      console.log(`[spd] using WATCHX_SPD_JSON modules=${envelope.modules?.length ?? 0} rawCached=${rawSpdCache.size}`)
      return sessionOutcome
    } catch (error) {
      console.warn('[spd] failed to read WATCHX_SPD_JSON', error)
    }
  }

  if (!helper) {
    sessionOutcome = {
      status: 'unavailable',
      detail: 'spd-helper.exe not found (build helpers/spd-helper)',
      envelope: null,
      rawCacheDir: null,
    }
    console.warn('[spd]', sessionOutcome.detail)
    return sessionOutcome
  }

  const userData = app.getPath('userData')
  const outFile = path.join(userData, 'spd-helper-scan.json')
  const rawDir = path.join(userData, 'spd-raw-cache')
  try {
    fs.mkdirSync(rawDir, { recursive: true })
  } catch {
    /* ignore */
  }

  // Remove stale output so we don't merge old JSON after a cancelled UAC.
  try {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile)
  } catch {
    /* ignore */
  }

  const psScript = `
$ErrorActionPreference = 'Stop'
$p = Start-Process -FilePath '${helper.replace(/'/g, "''")}' -ArgumentList @('scan','--out','${outFile.replace(/'/g, "''")}','--raw-dir','${rawDir.replace(/'/g, "''")}') -Verb RunAs -Wait -PassThru -WindowStyle Hidden
if ($null -eq $p) { exit 120 }
exit $p.ExitCode
`.trim()

  let exitCode = -1
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 120_000 },
    )
    exitCode = 0
  } catch (error) {
    const err = error as { code?: number; status?: number; message?: string }
    exitCode = typeof err.code === 'number' ? err.code : typeof err.status === 'number' ? err.status : 1
    console.warn('[spd] helper elevate/run failed', err.message || error)
  }

  if (!fs.existsSync(outFile)) {
    // UAC cancelled or helper never wrote output
    sessionOutcome = {
      status: exitCode === 3 ? 'permission-required' : 'permission-required',
      detail:
        exitCode === 120 || exitCode === 1
          ? 'SPD helper elevation cancelled or failed'
          : 'SPD helper produced no output (PawnIO/admin required)',
      envelope: null,
      rawCacheDir: null,
    }
    console.warn('[spd]', sessionOutcome.detail)
    return sessionOutcome
  }

  let envelope: SpdHelperEnvelope
  try {
    envelope = JSON.parse(fs.readFileSync(outFile, 'utf8')) as SpdHelperEnvelope
  } catch (error) {
    sessionOutcome = {
      status: 'read-error',
      detail: 'Failed to parse spd-helper JSON',
      envelope: null,
      rawCacheDir: null,
    }
    console.warn('[spd]', sessionOutcome.detail, error)
    return sessionOutcome
  }

  // Load raw bins into private main-process cache (not sent to renderer)
  rawSpdCache.clear()
  try {
    for (const file of fs.readdirSync(rawDir)) {
      if (!file.endsWith('.bin')) continue
      const buf = fs.readFileSync(path.join(rawDir, file))
      rawSpdCache.set(file, buf)
    }
  } catch {
    /* ignore */
  }
  // Also accept inline base64 from helper JSON (main-process only).
  for (const mod of envelope.modules ?? []) {
    if (mod.rawFile && mod.rawBase64 && !rawSpdCache.has(mod.rawFile)) {
      try {
        rawSpdCache.set(mod.rawFile, Buffer.from(mod.rawBase64, 'base64'))
      } catch {
        /* ignore */
      }
    }
    // Strip base64 before anything could leak toward renderer snapshots.
    delete mod.rawBase64
  }

  const status = mapStatus(envelope.status)
  sessionOutcome = {
    status,
    detail: envelope.detail ?? null,
    envelope,
    rawCacheDir: rawDir,
  }
  console.log(
    `[spd] scan status=${status} modules=${envelope.modules?.length ?? 0} rawCached=${rawSpdCache.size}`,
  )
  return sessionOutcome
}
