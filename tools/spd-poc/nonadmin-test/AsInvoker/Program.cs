/*
 * Watch X SPD Read-Only POC
 *
 * Uses RAMSPDToolkit (MPL-2.0) with PawnIO preferred.
 * Does NOT call SPD write / EEPROM write / RSWP / PMIC / Hub config APIs.
 * Page-select SMBus transactions inside the library (ChangePage / PROC_CALL)
 * are allowed only as address/register selection for reads.
 */

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using RAMSPDToolkit.I2CSMBus;
using RAMSPDToolkit.SPD;
using RAMSPDToolkit.SPD.Interop.Shared;
using RAMSPDToolkit.Windows.Driver;
using RAMSPDToolkit.Windows.Driver.Implementations;

namespace WatchX.SpdPoc;

internal static class Program
{
    private const string SmbusMutexName = @"Global\WatchX_SMBus_Lock";

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        var options = CliOptions.Parse(args);
        PrintBanner(options);

        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("ERROR: This POC is Windows-only.");
            return 2;
        }

        if (!IsElevated())
        {
            Console.Error.WriteLine("ERROR: Administrator elevation required for PawnIO / SMBus I/O.");
            Console.Error.WriteLine("Re-run from an elevated shell.");
            return 3;
        }

        Mutex? mutex = null;
        var report = new PocReport
        {
            StartedAtUtc = DateTime.UtcNow,
            Machine = Environment.MachineName,
            OsVersion = Environment.OSVersion.ToString(),
            IsElevated = true,
            DriverRequested = options.Driver.ToString(),
            ExpectedCrossCheck = new ExpectedModules
            {
                Count = 2,
                Manufacturer = "Kingston",
                PartNumberContains = "KF556C40-16",
                CapacityGb = 16,
                Type = "DDR5",
                Board = "ASUS TUF GAMING B860M-PLUS WIFI",
                Cpu = "Intel Core Ultra 7 270K Plus",
            },
        };

        try
        {
            mutex = AcquireSmbusMutex(out var mutexNote);
            report.SmbusMutex = mutexNote;
            Console.WriteLine(mutexNote.Message);
            if (!mutexNote.Acquired)
            {
                report.Outcome = "aborted_smbus_busy";
                WriteReport(report, options);
                return 4;
            }

            if (!LoadDriver(options.Driver, report))
            {
                report.Outcome = "driver_load_failed";
                WriteReport(report, options);
                return 5;
            }

            SMBusManager.DetectSMBuses();
            report.SmbusControllers = SMBusManager.RegisteredSMBuses
                .Select(DescribeBus)
                .ToList();

            Console.WriteLine();
            Console.WriteLine($"Detected SMBus controllers: {report.SmbusControllers.Count}");
            foreach (var bus in report.SmbusControllers)
            {
                Console.WriteLine($"  - {bus.Type}  DeviceName={bus.DeviceName}  Vendor=0x{bus.PciVendor:X4}  Device=0x{bus.PciDevice:X4}  SPD_WD={bus.HasSpdWriteProtection}");
            }

            if (report.SmbusControllers.Count == 0)
            {
                report.Outcome = "no_smbus";
                WriteReport(report, options);
                return 6;
            }

            var dimmIndex = 0;
            foreach (var bus in SMBusManager.RegisteredSMBuses)
            {
                for (byte addr = SPDConstants.SPD_BEGIN; addr <= SPDConstants.SPD_END; addr++)
                {
                    var dimm = TryReadDimm(bus, addr, dimmIndex, options);
                    if (dimm is null)
                        continue;

                    report.Dimms.Add(dimm);
                    PrintDimm(dimm);
                    dimmIndex++;
                }
            }

            report.CrossCheck = CrossCheck(report);
            report.Outcome = report.Dimms.Count > 0 ? "ok" : "no_dimm_spd";
            report.FinishedAtUtc = DateTime.UtcNow;
            WriteReport(report, options);

            Console.WriteLine();
            Console.WriteLine($"Outcome: {report.Outcome}");
            Console.WriteLine($"Cross-check: {(report.CrossCheck.Passed ? "PASS" : "FAIL / INCONCLUSIVE")} â€?{report.CrossCheck.Summary}");
            Console.WriteLine($"Report: {Path.GetFullPath(options.ReportPath)}");

            return report.Dimms.Count > 0 && report.CrossCheck.Passed ? 0 : 7;
        }
        catch (Exception ex)
        {
            report.Outcome = "exception";
            report.Error = ex.ToString();
            report.FinishedAtUtc = DateTime.UtcNow;
            WriteReport(report, options);
            Console.Error.WriteLine(ex);
            return 1;
        }
        finally
        {
            try
            {
                if (DriverManager.Driver is not null)
                {
                    DriverManager.UnloadDriver();
                    Console.WriteLine("Driver unloaded.");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Driver unload warning: {ex.Message}");
            }

            mutex?.ReleaseMutex();
            mutex?.Dispose();
        }
    }

    private static void PrintBanner(CliOptions options)
    {
        Console.WriteLine("==================================================");
        Console.WriteLine(" Watch X SPD Read-Only POC");
        Console.WriteLine(" Driver preference: " + options.Driver);
        Console.WriteLine(" Mutex: " + SmbusMutexName);
        Console.WriteLine(" WRITE APIs: not called");
        Console.WriteLine("==================================================");
        Console.WriteLine();
    }

    private static bool IsElevated()
    {
        using var id = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(id);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static Mutex AcquireSmbusMutex(out MutexStatus status)
    {
        status = new MutexStatus { Name = SmbusMutexName };
        try
        {
            var mutex = new Mutex(false, SmbusMutexName, out var createdNew);
            // Do not wait/retry against other holders â€?fail fast.
            var acquired = mutex.WaitOne(0);
            status.CreatedNew = createdNew;
            status.Acquired = acquired;
            status.Message = acquired
                ? $"SMBus mutex acquired ({SmbusMutexName})."
                : $"SMBus mutex busy ({SmbusMutexName}). Aborting SPD read (no retry).";
            if (!acquired)
            {
                mutex.Dispose();
                return null!;
            }

            return mutex;
        }
        catch (AbandonedMutexException)
        {
            // Previous holder crashed â€?safe to take ownership once.
            var mutex = new Mutex(false, SmbusMutexName);
            mutex.WaitOne(0);
            status.Acquired = true;
            status.CreatedNew = false;
            status.Message = $"SMBus mutex recovered from abandoned state ({SmbusMutexName}).";
            return mutex;
        }
        catch (Exception ex)
        {
            status.Acquired = false;
            status.Message = $"SMBus mutex error: {ex.Message}";
            return null!;
        }
    }

    private static bool LoadDriver(DriverChoice choice, PocReport report)
    {
        var impl = choice switch
        {
            DriverChoice.PawnIO => DriverImplementation.PawnIO,
            DriverChoice.WinRing0 => DriverImplementation.WinRing0,
            _ => DriverImplementation.PawnIO,
        };

        Console.WriteLine($"Loading driver: {impl} ...");
        var ok = DriverManager.LoadDriver(impl);
        report.DriverLoaded = ok;
        report.DriverActual = DriverManager.Driver is not null
            ? DriverManager.DriverImplementation.ToString()
            : null;

        if (ok)
        {
            Console.WriteLine($"Driver open: {report.DriverActual}");
            return true;
        }

        Console.Error.WriteLine($"Driver load FAILED for {impl}.");
        if (choice == DriverChoice.PawnIO)
        {
            Console.Error.WriteLine("Install official PawnIO from https://pawnio.eu/ then re-run elevated.");
            Console.Error.WriteLine("Do not extract proprietary PawnIO binaries into the app tree.");
        }

        return false;
    }

    private static SmbusInfo DescribeBus(SMBusInterface bus)
    {
        return new SmbusInfo
        {
            Type = bus.GetType().Name,
            DeviceName = bus.DeviceName,
            PortId = bus.PortID,
            PciVendor = (ushort)bus.PCIVendor,
            PciDevice = (ushort)bus.PCIDevice,
            PciSubsystemVendor = (ushort)bus.PCISubsystemVendor,
            PciSubsystemDevice = (ushort)bus.PCISubsystemDevice,
            HasSpdWriteProtection = bus.HasSPDWriteProtection,
        };
    }

    private static DimmInfo? TryReadDimm(SMBusInterface bus, byte address, int logicalIndex, CliOptions options)
    {
        // Prefer DDR5 on this test machine; still probe DDR4/DDR3 for completeness.
        if (DDR5Accessor.IsAvailable(bus, address))
            return ReadAccessor(new DDR5Accessor(bus, address), bus, address, logicalIndex, "DDR5", options);

        if (DDR4Accessor.IsAvailable(bus, address))
            return ReadAccessor(new DDR4Accessor(bus, address), bus, address, logicalIndex, "DDR4", options);

        if (DDR3Accessor.IsAvailable(bus, address))
            return ReadAccessor(new DDR3Accessor(bus, address), bus, address, logicalIndex, "DDR3", options);

        return null;
    }

    private static DimmInfo ReadAccessor(
        SPDAccessor spd,
        SMBusInterface bus,
        byte address,
        int logicalIndex,
        string generation,
        CliOptions options)
    {
        var info = new DimmInfo
        {
            Index = logicalIndex,
            Address = $"0x{address:X2}",
            AddressByte = address,
            BusType = bus.GetType().Name,
            SpdGeneration = generation,
            SpdWriteProtection = bus.HasSPDWriteProtection,
        };

        try
        {
            info.SpdRevision = $"0x{spd.SPDRevision():X2}";
            info.MemoryType = spd.MemoryType().ToString();
            info.CapacityGb = spd.GetCapacity();

            // Manufacturer / PN / SN / DRAM JEDEC live on higher pages for DDR5.
            // Library ChangePage may issue SMBus write transactions that ONLY select
            // the SPD page / register pointer â€?not EEPROM payload writes.
            info.ModuleManufacturer = Safe(() => spd.GetModuleManufacturerString());
            info.ModuleManufacturerContinuation = Safe(() => $"0x{spd.ModuleManufacturerContinuationCode():X2}");
            info.ModuleManufacturerId = Safe(() => $"0x{spd.ModuleManufacturerIDCode():X2}");
            info.ModulePartNumber = Safe(() => CleanAscii(spd.ModulePartNumber()));
            info.ModuleSerialNumber = Safe(() => CleanAscii(spd.ModuleSerialNumber()));
            info.ModuleManufacturingDate = Safe(() => spd.ModuleManufacturingDate()?.ToString("yyyy-MM-dd") ?? "");
            info.DramManufacturer = Safe(() => spd.GetDRAMManufacturerString());
            info.DramManufacturerContinuation = Safe(() => $"0x{spd.DRAMManufacturerContinuationCode():X2}");
            info.DramManufacturerId = Safe(() => $"0x{spd.DRAMManufacturerIDCode():X2}");

            info.Rank = TryReadRank(spd, generation);
            info.ModuleOrganization = TryReadOrganization(spd, generation);

            info.RawHexPrefix = DumpRawHex(spd, options.HexBytes, out var rawLen, out var rawBytes);
            info.SpdBytesRead = rawLen;
            info.ExpectedSpdSize = generation == "DDR5" ? 1024 : generation == "DDR4" ? 512 : 256;

            if (!string.IsNullOrWhiteSpace(options.DumpFile) && rawBytes is { Length: > 0 })
            {
                var path = Path.GetFullPath($"{Path.GetFileNameWithoutExtension(options.DumpFile)}_dimm{logicalIndex}_0x{address:X2}{Path.GetExtension(options.DumpFile)}");
                File.WriteAllBytes(path, rawBytes);
                info.DumpFile = path;
            }

            info.ReadOk = true;
        }
        catch (Exception ex)
        {
            info.ReadOk = false;
            info.Error = ex.Message;
        }

        return info;
    }

    private static string? TryReadRank(SPDAccessor spd, string generation)
    {
        try
        {
            // Prefer typed accessors when available via reflection to stay read-only
            // and avoid depending on unstable public surface across package versions.
            var method = spd.GetType().GetMethod("NumberOfRanks")
                         ?? spd.GetType().GetMethod("GetNumberOfRanks")
                         ?? spd.GetType().GetMethod("Ranks");
            if (method != null)
            {
                var value = method.Invoke(spd, null);
                return value?.ToString();
            }

            // Fallback: JEDEC DDR5 module organization byte (SPD byte 0x04 on page0 / base).
            if (generation == "DDR5")
            {
                var org = spd.At(0x04);
                // Bits [5:3] package ranks coding varies; expose raw for POC verification.
                return $"raw_org=0x{org:X2} (rank decode deferred)";
            }
        }
        catch (Exception ex)
        {
            return $"unavailable ({ex.Message})";
        }

        return null;
    }

    private static string? TryReadOrganization(SPDAccessor spd, string generation)
    {
        try
        {
            var method = spd.GetType().GetMethod("ModuleOrganization")
                         ?? spd.GetType().GetMethod("GetModuleOrganization");
            if (method != null)
                return method.Invoke(spd, null)?.ToString();

            if (generation == "DDR5")
                return $"byte0x04=0x{spd.At(0x04):X2}";
        }
        catch (Exception ex)
        {
            return $"unavailable ({ex.Message})";
        }

        return null;
    }

    private static string DumpRawHex(SPDAccessor spd, int count, out int bytesRead, out byte[] raw)
    {
        count = Math.Clamp(count, 16, 1024);
        var list = new List<byte>(count);
        var sb = new StringBuilder();

        // Read full SPD address space in chunks. At(offset, length) length is a byte (max 255).
        // Library ChangePage / PROC_CALL may run internally for higher offsets â€?page select only.
        ushort offset = 0;
        while (offset < count)
        {
            var remaining = count - offset;
            var chunkLen = (byte)Math.Min(remaining, 128);
            try
            {
                var chunk = spd.At(offset, chunkLen);
                if (chunk is null || chunk.Length == 0)
                    break;

                for (var i = 0; i < chunk.Length; i++)
                {
                    var abs = offset + i;
                    if (abs > 0 && abs % 16 == 0)
                        sb.AppendLine();
                    // Only pretty-print first 64 for console prefix; full bytes still collected.
                    if (abs < 64 || count <= 64)
                        sb.Append(chunk[i].ToString("X2")).Append(' ');
                    list.Add(chunk[i]);
                }

                if (chunk.Length < chunkLen)
                    break;
                offset = (ushort)(offset + chunk.Length);
            }
            catch
            {
                // Fallback byte-by-byte from current offset
                try
                {
                    var b = spd.At(offset);
                    list.Add(b);
                    if (offset < 64)
                    {
                        if (offset > 0 && offset % 16 == 0)
                            sb.AppendLine();
                        sb.Append(b.ToString("X2")).Append(' ');
                    }
                    offset++;
                }
                catch
                {
                    break;
                }
            }
        }

        if (count > 64 && list.Count > 64)
            sb.AppendLine().Append($"... ({list.Count} bytes total, first 64 shown)");

        raw = list.ToArray();
        bytesRead = raw.Length;
        return sb.ToString().TrimEnd();
    }

    private static string CleanAscii(string? s)
    {
        if (string.IsNullOrWhiteSpace(s))
            return "";
        return new string(s.Where(c => c >= 32 && c < 127).ToArray()).Trim();
    }

    private static string Safe(Func<string> fn)
    {
        try
        {
            return fn() ?? "";
        }
        catch (Exception ex)
        {
            return $"<error: {ex.Message}>";
        }
    }

    private static void PrintDimm(DimmInfo d)
    {
        Console.WriteLine();
        Console.WriteLine($"DIMM {d.Index}");
        Console.WriteLine($"  Address:              {d.Address}");
        Console.WriteLine($"  Bus:                  {d.BusType}");
        Console.WriteLine($"  SPD Type:             {d.SpdGeneration}");
        Console.WriteLine($"  MemoryType enum:      {d.MemoryType}");
        Console.WriteLine($"  SPD Revision:         {d.SpdRevision}");
        Console.WriteLine($"  SPD bytes read:       {d.SpdBytesRead} (expected ~{d.ExpectedSpdSize})");
        Console.WriteLine($"  SPD_WD (controller):  {d.SpdWriteProtection}");
        Console.WriteLine($"  Module Manufacturer:  {d.ModuleManufacturer}");
        Console.WriteLine($"  Part Number:          {d.ModulePartNumber}");
        Console.WriteLine($"  Serial:               {d.ModuleSerialNumber}");
        Console.WriteLine($"  Capacity (GB):        {d.CapacityGb}");
        Console.WriteLine($"  Manufacturing Date:   {d.ModuleManufacturingDate}");
        Console.WriteLine($"  DRAM Manufacturer:    {d.DramManufacturer} ({d.DramManufacturerContinuation}/{d.DramManufacturerId})");
        Console.WriteLine($"  Rank:                 {d.Rank}");
        Console.WriteLine($"  Module Organization:  {d.ModuleOrganization}");
        Console.WriteLine($"  Raw HEX (prefix):");
        Console.WriteLine(Indent(d.RawHexPrefix ?? "", "    "));
        if (!string.IsNullOrEmpty(d.DumpFile))
            Console.WriteLine($"  Dump file:            {d.DumpFile}");
        if (!string.IsNullOrEmpty(d.Error))
            Console.WriteLine($"  ERROR:                {d.Error}");
    }

    private static string Indent(string text, string prefix) =>
        string.Join(Environment.NewLine, text.Split('\n').Select(l => prefix + l.TrimEnd('\r')));

    private static CrossCheckResult CrossCheck(PocReport report)
    {
        var expected = report.ExpectedCrossCheck;
        var result = new CrossCheckResult();

        if (report.Dimms.Count == 0)
        {
            result.Passed = false;
            result.Summary = "No SPD DIMMs read â€?cannot cross-check SMBIOS.";
            return result;
        }

        var mismatches = new List<string>();

        if (report.Dimms.Count != expected.Count)
            mismatches.Add($"DIMM count SPD={report.Dimms.Count} expected={expected.Count}");

        foreach (var d in report.Dimms)
        {
            if (!string.Equals(d.SpdGeneration, expected.Type, StringComparison.OrdinalIgnoreCase)
                && d.MemoryType?.Contains("DDR5", StringComparison.OrdinalIgnoreCase) != true)
            {
                mismatches.Add($"DIMM{d.Index} type={d.SpdGeneration}/{d.MemoryType} expected={expected.Type}");
            }

            if (d.CapacityGb is > 0 && d.CapacityGb != expected.CapacityGb)
                mismatches.Add($"DIMM{d.Index} capacity={d.CapacityGb}GB expected={expected.CapacityGb}GB");

            var mfr = d.ModuleManufacturer ?? "";
            if (!mfr.Contains(expected.Manufacturer, StringComparison.OrdinalIgnoreCase)
                && !mfr.Contains("Kingston", StringComparison.OrdinalIgnoreCase)
                && !mfr.Contains("0198", StringComparison.OrdinalIgnoreCase)) // Kingston JEDEC bank often mapped by name
            {
                // Soft fail only when we got a non-empty wrong name
                if (!string.IsNullOrWhiteSpace(mfr) && !mfr.StartsWith("<error", StringComparison.Ordinal))
                    mismatches.Add($"DIMM{d.Index} manufacturer='{mfr}' expected contains '{expected.Manufacturer}'");
            }

            var pn = d.ModulePartNumber ?? "";
            if (!string.IsNullOrWhiteSpace(pn)
                && !pn.StartsWith("<error", StringComparison.Ordinal)
                && !pn.Contains(expected.PartNumberContains, StringComparison.OrdinalIgnoreCase))
            {
                mismatches.Add($"DIMM{d.Index} PN='{pn}' expected contains '{expected.PartNumberContains}'");
            }
        }

        result.Mismatches = mismatches;
        result.Passed = mismatches.Count == 0;
        result.Summary = result.Passed
            ? $"SPD matches expected {expected.Count}Ã— {expected.Manufacturer} {expected.PartNumberContains} {expected.CapacityGb}GB {expected.Type}."
            : string.Join("; ", mismatches);
        return result;
    }

    private static void WriteReport(PocReport report, CliOptions options)
    {
        report.FinishedAtUtc ??= DateTime.UtcNow;
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        });
        File.WriteAllText(options.ReportPath, json);
    }
}

