import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { collectMetrics, warmup } from './metrics'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
let collectTimer: NodeJS.Timeout | null = null
let collecting = false
let metricsPublished = 0
let isQuitting = false

const OVERLAY_WIDTH = 168
const OVERLAY_HEIGHT = 92
const statusPath = path.join(app.getPath('userData'), 'watchx-bridge-status.json')

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'icon.png'),
  ]
  return candidates.find((file) => fs.existsSync(file))
}

function writeStatus(payload: Record<string, unknown>): void {
  try {
    fs.writeFileSync(statusPath, JSON.stringify({ ...payload, at: Date.now() }, null, 2))
  } catch (error) {
    console.error('Failed to write bridge status', error)
  }
}

function sendMetrics(snapshot: Awaited<ReturnType<typeof collectMetrics>>): void {
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('metrics:update', snapshot)
    }
  }
}

async function publishMetrics(): Promise<void> {
  if (collecting) return
  const hasListener =
    (mainWindow && !mainWindow.isDestroyed()) || (overlayWindow && !overlayWindow.isDestroyed())
  if (!hasListener) return

  collecting = true
  try {
    const snapshot = await collectMetrics()
    sendMetrics(snapshot)
    metricsPublished += 1
    if (metricsPublished === 1 || metricsPublished % 5 === 0) {
      writeStatus({
        ok: true,
        stage: 'metrics',
        metricsPublished,
        platform: snapshot.system.platform,
        cpu: {
          brand: snapshot.cpu.brand,
          usage: snapshot.cpu.usagePercent,
          temp: snapshot.cpu.temperatureC,
          power: snapshot.cpu.powerDrawW,
        },
        memory: { usage: snapshot.memory.usagePercent },
        gpus: snapshot.gpus.map((g) => ({
          model: g.model,
          usage: g.usagePercent,
          temp: g.temperatureC,
          power: g.powerDrawW,
        })),
      })
    }
  } catch (error) {
    console.error('Failed to collect metrics', error)
    writeStatus({ ok: false, stage: 'collect', error: String(error) })
  } finally {
    collecting = false
  }
}

function startCollector(): void {
  if (collectTimer) return
  void publishMetrics()
  collectTimer = setInterval(() => {
    void publishMetrics()
  }, 1000)
}

function resolvePreload(): string {
  const candidates = [
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'preload.mjs'),
    path.join(__dirname, 'preload.cjs'),
  ]
  const found = candidates.find((file) => fs.existsSync(file))
  if (!found) {
    writeStatus({ ok: false, stage: 'preload-missing', candidates })
    throw new Error(`Preload script not found in ${__dirname}`)
  }
  return found
}

function appContentUrl(overlay: boolean): { kind: 'url' | 'file'; target: string } {
  if (process.env.VITE_DEV_SERVER_URL) {
    const base = process.env.VITE_DEV_SERVER_URL.replace(/\/$/, '')
    return { kind: 'url', target: overlay ? `${base}/?overlay=1` : base }
  }
  return {
    kind: 'file',
    target: path.join(__dirname, '../dist/index.html'),
  }
}

function loadWindowContent(win: BrowserWindow, overlay: boolean): void {
  const content = appContentUrl(overlay)
  if (content.kind === 'url') {
    void win.loadURL(content.target)
  } else if (overlay) {
    void win.loadFile(content.target, { query: { overlay: '1' } })
  } else {
    void win.loadFile(content.target)
  }
}

function overlayPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workArea
  const { x: originX, y: originY } = display.workArea
  return {
    x: originX + width - OVERLAY_WIDTH - 16,
    y: originY + height - OVERLAY_HEIGHT - 16,
  }
}

function createOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) return

  const preload = resolvePreload()
  const icon = resolveAppIcon()
  const pos = overlayPosition()

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    icon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlayWindow.setAlwaysOnTop(true, 'floating')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  loadWindowContent(overlayWindow, true)

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

function showOverlay(): void {
  createOverlayWindow()
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const pos = overlayPosition()
  overlayWindow.setBounds({
    x: pos.x,
    y: pos.y,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  })
  if (!overlayWindow.isVisible()) overlayWindow.showInactive()
  startCollector()
}

function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide()
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  hideOverlay()
}

function ensureTray(): void {
  if (tray) return
  const iconPath = resolveAppIcon()
  const image = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()
  tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5Xo6UAAAAASUVORK5CYII=',
  ) : image.resize({ width: 16, height: 16 }))
  tray.setToolTip('Watch X')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开主界面',
        click: () => showMainWindow(),
      },
      {
        label: '显示桌面浮窗',
        click: () => showOverlay(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('double-click', () => showMainWindow())
}

function createWindow(): void {
  const preload = resolvePreload()
  const icon = resolveAppIcon()
  writeStatus({ ok: false, stage: 'starting', preload, dir: __dirname, icon: icon || null })

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#070708',
    autoHideMenuBar: true,
    show: false,
    icon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    startCollector()
    ensureTray()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    startCollector()
    void mainWindow?.webContents
      .executeJavaScript(`({
        hasWatchx: typeof window.watchx !== 'undefined',
        keys: window.watchx ? Object.keys(window.watchx) : [],
        href: location.href
      })`)
      .then((result) => {
        console.log('[watchx] bridge check', result)
        writeStatus({
          ok: Boolean(result?.hasWatchx),
          stage: 'did-finish-load',
          preload,
          result,
          statusPath,
        })
      })
      .catch((error) => {
        writeStatus({ ok: false, stage: 'bridge-eval', error: String(error), preload })
      })
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[watchx] preload-error', preloadPath, error)
    writeStatus({ ok: false, stage: 'preload-error', preloadPath, error: String(error) })
  })

  mainWindow.on('minimize', () => {
    showOverlay()
  })

  mainWindow.on('restore', () => {
    hideOverlay()
  })

  mainWindow.on('show', () => {
    if (!mainWindow?.isMinimized()) hideOverlay()
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
    ensureTray()
    showOverlay()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadWindowContent(mainWindow, false)
}

ipcMain.on('metrics:start', () => {
  startCollector()
})

ipcMain.on('overlay:restore-main', () => {
  showMainWindow()
})

ipcMain.on('app:quit', () => {
  isQuitting = true
  app.quit()
})

app.whenReady().then(async () => {
  await warmup()
  createWindow()
  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // Keep running in tray/overlay on Windows/Linux until explicit quit.
  if (process.platform === 'darwin') {
    // macOS: default hide behavior already handled via close preventDefault
  }
})

app.on('will-quit', () => {
  if (collectTimer) {
    clearInterval(collectTimer)
    collectTimer = null
  }
  tray?.destroy()
  tray = null
})
