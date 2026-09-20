# Watch X SPD Helper (read-only)

Independent elevated process. Watch X Electron stays non-admin and invokes:

```text
spd-helper scan --out <json> [--raw-dir <dir>]
```

## Contract

- **Only** command: `scan`
- No SMBus address/register write parameters
- No write APIs in CLI or JSON schema
- Mutex: `Global\WatchX_SMBus_Lock` (fail-fast)
- Driver: PawnIO only

## Build

```powershell
dotnet build -c Release helpers/spd-helper/SpdHelper.csproj
dotnet test helpers/spd-helper/tests/SpdHelper.Tests.csproj
```

## Permission model (B860 test machine)

| Context | PawnIO LoadDriver | SMBus detect / SPD read |
|---------|-------------------|-------------------------|
| Non-admin (Medium IL) | Yes | **No** (0 controllers) |
| Elevated | Yes | Yes (full 1024B) |

Therefore Watch X must use a **controlled elevated helper**, not elevate the whole app.
