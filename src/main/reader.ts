import { open } from 'fs/promises'
import type { LineIndex } from './indexer'

const MAX_LINE_BYTES = 1_000_000 // cap per-line bytes returned to the renderer

/**
 * Read a contiguous range of lines by their offsets. Reads a single byte range
 * from disk (not the whole file) and slices it into lines using the offset
 * index, so fetching 200 lines for the virtual scroller is cheap regardless of
 * the file's overall size.
 */
export async function readLines(
  index: LineIndex,
  start: number,
  count: number
): Promise<{ lines: string[]; truncated: boolean[] }> {
  const total = index.lineCount
  const from = Math.max(0, start)
  const to = Math.min(total, start + count)
  if (from >= to) return { lines: [], truncated: [] }

  const startOffset = index.offsets[from]
  const endOffset = to < total ? Number(index.offsets[to]) - 1 : index.fileSize
  const len = endOffset - startOffset
  if (len <= 0) return { lines: [], truncated: [] }

  const fh = await open(index.path, 'r')
  try {
    const buf = Buffer.allocUnsafe(len)
    const { bytesRead } = await fh.read(buf, 0, len, startOffset)

    const lines: string[] = []
    const truncated: boolean[] = []
    for (let j = 0; j < to - from; j++) {
      const lineNo = from + j
      const s = Number(index.offsets[lineNo]) - startOffset
      const e =
        lineNo + 1 < total
          ? Number(index.offsets[lineNo + 1]) - 1 - startOffset
          : bytesRead
      let byteLen = e - s
      const isTruncated = byteLen > MAX_LINE_BYTES
      if (isTruncated) byteLen = MAX_LINE_BYTES
      lines.push(buf.toString('utf8', s, s + byteLen))
      truncated.push(isTruncated)
    }
    return { lines, truncated }
  } finally {
    await fh.close()
  }
}
