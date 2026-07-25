export const FAVICON_CANVAS_SIZE = 32
export const FAVICON_STRIPE_WIDTH = 6
export const FAVICON_STRIPE_GAP = 3

export const FAVICON_COMPOSE_OPTIONS = Object.freeze({
  size: FAVICON_CANVAS_SIZE,
  stripeWidth: FAVICON_STRIPE_WIDTH,
  stripeGap: FAVICON_STRIPE_GAP,
})

export function drawImageContained(ctx, image, x, y, width, height) {
  const sourceWidth = image.width || image.displayWidth || width
  const sourceHeight = image.height || image.displayHeight || height
  const scale = Math.min(width / sourceWidth, height / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  const offsetX = x + (width - drawWidth) / 2
  const offsetY = y + (height - drawHeight) / 2

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
}

export function paintFaviconMark(ctx, image, colorValue, options = FAVICON_COMPOSE_OPTIONS) {
  const { size, stripeWidth, stripeGap = 0 } = options
  const iconX = Math.min(size, stripeWidth + stripeGap)
  const iconWidth = Math.max(1, size - iconX)

  // Composite colors arrive as a comma-separated list and are painted as
  // stacked segments inside the stripe.
  const colors = String(colorValue)
    .split(',')
    .map(color => color.trim())
    .filter(Boolean)
  const segmentHeight = size / Math.max(1, colors.length)

  ctx.clearRect(0, 0, size, size)
  drawImageContained(ctx, image, iconX, 0, iconWidth, size)

  colors.forEach((color, index) => {
    ctx.fillStyle = color
    ctx.fillRect(0, Math.floor(index * segmentHeight), stripeWidth, Math.ceil(segmentHeight))
  })
}

export async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return `data:image/png;base64,${btoa(binary)}`
}
