export const TAB_MARK_STATE_STORAGE_KEY = 'tabMarkState'
export const TAB_MARK_RULES_STORAGE_KEY = 'tabMarkRules'

export const MarkSource = Object.freeze({
  direct: 'direct',
  rule: 'rule',
  tabGroup: 'tabGroup',
  skipped: 'skipped',
  none: 'none',
  disabled: 'disabled',
  unsupported: 'unsupported',
})

export const MARK_COLORS = Object.freeze([
  {
    id: 'red',
    label: '红色',
    value: '#EF4444',
    tint: 'rgba(239, 68, 68, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'light-red',
    label: '浅红',
    value: '#F87171',
    tint: 'rgba(248, 113, 113, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'orange',
    label: '橙色',
    value: '#F97316',
    tint: 'rgba(249, 115, 22, 0.14)',
    badgeText: '#ffffff',
  },
  {
    id: 'light-orange',
    label: '浅橙',
    value: '#FDBA74',
    tint: 'rgba(253, 186, 116, 0.16)',
    badgeText: '#172033',
  },
  {
    id: 'yellow',
    label: '黄色',
    value: '#EAB308',
    tint: 'rgba(234, 179, 8, 0.17)',
    badgeText: '#172033',
  },
  {
    id: 'lime',
    label: '青柠',
    value: '#84CC16',
    tint: 'rgba(132, 204, 22, 0.15)',
    badgeText: '#172033',
  },
  {
    id: 'green',
    label: '绿色',
    value: '#22C55E',
    tint: 'rgba(34, 197, 94, 0.14)',
    badgeText: '#ffffff',
  },
  {
    id: 'emerald',
    label: '翠绿',
    value: '#10B981',
    tint: 'rgba(16, 185, 129, 0.14)',
    badgeText: '#ffffff',
  },
  {
    id: 'cyan',
    label: '青色',
    value: '#06B6D4',
    tint: 'rgba(6, 182, 212, 0.14)',
    badgeText: '#ffffff',
  },
  {
    id: 'blue',
    label: '蓝色',
    value: '#3B82F6',
    tint: 'rgba(59, 130, 246, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'light-blue',
    label: '浅蓝',
    value: '#60A5FA',
    tint: 'rgba(96, 165, 250, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'indigo',
    label: '靛蓝',
    value: '#6366F1',
    tint: 'rgba(99, 102, 241, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'purple',
    label: '紫色',
    value: '#8B5CF6',
    tint: 'rgba(139, 92, 246, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'fuchsia',
    label: '紫红',
    value: '#D946EF',
    tint: 'rgba(217, 70, 239, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'pink',
    label: '粉色',
    value: '#EC4899',
    tint: 'rgba(236, 72, 153, 0.13)',
    badgeText: '#ffffff',
  },
  {
    id: 'rose',
    label: '玫瑰',
    value: '#FDA4AF',
    tint: 'rgba(253, 164, 175, 0.15)',
    badgeText: '#172033',
  },
  {
    id: 'slate',
    label: '灰蓝',
    value: '#94A3B8',
    tint: 'rgba(148, 163, 184, 0.14)',
    badgeText: '#172033',
  },
  {
    id: 'zinc',
    label: '中性灰',
    value: '#71717A',
    tint: 'rgba(113, 113, 122, 0.14)',
    badgeText: '#ffffff',
  },
  {
    id: 'black',
    label: '黑色',
    value: '#000000',
    tint: 'rgba(17, 24, 39, 0.15)',
    badgeText: '#ffffff',
  },
  {
    id: 'tricolor',
    label: '红黄绿',
    value: '#EF4444',
    stripes: ['#EF4444', '#EAB308', '#22C55E'],
    tint: 'rgba(234, 179, 8, 0.13)',
    badgeText: '#ffffff',
  },
])

/**
 * Swatch background for a mark color. Composite colors (with `stripes`)
 * render as equal side-by-side rectangles.
 */
export function getColorSwatchBackground(color) {
  return getColorLineBackground(color, { direction: '90deg' })
}

/**
 * Line background for a mark color. Composite colors render as hard-stop
 * segments, each occupying an equal share of the line.
 */
export function getColorLineBackground(color, { direction = '90deg' } = {}) {
  if (!color) return ''

  const stripes = Array.isArray(color.stripes) ? color.stripes.filter(Boolean) : []
  if (stripes.length < 2) return color.value

  const step = 100 / stripes.length
  const stops = stripes
    .map((stripe, index) => `${stripe} ${index * step}% ${(index + 1) * step}%`)
    .join(', ')

  return `linear-gradient(${direction}, ${stops})`
}

