const LOG_PREFIX = 'extension'

function formatScope(scope) {
  return scope ? `[${LOG_PREFIX}:${scope}]` : `[${LOG_PREFIX}]`
}

export function createLogger(scope) {
  const prefix = formatScope(scope)

  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  }
}
