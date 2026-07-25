import { APP_NAME } from '../../shared/app.js'
import { isHttpTabUrl } from '../config.js'
import { callExtensionApi, getExtensionApi } from '../browser/chrome-api.js'
import { createTab, getActiveTab } from '../browser/tabs.js'
import { createLogger } from '../logger.js'
import { composeFaviconDataUrlSafe } from './favicon-compose.js'
import {
  ExtensionMessage,
  createExtensionMessage,
  sendTabMessage,
} from '../messaging.js'
import {
  DEFAULT_MARK_COLOR_ID,
  DEFAULT_TAB_MARK_STATE,
  MARK_COLORS,
  MarkSource,
  TAB_MARK_RULES_STORAGE_KEY,
  TAB_MARK_STATE_STORAGE_KEY,
  createRuleDisplayName,
  findBestMatchingRule,
  getMarkColor,
  getNextColorId,
  normalizeTabMarkRule,
  normalizeTabMarkRules,
  normalizeTabMarkState,
  parseTabUrl,
  resolveTabMark,
  validateColorPayload,
  validateRulePayload,
} from '../../shared/tab-marks.js'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
} from '../../shared/settings.js'
import { colorLabel, t } from '../../shared/i18n.js'

const COMMAND_TOGGLE_TAB_MARK = 'toggle-tab-mark'
const COMMAND_CYCLE_TAB_MARK_COLOR = 'cycle-tab-mark-color'
const COMMAND_REMOVE_COLOR = 'remove-color'
const COMMAND_COLOR_MAP = Object.freeze({
  'color-red': 'red',
  'color-blue': 'blue',
  'color-green': 'green',
})
const TAB_GROUP_COLOR_MAP = Object.freeze({
  grey: 'zinc',
  blue: 'blue',
  red: 'red',
  yellow: 'yellow',
  green: 'green',
  pink: 'pink',
  purple: 'purple',
  cyan: 'cyan',
  orange: 'orange',
})
const CONTEXT_MENU_PARENT_ID = 'tab-finder-color-parent'
const CONTEXT_MENU_REMOVE_ID = 'tab-finder-color-remove'
const CONTEXT_MENU_SAVE_RULE_ID = 'tab-finder-color-save-rule'
const logger = createLogger('tab-marks')

function toPublicTab(tab, fallback = {}) {
  if (!tab) return null

  return {
    id: tab.id ?? fallback.id ?? null,
    title: tab.title || fallback.title || '',
    url: tab.url || fallback.url || '',
  }
}

function cloneState(state) {
  return normalizeTabMarkState(state)
}

function findRuleMatch(urlInfo, rules, title = '') {
  return findBestMatchingRule(rules, urlInfo, { title })
}

async function safeCall(method, args, extensionApi) {
  try {
    await callExtensionApi(method, args, extensionApi)
  } catch {
    // Browser UI updates are best-effort and should not block marking.
  }
}

