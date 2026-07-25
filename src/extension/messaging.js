import { callExtensionApi, getExtensionApi } from './browser/chrome-api.js'

export const ExtensionMessage = Object.freeze({
  ping: 'PING',
  getPageContext: 'GET_PAGE_CONTEXT',
  getActiveTab: 'GET_ACTIVE_TAB',
  getActiveTabMark: 'GET_ACTIVE_TAB_MARK',
  setActiveTabMark: 'SET_ACTIVE_TAB_MARK',
  cycleActiveTabMark: 'CYCLE_ACTIVE_TAB_MARK',
  clearActiveTabMark: 'CLEAR_ACTIVE_TAB_MARK',
  getUrlMark: 'GET_URL_MARK',
  applyPageMark: 'APPLY_PAGE_MARK',
  composeFaviconMark: 'COMPOSE_FAVICON_MARK',
  getTabMarkOverview: 'GET_TAB_MARK_OVERVIEW',
  getTabMarkRules: 'GET_TAB_MARK_RULES',
  exportTabMarkData: 'EXPORT_TAB_MARK_DATA',
  importTabMarkData: 'IMPORT_TAB_MARK_DATA',
  resetTabMarkData: 'RESET_TAB_MARK_DATA',
  addTabMarkRule: 'ADD_TAB_MARK_RULE',
  updateTabMarkRule: 'UPDATE_TAB_MARK_RULE',
  deleteTabMarkRule: 'DELETE_TAB_MARK_RULE',
  deleteTabMark: 'DELETE_TAB_MARK',
  updateTabMarkColor: 'UPDATE_TAB_MARK_COLOR',
  openMarkedUrl: 'OPEN_MARKED_URL',
  getSettings: 'GET_SETTINGS',
  updateSettings: 'UPDATE_SETTINGS',
  openOptions: 'OPEN_OPTIONS',
  closeSidePanel: 'CLOSE_SIDE_PANEL',
  sidePanelClosed: 'SIDE_PANEL_CLOSED',
})

export const ExtensionMessageErrorCode = Object.freeze({
  invalidMessage: 'INVALID_MESSAGE',
  invalidPayload: 'INVALID_PAYLOAD',
  handlerFailed: 'HANDLER_FAILED',
})

const EXTENSION_MESSAGE_TYPES = new Set(Object.values(ExtensionMessage))

function isPlainObject(value) {
  return value == null || (typeof value === 'object' && !Array.isArray(value))
}

export class ExtensionMessageError extends Error {
  constructor(message, code = ExtensionMessageErrorCode.handlerFailed, details = null) {
    super(message)
    this.name = 'ExtensionMessageError'
    this.code = code
    this.details = details
  }
}

export function isKnownExtensionMessageType(type) {
  return EXTENSION_MESSAGE_TYPES.has(type)
}

export function createExtensionMessage(type, payload = {}) {
  if (!isKnownExtensionMessageType(type)) {
    throw new ExtensionMessageError(
      `Unknown extension message type: ${type}`,
      ExtensionMessageErrorCode.invalidMessage,
    )
  }

  return { type, payload }
}

export function getExtensionMessageType(message) {
  return typeof message === 'string' ? message : message?.type
}

export function isExtensionMessage(message, type) {
  return getExtensionMessageType(message) === type
}

export function validateExtensionMessage(message) {
  const type = getExtensionMessageType(message)

  if (!isKnownExtensionMessageType(type)) {
    return new ExtensionMessageError(
      `Unknown extension message type: ${type}`,
      ExtensionMessageErrorCode.invalidMessage,
    )
  }

  if (typeof message !== 'string' && !isPlainObject(message?.payload)) {
    return new ExtensionMessageError(
      `Invalid payload for extension message: ${type}`,
      ExtensionMessageErrorCode.invalidPayload,
    )
  }

  return null
}

export function createExtensionSuccessResponse(data = null) {
  return {
    ok: true,
    data,
  }
}

export function createExtensionErrorResponse(error, code = ExtensionMessageErrorCode.handlerFailed) {
  const message = error?.message || String(error)

  return {
    ok: false,
    error: {
      code: error?.code || code,
      message,
      details: error?.details || null,
    },
  }
}

export function unwrapExtensionResponse(response) {
  if (response?.ok === false) {
    throw new ExtensionMessageError(
      response.error?.message || 'Extension message failed',
      response.error?.code || ExtensionMessageErrorCode.handlerFailed,
      response.error?.details || null,
    )
  }

  if (response?.ok === true) {
    return response.data
  }

  return response
}

export function sendRuntimeMessage(message, extensionApi = getExtensionApi()) {
  return callExtensionApi(
    extensionApi.runtime.sendMessage.bind(extensionApi.runtime),
    [message],
    extensionApi,
  ).then(unwrapExtensionResponse)
}

export function sendTabMessage(tabId, message, extensionApi = getExtensionApi()) {
  return callExtensionApi(
    extensionApi.tabs.sendMessage.bind(extensionApi.tabs),
    [tabId, message],
    extensionApi,
  ).then(unwrapExtensionResponse)
}

function normalizeHandlerOptions(optionsOrExtensionApi) {
  if (optionsOrExtensionApi?.runtime) {
    return {
      extensionApi: optionsOrExtensionApi,
      validators: {},
    }
  }

  return {
    extensionApi: optionsOrExtensionApi?.extensionApi || getExtensionApi(),
    validators: optionsOrExtensionApi?.validators || {},
  }
}

export function addRuntimeMessageHandlers(handlers, optionsOrExtensionApi) {
  const { extensionApi, validators } = normalizeHandlerOptions(optionsOrExtensionApi)

  const listener = (message, sender, sendResponse) => {
    const type = getExtensionMessageType(message)
    const handler = handlers[type]

    if (!handler) return false

    const messageError = validateExtensionMessage(message)
    if (messageError) {
      sendResponse(createExtensionErrorResponse(messageError))
      return false
    }

    const payload = typeof message === 'string' ? {} : message?.payload || {}
    const validatePayload = validators[type]
    const payloadError = validatePayload?.(payload)

    if (payloadError) {
      sendResponse(createExtensionErrorResponse(payloadError, ExtensionMessageErrorCode.invalidPayload))
      return false
    }

    Promise.resolve(handler({
      message,
      payload,
      sender,
    }))
      .then(data => {
        sendResponse(createExtensionSuccessResponse(data))
      })
      .catch(error => {
        sendResponse(createExtensionErrorResponse(error))
      })

    return true
  }

  extensionApi.runtime.onMessage.addListener(listener)

  return () => {
    extensionApi.runtime.onMessage.removeListener?.(listener)
  }
}