internal enum DriverChoice
{
    PawnIO,
    WinRing0,
}

internal sealed class CliOptions
{
    public DriverChoice Driver { get; init; } = DriverChoice.PawnIO;
    public int HexBytes { get; init; } = 64;
    public string ReportPath { get; init; } = "spd-poc-report.json";
    public string? DumpFile { get; init; }

    public static CliOptions Parse(string[] args)
    {
        var driver = DriverChoice.PawnIO;
        var hex = 64;
        string? dump = null;
        var report = "spd-poc-report.json";

        for (var i = 0; i < args.Length; i++)
        {
            var a = args[i];
            if (a is "--driver" or "-d" && i + 1 < args.Length)
            {
                var v = args[++i];
                driver = v.Equals("winring0", StringComparison.OrdinalIgnoreCase)
                    ? DriverChoice.WinRing0
                    : DriverChoice.PawnIO;
            }
            else if (a is "--hex" && i + 1 < args.Length)
                hex = int.Parse(args[++i]);
            else if (a is "--dump-file" && i + 1 < args.Length)
                dump = args[++i];
            else if (a is "--report" && i + 1 < args.Length)
                report = args[++i];
            else if (a is "--help" or "-h")
            {
                Console.WriteLine("spd-poc [--driver pawnio|winring0] [--hex 64] [--dump-file out.spd] [--report file.json]");
                Environment.Exit(0);
            }
        }

        return new CliOptions
        {
            Driver = driver,
            HexBytes = hex,
            DumpFile = dump,
            ReportPath = report,
        };
    }
}

