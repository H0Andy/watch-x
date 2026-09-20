# Watch X Phase-2 Step 1 — Windows SPD Feasibility + Read-Only POC

Date: 2026-09-20  
Machine: ASUS TUF GAMING B860M-PLUS WIFI / Intel Core Ultra 7 270K Plus / 2× Kingston KF556C40-16 DDR5  
POC path: `tools/spd-poc/` (isolated — **not** wired into Watch X metrics / Memory page)

---

## A. RAMSPDToolkit

| Item | Result |
|------|--------|
| Compile | **Yes** — NuGet `RAMSPDToolkit` 1.6.1 on .NET 8 (`spd-poc` builds Release) |
| Run | **Yes** — elevated; driver `PawnIO` |
| B860 detect | **Yes** — `SMBusPawnIO`, `DeviceName=i801`, PCI `8086:7F23` (Intel Innovation Platform Framework SMBUS Device) |
| DDR5 | **Yes** — both DIMMs `SPD_DDR5_SDRAM`, SPD revision `0x12` |
| Driver used | **PawnIO** (not WinRing0) |
| Admin | **Required** |
| License | **MPL-2.0** — OK for private/commercial if MPL notice kept; file-level copyleft on modified MPL files |
| Full 1024B | **Yes** on this machine even with `SPD_WD=True` (page select via library `PROC_CALL` path) |

**Pros**
- Same stack LibreHardwareMonitor already uses for DIMM SPD/temp
- First-class DDR5 + Intel I801 + AMD paths
- NuGet packaging; PawnIO preferred over WinRing0
- Identity fields (mfr / PN / SN / DRAM JEDEC / capacity) match SMBIOS

**Risks**
- Default package still **embeds WinRing0** as alternate driver — Watch X must pin `DriverImplementation.PawnIO` only
- Library surface includes SMBus **write** APIs — must never expose/call from product code
- DDR5 page change under `SPD_WD` relies on Intel `PROC_CALL` workaround (Windows OK here; Linux noted weaker in upstream comments)
- Cross-process SMBus races remain if other tools ignore locks

---

## B. PawnIO

