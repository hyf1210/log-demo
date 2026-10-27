import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { CH } from '../shared/types'
import { registerIpcHandlers, cleanup } from './ipc'
import { dropAll } from './indexStore'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    title: 'LogLens',
    backgroundColor: '#0f141a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Capture mode: drive the UI through a deterministic flow and snapshot each stage.
  if (process.env.LOGLENS_CAPTURE_DIR) {
    win.webContents.on('did-finish-load', () => {
      const demoDir = process.env.LOGLENS_DEMO_DIR
      if (!demoDir) return
      const tryRun = (attempt: number) => {
        win!.webContents
          .executeJavaScript(`window.__loglensCapture(${JSON.stringify(demoDir)})`)
          .catch(() => {
            if (attempt < 20) setTimeout(() => tryRun(attempt + 1), 300)
          })
      }
      tryRun(0)
    })
  }

  win.on('closed', () => {
    win = null
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  registerCaptureHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cleanup()
  dropAll()
  if (process.platform !== 'darwin') app.quit()
})

// --- optional screenshot / memory capture harness ------------------------
// Enabled only when LOGLENS_CAPTURE_DIR is set (used by scripts/capture.mjs).
const memorySnapshots: { name: string; memory: ReturnType<typeof snapshotMemory> }[] = []

function snapshotMemory() {
  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10
  const kb = (n: number) => Math.round((n / 1024) * 10) / 10
  const main = process.memoryUsage()
  let total = 0
  const processes: { type: string; rssMB: number }[] = []
  try {
    // workingSetSize is reported in kilobytes by Electron
    for (const m of app.getAppMetrics()) {
      const ws = m.memory?.workingSetSize ?? 0
      total += ws
      processes.push({ type: m.type, rssMB: kb(ws) })
    }
  } catch {
    total = main.rss / 1024
  }
  return {
    mainRssMB: mb(main.rss),
    heapUsedMB: mb(main.heapUsed),
    totalRssMB: kb(total),
    processes
  }
}

function registerCaptureHandlers(): void {
  if (!process.env.LOGLENS_CAPTURE_DIR) return

  ipcMain.handle(CH.captureScreenshot, async (_e, name: string) => {
    if (!win) return
    const image = await win.webContents.capturePage()
    const outDir = process.env.LOGLENS_CAPTURE_DIR as string
    await writeFile(join(outDir, `${name}.png`), image.toPNG())
    memorySnapshots.push({ name, memory: snapshotMemory() })
    // Also dump the rendered text as a human-readable proof of what is on screen.
    try {
      const text = await win.webContents.executeJavaScript('document.body.innerText')
      await writeFile(join(outDir, `${name}.txt`), String(text))
    } catch {
      /* ignore */
    }
    try {
      const mem = await win.webContents.executeJavaScript(
        'JSON.stringify({jsHeap: performance.memory ? performance.memory.usedJSHeapSize : -1, domNodes: document.getElementsByTagName("*").length})'
      )
      await writeFile(join(outDir, `${name}.renderer.json`), String(mem))
    } catch {
      /* ignore */
    }
  })

  ipcMain.handle(CH.captureDone, async () => {
    const outDir = process.env.LOGLENS_CAPTURE_DIR as string
    await writeFile(
      join(outDir, 'memory.json'),
      JSON.stringify(memorySnapshots, null, 2)
    )
    app.quit()
  })
}
