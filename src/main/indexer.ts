import { open } from 'fs/promises'
import type { IndexProgress } from '../shared/types'
import { CancelledError, yieldToLoop, type TaskSignal } from './scan'

/**
 * An in-memory line-offset index for a single file.
 * Only byte offsets are stored (never file content), so opening a 2GB file
 * costs roughly `lineCount * 4` bytes (~40MB for 10M lines) rather than 2GB.
 */
export interface LineIndex {
  path: string
  fileSize: number
  offsets: Uint32Array | Float64Array
  lineCount: number
}

export interface BuildIndexOptions {
  signal?: TaskSignal
  chunkSize?: number
  onProgress?: (p: IndexProgress) => void
}

const F32_LIMIT = 0xffffffff // Uint32 max; offsets must stay below this (covers 4GB files)

/**
 * Scan the file once for newline bytes and record the byte offset of every
 * line start. Reads in fixed-size chunks and yields to the event loop between
 * chunks, so neither memory nor UI responsiveness is sacrificed.
 */
export async function buildLineIndex(
  filePath: string,
  fileSize: number,
  opts: BuildIndexOptions = {}
): Promise<LineIndex> {
  const chunkSize = opts.chunkSize ?? 8 * 1024 * 1024
  const signal = opts.signal

  const use32 = fileSize < F32_LIMIT
  let capacity = Math.max(1024, Math.ceil(fileSize / 64)) // assume avg 64 bytes/line
  let offsets: Uint32Array | Float64Array = use32
    ? new Uint32Array(capacity)
    : new Float64Array(capacity)
  let count = 0

  const grow = () => {
    const next = new (use32 ? Uint32Array : Float64Array)(capacity * 2)
    next.set(offsets as Uint32Array)
    offsets = next as never
    capacity *= 2
  }

  const fh = await open(filePath, 'r')
  const buf = Buffer.allocUnsafe(chunkSize)
  let pos = 0

  try {
    // Line 0 always starts at byte 0.
    if (fileSize > 0) {
      offsets[count++] = 0
    }

    while (pos < fileSize) {
      if (signal?.aborted) throw new CancelledError()
      const toRead = Math.min(chunkSize, fileSize - pos)
      const { bytesRead } = await fh.read(buf, 0, toRead, pos)
      if (bytesRead === 0) break

      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x0a) {
          if (count === capacity) grow()
          offsets[count++] = pos + i + 1
        }
      }

      pos += bytesRead
      opts.onProgress?.({ bytesScanned: pos, totalBytes: fileSize, linesFound: count, done: false })
      await yieldToLoop()
    }

    // Drop the trailing empty line if the file ends with a newline.
    let lineCount = count
    if (count > 0 && offsets[count - 1] === fileSize) lineCount = count - 1

    opts.onProgress?.({ bytesScanned: fileSize, totalBytes: fileSize, linesFound: lineCount, done: true })

    return { path: filePath, fileSize, offsets, lineCount }
  } finally {
    await fh.close()
  }
}
