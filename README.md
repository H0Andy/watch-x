# Watch X

跨平台系统监控桌面应用，支持 **Windows / macOS / Linux** 安装与卸载。

## Logo / 图标

品牌图标为石墨底 + 香槟金仪表盘，资源位于：

- `build/logo-source.png` — 原始 Logo
- `build/icon.png` — 1024×1024
- `build/icon.ico` — Windows
- `build/icon.icns` — macOS
- `build/icons/*.png` — Linux 多尺寸
- `src/assets/icon-128.png` — 应用内侧栏

重新生成图标：

```bash
npm run icons
```

## 监控指标

**基础**：CPU、GPU（独立显卡）、内存、温度、风扇  
**额外**：磁盘、网络、电池/电源、进程、显示器、开机时长、主板型号

## macOS：Intel + Apple Silicon

| 检测 | 架构 | 传感器包 |
| --- | --- | --- |
| `darwin` + `arm64` | Apple Silicon | `macos-temperature-sensor` |
| `darwin` + `x64` | Intel Mac | `osx-temperature-sensor` |

## 开发

```bash
npm install
npm run dev
```

Electron 下载慢时可设镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 打包安装包

```bash
npm run dist:win     # Windows（本机可执行）
npm run dist:mac     # 需在 macOS 上执行
npm run dist:linux   # 需在 Linux 上执行
```

产物目录：`release/`

| 平台 | 安装包 | 卸载方式 |
| --- | --- | --- |
| Windows | `WatchX-*-Setup-x64.exe`（NSIS） | 「设置 → 应用」或开始菜单卸载程序；也可运行安装目录下的 `Uninstall Watch X.exe` |
| Windows | `WatchX-*-Portable-x64.exe` | 绿色版，删除文件即可 |
| macOS | `WatchX-*-mac-*.dmg` | 打开 DMG，拖到 Applications；卸载时从启动台/应用程序移到废纸篓 |
| macOS | `.zip` | 解压即用，删除 App 即可 |
| Linux | `.deb` | `sudo apt remove watch-x` 或软件中心卸载 |
| Linux | `.AppImage` | `chmod +x` 后运行；卸载即删除该文件 |

### Windows 安装说明

1. 运行 `WatchX-*-Setup-x64.exe`
2. 可选安装路径、桌面快捷方式、开始菜单
3. 卸载：Windows「已安装的应用」里找到 **Watch X** → 卸载  
   （electron-builder 会写入标准卸载项与卸载程序）

### macOS 安装说明

1. 打开 DMG
2. 将 **Watch X** 拖到 **Applications**
3. 首次打开若提示未验证：系统设置 → 隐私与安全性 → 仍要打开  
4. 正式分发需 Apple 开发者账号签名/公证（当前配置为本地/测试分发）

### Linux 安装说明

```bash
# deb
sudo dpkg -i WatchX-*-linux-x64.deb
sudo apt remove watch-x

# AppImage
chmod +x WatchX-*-linux-x64.AppImage
./WatchX-*-linux-x64.AppImage
```

## 说明

- Windows GPU 详细数据优先 `nvidia-smi`；主板 Intel 核显默认不展示
- 部分温度/风扇依赖驱动与权限，读不到会显示明确文案而不是假数据
- 进程列表约每 2 秒采样一次
