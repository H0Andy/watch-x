using System.Security.Principal;
using System.Text.Json;
using RAMSPDToolkit.I2CSMBus;
using RAMSPDToolkit.SPD;
using RAMSPDToolkit.SPD.Interop.Shared;
using RAMSPDToolkit.Windows.Driver;
using RAMSPDToolkit.Windows.Driver.Implementations;

var elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
Console.WriteLine($"Elevated={elevated}");
var ok = DriverManager.LoadDriver(DriverImplementation.PawnIO);
Console.WriteLine($"LoadDriver={ok}");
SMBusManager.DetectSMBuses();
Console.WriteLine($"SMBuses={SMBusManager.RegisteredSMBuses.Count}");
var modules = new List<object>();
foreach (var bus in SMBusManager.RegisteredSMBuses)
{
  for (byte addr = SPDConstants.SPD_BEGIN; addr <= SPDConstants.SPD_END; addr++)
  {
    if (!DDR5Accessor.IsAvailable(bus, addr)) continue;
    var spd = new DDR5Accessor(bus, addr);
    var raw = new byte[1024];
    for (ushort off = 0; off < 1024; off = (ushort)(off + 128))
    {
      var c = spd.At(off, 128);
      if (c == null) break;
      Array.Copy(c, 0, raw, off, Math.Min(c.Length, 1024 - off));
    }
    var b234 = raw[234];
    var ranks = 1 + ((b234 >> 3) & 7);
    var m = new {
      address = $"0x{addr:X2}",
      pn = spd.ModulePartNumber()?.Trim(),
      serial = spd.ModuleSerialNumber()?.Trim(),
      dram = spd.GetDRAMManufacturerString(),
      byte4 = $"0x{raw[4]:X2}",
      byte6 = $"0x{raw[6]:X2}",
      byte234 = $"0x{b234:X2}",
      ranks,
      asymmetric = ((b234 >> 6) & 1) == 1,
      bytes = raw.Count(x => true)
    };
    modules.Add(m);
    Console.WriteLine(JsonSerializer.Serialize(m));
  }
}
File.WriteAllText(@"C:\Users\leizi\Documents\watch_x\tools\spd-poc\elev-byte234.json", JsonSerializer.Serialize(modules, new JsonSerializerOptions{WriteIndented=true}));
if (DriverManager.Driver != null) DriverManager.UnloadDriver();
