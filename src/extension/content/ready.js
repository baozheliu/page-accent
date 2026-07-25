import { ExtensionMessage } from '../messaging.js'

export function createContentReadyHandlers(extraHandlers = {}) {
  return {
    [ExtensionMessage.ping]: () => 'PONG',
    [ExtensionMessage.getPageContext]: () => ({
      title: document.title,
      url: location.href,
      selection: globalThis.getSelection?.().toString() || '',
    }),
    ...extraHandlers,
  }
}
