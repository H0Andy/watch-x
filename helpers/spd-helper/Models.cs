using System.Text.Json.Serialization;

namespace WatchX.SpdHelper;

public sealed class SpdHelperEnvelope
{
    public int SchemaVersion { get; set; }
    public string Command { get; set; } = "scan";
    public DateTime StartedAtUtc { get; set; }
    public DateTime? FinishedAtUtc { get; set; }
    public bool Elevated { get; set; }
    /// <summary>available | unavailable | permission-required | busy | unsupported | read-error</summary>
    public string Status { get; set; } = "unavailable";
    public string? Detail { get; set; }
    public string? Driver { get; set; }
    public string? Error { get; set; }
    public List<SpdControllerInfo> Controllers { get; set; } = new();
    public List<SpdModuleDto> Modules { get; set; } = new();
}

public sealed class SpdControllerInfo
{
    public string? Type { get; set; }
    public string? DeviceName { get; set; }
    public int PciVendor { get; set; }
    public int PciDevice { get; set; }
    public bool SpdWriteProtection { get; set; }
}

/// <summary>Parsed SPD module — no SMBus write fields.</summary>
public sealed class SpdModuleDto
{
    public string? SpdAddress { get; set; }
    public int SpdAddressByte { get; set; }
    public int SpdSize { get; set; }
    public string? MemoryType { get; set; }
    public string? SpdRevision { get; set; }
    public string? ModuleManufacturer { get; set; }
    public string? ModulePartNumber { get; set; }
    public string? ModuleSerialNumber { get; set; }
    public string? DramManufacturer { get; set; }
    public string? DramManufacturerContinuation { get; set; }
    public string? DramManufacturerId { get; set; }
    public double? CapacityGb { get; set; }
    public int? Rank { get; set; }
    public bool? RankAsymmetric { get; set; }
    public string? RankSource { get; set; }
    public int? RawOrganization { get; set; }
    public int? RawDensityPackage { get; set; }
    public string? BusType { get; set; }
    public bool SpdWriteProtection { get; set; }
    public string? RawFile { get; set; }
    /// <summary>Full SPD image for main-process parsers. Stripped before renderer.</summary>
    public string? RawBase64 { get; set; }

    // Reserved for later phases — always null in schema for clarity
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public object? JedecProfiles { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public object? XmpProfiles { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public object? ExpoProfiles { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public object? Timings { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public object? Pmic { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public object? SpdHub { get; set; }
}
