// Generates a set of multi-format sample log files for testing LogLens.
// Sizes are overridable via env vars so you can produce a quick small set
// for development or the full 2GB set for the memory demonstration.
//
//   LOG_DIR        output directory (default ./sample-logs)
//   LOG_MAIN_MB    size of app.log (default 2048)
//   LOG_ACCESS_MB  size of access.log (default 200)
//   LOG_JSON_MB    size of service.json.log (default 50)
//   LOG_ERRORS_MB  size of errors.log (default 50)
//   LOG_SMALL_MB   size of debug-small.log (default 5)
//
// Usage:
//   node scripts/generate-logs.mjs              # full 2GB set
//   LOG_MAIN_MB=64 node scripts/generate-logs.mjs  # quick 64MB dev set

import fs from 'node:fs'
import path from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = process.env.LOG_DIR || path.resolve(__dirname, '..', 'sample-logs')

// Deterministic PRNG so generated files are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n, w = 2) => String(n).padStart(w, '0')
function fmt(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
}

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
// weighted level distribution
function pickLevel(r) {
  const n = r()
  if (n < 0.05) return 'TRACE'
  if (n < 0.28) return 'DEBUG'
  if (n < 0.86) return 'INFO'
  if (n < 0.95) return 'WARN'
  if (n < 0.99) return 'ERROR'
  return 'FATAL'
}

const SERVICES = ['order-service', 'user-service', 'payment-service', 'inventory-service', 'gateway']
const CLASSES = ['OrderService', 'UserService', 'PaymentGateway', 'InventoryService', 'AuthFilter']
const IPS = () => `${1 + Math.floor(Math.random() * 223)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`

const ERROR_TEMPLATES = [
  (r) => `Failed to connect to database at db-${Math.floor(r() * 20)}.internal:${3306 + Math.floor(r() * 10)} - connection refused`,
  (r) => `NullPointerException at com.example.${CLASSES[Math.floor(r() * CLASSES.length)]}.process(Class.java:${Math.floor(r() * 800)})`,
  (r) => `TimeoutException: request to ${SERVICES[Math.floor(r() * SERVICES.length)]} exceeded ${1000 + Math.floor(r() * 9000)}ms`,
  (r) => `OutOfMemoryError: Java heap space at java.util.ArrayList.grow(ArrayList.java:${Math.floor(r() * 500)})`,
  (r) => `FileNotFoundException: /var/data/shard-${Math.floor(r() * 64)}/segment.bin (No such file or directory)`,
  (r) => `SocketTimeoutException: read timed out after ${1000 + Math.floor(r() * 5000)}ms`,
  (r) => `SQLException: ORA-0${Math.floor(r() * 9)}${Math.floor(r() * 9)}${Math.floor(r() * 9)}: deadlock detected`,
  (r) => `ConnectionPoolExhausted: no available connections in pool size=${50 + Math.floor(r() * 50)}`
]
const INFO_TEMPLATES = [
  () => `request completed status=200 latency=${Math.floor(Math.random() * 500)}ms`,
  () => `cache hit key=user:${Math.floor(Math.random() * 100000)}`,
  () => `task scheduled queue=batch-worker`,
  () => `heartbeat ok node=n-${Math.floor(Math.random() * 32)}`,
  () => `config reloaded source=etcd`,
  () => `order ${Math.floor(Math.random() * 1000000)} created`
]
const DEBUG_TEMPLATES = [
  () => `processing payload size=${Math.floor(Math.random() * 65536)}`,
  () => `query plan optimized rows=${Math.floor(Math.random() * 10000)}`,
  () => `acquired lock key=tx-${Math.floor(Math.random() * 999999)}`
]

function makeAppLine(r, t, i) {
  const level = pickLevel(r)
  const svc = SERVICES[Math.floor(r() * SERVICES.length)]
  let msg
  if (level === 'ERROR' || level === 'FATAL') msg = ERROR_TEMPLATES[Math.floor(r() * ERROR_TEMPLATES.length)](r)
  else if (level === 'INFO') msg = INFO_TEMPLATES[Math.floor(r() * INFO_TEMPLATES.length)]()
  else if (level === 'DEBUG') msg = DEBUG_TEMPLATES[Math.floor(r() * DEBUG_TEMPLATES.length)]()
  else msg = `worker event id=${Math.floor(r() * 1e6)}`
  return `[${fmt(t)}] ${level.padEnd(5)} com.example.${svc} - ${msg}`
}

