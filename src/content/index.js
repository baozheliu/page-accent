import { createContentReadyHandlers } from '../extension/content/ready.js'
import {
  createTabMarkContentHandlers,
  setupTabMarkContent,
} from '../extension/content/tab-mark.js'
import { createLogger } from '../extension/logger.js'
import { addRuntimeMessageHandlers } from '../extension/messaging.js'

const logger = createLogger('content')

addRuntimeMessageHandlers(createContentReadyHandlers(createTabMarkContentHandlers()))
setupTabMarkContent()

logger.info('Content script mounted', location.href)
