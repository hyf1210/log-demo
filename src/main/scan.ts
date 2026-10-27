import { open } from 'fs/promises'

export class CancelledError extends Error {
  constructor() {
    super('operation cancelled')
    this.name = 'CancelledError'
  }
}

export interface TaskSignal {
  aborted: boolean
}

/** Yield to the event loop so the main process stays responsive between chunks. */
export function yieldToLoop(): Promise<void> {
  return new Promise((r) => setImmediate(r))
}

export interface LineInfo {
  index: number // 0-based line number
  text: string // decoded line text (capped at maxLineBytes)
  startOffset: number // absolute byte offset of line start
  truncated: boolean
}

export interface ForEachLineOptions {
  signal?: TaskSignal
  chunkSize?: number
  maxLineBytes?: number
  onProgress?: (bytesScanned: number) => void
}

/**
 * Stream a file in chunks and invoke `cb` for every line, without ever
 * loading the whole file into memory. A single line longer than maxLineBytes
 * is truncated (with `truncated: true`) so memory stays bounded even for
 * pathological inputs.
 */
export async function forEachLine(
  filePath: string,
  fileSize: number,
  cb: (line: LineInfo) => void,
  opts: ForEachLineOptions = {}
): Promise<{ lines: number }> {
  const chunkSize = opts.chunkSize ?? 8 * 1024 * 1024
  const maxLineBytes = opts.maxLineBytes ?? 4 * 1024 * 1024
  const signal = opts.signal
  const fh = await open(filePath, 'r')

  try {
    const buf = Buffer.allocUnsafe(chunkSize)
    let pos = 0
    let lineIndex = 0
    let carry: Buffer | null = null
    let carryStart = 0
    let carryTruncated = false

    const emit = (lineStartInChunk: number, newlinePos: number) => {
      const seg = newlinePos - lineStartInChunk
      let text: string
      let truncated: boolean
      let startOffset: number

      if (carry === null) {
        startOffset = pos + lineStartInChunk
        truncated = seg > maxLineBytes
        const take = truncated ? maxLineBytes : seg
        text = buf.toString('utf8', lineStartInChunk, lineStartInChunk + take)
      } else {
        startOffset = carryStart
        truncated = carryTruncated
        const head = carry.toString('utf8')
        const room = maxLineBytes - head.length
        const take = Math.max(0, Math.min(seg, room))
        if (seg > room) truncated = true
        const tail = buf.toString('utf8', lineStartInChunk, lineStartInChunk + take)
        text = head + tail
      }
      cb({ index: lineIndex++, text, startOffset, truncated })
      carry = null
      carryTruncated = false
    }

    while (pos < fileSize) {
      if (signal?.aborted) throw new CancelledError()
      const toRead = Math.min(chunkSize, fileSize - pos)
      const { bytesRead } = await fh.read(buf, 0, toRead, pos)
      if (bytesRead === 0) break

      let lineStart = 0
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x0a) {
          emit(lineStart, i)
          lineStart = i + 1
        }
      }

      const leftover = bytesRead - lineStart
      if (leftover > 0) {
        if (carry === null) {
          carryStart = pos + lineStart
          const take = Math.min(leftover, maxLineBytes)
          carry = Buffer.from(buf.subarray(lineStart, lineStart + take))
          carryTruncated = leftover > maxLineBytes
        } else if (carry.length < maxLineBytes) {
          const room = maxLineBytes - carry.length
          const take = Math.min(leftover, room)
          carry = Buffer.concat([carry, buf.subarray(lineStart, lineStart + take)])
          if (leftover > room) carryTruncated = true
        } else {
          carryTruncated = true
        }
      }

      pos += bytesRead
      opts.onProgress?.(pos)
      await yieldToLoop()
    }

    if (carry !== null) {
      cb({ index: lineIndex++, text: carry.toString('utf8'), startOffset: carryStart, truncated: carryTruncated })
    }

    return { lines: lineIndex }
  } finally {
    await fh.close()
  }
}
