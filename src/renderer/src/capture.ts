import { getState, loadDir, openFile, runSearch, runStats, setSearchQuery } from './store'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Screenshot / memory capture flow, driven by the main process in capture mode
 * (see scripts/capture.mjs). Walks the real UI through: import directory →
 * open largest file (index 2GB) → keyword search → statistics, capturing a
 * screenshot + memory snapshot at each stage.
 */
export function installCaptureHook(): void {
  ;(window as unknown as { __loglensCapture?: (dir: string) => Promise<void> }).__loglensCapture =
    async (demoDir: string) => {
      try {
        await loadDir(demoDir)
        await sleep(700)
        await window.loglens.captureScreenshot('01-directory-imported')

        const files = getState().files
        if (files.length === 0) {
          await window.loglens.captureDone()
          return
        }
        const largest = files.reduce((a, b) => (a.size >= b.size ? a : b))

        await openFile(largest.path)
        await sleep(700)
        await window.loglens.captureScreenshot('02-log-viewer')

        // scroll deep into the file to prove every line is reachable
        const scroller = document.querySelector('.log-scroll') as HTMLElement | null
        if (scroller) scroller.scrollTop = scroller.scrollHeight * 0.85
        await sleep(700)
        await window.loglens.captureScreenshot('03-deep-line')

        setSearchQuery({ keyword: 'error' })
        await runSearch()
        await sleep(700)
        await window.loglens.captureScreenshot('04-search')

        await runStats()
        await sleep(900)
        await window.loglens.captureScreenshot('05-stats')

        await window.loglens.captureDone()
      } catch (e) {
        console.error('capture flow failed', e)
        try {
          await window.loglens.captureDone()
        } catch {
          /* ignore */
        }
      }
    }
}