export const MARK_COLOR_SEQUENCE = Object.freeze(MARK_COLORS.map(color => color.id))
export const DEFAULT_MARK_COLOR_ID = MARK_COLOR_SEQUENCE[0]

export const DEFAULT_TAB_MARK_STATE = Object.freeze({
  version: 1,
  marks: {},
  skips: {},
})

const MARK_COLOR_IDS = new Set(MARK_COLOR_SEQUENCE)
const LEGACY_COLOR_ID_ALIASES = Object.freeze({
  white: 'slate',
})

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueTexts(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(trimText)
      .filter(Boolean),
  )]
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeDate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}

/** Common multi-part public suffixes for lightweight eTLD+1 extraction. */
const MULTI_PART_PUBLIC_SUFFIXES = Object.freeze([
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.hk',
  'com.tw',
  'com.sg',
])

/**
 * Extract registrable site domain (eTLD+1) from a hostname.
 * e.g. docs.google.com → google.com, www.example.com.cn → example.com.cn
 */
export function getSiteDomain(hostname) {
  const normalized = trimText(hostname).toLowerCase().replace(/^www\./, '')
  if (!normalized) return ''

  const parts = normalized.split('.').filter(Boolean)
  if (parts.length <= 2) return normalized

  const lastTwo = parts.slice(-2).join('.')
  if (MULTI_PART_PUBLIC_SUFFIXES.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }

  return lastTwo
}

/**
 * Rule sites match the exact hostname (www-insensitive):
 * docs.google.com only matches docs.google.com, not google.com or other subdomains.
 */
export function matchesSiteDomain(hostname, siteDomain) {
  const host = trimText(hostname).toLowerCase().replace(/^www\./, '')
  const site = trimText(siteDomain).toLowerCase().replace(/^www\./, '')
  if (!host || !site) return false

  return host === site
}

