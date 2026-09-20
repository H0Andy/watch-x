# SPD Integration Prep Report

Date: 2026-09-20  
Machine: ASUS TUF GAMING B860M-PLUS WIFI / Ultra 7 270K / 2× Kingston KF556C40-16

## 1. Non-admin access test

| Step | Result |
|------|--------|
| PawnIO service installed/running | Yes |
| Non-admin `LoadDriver(PawnIO)` | **True** |
| Non-admin `DetectSMBuses` | **0 controllers** |
| Non-admin full 1024B read | **Fail** |
| Elevated helper scan | **Success** — 2× DDR5 @ 0x50/0x51, 1024B each |

**Conclusion:** Do **not** elevate Watch X Electron. Use a **controlled elevated Helper** (`spd-helper.exe` + UAC once per scan). Optional future: install-time read-only broker/service.

Artifacts: `tools/spd-poc/nonadmin-perm-result.json`

## 2. Helper architecture

```
Watch X Electron (Medium IL, no admin)
        │  identity warmup / “重新扫描”
        ▼
helpers/spd-helper/spd-helper.exe  (requireAdministrator)
        │  command: scan only
        ▼
PawnIO → SmbusI801 → DDR5 SPD
```

- POC remains at `tools/spd-poc/`
- Formal helper at `helpers/spd-helper/`
- CLI: `spd-helper scan --out <json> [--raw-dir <dir>]`
- **No** write APIs in CLI/JSON schema
- Mutex: `Global\WatchX_SMBus_Lock` (fail-fast)
- Raw bins: main-process / disk cache only — **not** in MetricsSnapshot
- Electron bridge: `electron/spdHelper.ts` + merge `electron/spdMerge.ts`
- **Not** wired into 1s `metrics.ts` loop (only `collectHardwareIdentity`)

## 3. Rank decode (JEDEC)

**Wrong (POC early guess):** byte 4 = organization  
**Correct (JESD400-5):** **byte 234**, bits [5:3], `ranks = 1 + code`; bit 6 = asymmetric  

Byte 4 = First SDRAM density/package (not ranks).

This kit: `byte234 = 0x00` → **1R** (confirmed elevated + unit tests).

Tests: `helpers/spd-helper/tests` (9 passed) + `scripts/test-ddr5-spd-decode.mts`

## 4. Merged MemoryModule JSON

See `helpers/spd-helper/merged-memory-modules.json`.

Serial-matched:

| SMBIOS Serial | SPD Addr | DRAM | Rank |
|---------------|----------|------|------|
| 6222A3C6 | 0x50 | Samsung | 1R |
| 0C32A39F | 0x51 | Samsung | 1R |

## 5. UI

Memory page shows SMBIOS module block + SPD advanced block (Samsung / 1R / rev 1.2 / 1024 bytes) with source badges. “暂未实现” (XMP/Die/…) separated from failure states (`spdStatus`).

## Status vocabulary

`available | unavailable | permission-required | busy | unsupported | read-error | not-attempted`
