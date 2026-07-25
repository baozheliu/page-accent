import { EXTENSION_NAMESPACE } from '../config.js'
import { callExtensionApi, getExtensionApi } from './chrome-api.js'

function getNamespacedKey(key, namespace) {
  return namespace ? `${namespace}:${key}` : key
}

function getExtensionStorageContext(areaName, extensionApi) {
  try {
    const activeExtensionApi = extensionApi || getExtensionApi()

    return {
      extensionApi: activeExtensionApi,
      storageArea: activeExtensionApi.storage?.[areaName] || activeExtensionApi.storage?.local || null,
    }
  } catch {
    return {
      extensionApi: null,
      storageArea: null,
    }
  }
}

function readLocalStorage(key, fallbackValue) {
  if (!globalThis.localStorage) return fallbackValue

  const rawValue = globalThis.localStorage.getItem(key)
  if (rawValue == null) return fallbackValue

  try {
    return JSON.parse(rawValue)
  } catch {
    return rawValue
  }
}

function writeLocalStorage(key, value) {
  if (!globalThis.localStorage) {
    throw new Error('No extension storage area or localStorage is available')
  }

  globalThis.localStorage.setItem(key, JSON.stringify(value))
}

export function createExtensionStorage({
  area = 'local',
  namespace = EXTENSION_NAMESPACE,
  extensionApi,
} = {}) {
  return {
    async get(key, fallbackValue = null) {
      const namespacedKey = getNamespacedKey(key, namespace)
      const storageContext = getExtensionStorageContext(area, extensionApi)
      const { storageArea } = storageContext

      if (!storageArea) {
        return readLocalStorage(namespacedKey, fallbackValue)
      }

      const result = await callExtensionApi(
        storageArea.get.bind(storageArea),
        [namespacedKey],
        storageContext.extensionApi,
      )

      return result[namespacedKey] ?? fallbackValue
    },

    async set(key, value) {
      const namespacedKey = getNamespacedKey(key, namespace)
      const storageContext = getExtensionStorageContext(area, extensionApi)
      const { storageArea } = storageContext

      if (!storageArea) {
        writeLocalStorage(namespacedKey, value)
        return
      }

      await callExtensionApi(
        storageArea.set.bind(storageArea),
        [{ [namespacedKey]: value }],
        storageContext.extensionApi,
      )
    },

    async remove(key) {
      const namespacedKey = getNamespacedKey(key, namespace)
      const storageContext = getExtensionStorageContext(area, extensionApi)
      const { storageArea } = storageContext

      if (!storageArea) {
        globalThis.localStorage?.removeItem(namespacedKey)
        return
      }

      await callExtensionApi(
        storageArea.remove.bind(storageArea),
        [namespacedKey],
        storageContext.extensionApi,
      )
    },
  }
}