internal sealed class PocReport
{
    public DateTime StartedAtUtc { get; set; }
    public DateTime? FinishedAtUtc { get; set; }
    public string? Machine { get; set; }
    public string? OsVersion { get; set; }
    public bool IsElevated { get; set; }
    public string? DriverRequested { get; set; }
    public string? DriverActual { get; set; }
    public bool DriverLoaded { get; set; }
    public MutexStatus? SmbusMutex { get; set; }
    public List<SmbusInfo> SmbusControllers { get; set; } = new();
    public List<DimmInfo> Dimms { get; set; } = new();
    public ExpectedModules? ExpectedCrossCheck { get; set; }
    public CrossCheckResult? CrossCheck { get; set; }
    public string? Outcome { get; set; }
    public string? Error { get; set; }
}

internal sealed class MutexStatus
{
    public string? Name { get; set; }
    public bool Acquired { get; set; }
    public bool CreatedNew { get; set; }
    public string? Message { get; set; }
}

internal sealed class SmbusInfo
{
    public string? Type { get; set; }
    public string? DeviceName { get; set; }
    public int PortId { get; set; }
    public ushort PciVendor { get; set; }
    public ushort PciDevice { get; set; }
    public ushort PciSubsystemVendor { get; set; }
    public ushort PciSubsystemDevice { get; set; }
    public bool HasSpdWriteProtection { get; set; }
}

