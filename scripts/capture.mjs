// Builds the app and runs it in "capture mode": the renderer walks a
// deterministic flow (import dir → open 2GB file → search → stats) while the
// main process snapshots a screenshot + memory reading at each stage into ./captures.
//
// Usage: node scripts/capture.mjs   (requires ./sample-logs to already exist)

import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'captures')
const demoDir = path.join(root, 'sample-logs')

if (!fs.existsSync(path.join(demoDir, 'app.log'))) {
  console.error('sample-logs/app.log not found. Run `npm run gen:logs` first.')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

console.log('Building app ...')
const build = spawnSync('npx', ['electron-vite', 'build'], { cwd: root, stdio: 'inherit', shell: true })
if (build.status !== 0) {
  console.error('Build failed.')
  process.exit(1)
}

console.log('Running capture flow ...')
const child = spawn(electronPath, ['.'], {
  cwd: root,
  env: {
    ...process.env,
    LOGLENS_CAPTURE_DIR: outDir,
    LOGLENS_DEMO_DIR: demoDir
  },
  stdio: 'inherit'
})

const timeout = setTimeout(() => {
  console.error('Capture timed out, killing app.')
  child.kill()
  process.exit(2)
}, 10 * 60 * 1000)

child.on('exit', (code) => {
  clearTimeout(timeout)
  console.log('Capture finished with exit code', code ?? 0)
  process.exit(code ?? 0)
})
