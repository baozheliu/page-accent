import assert from 'node:assert/strict'
import test from 'node:test'
import { createTabMarkController } from '../src/extension/background/tab-marks.js'
import { ExtensionMessage } from '../src/extension/messaging.js'
import {
  TAB_MARK_RULES_STORAGE_KEY,
  TAB_MARK_STATE_STORAGE_KEY,
  buildKeywordSuggestions,
  doesRuleMatchUrl,
  parseTabUrl,
} from '../src/shared/tab-marks.js'

function createRule(siteDomain, keyword = '') {
  return {
    id: `${siteDomain}-${keyword || 'all'}`,
    enabled: true,
    colorId: 'blue',
    conditions: { siteDomain, keyword },
  }
}

test('site rules match every path, parameter, and hash on the exact hostname only', () => {
  const rule = createRule('docs.example.com')

  assert.equal(doesRuleMatchUrl(rule, parseTabUrl('https://docs.example.com/')), true)
  assert.equal(doesRuleMatchUrl(rule, parseTabUrl('https://docs.example.com/a/b?mode=full#part')), true)
  assert.equal(doesRuleMatchUrl(rule, parseTabUrl('https://www.docs.example.com/a')), true)
  assert.equal(doesRuleMatchUrl(rule, parseTabUrl('https://example.com/a/b')), false)
  assert.equal(doesRuleMatchUrl(rule, parseTabUrl('https://internal.docs.example.com/')), false)

  const baseRule = createRule('example.com')
  assert.equal(doesRuleMatchUrl(baseRule, parseTabUrl('https://example.com/a/b?mode=full#part')), true)
  assert.equal(doesRuleMatchUrl(baseRule, parseTabUrl('https://www.example.com/')), true)
  assert.equal(doesRuleMatchUrl(baseRule, parseTabUrl('https://docs.example.com/')), false)
})

test('keyword rules match path, query, hash, and title within their exact host', () => {
  const cases = [
    ['project-42', 'https://example.com/projects/project-42'],
    ['board', 'https://example.com/projects/42?view=board'],
    ['notes', 'https://example.com/projects/42#notes'],
  ]

  for (const [keyword, url] of cases) {
    assert.equal(doesRuleMatchUrl(createRule('example.com', keyword), parseTabUrl(url)), true)
  }

  assert.equal(
    doesRuleMatchUrl(
      createRule('example.com', 'quarterly report'),
      parseTabUrl('https://example.com/projects/other'),
      { title: 'Quarterly Report' },
    ),
    true,
  )
  assert.equal(
    doesRuleMatchUrl(createRule('example.com', 'project-42'), parseTabUrl('https://docs.example.com/project-42')),
    false,
  )
})

test('keyword suggestions include URL and page-title words', () => {
  const urlInfo = parseTabUrl('https://docs.example.com/projects/alpha?view=board#notes')
  const suggestions = buildKeywordSuggestions(urlInfo, 'Quarterly Report')

  assert.ok(suggestions.includes('alpha'))
  assert.ok(suggestions.includes('board'))
  assert.ok(suggestions.includes('quarterly'))
})

test('quick marking creates a whole-site rule and removing it deletes that rule', async () => {
  const tab = {
    id: 7,
    title: 'Example project',
    url: 'https://example.com/projects/42?view=board',
  }
  const values = new Map()
  const storage = {
    async get(key, fallback) {
      return values.has(key) ? values.get(key) : fallback
    },
    async set(key, value) {
      values.set(key, value)
    },
  }
  const extensionApi = {
    runtime: { lastError: null },
    tabs: {
      query(query, callback) {
        callback(query.active ? [tab] : [])
      },
      sendMessage(_tabId, message, callback) {
        const data = message.type === ExtensionMessage.getPageContext
          ? { url: tab.url, title: tab.title }
          : null
        callback({ ok: true, data })
      },
    },
  }
  const controller = createTabMarkController({ extensionApi, storage })

  await controller.handlers[ExtensionMessage.setActiveTabMark]({
    payload: { colorId: 'green' },
  })

  const rules = values.get(TAB_MARK_RULES_STORAGE_KEY)
  const state = values.get(TAB_MARK_STATE_STORAGE_KEY)
  assert.equal(rules.length, 1)
  assert.deepEqual(rules[0].conditions.siteDomain, 'example.com')
  assert.deepEqual(rules[0].conditions.keyword, '')
  assert.equal(rules[0].colorId, 'green')
  assert.deepEqual(state.marks, {})

  await controller.handlers[ExtensionMessage.clearActiveTabMark]({ payload: {} })
  assert.deepEqual(values.get(TAB_MARK_RULES_STORAGE_KEY), [])
})

test('legacy page marks can be deleted by URL key', async () => {
  const urlKey = 'https://example.com/legacy'
  const values = new Map([
    [TAB_MARK_STATE_STORAGE_KEY, {
      version: 1,
      marks: {
        [urlKey]: {
          urlKey,
          colorId: 'red',
          title: 'Legacy mark',
          url: urlKey,
          updatedAt: 1,
        },
      },
      skips: {},
    }],
  ])
  const storage = {
    async get(key, fallback) {
      return values.has(key) ? values.get(key) : fallback
    },
    async set(key, value) {
      values.set(key, value)
    },
  }
  const extensionApi = {
    runtime: { lastError: null },
    tabs: {
      query(_query, callback) {
        callback([])
      },
    },
  }
  const controller = createTabMarkController({ extensionApi, storage })

  await controller.handlers[ExtensionMessage.deleteTabMark]({ payload: { urlKey } })

  assert.deepEqual(values.get(TAB_MARK_STATE_STORAGE_KEY).marks, {})
})