internal sealed class DimmInfo
{
    public int Index { get; set; }
    public string? Address { get; set; }
    public byte AddressByte { get; set; }
    public string? BusType { get; set; }
    public string? SpdGeneration { get; set; }
    public string? MemoryType { get; set; }
    public string? SpdRevision { get; set; }
    public int SpdBytesRead { get; set; }
    public int ExpectedSpdSize { get; set; }
    public bool SpdWriteProtection { get; set; }
    public string? ModuleManufacturer { get; set; }
    public string? ModuleManufacturerContinuation { get; set; }
    public string? ModuleManufacturerId { get; set; }
    public string? ModulePartNumber { get; set; }
    public string? ModuleSerialNumber { get; set; }
    public string? ModuleManufacturingDate { get; set; }
    public double? CapacityGb { get; set; }
    public string? DramManufacturer { get; set; }
    public string? DramManufacturerContinuation { get; set; }
    public string? DramManufacturerId { get; set; }
    public string? Rank { get; set; }
    public string? ModuleOrganization { get; set; }
    public string? RawHexPrefix { get; set; }
    public string? DumpFile { get; set; }
    public bool ReadOk { get; set; }
    public string? Error { get; set; }
}

internal sealed class ExpectedModules
{
    public int Count { get; set; }
    public string? Manufacturer { get; set; }
    public string? PartNumberContains { get; set; }
    public int CapacityGb { get; set; }
    public string? Type { get; set; }
    public string? Board { get; set; }
    public string? Cpu { get; set; }
}

internal sealed class CrossCheckResult
{
    public bool Passed { get; set; }
    public string? Summary { get; set; }
    public List<string> Mismatches { get; set; } = new();
}

