import { callExtensionApi, getExtensionApi } from '../browser/chrome-api.js'
import { getActiveTab } from '../browser/tabs.js'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  mergeSettings,
  normalizeSettings,
  validateSettingsPatch,
} from '../config.js'
import { createLogger } from '../logger.js'
import { addRuntimeMessageHandlers, ExtensionMessage } from '../messaging.js'
import { createExtensionStorage } from '../browser/storage.js'
import { setupSidePanelController } from './side-panel.js'
import { createTabMarkController } from './tab-marks.js'

const logger = createLogger('background')

export function setupExtensionRuntime({
  extensionApi = getExtensionApi(),
  storage = createExtensionStorage({ extensionApi }),
} = {}) {
  setupSidePanelController({ extensionApi })
  const tabMarkController = createTabMarkController({
    extensionApi,
    storage,
  })

  tabMarkController.setupListeners()
  tabMarkController.createContextMenus()

  extensionApi.runtime.onInstalled.addListener(async (details) => {
    logger.info('Extension installed or updated', details.reason)

    const currentSettings = await storage.get(SETTINGS_STORAGE_KEY, null)
    if (!currentSettings) {
      await storage.set(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
    }

    await tabMarkController.ensureDefaults()
    tabMarkController.createContextMenus()
    await tabMarkController.refreshAllMarkedTabs()
  })

  addRuntimeMessageHandlers({
    [ExtensionMessage.getActiveTab]: async () => {
      const tab = await getActiveTab(extensionApi)
      if (!tab) return null

      return {
        id: tab.id,
        title: tab.title,
        url: tab.url,
      }
    },

    [ExtensionMessage.getSettings]: async () => {
      const settings = await storage.get(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)

      return normalizeSettings(settings)
    },

    [ExtensionMessage.updateSettings]: async ({ payload }) => {
      const currentSettings = await storage.get(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
      const nextSettings = mergeSettings(currentSettings, payload)

      await storage.set(SETTINGS_STORAGE_KEY, nextSettings)
      await tabMarkController.refreshActiveTab()
      return nextSettings
    },

    [ExtensionMessage.openOptions]: async () => {
      await callExtensionApi(
        extensionApi.runtime.openOptionsPage.bind(extensionApi.runtime),
        [],
        extensionApi,
      )

      return { opened: true }
    },

    ...tabMarkController.handlers,
  }, {
    extensionApi,
    validators: {
      [ExtensionMessage.updateSettings]: validateSettingsPatch,
      ...tabMarkController.validators,
    },
  })
}
