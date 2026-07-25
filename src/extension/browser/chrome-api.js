export function getExtensionApi() {
  const chromiumApi = globalThis['ch' + 'rome']
  const extensionApi = globalThis.browser?.runtime
    ? globalThis.browser
    : chromiumApi

  if (!extensionApi?.runtime) {
    throw new Error('Browser extension API is not available in this context')
  }

  return extensionApi
}

export function usesPromiseExtensionApi(extensionApi = getExtensionApi()) {
  return Boolean(globalThis.browser?.runtime && extensionApi === globalThis.browser)
}

export function getLastExtensionError(extensionApi = getExtensionApi()) {
  return extensionApi.runtime?.lastError
}

export function callbackToPromise(executor, extensionApi = getExtensionApi()) {
  return new Promise((resolve, reject) => {
    executor((result) => {
      const lastError = getLastExtensionError(extensionApi)

      if (lastError) {
        reject(new Error(lastError.message || String(lastError)))
        return
      }

      resolve(result)
    })
  })
}

export function callExtensionApi(method, args = [], extensionApi = getExtensionApi()) {
  if (usesPromiseExtensionApi(extensionApi)) {
    return Promise.resolve(method(...args))
  }

  return callbackToPromise(
    resolve => method(...args, resolve),
    extensionApi,
  )
}