export function createTabMarkController({
  extensionApi = getExtensionApi(),
  storage,
} = {}) {
  async function getSettings() {
    return normalizeSettings(await storage.get(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS))
  }

  async function getMarkState() {
    return normalizeTabMarkState(
      await storage.get(TAB_MARK_STATE_STORAGE_KEY, DEFAULT_TAB_MARK_STATE),
    )
  }

  async function setMarkState(state) {
    const nextState = normalizeTabMarkState(state)
    await storage.set(TAB_MARK_STATE_STORAGE_KEY, nextState)
    return nextState
  }

  async function getRules() {
    return normalizeTabMarkRules(await storage.get(TAB_MARK_RULES_STORAGE_KEY, []))
  }

  async function setRules(rules) {
    const nextRules = normalizeTabMarkRules(rules)
    await storage.set(TAB_MARK_RULES_STORAGE_KEY, nextRules)
    return nextRules
  }

  async function ensureDefaults() {
    const currentState = await storage.get(TAB_MARK_STATE_STORAGE_KEY, null)
    if (!currentState) {
      await storage.set(TAB_MARK_STATE_STORAGE_KEY, DEFAULT_TAB_MARK_STATE)
    }

    const currentRules = await storage.get(TAB_MARK_RULES_STORAGE_KEY, null)
    if (!Array.isArray(currentRules)) {
      await storage.set(TAB_MARK_RULES_STORAGE_KEY, [])
    }
  }

  async function getActiveTabSnapshot() {
    const tab = await getActiveTab(extensionApi)
    if (!tab) return { tab: null, url: '', title: '' }

    let pageContext = null

    if (tab.id != null) {
      try {
        pageContext = await sendTabMessage(
          tab.id,
          createExtensionMessage(ExtensionMessage.getPageContext),
          extensionApi,
        )
      } catch {
        pageContext = null
      }
    }

    return {
      tab: toPublicTab(tab, pageContext || {}),
      url: pageContext?.url || tab.url || '',
      title: pageContext?.title || tab.title || '',
    }
  }

  async function getTabGroupColorId(tabId, settings) {
    if (
      tabId == null
      || settings?.tabGroupSync === false
      || !extensionApi.tabGroups?.get
      || !extensionApi.tabs?.get
    ) {
      return null
    }

    try {
      const tab = await callExtensionApi(
        extensionApi.tabs.get.bind(extensionApi.tabs),
        [tabId],
        extensionApi,
      )
      if (!tab?.groupId || tab.groupId === -1) return null

      const group = await callExtensionApi(
        extensionApi.tabGroups.get.bind(extensionApi.tabGroups),
        [tab.groupId],
        extensionApi,
      )

      return TAB_GROUP_COLOR_MAP[group?.color] || null
    } catch {
      return null
    }
  }

  async function resolveUrl(url, tabId = null, title = '') {
    const [settings, state, rules] = await Promise.all([
      getSettings(),
      getMarkState(),
      getRules(),
    ])

    let pageTitle = title
    if (!pageTitle && tabId != null && extensionApi.tabs?.get) {
      try {
        const tab = await callExtensionApi(
          extensionApi.tabs.get.bind(extensionApi.tabs),
          [tabId],
          extensionApi,
        )
        pageTitle = tab?.title || ''
      } catch {
        pageTitle = ''
      }
    }

    let resolved = resolveTabMark(url, {
      settings,
      state,
      rules,
      title: pageTitle,
    })

    const groupColorId = resolved.mark ? null : await getTabGroupColorId(tabId, settings)
    if (groupColorId && resolved.urlInfo) {
      resolved = {
        source: MarkSource.tabGroup,
        mark: {
          urlKey: resolved.urlInfo.urlKey,
          colorId: groupColorId,
          title: t('common.tabGroupColor'),
          url: resolved.urlInfo.href,
          updatedAt: Date.now(),
          color: getMarkColor(groupColorId),
        },
        rule: null,
        urlInfo: resolved.urlInfo,
      }
    }

    return {
      settings,
      state,
      rules,
      resolved,
    }
  }

  async function setActionBadge(tabId) {
    if (tabId == null || !extensionApi.action) return

    await safeCall(extensionApi.action.setBadgeText.bind(extensionApi.action), [{
      tabId,
      text: '',
    }], extensionApi)
    await safeCall(extensionApi.action.setTitle.bind(extensionApi.action), [{
      tabId,
      title: APP_NAME,
    }], extensionApi)
  }

  async function refreshAllMarkedTabs() {
    if (!extensionApi.tabs?.query) return

    try {
      const tabs = await callExtensionApi(
        extensionApi.tabs.query.bind(extensionApi.tabs),
        [{ url: ['http://*/*', 'https://*/*'] }],
        extensionApi,
      )

      await Promise.all(
        (tabs || []).map(tab => (
          tab.id != null && tab.url
            ? syncTabMark(tab.id, tab.url)
            : Promise.resolve()
        )),
      )
    } catch (error) {
      logger.warn('Failed to refresh marked tabs', error)
    }
  }

  async function applyPageMark(tabId, resolved, settings) {
    if (tabId == null) return

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await sendTabMessage(
          tabId,
          createExtensionMessage(ExtensionMessage.applyPageMark, {
            resolved,
            settings,
          }),
          extensionApi,
        )
        return
      } catch (error) {
        if (attempt === 2) {
          logger.warn('Failed to apply page mark', { tabId, error })
          return
        }

        await new Promise(resolve => globalThis.setTimeout(resolve, 120 * (attempt + 1)))
      }
    }
  }

  async function syncTabMark(tabId, url) {
    if (tabId == null || !isHttpTabUrl(url)) {
      await setActionBadge(tabId)
      return null
    }

    const data = await resolveUrl(url, tabId)

    await Promise.all([
      setActionBadge(tabId),
      applyPageMark(tabId, data.resolved, data.settings),
    ])

    return data.resolved
  }

  async function buildActiveContext() {
    const snapshot = await getActiveTabSnapshot()
    const data = await resolveUrl(snapshot.url, snapshot.tab?.id, snapshot.title)
    const urlInfo = parseTabUrl(snapshot.url)
    const directMark = urlInfo ? data.state.marks[urlInfo.urlKey] || null : null
    const skip = urlInfo ? data.state.skips[urlInfo.urlKey] || null : null

    if (snapshot.tab?.id != null) {
      await syncTabMark(snapshot.tab.id, snapshot.url)
    }

    return {
      tab: snapshot.tab,
      resolved: data.resolved,
      directMark,
      skip,
      rules: data.rules,
      marks: Object.values(data.state.marks),
      settings: data.settings,
      colors: MARK_COLORS,
    }
  }

  async function applyTabMark(tab, colorId = DEFAULT_MARK_COLOR_ID) {
    const urlInfo = parseTabUrl(tab?.url)
    if (!urlInfo || tab?.id == null) {
      throw new Error(t('common.unsupportedPage'))
    }

    const [state, rules] = await Promise.all([
      getMarkState(),
      getRules(),
    ])
    const nextState = cloneState(state)
    const matchingRule = findRuleMatch(urlInfo, rules, tab.title || '')
    const now = Date.now()
    const nextRule = normalizeTabMarkRule(matchingRule
      ? {
          ...matchingRule,
          colorId,
          updatedAt: now,
        }
      : {
          name: createRuleDisplayName(urlInfo.hostname, ''),
          enabled: true,
          colorId,
          conditions: {
            siteDomain: urlInfo.hostname,
            keyword: '',
          },
          createdAt: now,
          updatedAt: now,
        })
    const nextRules = [
      nextRule,
      ...rules.filter(rule => rule.id !== nextRule.id),
    ]

    delete nextState.marks[urlInfo.urlKey]
    delete nextState.skips[urlInfo.urlKey]

    await Promise.all([
      setMarkState(nextState),
      setRules(nextRules),
    ])
    await refreshAllMarkedTabs()

    return syncTabMark(tab.id, tab.url)
  }

  async function clearTabMark(tab) {
    const urlInfo = parseTabUrl(tab?.url)
    if (!urlInfo || tab?.id == null) {
      throw new Error(t('common.unsupportedPage'))
    }

    const [state, rules] = await Promise.all([
      getMarkState(),
      getRules(),
    ])
    const nextState = cloneState(state)
    const directMark = nextState.marks[urlInfo.urlKey]
    const matchingRule = directMark ? null : findRuleMatch(urlInfo, rules, tab.title || '')

    delete nextState.marks[urlInfo.urlKey]
    delete nextState.skips[urlInfo.urlKey]

    await Promise.all([
      setMarkState(nextState),
      matchingRule
        ? setRules(rules.filter(rule => rule.id !== matchingRule.id))
        : Promise.resolve(rules),
    ])
    await refreshAllMarkedTabs()

    return syncTabMark(tab.id, tab.url)
  }

  async function setActiveTabMark(colorId = DEFAULT_MARK_COLOR_ID) {
    const snapshot = await getActiveTabSnapshot()

    if (!parseTabUrl(snapshot.url)) {
      throw new Error(t('common.unsupportedPage'))
    }

    if (snapshot.tab?.id == null) {
      throw new Error(t('common.unsupportedTab'))
    }

    await applyTabMark({
      id: snapshot.tab.id,
      title: snapshot.title,
      url: snapshot.url,
    }, colorId)

    return buildActiveContext()
  }

  async function clearActiveTabMark() {
    const snapshot = await getActiveTabSnapshot()

    if (!parseTabUrl(snapshot.url)) {
      throw new Error(t('common.unsupportedPage'))
    }

    if (snapshot.tab?.id == null) {
      throw new Error(t('common.unsupportedTab'))
    }

    await clearTabMark({
      id: snapshot.tab.id,
      title: snapshot.title,
      url: snapshot.url,
    })

    return buildActiveContext()
  }

  async function cycleActiveTabMark() {
    const snapshot = await getActiveTabSnapshot()
    const current = await resolveUrl(snapshot.url, snapshot.tab?.id, snapshot.title)
    const nextColorId = current.resolved.mark
      ? getNextColorId(current.resolved.mark.colorId)
      : DEFAULT_MARK_COLOR_ID

    return setActiveTabMark(nextColorId)
  }

  async function toggleActiveTabMark() {
    const snapshot = await getActiveTabSnapshot()
    const current = await resolveUrl(snapshot.url, snapshot.tab?.id, snapshot.title)

    if (current.resolved.mark) {
      return clearActiveTabMark()
    }

    return setActiveTabMark(DEFAULT_MARK_COLOR_ID)
  }

  async function getOverview() {
    const [state, rules, settings] = await Promise.all([
      getMarkState(),
      getRules(),
      getSettings(),
    ])

    return {
      marks: Object.values(state.marks)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      skips: Object.values(state.skips),
      rules,
      settings,
      colors: MARK_COLORS,
    }
  }

  async function exportData() {
    const [settings, state, rules] = await Promise.all([
      getSettings(),
      getMarkState(),
      getRules(),
    ])

    return {
      _page_mark_line_export: true,
      version: 1,
      exportDate: new Date().toISOString(),
      settings,
      state,
      rules,
    }
  }

  async function importData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error(t('common.invalidImport'))
    }

    if (data.settings) {
      await storage.set(SETTINGS_STORAGE_KEY, normalizeSettings(data.settings))
    }

    if (data.state) {
      await setMarkState(data.state)
    }

    if (Array.isArray(data.rules)) {
      await setRules(data.rules)
    }

    await refreshActiveTab()
    return getOverview()
  }

  async function resetData() {
    await Promise.all([
      storage.set(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS),
      setMarkState(DEFAULT_TAB_MARK_STATE),
      setRules([]),
    ])

    await refreshActiveTab()
    return getOverview()
  }

  async function addRule(rulePayload) {
    const rules = await getRules()
    const now = Date.now()
    const nextRule = normalizeTabMarkRule({
      ...rulePayload,
      createdAt: now,
      updatedAt: now,
    })

    const nextRules = await setRules([
      nextRule,
      ...rules.filter(rule => rule.id !== nextRule.id),
    ])

    await refreshActiveTab()

    return nextRules
  }

  async function updateRule(rulePayload) {
    const rules = await getRules()
    const existingRule = rules.find(rule => rule.id === rulePayload.id)
    const now = Date.now()
    const nextRule = normalizeTabMarkRule({
      ...existingRule,
      ...rulePayload,
      createdAt: existingRule?.createdAt || now,
      updatedAt: now,
    })

    const nextRules = await setRules(
      rules.map(rule => (rule.id === nextRule.id ? nextRule : rule)),
    )

    await refreshActiveTab()

    return nextRules
  }

  async function deleteRule(id) {
    const rules = await getRules()
    const nextRules = await setRules(rules.filter(rule => rule.id !== id))

    await refreshActiveTab()

    return nextRules
  }

  async function updateMarkColor(urlKey, colorId) {
    const state = await getMarkState()
    const nextState = cloneState(state)
    const mark = nextState.marks[urlKey]

    if (!mark) {
      throw new Error(t('common.unsupportedPage'))
    }

    nextState.marks[urlKey] = {
      ...mark,
      colorId,
      updatedAt: Date.now(),
    }

    await setMarkState(nextState)
    await refreshAllMarkedTabs()

    return getOverview()
  }

  async function deleteMark(urlKey) {
    const state = await getMarkState()
    const nextState = cloneState(state)

    delete nextState.marks[urlKey]
    delete nextState.skips[urlKey]

    const savedState = await setMarkState(nextState)
    await refreshAllMarkedTabs()

    return savedState
  }

  async function openMarkedUrl(url) {
    if (!isHttpTabUrl(url)) {
      throw new Error(t('common.cannotOpenUrl'))
    }

    const tab = await createTab({ url }, extensionApi)

    return toPublicTab(tab)
  }

  async function saveTabHostnameRule(tab) {
    const urlInfo = parseTabUrl(tab?.url)
    if (!urlInfo || tab?.id == null) return null

    const data = await resolveUrl(tab.url, tab.id, tab.title || '')
    const colorId = data.resolved.mark?.colorId || DEFAULT_MARK_COLOR_ID
    const siteDomain = urlInfo.hostname

    return addRule({
      name: createRuleDisplayName(siteDomain, ''),
      colorId,
      enabled: true,
      conditions: {
        siteDomain,
        keyword: '',
      },
    })
  }

  async function refreshActiveTab() {
    const tab = await getActiveTab(extensionApi)
    if (!tab?.id) return null

    let url = tab.url || ''

    if (!isHttpTabUrl(url)) {
      try {
        const pageContext = await sendTabMessage(
          tab.id,
          createExtensionMessage(ExtensionMessage.getPageContext),
          extensionApi,
        )
        url = pageContext?.url || url
      } catch {
        url = ''
      }
    }

    return syncTabMark(tab.id, url)
  }

  function createContextMenus() {
    const menus = extensionApi.contextMenus
    if (!menus?.create) return

    const createMenus = () => {
      menus.create({
        id: CONTEXT_MENU_PARENT_ID,
        title: `${APP_NAME} - ${t('common.setColor')}`,
        contexts: ['page'],
      })

      for (const color of MARK_COLORS.slice(0, 8)) {
        menus.create({
          id: `${CONTEXT_MENU_PARENT_ID}-${color.id}`,
          parentId: CONTEXT_MENU_PARENT_ID,
          title: colorLabel(color),
          contexts: ['page'],
        })
      }

      menus.create({
        id: `${CONTEXT_MENU_PARENT_ID}-separator`,
        parentId: CONTEXT_MENU_PARENT_ID,
        type: 'separator',
        contexts: ['page'],
      })

      menus.create({
        id: CONTEXT_MENU_REMOVE_ID,
        parentId: CONTEXT_MENU_PARENT_ID,
        title: t('common.removeColor'),
        contexts: ['page'],
      })

      menus.create({
        id: CONTEXT_MENU_SAVE_RULE_ID,
        parentId: CONTEXT_MENU_PARENT_ID,
        title: t('common.saveSiteRule'),
        contexts: ['page'],
      })
    }

    if (menus.removeAll) {
      let created = false
      const createOnce = () => {
        if (created) return
        created = true
        createMenus()
      }

      try {
        const result = menus.removeAll(createOnce)
        if (result?.then) result.then(createOnce).catch(createOnce)
      } catch {
        createOnce()
      }
      return
    }

    createMenus()
  }

  function setupListeners() {
    void refreshAllMarkedTabs()
    extensionApi.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading' || changeInfo.url || tab?.url) {
        syncTabMark(tabId, changeInfo.url || tab?.url).catch(() => {})
      }
    })

    extensionApi.tabs?.onActivated?.addListener(({ tabId }) => {
      callExtensionApi(
        extensionApi.tabs.get.bind(extensionApi.tabs),
        [tabId],
        extensionApi,
      )
        .then(tab => syncTabMark(tabId, tab?.url))
        .catch(() => {})
    })

    extensionApi.tabGroups?.onUpdated?.addListener((group) => {
      if (!extensionApi.tabs?.query) return

      callExtensionApi(
        extensionApi.tabs.query.bind(extensionApi.tabs),
        [{ groupId: group.id }],
        extensionApi,
      )
        .then(tabs => {
          for (const tab of tabs || []) {
            if (tab.id != null && tab.url) {
              syncTabMark(tab.id, tab.url).catch(() => {})
            }
          }
        })
        .catch(() => {})
    })

    extensionApi.commands?.onCommand?.addListener((command) => {
      if (COMMAND_COLOR_MAP[command]) {
        setActiveTabMark(COMMAND_COLOR_MAP[command]).catch(() => {})
      }

      if (command === COMMAND_REMOVE_COLOR) {
        clearActiveTabMark().catch(() => {})
      }

      if (command === COMMAND_TOGGLE_TAB_MARK) {
        toggleActiveTabMark().catch(() => {})
      }

      if (command === COMMAND_CYCLE_TAB_MARK_COLOR) {
        cycleActiveTabMark().catch(() => {})
      }
    })

    extensionApi.contextMenus?.onClicked?.addListener((info, tab) => {
      if (info.menuItemId === CONTEXT_MENU_REMOVE_ID) {
        clearTabMark(tab).catch(() => {})
        return
      }

      if (info.menuItemId === CONTEXT_MENU_SAVE_RULE_ID) {
        saveTabHostnameRule(tab).catch(() => {})
        return
      }

      const colorId = String(info.menuItemId || '').replace(`${CONTEXT_MENU_PARENT_ID}-`, '')
      if (MARK_COLORS.some(color => color.id === colorId)) {
        applyTabMark(tab, colorId).catch(() => {})
      }
    })
  }

  const handlers = {
    [ExtensionMessage.getActiveTabMark]: buildActiveContext,

    [ExtensionMessage.setActiveTabMark]: ({ payload }) => (
      setActiveTabMark(payload.colorId || DEFAULT_MARK_COLOR_ID)
    ),

    [ExtensionMessage.cycleActiveTabMark]: cycleActiveTabMark,

    [ExtensionMessage.clearActiveTabMark]: clearActiveTabMark,

    [ExtensionMessage.getUrlMark]: async ({ payload, sender }) => {
      const url = payload.url || sender?.url || sender?.tab?.url || ''
      const tabId = sender?.tab?.id ?? null

      if (tabId != null && isHttpTabUrl(url)) {
        await syncTabMark(tabId, url)
      } else if (tabId != null) {
        await setActionBadge(tabId)
      }

      const data = await resolveUrl(url, tabId)

      return {
        resolved: data.resolved,
        settings: data.settings,
        colors: MARK_COLORS,
      }
    },

    [ExtensionMessage.composeFaviconMark]: ({ payload }) => (
      composeFaviconDataUrlSafe(payload.faviconUrl, payload.colorValue)
    ),

    [ExtensionMessage.getTabMarkOverview]: getOverview,

    [ExtensionMessage.getTabMarkRules]: getRules,

    [ExtensionMessage.exportTabMarkData]: exportData,

    [ExtensionMessage.importTabMarkData]: ({ payload }) => importData(payload.data || payload),

    [ExtensionMessage.resetTabMarkData]: resetData,

    [ExtensionMessage.addTabMarkRule]: ({ payload }) => addRule(payload.rule || payload),

    [ExtensionMessage.updateTabMarkRule]: ({ payload }) => updateRule(payload.rule || payload),

    [ExtensionMessage.deleteTabMarkRule]: ({ payload }) => deleteRule(payload.id),

    [ExtensionMessage.deleteTabMark]: ({ payload }) => deleteMark(payload.urlKey),

    [ExtensionMessage.updateTabMarkColor]: ({ payload }) => updateMarkColor(payload.urlKey, payload.colorId),

    [ExtensionMessage.openMarkedUrl]: ({ payload }) => openMarkedUrl(payload.url),
  }

  const validators = {
    [ExtensionMessage.setActiveTabMark]: validateColorPayload,
    [ExtensionMessage.updateTabMarkColor]: validateColorPayload,
    [ExtensionMessage.addTabMarkRule]: validateRulePayload,
    [ExtensionMessage.updateTabMarkRule]: validateRulePayload,
  }

  return {
    ensureDefaults,
    setupListeners,
    handlers,
    validators,
    refreshActiveTab,
    refreshAllMarkedTabs,
    toggleActiveTabMark,
    cycleActiveTabMark,
    createContextMenus,
  }
}
