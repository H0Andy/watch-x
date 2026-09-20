# Watch X

**跨平台硬件监控桌面应用**（Windows / macOS / Linux）：CPU、GPU、内存（含 Windows DDR5 SPD 识别）、温度、风扇、磁盘、网络、电池、进程；主窗口最小化后仍可用悬浮 HUD。

[![Release](https://img.shields.io/github/v/release/H0Andy/watch-x)](https://github.com/H0Andy/watch-x/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English README](README.md) · [下载 v1.0.0](https://github.com/H0Andy/watch-x/releases/tag/v1.0.0)

![Watch X 总览](docs/images/screenshot-overview.png)

## 解决什么问题？

很多监控工具会：

- 把 SMBIOS 营销文案当成内存“真实规格”
- 在证据不足时编造 DRAM 颗粒型号
- 安装过程还要联网下驱动/插件

Watch X 更强调 **读数诚实** 与 **Windows 离线安装**：

- 优先实测来源（SMBIOS、SPD、RAPL / Energy Meter）
- 证据不足时不填颗粒 Die
- Windows 安装包自带 helper / PawnIO，装机可不联网

## 核心特点

- 实时总览：CPU / 独显 GPU / 内存 / 温度风扇 / 磁盘网络 / 电池 / 进程
- Windows DDR5 SPD：JEDEC / XMP / EXPO 宣称配置（提升权限的 `spd-helper` + 官方 PawnIO，安装包内离线静默安装）
- CPU 整包功耗：可用时走 Energy Meter / RAPL
- 悬浮 HUD：最小化 / 关主窗后继续看关键指标
- Windows 离线自包含：Electron + 自带 .NET 运行时的 helper + 官方未修改 `PawnIO_setup.exe`

## 快速开始

### 直接下载（推荐）

1. 打开 [Releases](https://github.com/H0Andy/watch-x/releases/latest)
2. 按系统选择：
   - **Windows**：`WatchX-*-Setup-x64.exe` 或绿色版 `*-Portable-x64.exe`
   - **macOS**：`*-mac-arm64.dmg`（Apple Silicon）或 `*-mac-x64.dmg`（Intel）
   - **Linux**：`.AppImage` 或 `.deb`
3. 安装运行，无需账号

### 从源码开发

```bash
git clone https://github.com/H0Andy/watch-x.git
cd watch-x
npm install
npm run dev
```

Electron 下载慢时可设镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 打包安装包

Windows 安装包为**离线自包含**（用户装机可不联网）：

| 资源 | 说明 |
| --- | --- |
| Electron | 打进 Setup |
| `spd-helper.exe` | self-contained，用户无需装 .NET |
| `PawnIO_setup.exe` | 官方未修改安装包，NSIS 本地静默安装 |

```bash
npm run fetch:vendor   # 下载官方 PawnIO → vendor/PawnIO/
npm run dist:win
npm run dist:mac       # 需在 macOS
npm run dist:linux     # 需在 Linux
```

产物在 `release/`。也可用已发布的 [GitHub Release](https://github.com/H0Andy/watch-x/releases/tag/v1.0.0)。

### Windows 安装说明

1. 运行 `WatchX-*-Setup-x64.exe`（可离线）
2. 若本机尚无 PawnIO，安装过程会本地静默安装（可能 UAC）
3. 卸载 Watch X **不会**卸载 PawnIO（可能被其他工具共用）

### macOS / Linux

见英文 README [Platforms](README.md#platforms)。macOS 当前为未公证测试构建，首次打开可能需在「隐私与安全性」中允许。

## 数据诚实原则

- SPD 里的 XMP/EXPO **不等于** 当前运行时序
- DRAM **颗粒**无唯一证据时保持未知，不靠料号瞎填
- 读不到的传感器显示明确不可用，不造假数

## License

[MIT](LICENSE)

## 链接

- 仓库：https://github.com/H0Andy/watch-x
- 最新版本：https://github.com/H0Andy/watch-x/releases/latest
