import {
  ExtensionMessage,
  createExtensionMessage,
  sendRuntimeMessage,
} from '../messaging.js'
import { getMarkColor } from '../../shared/tab-marks.js'
import { DEFAULT_SETTINGS } from '../../shared/settings.js'

const MARK_LINE_ID = 'tab-finder-page-line'
const MARK_STYLE_ID = 'tab-finder-page-line-style'
const CORNER_BADGE_ID = 'tab-finder-corner-badge'
const CORNER_BADGE_STYLE_ID = 'tab-finder-corner-badge-style'
const LEGACY_MARK_ROOT_ID = 'tab-finder-page-mark'
const LEGACY_MARK_STYLE_ID = 'tab-finder-page-mark-style'
const FAVICON_MARK_ATTRIBUTE = 'data-tab-finder-favicon-mark'
const FAVICON_REAPPLY_DELAY = 120
const PAGE_LINE_REAPPLY_DELAY = 80
const CORNER_BADGE_REAPPLY_DELAY = 80

let lastSyncedHref = ''
let syncTimer = null
let originalFaviconHref = ''
let activeFaviconColor = ''
let currentFaviconColor = ''
let currentFaviconDataUrl = ''
let faviconUpdateToken = 0
let faviconMutationTimer = null
let faviconObserver = null
let headReadyObserver = null
let activeLineColor = null
let activeLineSettings = null
let activeCornerPayload = null
let pageLineReapplyTimer = null
let cornerBadgeReapplyTimer = null

function removeLegacyPageMark() {
  document.getElementById(LEGACY_MARK_ROOT_ID)?.remove()
  document.getElementById(LEGACY_MARK_STYLE_ID)?.remove()
}

function removePageLine() {
  document.getElementById(MARK_LINE_ID)?.remove()
  document.getElementById(MARK_STYLE_ID)?.remove()
}

function removeCornerBadge() {
  document.getElementById(CORNER_BADGE_ID)?.remove()
  document.getElementById(CORNER_BADGE_STYLE_ID)?.remove()
}

