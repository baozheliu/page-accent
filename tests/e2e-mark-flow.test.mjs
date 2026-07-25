import assert from 'node:assert/strict'
import test from 'node:test'
import { createTabMarkController } from '../src/extension/background/tab-marks.js'
import { ExtensionMessage } from '../src/extension/messaging.js'
import { paintFaviconMark } from '../src/shared/favicon-compose.js'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../src/shared/settings.js'
import {
  MARK_COLORS,
  TAB_MARK_RULES_STORAGE_KEY,
  TAB_MARK_STATE_STORAGE_KEY,
  doesRuleMatchUrl,
  getColorLineBackground,
  getColorSwatchBackground,
  getMarkColor,
  normalizeRuleSite,
  parseTabUrl,
  resolveTabMark,
} from '../src/shared/tab-marks.js'

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed))
  return {
    values,
    async get(key, fallback) {
      return values.has(key) ? values.get(key) : fallback
    },
    async set(key, value) {
      values.set(key, value)
    },
  }
}

function createController(tab, storage) {
  const extensionApi = {
    runtime: { lastError: null },
    tabs: {
      query(query, callback) {
        if (query?.url) {
          callback(tab ? [tab] : [])
          return
        }
        callback(query?.active ? (tab ? [tab] : []) : (tab ? [tab] : []))
      },
      sendMessage(_tabId, message, callback) {
        const data = message.type === ExtensionMessage.getPageContext
          ? { url: tab?.url || '', title: tab?.title || '' }
          : message.type === ExtensionMessage.applyPageMark
            ? { applied: true }
            : null
        callback({ ok: true, data })
      },
    },
  }

  return createTabMarkController({ extensionApi, storage })
}

test('e2e: exact-host rule covers paths/query/hash but not sibling hosts', () => {
  const rules = [{
    id: 'docs',
    enabled: true,
    colorId: 'tricolor',
    conditions: { siteDomain: 'docs.google.com', keyword: '' },
  }]

  const hit = resolveTabMark('https://docs.google.com/document/d/1?mode=edit#heading', {
    settings: DEFAULT_SETTINGS,
    state: { version: 1, marks: {}, skips: {} },
    rules,
    title: 'Doc',
  })
  const missRoot = resolveTabMark('https://google.com/', {
    settings: DEFAULT_SETTINGS,
    state: { version: 1, marks: {}, skips: {} },
    rules,
  })
  const missSibling = resolveTabMark('https://drive.google.com/', {
    settings: DEFAULT_SETTINGS,
    state: { version: 1, marks: {}, skips: {} },
    rules,
  })

  assert.equal(hit.source, 'rule')
  assert.equal(hit.mark.colorId, 'tricolor')
  assert.equal(missRoot.source, 'none')
  assert.equal(missSibling.source, 'none')
})

test('e2e: quick mark on subdomain stores hostname, not eTLD+1', async () => {
  const tab = {
    id: 11,
    title: 'Docs',
    url: 'https://docs.google.com/document/d/abc',
  }
  const storage = createStorage()
  const controller = createController(tab, storage)

  const context = await controller.handlers[ExtensionMessage.setActiveTabMark]({
    payload: { colorId: 'tricolor' },
  })

  const rules = storage.values.get(TAB_MARK_RULES_STORAGE_KEY)
  assert.equal(rules.length, 1)
  assert.equal(rules[0].conditions.siteDomain, 'docs.google.com')
  assert.equal(rules[0].colorId, 'tricolor')
  assert.equal(context.resolved.source, 'rule')
  assert.equal(context.resolved.mark.colorId, 'tricolor')

  // Sibling host on the same registrable domain stays unmarked.
  const sibling = resolveTabMark('https://mail.google.com/mail', {
    settings: DEFAULT_SETTINGS,
    state: storage.values.get(TAB_MARK_STATE_STORAGE_KEY),
    rules,
  })
  assert.equal(sibling.source, 'none')
})

test('e2e: data-management color update for rules and page marks', async () => {
  const ruleId = 'rule-1'
  const urlKey = 'https://example.com/legacy'
  const storage = createStorage({
    [TAB_MARK_RULES_STORAGE_KEY]: [{
      id: ruleId,
      name: 'example.com · 整个网站',
      enabled: true,
      colorId: 'blue',
      conditions: { siteDomain: 'example.com', keyword: '' },
      createdAt: 1,
      updatedAt: 1,
    }],
    [TAB_MARK_STATE_STORAGE_KEY]: {
      version: 1,
      marks: {
        [urlKey]: {
          urlKey,
          colorId: 'red',
          title: 'Legacy',
          url: urlKey,
          updatedAt: 1,
        },
      },
      skips: {},
    },
  })
  const controller = createController(null, storage)

  await controller.handlers[ExtensionMessage.updateTabMarkRule]({
    payload: {
      rule: {
        id: ruleId,
        name: 'example.com · 整个网站',
        enabled: true,
        colorId: 'tricolor',
        conditions: { siteDomain: 'example.com', keyword: '' },
      },
    },
  })

  await controller.handlers[ExtensionMessage.updateTabMarkColor]({
    payload: { urlKey, colorId: 'green' },
  })

  const overview = await controller.handlers[ExtensionMessage.getTabMarkOverview]()
  assert.equal(overview.rules[0].colorId, 'tricolor')
  assert.equal(overview.marks[0].colorId, 'green')
})

