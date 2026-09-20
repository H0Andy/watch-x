import { contextBridge, ipcRenderer } from 'electron'
import type { MetricsSnapshot } from '../src/shared/types'

contextBridge.exposeInMainWorld('watchx', {
  subscribe(callback: (snapshot: MetricsSnapshot) => void) {
    const listener = (_event: unknown, snapshot: MetricsSnapshot) => {
      callback(snapshot)
    }
    ipcRenderer.on('metrics:update', listener)
    ipcRenderer.send('metrics:start')
    return () => {
      ipcRenderer.removeListener('metrics:update', listener)
    }
  },
  restoreMain() {
    ipcRenderer.send('overlay:restore-main')
  },
  quitApp() {
    ipcRenderer.send('app:quit')
  },
})