function rgbaFromHex(hex, alpha = 1) {
  const normalized = String(hex || '').trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized)

  if (!match) return `rgba(0, 113, 227, ${alpha})`

  const value = parseInt(match[1], 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getColorStripes(color) {
  const stripes = Array.isArray(color?.stripes) ? color.stripes.filter(Boolean) : []
  return stripes.length >= 2 ? stripes : [color?.value || '#0071E3']
}

/** Line fill with translucency so the liquid-glass backdrop shows through. */
function buildLineFill(color, position, alpha = 0.82) {
  const stripes = getColorStripes(color)

  if (stripes.length === 1) return rgbaFromHex(stripes[0], alpha)

  const direction = position === 'left' || position === 'right' ? '180deg' : '90deg'
  const step = 100 / stripes.length
  const stops = stripes
    .map((stripe, index) => (
      `${rgbaFromHex(stripe, alpha)} ${index * step}% ${(index + 1) * step}%`
    ))
    .join(', ')

  return `linear-gradient(${direction}, ${stops})`
}

/**
 * Star drift choreography for the corner "flowing sand" effect.
 * Positions are percentages inside the badge box; stars fall slowly along the
 * glow arc, twinkling as they drift. Values are fixed so re-applies are stable.
 */
const CORNER_STARS = Object.freeze([
  { x: 22, y: 18, size: 7, delay: 0, duration: 9.5, drift: 46 },
  { x: 30, y: 30, size: 5, delay: 1.6, duration: 8, drift: 38 },
  { x: 24, y: 42, size: 4, delay: 3.4, duration: 10.5, drift: 52 },
  { x: 34, y: 22, size: 6, delay: 4.8, duration: 9, drift: 42 },
  { x: 27, y: 27, size: 3.5, delay: 2.2, duration: 7.5, drift: 34 },
  { x: 36, y: 36, size: 4.5, delay: 5.6, duration: 11, drift: 48 },
  { x: 20, y: 33, size: 3, delay: 6.8, duration: 8.5, drift: 40 },
  { x: 31, y: 15, size: 5.5, delay: 8, duration: 10, drift: 44 },
])

const CORNER_STAR_ACCENTS = Object.freeze(['#FFD86B', '#7DD3FC', '#F9A8D4', '#C4B5FD', '#86EFAC'])

function ensureCornerBadgeStyle() {
  let style = document.getElementById(CORNER_BADGE_STYLE_ID)
  const styleContainer = document.head || document.documentElement

  if (!style && styleContainer) {
    style = document.createElement('style')
    style.id = CORNER_BADGE_STYLE_ID
    style.textContent = `
      #${CORNER_BADGE_ID} {
        position: fixed;
        top: -100px;
        left: -100px;
        z-index: 2147483646;
        width: 500px;
        height: 400px;
        pointer-events: none;
        background: var(--tf-corner-glow);
        transform-origin: top left;
        animation: tab-finder-corner-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1);
      }

      #${CORNER_BADGE_ID} .tf-corner-star {
        position: absolute;
        top: 0;
        left: 0;
        width: var(--tf-star-size);
        height: var(--tf-star-size);
        background: var(--tf-star-color);
        clip-path: polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%);
        opacity: 0;
        filter: drop-shadow(0 0 3px var(--tf-star-color));
        will-change: transform, opacity;
        animation: tab-finder-star-drift var(--tf-star-duration) linear var(--tf-star-delay) infinite;
      }

      @keyframes tab-finder-corner-enter {
        from {
          opacity: 0;
          transform: scale(0.6);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes tab-finder-star-drift {
        0% {
          opacity: 0;
          transform: translate(var(--tf-star-from-x), var(--tf-star-from-y)) scale(0.4) rotate(0deg);
        }
        18% {
          opacity: 0.85;
          transform: translate(
            calc(var(--tf-star-from-x) + var(--tf-star-drift) * 0.18),
            calc(var(--tf-star-from-y) + var(--tf-star-drift) * 0.24)
          ) scale(1) rotate(32deg);
        }
        45% {
          opacity: 0.35;
        }
        62% {
          opacity: 0.7;
        }
        100% {
          opacity: 0;
          transform: translate(
            calc(var(--tf-star-from-x) + var(--tf-star-drift)),
            calc(var(--tf-star-from-y) + var(--tf-star-drift) * 1.35)
          ) scale(0.3) rotate(120deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #${CORNER_BADGE_ID} .tf-corner-star {
          animation: none;
          opacity: 0.4;
          transform: translate(var(--tf-star-from-x), var(--tf-star-from-y));
        }
      }
    `
    styleContainer.append(style)
  } else if (style && styleContainer && style.parentElement !== styleContainer) {
    styleContainer.append(style)
  }

  return style
}

function buildCornerGlow(color) {
  // Always use the solid primary color — composite marks keep a single-hue glow.
  const solid = color?.value || '#0071E3'

  return `radial-gradient(ellipse at 20% 25%, ${rgbaFromHex(solid, 0.35)} 0%, ${rgbaFromHex(solid, 0.18)} 18%, ${rgbaFromHex(solid, 0.06)} 35%, transparent 58%)`
}

function renderCornerStars(badge, color) {
  const solid = color?.value || '#0071E3'
  const palette = [solid, ...CORNER_STAR_ACCENTS]

  badge.textContent = ''

  CORNER_STARS.forEach((star, index) => {
    const el = document.createElement('span')
    el.className = 'tf-corner-star'
    el.setAttribute('style', [
      `--tf-star-size:${star.size}px`,
      `--tf-star-color:${palette[index % palette.length]}`,
      `--tf-star-from-x:${star.x * 5}px`,
      `--tf-star-from-y:${star.y * 4}px`,
      `--tf-star-drift:${star.drift}px`,
      `--tf-star-delay:${star.delay}s`,
      `--tf-star-duration:${star.duration}s`,
    ].join(';'))
    badge.append(el)
  })
}

function applyCornerBadge(resolved, color) {
  const mountTarget = document.body || document.documentElement

  if (!mountTarget) return

  ensureCornerBadgeStyle()

  let badge = document.getElementById(CORNER_BADGE_ID)

  if (!badge) {
    badge = document.createElement('div')
    badge.id = CORNER_BADGE_ID
    badge.setAttribute('aria-hidden', 'true')
  }

  if (badge.parentElement !== mountTarget) {
    mountTarget.append(badge)
  }

  badge.setAttribute('style', `--tf-corner-glow:${buildCornerGlow(color)}`)
  renderCornerStars(badge, color)
}

function isSvgFavicon(href = '', type = '') {
  const normalizedHref = href.toLowerCase()
  const normalizedType = type.toLowerCase()

  return normalizedType.includes('svg')
    || normalizedHref.includes('.svg')
    || normalizedHref.startsWith('data:image/svg+xml')
}

function getFaviconLinks() {
  return [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')]
}

function isManagedFaviconLink(link) {
  return link?.getAttribute?.(FAVICON_MARK_ATTRIBUTE) === 'true'
    || Boolean(currentFaviconDataUrl && link?.href === currentFaviconDataUrl)
}

function findFaviconHref({ fallback = true, includeManaged = false } = {}) {
  const links = getFaviconLinks()
  const candidates = links
    .map(link => ({
      managed: isManagedFaviconLink(link),
      href: link.href,
      type: link.type || '',
      sizes: link.sizes?.value || '',
    }))
    .filter(link => (
      link.href
      && (includeManaged || !link.managed)
      && !isSvgFavicon(link.href, link.type)
    ))

  if (!candidates.length) {
    return fallback ? `${location.origin}/favicon.ico` : ''
  }

  const sizedIcon = candidates.find(link => /\d/.test(link.sizes))
  return (sizedIcon || candidates[0]).href
}

function rememberOriginalFavicon({ refresh = false } = {}) {
  const href = findFaviconHref({ fallback: false })
  const fallbackHref = `${location.origin}/favicon.ico`

  if (!href || href.startsWith('data:')) {
    if (!originalFaviconHref || originalFaviconHref.startsWith('data:')) {
      originalFaviconHref = fallbackHref
      return true
    }
    return false
  }

  if ((refresh || !originalFaviconHref || originalFaviconHref.startsWith('data:'))
    && originalFaviconHref !== href) {
    originalFaviconHref = href
    return true
  }

  return false
}

function restoreOriginalFavicon() {
  if (!originalFaviconHref || !document.head) return

  getFaviconLinks().forEach(link => link.remove())

  const iconLink = document.createElement('link')
  iconLink.rel = 'icon'
  iconLink.href = originalFaviconHref
  document.head.append(iconLink)
  currentFaviconColor = ''
  currentFaviconDataUrl = ''
}

function applyComposedFavicon(dataUrl) {
  if (!document.head) return false

  getFaviconLinks().forEach(link => link.remove())

  const iconLink = document.createElement('link')
  iconLink.rel = 'icon'
  iconLink.type = 'image/png'
  iconLink.href = dataUrl
  iconLink.setAttribute(FAVICON_MARK_ATTRIBUTE, 'true')
  document.head.append(iconLink)

  return true
}

function hasAppliedComposedFavicon() {
  return Boolean(currentFaviconDataUrl && getFaviconLinks().some(link => (
    isManagedFaviconLink(link) && link.href === currentFaviconDataUrl
  )))
}

async function setPageFaviconMark(colorValue, options = {}) {
  const { force = false, refreshOriginal = false } = options
  activeFaviconColor = colorValue || ''

  const originalChanged = rememberOriginalFavicon({ refresh: refreshOriginal })

  if (originalChanged) {
    currentFaviconColor = ''
    currentFaviconDataUrl = ''
  }

  const updateToken = ++faviconUpdateToken

  if (!colorValue) {
    restoreOriginalFavicon()
    return
  }

  if (!document.head) return

  if (!force && currentFaviconColor === colorValue && hasAppliedComposedFavicon()) return

  if (currentFaviconColor === colorValue && currentFaviconDataUrl) {
    applyComposedFavicon(currentFaviconDataUrl)
    return
  }

  try {
    const dataUrl = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.composeFaviconMark, {
      faviconUrl: originalFaviconHref,
      colorValue,
    }))

    if (updateToken !== faviconUpdateToken || !dataUrl) return

    currentFaviconDataUrl = dataUrl
    if (applyComposedFavicon(dataUrl)) {
      currentFaviconColor = colorValue
    }
  } catch {
    if (updateToken !== faviconUpdateToken) return
    // Keep the original favicon when the site icon cannot be composed.
  }
}

