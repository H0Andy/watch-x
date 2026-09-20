namespace WatchX.SpdHelper;

/// <summary>
/// JESD400-5 DDR5 SPD decoding (read-only helpers).
/// Package ranks live in <b>byte 234</b>, bits [5:3], value is 0-based (ranks = 1 + code).
/// Byte 4 is First SDRAM density/package — NOT module rank organization.
/// </summary>
public static class Ddr5Organization
{
    public const int ModuleOrganizationOffset = 234;

    public readonly record struct PackageRankInfo(int Ranks, bool Asymmetric, byte Raw);

    public static PackageRankInfo DecodePackageRanks(byte byte234)
    {
        var ranks = 1 + ((byte234 >> 3) & 0x7);
        var asymmetric = ((byte234 >> 6) & 0x1) == 1;
        return new PackageRankInfo(ranks, asymmetric, byte234);
    }
}
