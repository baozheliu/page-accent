import { createLogger } from '../logger.js'
import {
  FAVICON_CANVAS_SIZE,
  FAVICON_COMPOSE_OPTIONS,
  blobToDataUrl,
  paintFaviconMark,
} from '../../shared/favicon-compose.js'

const logger = createLogger('favicon-compose')

async function loadFaviconBitmap(faviconUrl) {
  const response = await fetch(faviconUrl, {
    credentials: 'omit',
    cache: 'force-cache',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch favicon: ${response.status}`)
  }

  const blob = await response.blob()
  return createImageBitmap(blob)
}

export async function composeFaviconDataUrl(faviconUrl, colorValue) {
  if (!faviconUrl || !colorValue) {
    throw new Error('Favicon composition requires a URL and color')
  }

  let imageBitmap = null

  try {
    imageBitmap = await loadFaviconBitmap(faviconUrl)

    const canvas = new OffscreenCanvas(FAVICON_CANVAS_SIZE, FAVICON_CANVAS_SIZE)
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Canvas is not available')
    }

    paintFaviconMark(ctx, imageBitmap, colorValue, FAVICON_COMPOSE_OPTIONS)

    const outputBlob = await canvas.convertToBlob({ type: 'image/png' })
    return blobToDataUrl(outputBlob)
  } finally {
    imageBitmap?.close?.()
  }
}

export async function composeFaviconDataUrlSafe(faviconUrl, colorValue) {
  try {
    return await composeFaviconDataUrl(faviconUrl, colorValue)
  } catch (error) {
    logger.warn('Failed to compose favicon mark', { faviconUrl, error })
    return null
  }
}