function buildLineStyles(position, width, color) {
  const px = `${width}px`
  const fill = buildLineFill(color, position)
  const glow = rgbaFromHex(getColorStripes(color)[0], 0.4)
  const isVertical = position === 'left' || position === 'right'
  const highlight = isVertical
    ? 'inset 1px 0 0 rgba(255, 255, 255, 0.55), inset -1px 0 1px rgba(15, 23, 42, 0.16)'
    : 'inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 1px rgba(15, 23, 42, 0.16)'
  const shared = [
    'position:fixed',
    'z-index:2147483647',
    'pointer-events:none',
    'overflow:hidden',
    `background:${fill}`,
    // Liquid glass: the strip refracts and saturates the page behind it.
    'backdrop-filter:blur(6px) saturate(1.7) brightness(1.06)',
    '-webkit-backdrop-filter:blur(6px) saturate(1.7) brightness(1.06)',
    `box-shadow:${highlight}, 0 0 ${Math.max(6, width * 2)}px ${glow}`,
  ]

  switch (position) {
    case 'top':
      return [...shared, 'top:0', 'left:0', 'right:0', `height:${px}`].join(';')
    case 'bottom':
      return [...shared, 'bottom:0', 'left:0', 'right:0', `height:${px}`].join(';')
    case 'right':
      return [...shared, 'top:0', 'right:0', 'bottom:0', `width:${px}`].join(';')
    case 'frame': {
      const stripes = getColorStripes(color)
      const borderStyle = stripes.length > 1
        ? [
            `border:${px} solid transparent`,
            `border-image:${buildLineFill(color, 'top', 0.9)} 1`,
          ]
        : [`border:${px} solid ${rgbaFromHex(stripes[0], 0.9)}`]

      return [
        'position:fixed',
        'z-index:2147483647',
        'pointer-events:none',
        'background:transparent',
        'top:0',
        'right:0',
        'bottom:0',
        'left:0',
        ...borderStyle,
        `box-shadow:inset 0 0 ${Math.max(8, width * 3)}px ${rgbaFromHex(stripes[0], 0.18)}`,
      ].join(';')
    }
    case 'left':
    default:
      return [...shared, 'top:0', 'left:0', 'bottom:0', `width:${px}`].join(';')
  }
}

