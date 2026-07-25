export const EXTENSION_NAMESPACE = 'tab-finder'

export {
  DEFAULT_SETTINGS,
  LinePosition,
  SETTINGS_STORAGE_KEY,
  ThemeMode,
  mergeSettings,
  normalizeSettings,
  validateSettingsPatch,
} from '../shared/settings.js'

export const EXTENSION_PAGES = Object.freeze({
  popup: 'src/pages/popup/index.html',
  options: 'src/pages/options/index.html',
  sidePanel: 'src/pages/side-panel/index.html',
})

export const CONTENT_SCRIPT_MATCHES = Object.freeze([
  'http://*/*',
  'https://*/*',
])

export function isHttpTabUrl(url) {
  if (!url) return false

  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
