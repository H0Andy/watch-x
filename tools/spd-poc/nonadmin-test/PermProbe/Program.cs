using System.Security.Principal;
using System.Text.Json;
using RAMSPDToolkit.I2CSMBus;
using RAMSPDToolkit.SPD;
using RAMSPDToolkit.SPD.Interop.Shared;
using RAMSPDToolkit.Windows.Driver;
using RAMSPDToolkit.Windows.Driver.Implementations;

var elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
Console.WriteLine($"Elevated={elevated}");
Console.WriteLine($"User={Environment.UserName}");

var result = new Dictionary<string, object?> {
  ["elevated"] = elevated,
  ["pawnioLoad"] = false,
  ["smbusCount"] = 0,
  ["dimmCount"] = 0,
  ["bytesRead"] = 0,
  ["error"] = null,
};

try
{
    var ok = DriverManager.LoadDriver(DriverImplementation.PawnIO);
    result["pawnioLoad"] = ok;
    Console.WriteLine($"PawnIO LoadDriver={ok} Driver={DriverManager.DriverImplementation}");
    if (!ok)
    {
        result["error"] = "LoadDriver returned false";
        Console.WriteLine("FAIL: cannot open PawnIO as current user");
    }
    else
    {
        SMBusManager.DetectSMBuses();
        result["smbusCount"] = SMBusManager.RegisteredSMBuses.Count;
        Console.WriteLine($"SMBuses={SMBusManager.RegisteredSMBuses.Count}");
        var bytes = 0;
        var dimms = 0;
        foreach (var bus in SMBusManager.RegisteredSMBuses)
        {
            Console.WriteLine($"Bus {bus.GetType().Name} name={bus.DeviceName} SPD_WD={bus.HasSPDWriteProtection}");
            for (byte addr = SPDConstants.SPD_BEGIN; addr <= SPDConstants.SPD_END; addr++)
            {
                if (!DDR5Accessor.IsAvailable(bus, addr)) continue;
                dimms++;
                var spd = new DDR5Accessor(bus, addr);
                var chunk = spd.At(0, 128);
                var n = chunk?.Length ?? 0;
                // try full dump loop
                var total = 0;
                for (ushort off = 0; off < 1024; off = (ushort)(off + 128))
                {
                    var c = spd.At(off, 128);
                    if (c == null || c.Length == 0) break;
                    total += c.Length;
                }
                bytes = Math.Max(bytes, total);
                Console.WriteLine($"DIMM 0x{addr:X2} PN={spd.ModulePartNumber()?.Trim()} bytes={total}");
            }
        }
        result["dimmCount"] = dimms;
        result["bytesRead"] = bytes;
        Console.WriteLine(dimms > 0 && bytes >= 1024 ? "RESULT: non-admin READ OK" : dimms > 0 ? "RESULT: partial read" : "RESULT: no DIMMs");
    }
}
catch (Exception ex)
{
    result["error"] = ex.ToString();
    Console.WriteLine("EXCEPTION: " + ex.Message);
}
finally
{
    try { if (DriverManager.Driver != null) DriverManager.UnloadDriver(); } catch {}
}

var path = @"C:\Users\leizi\Documents\watch_x\tools\spd-poc\nonadmin-perm-result.json";
File.WriteAllText(path, JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine("Wrote " + path);
return (bool)result["pawnioLoad"]! && (int)result["dimmCount"]! > 0 ? 0 : 10;