function buildLineSheetStyles(position) {
  // The frame variant covers the whole viewport, so overlay layers would wash
  // out the page content; keep it to the plain border.
  if (position === 'frame') {
    return `#${MARK_LINE_ID}{transition:border-color .15s;}`
  }

  const isVertical = position === 'left' || position === 'right'
  const sheenGeometry = isVertical
    ? 'left:0;right:0;height:26%;top:-30%;'
    : 'top:0;bottom:0;width:22%;left:-25%;'
  const sheenGradient = isVertical
    ? 'linear-gradient(190deg, transparent, rgba(255, 255, 255, 0.45), transparent)'
    : 'linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.45), transparent)'
  const sweepKeyframes = isVertical
    ? '0%{transform:translateY(0);}58%,100%{transform:translateY(520%);}'
    : '0%{transform:translateX(0);}58%,100%{transform:translateX(600%);}'
  const specular = isVertical
    ? 'linear-gradient(90deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.06) 45%, rgba(255, 255, 255, 0) 62%, rgba(255, 255, 255, 0.2))'
    : 'linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.06) 45%, rgba(255, 255, 255, 0) 62%, rgba(255, 255, 255, 0.2))'

  return `
    #${MARK_LINE_ID} {
      transition: background .15s, width .15s, height .15s;
      animation: tab-finder-line-breathe 8s ease-in-out infinite;
    }

    /* Glass specular highlight: a static light-refraction layer. */
    #${MARK_LINE_ID}::before {
      content: '';
      position: absolute;
      inset: 0;
      background: ${specular};
      pointer-events: none;
    }

    /* Elegant twinkle: a soft sheen sweeps along the line. */
    #${MARK_LINE_ID}::after {
      content: '';
      position: absolute;
      ${sheenGeometry}
      background: ${sheenGradient};
      filter: blur(1px);
      pointer-events: none;
      animation: tab-finder-line-sweep 9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    @keyframes tab-finder-line-sweep {
      ${sweepKeyframes}
    }

    @keyframes tab-finder-line-breathe {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(1.06) saturate(1.05); }
    }

    @media (prefers-reduced-motion: reduce) {
      #${MARK_LINE_ID} { animation: none; }
      #${MARK_LINE_ID}::after { animation: none; opacity: 0; }
    }
  `
}

