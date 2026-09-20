using WatchX.SpdHelper;
using Xunit;

namespace WatchX.SpdHelper.Tests;

public class Ddr5OrganizationTests
{
    [Fact]
    public void Byte234_0x00_Is_1R()
    {
        var info = Ddr5Organization.DecodePackageRanks(0x00);
        Assert.Equal(1, info.Ranks);
        Assert.False(info.Asymmetric);
    }

    [Fact]
    public void Byte234_0x08_Is_2R()
    {
        // bits[5:3] = 001 → ranks = 2
        var info = Ddr5Organization.DecodePackageRanks(0x08);
        Assert.Equal(2, info.Ranks);
        Assert.False(info.Asymmetric);
    }

    [Fact]
    public void Byte234_0x48_Is_2R_Asymmetric()
    {
        // bit6 asymmetric + bits[5:3]=001
        var info = Ddr5Organization.DecodePackageRanks(0x48);
        Assert.Equal(2, info.Ranks);
        Assert.True(info.Asymmetric);
    }

    [Fact]
    public void Byte4_Is_Not_Rank_Field()
    {
        // Regression: POC initially misread byte4 0x04 as organization.
        // 0x04 as if it were byte234 would still decode as 1R (bits[5:3]=0),
        // but byte4 is density/package — decoder must only accept byte234.
        Assert.Equal(234, Ddr5Organization.ModuleOrganizationOffset);
        var mistaken = Ddr5Organization.DecodePackageRanks(0x04);
        Assert.Equal(1, mistaken.Ranks); // happens to be 1R, but wrong source byte
    }

    [Theory]
    [InlineData(0x00, 1)]
    [InlineData(0x08, 2)]
    [InlineData(0x10, 3)]
    [InlineData(0x18, 4)]
    [InlineData(0x38, 8)]
    public void Rank_Table(byte org, int ranks)
    {
        Assert.Equal(ranks, Ddr5Organization.DecodePackageRanks(org).Ranks);
    }
}