| Question | Finding |
|----------|---------|
| Install | Official `PawnIO_setup.exe` (tested 2.2.0). Service `PawnIO` **RUNNING** after install. Files under `C:\Program Files\PawnIO\` + DriverStore |
| Signature | `PawnIO.sys` Authenticode **Valid** — signed as Microsoft Windows Hardware Compatibility Publisher (WHCP attestation path) |
| Windows compat | Works on this host: **Win 10.0.26100** (Windows 11 24H2-class). VBS/Device Guard present (`VirtualizationBasedSecurityStatus=2`, security service `2` running) — driver still loaded and usable |
| Admin | App must be elevated to open PawnIO for SMBus (POC uses `requireAdministrator`) |
| User install | **Yes — separate driver install today**. Not “zero dependency” |
| Bundle with Electron | **Do not extract/redistribute proprietary signed `.sys` alone.** Allowed pattern per author: redistribute **official installer unmodified**, or ship self-built GPLv2 build with **different device name** + own signing. Prefer: setup dependency / optional component that runs `PawnIO_setup.exe` |
| Defender / Core Isolation | No block observed on this machine during install/load/read |
| Intel B860 SMBus | **Yes** — `i801` / `8086:7F23` |
| SmbusI801 path | **Yes** — RAMSPDToolkit `SMBusPawnIO` + PawnIO `SmbusI801` module |
| DDR5 1024 bytes | **Yes** — dumps `spd-full2_dimm{0,1}_*.bin` are 1024 bytes each |
| License | Kernel source **GPLv2** (+ IOCTL combination exception). Official **signed** binary is proprietary distribution; installer may be redistributed **unmodified**. Do not strip binaries into the app tree |

**Fit for Watch X:** Good as the **only** supported Windows SPD backend, installed as an optional prerequisite (like many HW tools), with graceful SMBIOS fallback if missing.

---

## C. SPDReader

| Item | Result |
|------|--------|
| Feasible on this PC? | Technically yes (Intel SMBus + DDR5), but **driver path is WinRing0 / OpenLibSys** |
| License | **MIT** (app); still pulls **WinRing0** third_party |
| Worth borrowing | README / `qspd` protocol notes for SPD5 Hub MemReg, 1/2-byte address modes, page/MR11 behavior — excellent **reference** |
| Do **not** integrate | Qt UI; `qwinring0` I/O; any EEPROM/PMIC write helpers; wholesale copy into Watch X |

---

## D. Measured results (this machine)

### SMBus
- Controller: `SMBusPawnIO` / `i801`
- PCI: `8086:7F23` (ASUS subsystem `1043:88EF`)
- `HasSPDWriteProtection` (**SPD_WD**): **True**
- Mutex: `Global\WatchX_SMBus_Lock` acquired (fail-fast, no retry)

### DIMM 0
| Field | Value |
|-------|-------|
| Address | **0x50** |
| SPD bytes | **1024** |
| Type / Rev | DDR5 / `0x12` |
| Module Manufacturer | **Kingston** (JEDEC cont `0x01` / id `0x98`) |
| Part Number | **KF556C40-16** |
| Serial | **6222A3C6** |
| Capacity | **16 GB** |
| Manufacturing Date | 2026-01-12 |
| DRAM Manufacturer | **Samsung** (`0x00` / `0xCE`) |
| Rank | org byte `0x04` → bits[5:3]=0 → **1 package rank** (width nibble needs JEDEC table double-check) |
| Dump | `tools/spd-poc/spd-full2_dimm0_0x50.bin` |

### DIMM 1
| Field | Value |
|-------|-------|
| Address | **0x51** |
| SPD bytes | **1024** |
| Type / Rev | DDR5 / `0x12` |
| Module Manufacturer | **Kingston** |
| Part Number | **KF556C40-16** |
| Serial | **0C32A39F** |
| Capacity | **16 GB** |
| Manufacturing Date | 2026-01-12 |
| DRAM Manufacturer | **Samsung** (`0x00` / `0xCE`) |
| Rank | same as DIMM 0 → **1 package rank** |
| Dump | `tools/spd-poc/spd-full2_dimm1_0x51.bin` |

### Cross-check vs Watch X / SMBIOS
**PASS** — 2× Kingston `KF556C40-16`, 16GB, DDR5. Serials differ per stick (expected).

Not done this round (by design): XMP/EXPO, PMIC, SPD Hub config, A/M-die DB.

---

## E. Recommendation

### Recommended formal approach
**PawnIO (official signed installer) + RAMSPDToolkit (PawnIO-only, read-only wrapper) + `Global\WatchX_SMBus_Lock` + one-shot/static identity read + SMBIOS fallback**

### Not recommended
1. **WinRing0 / OpenLibSys** (SPDReader path, RAMSPDToolkit fallback) — signing/Defender/HVCI risk; do not ship  
2. **Vendoring SPDReader** as the product SPD stack  
3. **Embedding proprietary PawnIO.sys** outside the official installer  
4. **Any SPD/EEPROM/PMIC/Hub write surface** in Watch X  
5. Putting SPD reads in the **1s realtime metrics loop**

### Why
This exact B860 + DDR5 kit already proves stable read-only SPD identity via PawnIO+I801, including full 1024-byte dumps under BIOS SPD write-protect, with SMBIOS-consistent PN/mfr/capacity. Distribution cost is an optional signed driver install — acceptable if Watch X degrades cleanly when PawnIO is absent.

### Explicit non-goals completed
- Watch X Memory page / metrics loop **unchanged**
- No die database
- No write APIs called from POC

### Next step (after your confirmation only)
Design a read-only Electron bridge that: loads PawnIO once at identity warmup, fills SPD fields with `source: "spd"`, never touches metrics cadence, and shows “SPD 高级信息不可用” when driver/admin/SMBus fails.