function applyPageLine(color, settings) {
  const position = settings?.linePosition || DEFAULT_SETTINGS.linePosition
  const width = settings?.lineWidth ?? DEFAULT_SETTINGS.lineWidth
  const lineContainer = document.body || document.documentElement

  let line = document.getElementById(MARK_LINE_ID)

  if (!lineContainer) return

  if (!line) {
    line = document.createElement('div')
    line.id = MARK_LINE_ID
  }

  if (line.parentElement !== lineContainer) {
    lineContainer.append(line)
  }

  line.setAttribute('style', buildLineStyles(position, width, color))

  let style = document.getElementById(MARK_STYLE_ID)
  const styleContainer = document.head || document.documentElement

  if (!style && styleContainer) {
    style = document.createElement('style')
    style.id = MARK_STYLE_ID
  }

  if (style && styleContainer && style.parentElement !== styleContainer) {
    styleContainer.append(style)
  }

  if (style) {
    style.textContent = buildLineSheetStyles(position)
  }
}

function applyResolvedPageMark(resolved, settings) {
  const mark = resolved?.mark || null
  removeLegacyPageMark()

  if (!mark || settings?.enabled === false) {
    activeLineColor = null
    activeLineSettings = null
    activeCornerPayload = null
    removePageLine()
    removeCornerBadge()
    void setPageFaviconMark(null)
    return { applied: false }
  }

  const color = getMarkColor(mark.colorId)
  activeLineColor = color
  activeLineSettings = settings
  applyPageLine(color, settings)

  if (settings?.cornerAddress !== false) {
    activeCornerPayload = { color }
    applyCornerBadge(resolved, color)
  } else {
    activeCornerPayload = null
    removeCornerBadge()
  }

  void setPageFaviconMark(getColorStripes(color).join(','))

  return {
    applied: true,
    colorId: color.id,
  }
}

async function syncPageMark() {
  const href = location.href
  if (lastSyncedHref === href) return null

  lastSyncedHref = href
  originalFaviconHref = ''
  currentFaviconColor = ''
  currentFaviconDataUrl = ''

  try {
    const data = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.getUrlMark, {
      url: location.href,
    }))

    return applyResolvedPageMark(data.resolved, data.settings)
  } catch {
    return null
  }
}

function queuePageMarkSync() {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncPageMark()
  }, 80)
}

function queuePageLineReapply() {
  if (!activeLineColor) return

  window.clearTimeout(pageLineReapplyTimer)
  pageLineReapplyTimer = window.setTimeout(() => {
    if (activeLineColor) {
      applyPageLine(activeLineColor, activeLineSettings)
    }
  }, PAGE_LINE_REAPPLY_DELAY)
}

