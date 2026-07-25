function convexProfile(radius) {
  const edge = Math.max(0, (radius - 0.35) / 0.65)
  return edge * edge * (3 - 2 * edge)
}

function magnifyingProfile(radius) {
  const center = Math.sin(Math.min(radius / 0.78, 1) * Math.PI) * 0.36
  return Math.min(1, center + convexProfile(radius) * 0.82)
}

export function buildConvexLensMap(size = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const image = ctx.createImageData(size, size)
  const half = size / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - half) / half
      const dy = (y + 0.5 - half) / half
      const dist = Math.hypot(dx, dy) || 1e-6
      const radius = Math.min(dist, 1)
      const magnitude = magnifyingProfile(radius)
      const nx = (dx / dist) * magnitude
      const ny = (dy / dist) * magnitude
      const index = (y * size + x) * 4

      image.data[index] = Math.round(128 + nx * 127)
      image.data[index + 1] = Math.round(128 + ny * 127)
      image.data[index + 2] = 128
      image.data[index + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

export function buildCapsuleLensMap(width = 128, height = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const image = ctx.createImageData(width, height)
  const radius = height / 2

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const left = radius
      const right = width - radius
      let nx = 0
      let ny = 0
      let magnitude = 0

      if (px < left) {
        const dx = px - left
        const dy = py - radius
        const dist = Math.hypot(dx, dy) || 1e-6
        magnitude = convexProfile(Math.min(dist / radius, 1))
        nx = (dx / dist) * magnitude
        ny = (dy / dist) * magnitude
      } else if (px > right) {
        const dx = px - right
        const dy = py - radius
        const dist = Math.hypot(dx, dy) || 1e-6
        magnitude = convexProfile(Math.min(dist / radius, 1))
        nx = (dx / dist) * magnitude
        ny = (dy / dist) * magnitude
      } else {
        const topDist = py
        const bottomDist = height - py
        const edgeDist = Math.min(topDist, bottomDist)
        magnitude = convexProfile(1 - Math.min(edgeDist / radius, 1))

        if (topDist < bottomDist) {
          nx = 0
          ny = -magnitude
        } else {
          nx = 0
          ny = magnitude
        }
      }

      const index = (y * width + x) * 4
      image.data[index] = Math.round(128 + nx * 127)
      image.data[index + 1] = Math.round(128 + ny * 127)
      image.data[index + 2] = 128
      image.data[index + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
