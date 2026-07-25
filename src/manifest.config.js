import { CONTENT_SCRIPT_MATCHES, EXTENSION_PAGES } from './extension/config.js'

export const ExtensionTarget = Object.freeze({
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
})

const DEFAULT_TARGET = ExtensionTarget.chrome
const CHROMIUM_TARGETS = new Set([
  ExtensionTarget.chrome,
  ExtensionTarget.edge,
])

function normalizeTarget(target = DEFAULT_TARGET) {
  return Object.values(ExtensionTarget).includes(target) ? target : DEFAULT_TARGET
}

function createContentScripts() {
  return [
    {
      matches: CONTENT_SCRIPT_MATCHES,
      js: ['src/content/index.js'],
      run_at: 'document_start',
    },
  ]
}

function createWebAccessibleResources() {
  return [
    {
      resources: ['assets/icons/*'],
      matches: CONTENT_SCRIPT_MATCHES,
    },
  ]
}

export function defineExtensionManifest({
  target = DEFAULT_TARGET,
} = {}) {
  const normalizedTarget = normalizeTarget(target)
  const isChromium = CHROMIUM_TARGETS.has(normalizedTarget)

  const manifest = {
    manifest_version: 3,
    name: '__MSG_extName__',
    version: '0.1.3',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    action: {
      default_title: '__MSG_extName__',
      default_popup: EXTENSION_PAGES.popup,
      default_icon: {
        16: 'assets/icons/icon16.png',
        32: 'assets/icons/icon32.png',
        48: 'assets/icons/icon48.png',
        128: 'assets/icons/icon128.png',
      },
    },
    icons: {
      16: 'assets/icons/icon16.png',
      32: 'assets/icons/icon32.png',
      48: 'assets/icons/icon48.png',
      128: 'assets/icons/icon128.png',
    },
    permissions: [
      'activeTab',
      'storage',
      'tabs',
      'contextMenus',
      ...(isChromium ? ['sidePanel', 'tabGroups'] : []),
    ],
    host_permissions: isChromium ? [...CONTENT_SCRIPT_MATCHES] : undefined,
    optional_permissions: [],
    optional_host_permissions: isChromium ? [] : [...CONTENT_SCRIPT_MATCHES],
    background: {
      service_worker: 'src/background/index.js',
      type: 'module',
    },
    content_scripts: createContentScripts(),
    options_page: EXTENSION_PAGES.options,
    commands: {
      'color-red': {
        suggested_key: {
          default: 'Alt+1',
        },
        description: '__MSG_cmdColorRed__',
      },
      'color-blue': {
        suggested_key: {
          default: 'Alt+2',
        },
        description: '__MSG_cmdColorBlue__',
      },
      'color-green': {
        suggested_key: {
          default: 'Alt+3',
        },
        description: '__MSG_cmdColorGreen__',
      },
      'remove-color': {
        suggested_key: {
          default: 'Alt+0',
        },
        description: '__MSG_cmdRemoveColor__',
      },
    },
    web_accessible_resources: createWebAccessibleResources(),
  }

  if (isChromium) {
    manifest.side_panel = {
      default_path: EXTENSION_PAGES.sidePanel,
    }
  } else {
    manifest.sidebar_action = {
      default_title: '__MSG_extName__',
      default_panel: EXTENSION_PAGES.sidePanel,
    }
  }

  return manifest
}