function queueCornerBadgeReapply() {
  if (!activeCornerPayload) return

  window.clearTimeout(cornerBadgeReapplyTimer)
  cornerBadgeReapplyTimer = window.setTimeout(() => {
    if (activeCornerPayload) {
      applyCornerBadge(null, activeCornerPayload.color)
    }
  }, CORNER_BADGE_REAPPLY_DELAY)
}

function queueFaviconRefresh() {
  if (!activeFaviconColor) return

  window.clearTimeout(faviconMutationTimer)
  faviconMutationTimer = window.setTimeout(() => {
    faviconMutationTimer = null

    if (!activeFaviconColor) return

    void setPageFaviconMark(activeFaviconColor, {
      force: !hasAppliedComposedFavicon(),
      refreshOriginal: true,
    })
  }, FAVICON_REAPPLY_DELAY)
}

function nodeContainsFaviconLink(node) {
  if (node?.nodeType !== Node.ELEMENT_NODE) return false

  if (node.tagName === 'LINK') {
    return node.getAttribute(FAVICON_MARK_ATTRIBUTE) === 'true'
      || /\bicon\b/i.test(node.getAttribute('rel') || '')
  }

  return Boolean(node.querySelector?.('link[rel~="icon"], link[rel="shortcut icon"]'))
}

function mutationTouchesFavicon(mutation) {
  if (mutation.type === 'attributes') {
    return mutation.target?.tagName === 'LINK'
  }

  return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsFaviconLink)
}

function installFaviconWatcher() {
  if (window.__tabFinderFaviconWatcherInstalled) return
  window.__tabFinderFaviconWatcherInstalled = true

  const installHeadObserver = () => {
    if (!document.head || faviconObserver) return

    headReadyObserver?.disconnect()
    headReadyObserver = null

    faviconObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesFavicon)) {
        queueFaviconRefresh()
      }
    })

    faviconObserver.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'rel', 'type', 'sizes'],
    })

    queueFaviconRefresh()
  }

  installHeadObserver()

  if (!faviconObserver && document.documentElement) {
    headReadyObserver = new MutationObserver(installHeadObserver)
    headReadyObserver.observe(document.documentElement, { childList: true })
  }

  document.addEventListener('DOMContentLoaded', installHeadObserver, { once: true })
}

function installPageLineWatcher() {
  if (window.__tabFinderPageLineWatcherInstalled) return
  window.__tabFinderPageLineWatcherInstalled = true

  document.addEventListener('DOMContentLoaded', queuePageLineReapply, { once: true })
  window.addEventListener('load', queuePageLineReapply, { once: true })
  window.addEventListener('pageshow', queuePageLineReapply)
}

function installCornerBadgeWatcher() {
  if (window.__tabFinderCornerBadgeWatcherInstalled) return
  window.__tabFinderCornerBadgeWatcherInstalled = true

  document.addEventListener('DOMContentLoaded', queueCornerBadgeReapply, { once: true })
  window.addEventListener('load', queueCornerBadgeReapply, { once: true })
  window.addEventListener('pageshow', queueCornerBadgeReapply)
}

function installLocationWatcher() {
  if (window.__tabFinderLocationWatcherInstalled) return
  window.__tabFinderLocationWatcherInstalled = true

  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function pushStateWithTabFinder(...args) {
    const result = originalPushState.apply(this, args)
    queuePageMarkSync()
    return result
  }

  history.replaceState = function replaceStateWithTabFinder(...args) {
    const result = originalReplaceState.apply(this, args)
    queuePageMarkSync()
    return result
  }

  window.addEventListener('popstate', queuePageMarkSync)
  window.addEventListener('hashchange', queuePageMarkSync)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) queuePageMarkSync()
  })
}

export function createTabMarkContentHandlers() {
  return {
    [ExtensionMessage.applyPageMark]: ({ payload }) => (
      applyResolvedPageMark(payload.resolved, payload.settings)
    ),
  }
}

export function setupTabMarkContent() {
  installLocationWatcher()
  installFaviconWatcher()
  installPageLineWatcher()
  installCornerBadgeWatcher()
  queuePageMarkSync()
}
