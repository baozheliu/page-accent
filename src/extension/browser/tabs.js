import { callExtensionApi, getExtensionApi } from './chrome-api.js'

export function queryTabs(queryInfo, extensionApi = getExtensionApi()) {
  return callExtensionApi(
    extensionApi.tabs.query.bind(extensionApi.tabs),
    [queryInfo],
    extensionApi,
  )
}

export async function getActiveTab(extensionApi = getExtensionApi()) {
  const tabs = await queryTabs({ active: true, currentWindow: true }, extensionApi)
  return tabs[0] || null
}

export function createTab(createProperties, extensionApi = getExtensionApi()) {
  return callExtensionApi(
    extensionApi.tabs.create.bind(extensionApi.tabs),
    [createProperties],
    extensionApi,
  )
}

export function sendTabMessage(tabId, message, extensionApi = getExtensionApi()) {
  return callExtensionApi(
    extensionApi.tabs.sendMessage.bind(extensionApi.tabs),
    [tabId, message],
    extensionApi,
  )
}

export function reloadTab(tabId, extensionApi = getExtensionApi()) {
  return callExtensionApi(
    extensionApi.tabs.reload.bind(extensionApi.tabs),
    [tabId],
    extensionApi,
  )
}

export function waitForTabComplete(tabId, extensionApi = getExtensionApi()) {
  return new Promise(resolve => {
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        extensionApi.tabs.onUpdated.removeListener(onUpdated)
        resolve()
      }
    }

    extensionApi.tabs.onUpdated.addListener(onUpdated)
  })
}