function makeAccessLine(r, t) {
  const method = ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(r() * 4)]
  const code = [200, 200, 200, 201, 301, 304, 404, 500][Math.floor(r() * 8)]
  const bytes = Math.floor(r() * 100000)
  return `${IPS()} - - [${fmt(t).replace(' ', ':')} +0800] "${method} /api/v${Math.floor(r() * 3)}/resource/${Math.floor(r() * 1000)} HTTP/1.1" ${code} ${bytes}`
}

function makeJsonLine(r, t) {
  const level = pickLevel(r)
  const msg =
    level === 'ERROR'
      ? ERROR_TEMPLATES[Math.floor(r() * ERROR_TEMPLATES.length)](r)
      : `operation ${['read', 'write', 'delete', 'update'][Math.floor(r() * 4)]} ok`
  return JSON.stringify({ ts: new Date(t).toISOString(), level, thread: `pool-${Math.floor(r() * 8)}`, msg, traceId: `${(Math.random() * 1e15).toString(16)}` })
}

function makeErrorLine(r, t) {
  const level = 'ERROR'
  const msg = ERROR_TEMPLATES[Math.floor(r() * ERROR_TEMPLATES.length)](r)
  const lines = [`${fmt(t)} ${level} com.example.${CLASSES[Math.floor(r() * CLASSES.length)]} - ${msg}`]
  if (r() < 0.8) {
    const frames = 2 + Math.floor(r() * 5)
    for (let k = 0; k < frames; k++) {
      lines.push(`    at com.example.${CLASSES[Math.floor(r() * CLASSES.length)]}.invoke(Method.java:${Math.floor(r() * 900)})`)
    }
  }
  return lines.join('\n')
}

async function generate(filePath, totalBytes, makeLine, seed) {
  const r = mulberry32(seed)
  const stream = fs.createWriteStream(filePath)
  const base = Date.UTC(2024, 0, 15, 0, 0, 0)
  const DAY = 24 * 3600 * 1000
  const BATCH_BYTES = 4 * 1024 * 1024
  let t = base + r() * DAY
  let written = 0
  let i = 0
  let batch = []
  let batchBytes = 0

  const flush = async () => {
    const chunk = batch.join('\n') + '\n'
    if (!stream.write(chunk)) await once(stream, 'drain')
    written += Buffer.byteLength(chunk)
    batch = []
    batchBytes = 0
  }

  while (written < totalBytes) {
    t += Math.floor(r() * 2000) // advance 0-2s per line
    if (t >= base + DAY) t = base + (t - base) % DAY
    const line = makeLine(r, t, i++)
    batch.push(line)
    batchBytes += line.length + 1
    if (batchBytes >= BATCH_BYTES) await flush()
  }
  if (batch.length) await flush()

  stream.end()
  await once(stream, 'finish')
  return i
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const specs = [
    { name: 'app.log', mb: Number(process.env.LOG_MAIN_MB || 2048), make: makeAppLine, seed: 12345 },
    { name: 'access.log', mb: Number(process.env.LOG_ACCESS_MB || 200), make: makeAccessLine, seed: 23456 },
    { name: 'service.json.log', mb: Number(process.env.LOG_JSON_MB || 50), make: makeJsonLine, seed: 34567 },
    { name: 'errors.log', mb: Number(process.env.LOG_ERRORS_MB || 50), make: makeErrorLine, seed: 45678 },
    { name: 'debug-small.log', mb: Number(process.env.LOG_SMALL_MB || 5), make: makeAppLine, seed: 56789 }
  ]

  console.log(`Output directory: ${OUT_DIR}`)
  for (const spec of specs) {
    const filePath = path.join(OUT_DIR, spec.name)
    const totalBytes = spec.mb * 1024 * 1024
    process.stdout.write(`Generating ${spec.name} (${spec.mb} MB) ... `)
    const start = Date.now()
    const lines = await generate(filePath, totalBytes, spec.make, spec.seed)
    const secs = ((Date.now() - start) / 1000).toFixed(1)
    const actual = (fs.statSync(filePath).size / 1048576).toFixed(1)
    console.log(`done: ${actual} MB, ${lines.toLocaleString()} lines, ${secs}s`)
  }
  console.log('All files generated.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
