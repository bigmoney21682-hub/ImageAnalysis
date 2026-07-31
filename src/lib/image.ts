/**
 * Diagnostic detail is fine and low-contrast — a subtle pneumothorax line is a
 * few pixels wide — so we keep more resolution than a typical upload would.
 * 2048px on the long edge is about where further pixels stop buying detectable
 * detail and just cost quota.
 */
const MAX_EDGE = 2048

/**
 * Higher than you would use for a photo, and deliberately so: JPEG blocking and
 * ringing around high-contrast edges is itself an imaging artifact, and this app
 * would then be asked to report on artifacts we introduced. 0.95 keeps the
 * re-encode below the noise floor of the original.
 */
const JPEG_QUALITY = 0.95

/**
 * A lossless source small enough to send as-is is sent as-is — no re-encode, no
 * introduced artifact. Most exported PNG screengrabs of a study land under this.
 */
const LOSSLESS_PASSTHROUGH_BYTES = 4 * 1024 * 1024

/**
 * History thumbnails live in localStorage, which is only a few MB in total.
 * 512px at quality 0.6 lands around 30KB each — small enough that a full history
 * is well under the budget, big enough to recognise the study at a glance.
 */
const THUMB_EDGE = 512
const THUMB_QUALITY = 0.6

export interface PreparedImage {
  /** Base64 payload with no data: prefix, ready for the API. */
  base64: string
  mimeType: string
  /** Object URL for previewing. Caller must revoke it. */
  previewUrl: string
  /** Small data: URL, cheap enough to keep in history alongside the report. */
  thumbnail: string
  width: number
  height: number
  bytes: number
  /** True when the pixels reached the model untouched. Surfaced in the UI so a
   *  reported compression artifact can be traced to its real source. */
  lossless: boolean
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  // from-image applies EXIF rotation, so phone photos of a lightbox or monitor
  // aren't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const thumbnail = makeThumbnail(canvas)

  // A lossless original that needed no downscale goes through untouched.
  const passthrough =
    scale === 1 &&
    file.size <= LOSSLESS_PASSTHROUGH_BYTES &&
    (file.type === 'image/png' || file.type === 'image/webp')

  const blob = passthrough
    ? file
    : await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      ).then((b) => {
        if (!b) throw new Error('Could not encode the image.')
        return b
      })

  return {
    base64: await blobToBase64(blob),
    mimeType: passthrough ? file.type : 'image/jpeg',
    previewUrl: URL.createObjectURL(blob),
    thumbnail,
    width,
    height,
    bytes: blob.size,
    lossless: passthrough,
  }
}

/** Downscales the already-prepared canvas; the source bitmap is closed by now. */
function makeThumbnail(source: HTMLCanvasElement): string {
  const scale = Math.min(1, THUMB_EDGE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  try {
    return canvas.toDataURL('image/jpeg', THUMB_QUALITY)
  } catch {
    // A thumbnail is a nicety — never fail the analysis over one.
    return ''
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/** Splits a stored thumbnail back into the parts an API call needs. */
export function splitDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = /^data:([^;,]+)[^,]*,(.*)$/s.exec(dataUrl)
  return match ? { mimeType: match[1], base64: match[2] } : null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
