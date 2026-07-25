export const ThemeMode = Object.freeze({
  system: 'system',
  light: 'light',
  dark: 'dark',
})

export const LinePosition = Object.freeze({
  left: 'left',
  right: 'right',
  top: 'top',
  bottom: 'bottom',
  frame: 'frame',
})

export const SETTINGS_STORAGE_KEY = 'settings'

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  theme: ThemeMode.system,
  linePosition: LinePosition.top,
  lineWidth: 4,
  tabGroupSync: true,
  cornerAddress: true,
})

const THEME_VALUES = new Set(Object.values(ThemeMode))
const LINE_POSITION_VALUES = new Set(Object.values(LinePosition))
const LINE_WIDTH_MIN = 1
const LINE_WIDTH_MAX = 10

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function createSettingsValidationError(message) {
  const error = new Error(message)
  error.code = 'INVALID_PAYLOAD'

  return error
}

export function validateSettingsPatch(payload) {
  if (!isRecord(payload)) {
    return createSettingsValidationError('Settings payload must be an object')
  }

  if ('enabled' in payload && typeof payload.enabled !== 'boolean') {
    return createSettingsValidationError('Settings.enabled must be a boolean')
  }

  if ('theme' in payload && !THEME_VALUES.has(payload.theme)) {
    return createSettingsValidationError('Settings.theme is not supported')
  }

  if ('linePosition' in payload && !LINE_POSITION_VALUES.has(payload.linePosition)) {
    return createSettingsValidationError('Settings.linePosition is not supported')
  }

  if ('lineWidth' in payload) {
    const w = payload.lineWidth
    if (typeof w !== 'number' || !Number.isFinite(w) || w < LINE_WIDTH_MIN || w > LINE_WIDTH_MAX) {
      return createSettingsValidationError(`Settings.lineWidth must be ${LINE_WIDTH_MIN}-${LINE_WIDTH_MAX}`)
    }
  }

  if ('tabGroupSync' in payload && typeof payload.tabGroupSync !== 'boolean') {
    return createSettingsValidationError('Settings.tabGroupSync must be a boolean')
  }

  if ('cornerAddress' in payload && typeof payload.cornerAddress !== 'boolean') {
    return createSettingsValidationError('Settings.cornerAddress must be a boolean')
  }

  return null
}

function clampLineWidth(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.lineWidth
  return Math.max(LINE_WIDTH_MIN, Math.min(LINE_WIDTH_MAX, Math.round(value)))
}

export function normalizeSettings(settings = {}) {
  const normalized = { ...DEFAULT_SETTINGS }

  if (!isRecord(settings)) {
    return normalized
  }

  if (typeof settings.enabled === 'boolean') {
    normalized.enabled = settings.enabled
  }

  if (THEME_VALUES.has(settings.theme)) {
    normalized.theme = settings.theme
  }

  if (LINE_POSITION_VALUES.has(settings.linePosition)) {
    normalized.linePosition = settings.linePosition
  }

  if ('lineWidth' in settings) {
    normalized.lineWidth = clampLineWidth(settings.lineWidth)
  }

  if (typeof settings.tabGroupSync === 'boolean') {
    normalized.tabGroupSync = settings.tabGroupSync
  }

  if (typeof settings.cornerAddress === 'boolean') {
    normalized.cornerAddress = settings.cornerAddress
  }

  return normalized
}

export function mergeSettings(currentSettings, settingsPatch) {
  return normalizeSettings({
    ...normalizeSettings(currentSettings),
    ...settingsPatch,
  })
}