test('e2e: composite swatch is rectangular segments; solid value stays primary red', () => {
  const tricolor = getMarkColor('tricolor')
  const swatch = getColorSwatchBackground(tricolor)
  const line = getColorLineBackground(tricolor)

  assert.equal(tricolor.value, '#EF4444')
  assert.ok(swatch.includes('linear-gradient(90deg'))
  assert.doesNotMatch(swatch, /conic-gradient/)
  assert.ok(swatch.includes('#EF4444'))
  assert.ok(swatch.includes('#EAB308'))
  assert.ok(swatch.includes('#22C55E'))
  assert.match(line, /^linear-gradient\(90deg/)
  assert.equal(MARK_COLORS.some(color => color.id === 'tricolor' && color.stripes?.length === 3), true)
})

test('e2e: normalizeRuleSite keeps full hostname for rule forms', () => {
  assert.equal(normalizeRuleSite('https://www.Docs.Google.com/a?b=1'), 'docs.google.com')
  assert.equal(normalizeRuleSite('mail.google.com'), 'mail.google.com')
})

test('e2e: keyword refinement stays host-scoped and ignores hostname substrings', () => {
  const rule = {
    enabled: true,
    colorId: 'blue',
    conditions: { siteDomain: 'example.com', keyword: 'docs' },
  }

  assert.equal(
    doesRuleMatchUrl(rule, parseTabUrl('https://docs.example.com/projects')),
    false,
  )
  assert.equal(
    doesRuleMatchUrl(rule, parseTabUrl('https://example.com/docs/guide')),
    true,
  )
})

test('e2e: line-width setting round-trips through settings update', async () => {
  const storage = createStorage({
    [SETTINGS_STORAGE_KEY]: { ...DEFAULT_SETTINGS, lineWidth: 3 },
  })
  const controller = createController({
    id: 1,
    title: 'Home',
    url: 'https://example.com/',
  }, storage)

  // Controllers expose settings via background handlers registered elsewhere;
  // verify storage + resolve path still honor lineWidth for page application.
  await storage.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, lineWidth: 8 })
  const settings = await storage.get(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
  assert.equal(settings.lineWidth, 8)

  await controller.handlers[ExtensionMessage.setActiveTabMark]({
    payload: { colorId: 'red' },
  })
  const urlMark = await controller.handlers[ExtensionMessage.getUrlMark]({
    payload: { url: 'https://example.com/path' },
    sender: { tab: { id: 1, url: 'https://example.com/path' } },
  })
  assert.equal(urlMark.settings.lineWidth, 8)
  assert.equal(urlMark.resolved.source, 'rule')
})

test('e2e: favicon composer paints stacked segments for composite colors', () => {
  const ops = []
  const ctx = {
    clearRect(...args) { ops.push(['clear', ...args]) },
    drawImage() { ops.push(['draw']) },
    fillRect(...args) { ops.push(['fill', this.fillStyle, ...args]) },
    fillStyle: '',
  }
  const image = { width: 32, height: 32 }

  paintFaviconMark(ctx, image, '#EF4444,#EAB308,#22C55E', {
    size: 30,
    stripeWidth: 6,
    stripeGap: 0,
  })

  const fills = ops.filter(op => op[0] === 'fill')
  assert.equal(fills.length, 3)
  assert.equal(fills[0][1], '#EF4444')
  assert.equal(fills[1][1], '#EAB308')
  assert.equal(fills[2][1], '#22C55E')
})

test('e2e: export/import preserves exact-host rules and tricolor', async () => {
  const storage = createStorage()
  const tab = {
    id: 3,
    title: 'Docs',
    url: 'https://docs.example.com/a',
  }
  const controller = createController(tab, storage)

  await controller.handlers[ExtensionMessage.setActiveTabMark]({
    payload: { colorId: 'tricolor' },
  })

  const exported = await controller.handlers[ExtensionMessage.exportTabMarkData]()
  assert.equal(exported.rules[0].conditions.siteDomain, 'docs.example.com')
  assert.equal(exported.rules[0].colorId, 'tricolor')

  const other = createStorage()
  const otherController = createController(tab, other)
  await otherController.handlers[ExtensionMessage.importTabMarkData]({
    payload: { data: exported },
  })

  const overview = await otherController.handlers[ExtensionMessage.getTabMarkOverview]()
  assert.equal(overview.rules.length, 1)
  assert.equal(overview.rules[0].conditions.siteDomain, 'docs.example.com')
  assert.equal(overview.rules[0].colorId, 'tricolor')
})

test('e2e: clear mark removes matching exact-host rule', async () => {
  const tab = {
    id: 9,
    title: 'Site',
    url: 'https://news.example.com/today',
  }
  const storage = createStorage()
  const controller = createController(tab, storage)

  await controller.handlers[ExtensionMessage.setActiveTabMark]({
    payload: { colorId: 'orange' },
  })
  assert.equal(storage.values.get(TAB_MARK_RULES_STORAGE_KEY).length, 1)

  await controller.handlers[ExtensionMessage.clearActiveTabMark]({ payload: {} })
  assert.deepEqual(storage.values.get(TAB_MARK_RULES_STORAGE_KEY), [])
})
