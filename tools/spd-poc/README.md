# Watch X — SPD Read-Only POC

Independent feasibility probe for Windows DDR5 SPD reads on the B860 test machine.

## Scope

- Read-only SMBus / SPD access only
- No Watch X app integration
- No die database
- No SPD / EEPROM / PMIC / Hub writes exposed or called

## Prerequisites

1. .NET SDK 8+
2. Administrator shell
3. **PawnIO** official installer from https://pawnio.eu/ (signed driver)
4. Close HWiNFO / OpenRGB / LHM / other SMBus clients before running

## Build

```powershell
cd tools/spd-poc
dotnet restore
dotnet build -c Release
```

## Run

```powershell
# Elevated PowerShell
dotnet run -c Release --no-build
# or
.\bin\Release\net8.0-windows\spd-poc.exe
```

Optional args:

- `--driver pawnio` (default)
- `--driver winring0` (marked risky; not recommended)
- `--hex 64` first N raw SPD bytes to dump (default 64)
- `--dump-file out.spd` write full raw dump if readable

## Output

Writes console report + `spd-poc-report.json` in the working directory.