/** Normalize user input like "https://www.Docs.Google.com/a?b" into a rule site hostname. */
export function normalizeRuleSite(value) {
  const text = trimText(value).toLowerCase()
  if (!text) return ''

  const withoutScheme = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  const host = withoutScheme.split(/[/?#]/)[0]

  return host.replace(/^www\./, '')
}

export function createRuleDisplayName(siteDomain, keyword = '', labels = {}) {
  const site = trimText(siteDomain).toLowerCase().replace(/^www\./, '')
  const kw = trimText(keyword)
  if (!site) return labels.untitledRule || '未命名规则'
  return kw ? `${site} · ${kw}` : `${site} · ${labels.wholeSite || '整个网站'}`
}

export function buildKeywordSuggestions(urlInfo, title = '') {
  if (!urlInfo) return []

  const suggestions = []
  const seen = new Set()

  function push(value) {
    const text = trimText(value).toLowerCase()
    if (!text || text.length < 2 || seen.has(text)) return
    if (text === urlInfo.siteDomain || text === urlInfo.hostname) return
    seen.add(text)
    suggestions.push(text)
  }

  for (const segment of urlInfo.pathSegments || []) {
    push(segment)
  }

  for (const param of urlInfo.queryParams || []) {
    push(param.key)
    push(param.value)
  }

  if (urlInfo.hash) {
    push(urlInfo.hash.replace(/^#/, ''))
  }

  const titleWords = trimText(title)
    .toLowerCase()
    .split(/[\s\-_|/·•:：,，.。]+/)
    .filter(Boolean)

  for (const word of titleWords) {
    push(word)
  }

  return suggestions.slice(0, 8)
}

function getColorFallback(colorId) {
  if (LEGACY_COLOR_ID_ALIASES[colorId]) return LEGACY_COLOR_ID_ALIASES[colorId]
  return MARK_COLOR_IDS.has(colorId) ? colorId : DEFAULT_MARK_COLOR_ID
}

function normalizeMarkRecord(mark, fallbackUrlKey = '') {
  if (!isRecord(mark)) return null

  const urlKey = trimText(mark.urlKey) || fallbackUrlKey
  if (!urlKey) return null

  return {
    urlKey,
    colorId: getColorFallback(mark.colorId),
    title: trimText(mark.title),
    url: trimText(mark.url),
    updatedAt: normalizeDate(mark.updatedAt),
  }
}

function normalizeSkipRecord(skip, fallbackUrlKey = '') {
  if (!isRecord(skip)) return null

  const urlKey = trimText(skip.urlKey) || fallbackUrlKey
  if (!urlKey) return null

  return {
    urlKey,
    title: trimText(skip.title),
    updatedAt: normalizeDate(skip.updatedAt),
  }
}

export function getMarkColor(colorId) {
  return MARK_COLORS.find(color => color.id === colorId) || MARK_COLORS[0]
}

export function getNextColorId(colorId) {
  const index = MARK_COLOR_SEQUENCE.indexOf(colorId)

  if (index < 0) return DEFAULT_MARK_COLOR_ID

  return MARK_COLOR_SEQUENCE[(index + 1) % MARK_COLOR_SEQUENCE.length]
}

export function createRuleId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function parseTabUrl(url) {
  if (!url) return null

  let parsedUrl

  try {
    parsedUrl = new URL(url)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return null
  }

  const pathSegments = parsedUrl.pathname
    .split('/')
    .map(segment => safeDecode(segment).trim())
    .filter(Boolean)

  const queryParams = [...parsedUrl.searchParams.entries()]
    .map(([key, value]) => ({
      key: safeDecode(key).trim(),
      value: safeDecode(value).trim(),
    }))
    .filter(param => param.key)

  const hostname = parsedUrl.hostname.toLowerCase()
  const siteDomain = getSiteDomain(hostname)
  const hostParts = hostname.replace(/^www\./, '').split('.').filter(Boolean)
  const siteParts = siteDomain.split('.').filter(Boolean)
  const hostPrefix = hostParts.length > siteParts.length
    ? hostParts.slice(0, hostParts.length - siteParts.length).join('.')
    : ''
  const normalizedPath = parsedUrl.pathname || '/'
  const searchText = safeDecode(parsedUrl.search.replace(/^\?/, '')).toLowerCase()
  const hash = safeDecode(parsedUrl.hash.replace(/^#/, '')).toLowerCase()

  return {
    href: parsedUrl.href,
    origin: parsedUrl.origin,
    hostname,
    siteDomain,
    hostPrefix,
    pathname: normalizedPath,
    fullPath: `${hostname}${normalizedPath}`,
    pathnameText: safeDecode(normalizedPath).toLowerCase(),
    searchText,
    hash,
    urlKey: `${parsedUrl.origin}${normalizedPath}`,
    displayUrl: `${parsedUrl.hostname}${normalizedPath}`,
    pathSegments,
    queryParams,
  }
}

export function createUrlKey(url) {
  return parseTabUrl(url)?.urlKey || ''
}

export function normalizeTabMarkState(state = DEFAULT_TAB_MARK_STATE) {
  const normalized = {
    version: 1,
    marks: {},
    skips: {},
  }

  if (!isRecord(state)) return normalized

  if (isRecord(state.marks)) {
    for (const [urlKey, mark] of Object.entries(state.marks)) {
      const normalizedMark = normalizeMarkRecord(mark, urlKey)
      if (normalizedMark) normalized.marks[normalizedMark.urlKey] = normalizedMark
    }
  }

  if (isRecord(state.skips)) {
    for (const [urlKey, skip] of Object.entries(state.skips)) {
      const normalizedSkip = normalizeSkipRecord(skip, urlKey)
      if (normalizedSkip) normalized.skips[normalizedSkip.urlKey] = normalizedSkip
    }
  }

  return normalized
}

export function normalizeRuleConditions(conditions = {}) {
  if (!isRecord(conditions)) {
    return {
      siteDomain: '',
      keyword: '',
      exactUrlKey: '',
      hostname: '',
      hostnameSuffix: '',
      pathPattern: '',
      hostPrefix: '',
      pathFragments: [],
      queryParams: [],
    }
  }

  return {
    siteDomain: trimText(conditions.siteDomain).toLowerCase().replace(/^www\./, ''),
    keyword: trimText(conditions.keyword).toLowerCase(),
    exactUrlKey: trimText(conditions.exactUrlKey),
    hostname: trimText(conditions.hostname).toLowerCase().replace(/^www\./, ''),
    hostnameSuffix: trimText(conditions.hostnameSuffix).toLowerCase().replace(/^\*\./, '').replace(/^www\./, ''),
    pathPattern: trimText(conditions.pathPattern).toLowerCase(),
    hostPrefix: trimText(conditions.hostPrefix).toLowerCase(),
    pathFragments: uniqueTexts(conditions.pathFragments),
    queryParams: (Array.isArray(conditions.queryParams) ? conditions.queryParams : [])
      .map(param => {
        if (!isRecord(param)) return null

        const key = trimText(param.key)
        if (!key) return null

        const value = trimText(param.value)

        return {
          key,
          value,
          mode: param.mode === 'exists' || !value ? 'exists' : 'equals',
        }
      })
      .filter(Boolean),
  }
}

function migrateLegacyConditions(conditions) {
  if (conditions.siteDomain) return conditions

  // Exact-hostname rules map directly onto the site+keyword model.
  // Suffix/pattern-style legacy rules keep their original matching semantics
  // through the legacy matcher, so they are not migrated.
  if (conditions.hostname && !conditions.hostnameSuffix && !conditions.pathPattern && !conditions.hostPrefix) {
    return {
      ...conditions,
      siteDomain: conditions.hostname,
      hostname: '',
      keyword: (conditions.keyword || '').toLowerCase(),
    }
  }

  return conditions
}

export function normalizeTabMarkRule(rule = {}) {
  let conditions = migrateLegacyConditions(normalizeRuleConditions(rule.conditions))
  const defaultName = conditions.siteDomain
    ? createRuleDisplayName(conditions.siteDomain, conditions.keyword)
    : '未命名规则'

  return {
    id: trimText(rule.id) || createRuleId(),
    name: trimText(rule.name) || defaultName,
    enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
    colorId: getColorFallback(rule.colorId),
    conditions,
    createdAt: normalizeDate(rule.createdAt),
    updatedAt: normalizeDate(rule.updatedAt),
  }
}

export function normalizeTabMarkRules(rules = []) {
  if (!Array.isArray(rules)) return []

  return rules.map(normalizeTabMarkRule)
}

export function hasRuleConditions(rule) {
  const conditions = migrateLegacyConditions(normalizeRuleConditions(rule?.conditions))

  return Boolean(
    conditions.siteDomain
    || conditions.exactUrlKey
    || conditions.hostname
    || conditions.hostnameSuffix
    || conditions.pathPattern
    || conditions.hostPrefix
    || conditions.pathFragments.length
    || conditions.queryParams.length,
  )
}

function matchesExactHostname(hostname, pattern) {
  if (!pattern) return true

  const normalizedHost = hostname.replace(/^www\./, '')

  return normalizedHost === pattern
}

function matchesHostnameSuffix(hostname, suffix) {
  if (!suffix) return true

  const normalizedHost = hostname.replace(/^www\./, '')

  return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`)
}

function matchesPathPattern(fullPath, pattern) {
  if (!pattern) return true

  const escapedPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')

  return new RegExp(`^${escapedPattern}`).test(fullPath.toLowerCase())
}

function buildRuleMatchHaystack(urlInfo, title = '') {
  // The site condition already pins the hostname, so keywords only refine
  // by path, query, hash, and page title.
  return [
    urlInfo.pathnameText || '',
    urlInfo.searchText || '',
    urlInfo.hash || '',
    trimText(title).toLowerCase(),
  ].join('\n')
}

function doesSiteKeywordRuleMatch(conditions, urlInfo, title = '') {
  if (!matchesSiteDomain(urlInfo.hostname, conditions.siteDomain)) {
    return false
  }

  const keyword = trimText(conditions.keyword).toLowerCase()
  if (!keyword) return true

  return buildRuleMatchHaystack(urlInfo, title).includes(keyword)
}

function doesLegacyRuleMatch(conditions, urlInfo) {
  if (conditions.exactUrlKey && conditions.exactUrlKey !== urlInfo.urlKey) {
    return false
  }

  if (!matchesExactHostname(urlInfo.hostname, conditions.hostname)) {
    return false
  }

  if (!matchesHostnameSuffix(urlInfo.hostname, conditions.hostnameSuffix)) {
    return false
  }

  if (!matchesPathPattern(urlInfo.fullPath, conditions.pathPattern)) {
    return false
  }

  if (conditions.hostPrefix && conditions.hostPrefix !== urlInfo.hostPrefix) {
    return false
  }

  for (const fragment of conditions.pathFragments) {
    if (!urlInfo.pathnameText.includes(fragment.toLowerCase())) {
      return false
    }
  }

  for (const expectedParam of conditions.queryParams) {
    const actualParams = urlInfo.queryParams.filter(param => param.key === expectedParam.key)

    if (!actualParams.length) {
      return false
    }

    if (
      expectedParam.mode === 'equals'
      && !actualParams.some(param => param.value === expectedParam.value)
    ) {
      return false
    }
  }

  return true
}

export function doesRuleMatchUrl(rule, urlInfo, { title = '' } = {}) {
  if (!urlInfo) return false

  const normalizedRule = normalizeTabMarkRule(rule)
  if (!normalizedRule.enabled || !hasRuleConditions(normalizedRule)) return false

  const { conditions } = normalizedRule

  if (conditions.siteDomain) {
    return doesSiteKeywordRuleMatch(conditions, urlInfo, title)
  }

  return doesLegacyRuleMatch(conditions, urlInfo)
}

/**
 * Higher score = more specific.
 * Keyword rules beat whole-site rules; legacy structured rules count as specific.
 */
export function getRuleSpecificity(rule) {
  const normalizedRule = normalizeTabMarkRule(rule)
  const { conditions } = normalizedRule

  if (conditions.keyword) return 2
  if (
    conditions.exactUrlKey
    || conditions.pathPattern
    || conditions.pathFragments.length
    || conditions.queryParams.length
    || conditions.hostPrefix
  ) {
    return 2
  }

  if (conditions.siteDomain || conditions.hostname || conditions.hostnameSuffix) {
    return 1
  }

  return 0
}

export function compareMatchingRules(left, right) {
  const specificityDiff = getRuleSpecificity(right) - getRuleSpecificity(left)
  if (specificityDiff !== 0) return specificityDiff

  return (right.updatedAt || 0) - (left.updatedAt || 0)
}

export function findBestMatchingRule(rules, urlInfo, { title = '' } = {}) {
  if (!urlInfo) return null

  const matches = normalizeTabMarkRules(rules)
    .filter(rule => doesRuleMatchUrl(rule, urlInfo, { title }))

  if (!matches.length) return null

  return [...matches].sort(compareMatchingRules)[0]
}

export function resolveTabMark(url, {
  settings,
  state,
  rules,
  title = '',
} = {}) {
  const urlInfo = parseTabUrl(url)

  if (!urlInfo) {
    return {
      source: MarkSource.unsupported,
      mark: null,
      rule: null,
      urlInfo: null,
    }
  }

  if (settings?.enabled === false) {
    return {
      source: MarkSource.disabled,
      mark: null,
      rule: null,
      urlInfo,
    }
  }

  const normalizedState = normalizeTabMarkState(state)

  const skipped = normalizedState.skips[urlInfo.urlKey]

  if (skipped) {
    return {
      source: MarkSource.skipped,
      mark: null,
      rule: null,
      skip: skipped,
      urlInfo,
    }
  }

  const directMark = normalizedState.marks[urlInfo.urlKey]

  if (directMark) {
    return {
      source: MarkSource.direct,
      mark: {
        ...directMark,
        color: getMarkColor(directMark.colorId),
      },
      rule: null,
      urlInfo,
    }
  }

  const matchingRule = findBestMatchingRule(rules, urlInfo, { title })

  if (matchingRule) {
    return {
      source: MarkSource.rule,
      mark: {
        urlKey: urlInfo.urlKey,
        colorId: matchingRule.colorId,
        title: matchingRule.name,
        url: urlInfo.href,
        updatedAt: matchingRule.updatedAt,
        color: getMarkColor(matchingRule.colorId),
      },
      rule: matchingRule,
      urlInfo,
    }
  }

  return {
    source: MarkSource.none,
    mark: null,
    rule: null,
    urlInfo,
  }
}

export function createTabMarkValidationError(message) {
  const error = new Error(message)
  error.code = 'INVALID_PAYLOAD'

  return error
}

export function validateColorPayload(payload) {
  if (!isRecord(payload)) {
    return createTabMarkValidationError('Payload must be an object')
  }

  if (
    'colorId' in payload
    && !MARK_COLOR_IDS.has(payload.colorId)
    && !LEGACY_COLOR_ID_ALIASES[payload.colorId]
  ) {
    return createTabMarkValidationError('Unsupported mark color')
  }

  return null
}

export function validateRulePayload(payload) {
  if (!isRecord(payload)) {
    return createTabMarkValidationError('Rule payload must be an object')
  }

  const rule = payload.rule || payload

  if (!isRecord(rule)) {
    return createTabMarkValidationError('Rule must be an object')
  }

  const normalizedRule = normalizeTabMarkRule(rule)

  if (!hasRuleConditions(normalizedRule)) {
    return createTabMarkValidationError('Rule needs at least one matching condition')
  }

  return null
}
