import { callExtensionApi, getExtensionApi } from '../browser/chrome-api.js'
import { EXTENSION_NAMESPACE } from '../config.js'
import { createLogger } from '../logger.js'
import {
  ExtensionMessage,
  createExtensionErrorResponse,
  createExtensionMessage,
  createExtensionSuccessResponse,
  isExtensionMessage,
} from '../messaging.js'

const logger = createLogger('side-panel')
const SIDE_PANEL_STATE_KEY = `${EXTENSION_NAMESPACE}:sidePanel`

let fallbackPanelState = {
  open: false,
  windowId: null,
}

async function readPanelState(extensionApi) {
  const storageArea = extensionApi.storage?.session

  if (!storageArea) {
    return fallbackPanelState
  }

  try {
    const result = await callExtensionApi(
      storageArea.get.bind(storageArea),
      [SIDE_PANEL_STATE_KEY],
      extensionApi,
    )

    fallbackPanelState = result[SIDE_PANEL_STATE_KEY] || fallbackPanelState
  } catch (error) {
    logger.warn('Failed to read side panel state', error)
  }

  return fallbackPanelState
}

async function writePanelState(extensionApi, state) {
  fallbackPanelState = {
    ...fallbackPanelState,
    ...state,
  }

  const storageArea = extensionApi.storage?.session

  if (!storageArea) {
    return fallbackPanelState
  }

  try {
    await callExtensionApi(
      storageArea.set.bind(storageArea),
      [{ [SIDE_PANEL_STATE_KEY]: fallbackPanelState }],
      extensionApi,
    )
  } catch (error) {
    logger.warn('Failed to persist side panel state', error)
  }

  return fallbackPanelState
}

export function setupSidePanelController({
  extensionApi = getExtensionApi(),
  openOnActionClick = false,
} = {}) {
  if (openOnActionClick && extensionApi.action?.onClicked && extensionApi.sidePanel?.open) {
    extensionApi.action.onClicked.addListener(async (tab) => {
      const panelState = await readPanelState(extensionApi)

      if (!panelState.open) {
        try {
          await callExtensionApi(
            extensionApi.sidePanel.open.bind(extensionApi.sidePanel),
            [{ windowId: tab.windowId }],
            extensionApi,
          )
          await writePanelState(extensionApi, {
            open: true,
            windowId: tab.windowId ?? null,
          })
        } catch (error) {
          logger.error('Failed to open side panel', error)
        }
        return
      }

      try {
        await callExtensionApi(
          extensionApi.runtime.sendMessage.bind(extensionApi.runtime),
          [createExtensionMessage(ExtensionMessage.closeSidePanel)],
          extensionApi,
        )
      } catch (error) {
        logger.warn('Failed to notify side panel to close', error)
      }

      await writePanelState(extensionApi, {
        open: false,
        windowId: null,
      })
    })
  }

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isExtensionMessage(message, ExtensionMessage.sidePanelClosed)) {
      Promise.resolve(writePanelState(extensionApi, {
        open: false,
        windowId: sender?.tab?.windowId ?? null,
      }))
        .then(state => {
          sendResponse(createExtensionSuccessResponse(state))
        })
        .catch(error => {
          sendResponse(createExtensionErrorResponse(error))
        })

      return true
    }

    return false
  })

  return {
    isOpen: () => fallbackPanelState.open,
  }
}
