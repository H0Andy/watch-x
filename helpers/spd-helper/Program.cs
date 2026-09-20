/*
 * Watch X SPD Helper — READ ONLY
 *
 * Public surface: `scan` only.
 * No writeByte / writeSPD / RSWP / PMIC / Hub APIs are exposed to CLI or JSON schema.
 */

using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using RAMSPDToolkit.I2CSMBus;
using RAMSPDToolkit.SPD;
using RAMSPDToolkit.SPD.Interop.Shared;
using RAMSPDToolkit.Windows.Driver;
using RAMSPDToolkit.Windows.Driver.Implementations;
using WatchX.SpdHelper;

const string MutexName = @"Global\WatchX_SMBus_Lock";

if (args.Length == 0 || args[0] is "-h" or "--help")
{
    Console.Error.WriteLine("Watch X SPD Helper (read-only)");
    Console.Error.WriteLine("Usage: spd-helper scan --out <file.json> [--raw-dir <dir>]");
    return 2;
}

if (!string.Equals(args[0], "scan", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine($"Unknown command '{args[0]}'. Only 'scan' is supported.");
    return 2;
}

string? outPath = null;
string? rawDir = null;
for (var i = 1; i < args.Length; i++)
{
    if (args[i] is "--out" && i + 1 < args.Length) outPath = args[++i];
    else if (args[i] is "--raw-dir" && i + 1 < args.Length) rawDir = args[++i];
}

if (string.IsNullOrWhiteSpace(outPath))
{
    Console.Error.WriteLine("Missing --out <file.json>");
    return 2;
}

var envelope = new SpdHelperEnvelope
{
    SchemaVersion = 1,
    Command = "scan",
    StartedAtUtc = DateTime.UtcNow,
    Elevated = IsElevated(),
    Status = "unavailable",
};

Mutex? mutex = null;
try
{
    if (!OperatingSystem.IsWindows())
    {
        envelope.Status = "unsupported";
        envelope.Detail = "Windows only";
        WriteOut(outPath!, envelope);
        return 6;
    }

    if (!IsElevated())
    {
        envelope.Status = "permission-required";
        envelope.Detail = "Administrator elevation required for SMBus SPD read";
        WriteOut(outPath!, envelope);
        return 3;
    }

    try
    {
        mutex = new Mutex(false, MutexName, out _);
        if (!mutex.WaitOne(0))
        {
            envelope.Status = "busy";
            envelope.Detail = "SMBus mutex busy (Global\\WatchX_SMBus_Lock); skipped without retry";
            WriteOut(outPath!, envelope);
            return 4;
        }
    }
    catch (AbandonedMutexException)
    {
        mutex = new Mutex(false, MutexName);
        mutex.WaitOne(0);
    }
    catch (Exception ex)
    {
        envelope.Status = "read-error";
        envelope.Detail = $"Mutex error: {ex.Message}";
        WriteOut(outPath!, envelope);
        return 5;
    }

    if (!DriverManager.LoadDriver(DriverImplementation.PawnIO))
    {
        envelope.Status = "unavailable";
        envelope.Detail = "PawnIO LoadDriver failed (is PawnIO installed?)";
        WriteOut(outPath!, envelope);
        return 7;
    }

    envelope.Driver = "PawnIO";
    SMBusManager.DetectSMBuses();
    envelope.Controllers = SMBusManager.RegisteredSMBuses.Select(b => new SpdControllerInfo
    {
        Type = b.GetType().Name,
        DeviceName = b.DeviceName,
        PciVendor = b.PCIVendor,
        PciDevice = b.PCIDevice,
        SpdWriteProtection = b.HasSPDWriteProtection,
    }).ToList();

    if (envelope.Controllers.Count == 0)
    {
        envelope.Status = "unavailable";
        envelope.Detail = "No SMBus controller detected";
        WriteOut(outPath!, envelope);
        return 8;
    }

    if (!string.IsNullOrWhiteSpace(rawDir))
        Directory.CreateDirectory(rawDir);

    foreach (var bus in SMBusManager.RegisteredSMBuses)
    {
        for (byte addr = SPDConstants.SPD_BEGIN; addr <= SPDConstants.SPD_END; addr++)
        {
            if (!DDR5Accessor.IsAvailable(bus, addr)
                && !DDR4Accessor.IsAvailable(bus, addr)
                && !DDR3Accessor.IsAvailable(bus, addr))
            {
                continue;
            }

            SPDAccessor spd;
            string generation;
            if (DDR5Accessor.IsAvailable(bus, addr))
            {
                spd = new DDR5Accessor(bus, addr);
                generation = "DDR5";
            }
            else if (DDR4Accessor.IsAvailable(bus, addr))
            {
                spd = new DDR4Accessor(bus, addr);
                generation = "DDR4";
            }
            else
            {
                spd = new DDR3Accessor(bus, addr);
                generation = "DDR3";
            }

            var raw = ReadRaw(spd, generation == "DDR5" ? 1024 : generation == "DDR4" ? 512 : 256);
            var module = ParseModule(spd, generation, addr, bus, raw);
            envelope.Modules.Add(module);

            if (!string.IsNullOrWhiteSpace(rawDir) && raw.Length > 0)
            {
                var name = $"dimm_0x{addr:X2}_{Sanitize(module.ModuleSerialNumber)}.bin";
                File.WriteAllBytes(Path.Combine(rawDir, name), raw);
                module.RawFile = name;
                module.RawBase64 = Convert.ToBase64String(raw);
            }
        }
    }

    envelope.Status = envelope.Modules.Count > 0 ? "available" : "unavailable";
    envelope.Detail = envelope.Modules.Count > 0
        ? $"Read {envelope.Modules.Count} module(s)"
        : "No SPD devices responded";
    envelope.FinishedAtUtc = DateTime.UtcNow;
    WriteOut(outPath!, envelope);
    return envelope.Modules.Count > 0 ? 0 : 9;
}
catch (Exception ex)
{
    envelope.Status = "read-error";
    envelope.Detail = ex.Message;
    envelope.Error = ex.ToString();
    envelope.FinishedAtUtc = DateTime.UtcNow;
    try { WriteOut(outPath!, envelope); } catch { /* ignore */ }
    Console.Error.WriteLine(ex);
    return 1;
}
finally
{
    try
    {
        if (DriverManager.Driver is not null)
            DriverManager.UnloadDriver();
    }
    catch { /* ignore */ }

    try
    {
        mutex?.ReleaseMutex();
        mutex?.Dispose();
    }
    catch { /* ignore */ }
}

static bool IsElevated()
{
    using var id = WindowsIdentity.GetCurrent();
    return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
}

static byte[] ReadRaw(SPDAccessor spd, int expected)
{
    var list = new List<byte>(expected);
    ushort offset = 0;
    while (offset < expected)
    {
        var chunkLen = (byte)Math.Min(expected - offset, 128);
        try
        {
            var chunk = spd.At(offset, chunkLen);
            if (chunk is null || chunk.Length == 0) break;
            list.AddRange(chunk);
            if (chunk.Length < chunkLen) break;
            offset = (ushort)(offset + chunk.Length);
        }
        catch
        {
            break;
        }
    }
    return list.ToArray();
}

static SpdModuleDto ParseModule(SPDAccessor spd, string generation, byte addr, SMBusInterface bus, byte[] raw)
{
    var dto = new SpdModuleDto
    {
        SpdAddress = $"0x{addr:X2}",
        SpdAddressByte = addr,
        SpdSize = raw.Length,
        MemoryType = generation,
        SpdRevision = Safe(() => FormatRevision(spd.SPDRevision())),
        ModuleManufacturer = Safe(() => Clean(spd.GetModuleManufacturerString())),
        ModulePartNumber = Safe(() => Clean(spd.ModulePartNumber())),
        ModuleSerialNumber = Safe(() => Clean(spd.ModuleSerialNumber())),
        DramManufacturer = Safe(() => Clean(spd.GetDRAMManufacturerString())),
        DramManufacturerContinuation = Safe(() => $"0x{spd.DRAMManufacturerContinuationCode():X2}"),
        DramManufacturerId = Safe(() => $"0x{spd.DRAMManufacturerIDCode():X2}"),
        CapacityGb = SafeNum(() => spd.GetCapacity()),
        BusType = bus.GetType().Name,
        SpdWriteProtection = bus.HasSPDWriteProtection,
    };

    if (generation == "DDR5" && raw.Length > 234)
    {
        var org = raw[234];
        var decoded = Ddr5Organization.DecodePackageRanks(org);
        dto.RawOrganization = org;
        dto.Rank = decoded.Ranks;
        dto.RankAsymmetric = decoded.Asymmetric;
        dto.RankSource = "jedec-byte234";
        // Density/package byte (NOT ranks) — retained for diagnostics only
        dto.RawDensityPackage = raw.Length > 4 ? raw[4] : null;
    }
    else if (generation == "DDR4" && raw.Length > 12)
    {
        // DDR4 byte 12 bits[2:0] = package ranks encoding (0=1R …) — not used on this B860 kit
        dto.Rank = null;
        dto.RankSource = "unconfirmed";
    }

    return dto;
}

static string FormatRevision(byte rev)
{
    // High nibble = major, low = minor (common SPD encoding)
    return $"{(rev >> 4) & 0xF}.{(rev & 0xF)}";
}

static string Clean(string? s)
{
    if (string.IsNullOrWhiteSpace(s)) return "";
    return new string(s.Where(c => c >= 32 && c < 127).ToArray()).Trim();
}

static string Safe(Func<string> fn)
{
    try { return fn() ?? ""; }
    catch { return ""; }
}

static double? SafeNum(Func<float> fn)
{
    try
    {
        var v = fn();
        return float.IsFinite(v) ? v : null;
    }
    catch { return null; }
}

static string Sanitize(string? s)
{
    if (string.IsNullOrWhiteSpace(s)) return "unknown";
    var sb = new StringBuilder();
    foreach (var c in s)
        sb.Append(char.IsLetterOrDigit(c) ? c : '_');
    return sb.ToString();
}

static void WriteOut(string path, SpdHelperEnvelope envelope)
{
    envelope.FinishedAtUtc ??= DateTime.UtcNow;
    var dir = Path.GetDirectoryName(path);
    if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
    var json = JsonSerializer.Serialize(envelope, new JsonSerializerOptions
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    });
    File.WriteAllText(path, json);
    Console.WriteLine($"Wrote {path} status={envelope.Status} modules={envelope.Modules.Count}");
}
