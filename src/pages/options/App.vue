<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { MARK_COLORS, createRuleDisplayName, getColorSwatchBackground, getMarkColor } from '../../shared/tab-marks.js'
import { APP_NAME } from '../../shared/app.js'
import { DEFAULT_SETTINGS, LinePosition, ThemeMode } from '../../shared/settings.js'
import { ExtensionMessage, createExtensionMessage, sendRuntimeMessage } from '../../extension/messaging.js'
import { buildCapsuleLensMap, buildConvexLensMap } from '../../shared/liquid-glass-lens.js'
import { colorLabel, t } from '../../shared/i18n.js'

const form = reactive({ ...DEFAULT_SETTINGS })
const overview = ref(null)
const configSearch = ref('')
const loading = ref(false)
const error = ref('')
const saveIndicator = ref('')
const importInput = ref(null)
const lensMapUrl = ref('')
const capsuleMapUrl = ref('')
let saveTimer = null

const lineWidthText = computed(() => `${form.lineWidth}px`)
const lineFillRatio = computed(() => `${(form.lineWidth - 1) / 9}`)

function siteFromUrlKey(urlKey) {
  try {
    return new URL(urlKey).hostname.replace(/^www\./, '')
  } catch {
    return urlKey || ''
  }
}

function pathFromUrlKey(urlKey) {
  try {
    const url = new URL(urlKey)
    return `${url.pathname || '/'}`
  } catch {
    return urlKey || ''
  }
}

const configRows = computed(() => {
  const rows = []

  for (const rule of overview.value?.rules || []) {
    const conditions = rule.conditions || {}
    const site = conditions.siteDomain || ''
    const keyword = conditions.keyword || ''
    const detail = keyword ? t('common.keywordPrefix', { keyword }) : t('common.wholeSite')
    const name = site
      ? createRuleDisplayName(site, keyword, {
        wholeSite: t('common.wholeSite'),
        untitledRule: t('common.untitledRule'),
      })
      : (rule.name || t('common.untitledRule'))

    rows.push({
      id: `rule-${rule.id}`,
      ruleId: rule.id,
      rule,
      markKey: null,
      canDelete: true,
      typeId: 'rule',
      type: t('options.ruleTypeRule'),
      site: site || '—',
      name,
      detail,
      colorId: rule.colorId,
      searchText: [site, keyword, name, detail, rule.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    })
  }

  for (const mark of overview.value?.marks || []) {
    const site = siteFromUrlKey(mark.urlKey)
    const path = pathFromUrlKey(mark.urlKey)
    const name = mark.title || mark.urlKey || ''

    rows.push({
      id: `mark-${mark.urlKey}`,
      ruleId: null,
      rule: null,
      markKey: mark.urlKey,
      canDelete: true,
      typeId: 'mark',
      type: t('options.ruleTypeMark'),
      site: site || '—',
      name,
      detail: path || mark.urlKey || '—',
      colorId: mark.colorId,
      searchText: [site, path, name, mark.urlKey]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    })
  }

  return rows
})

const filteredConfigRows = computed(() => {
  const query = configSearch.value.trim().toLowerCase()
  if (!query) return configRows.value

  return configRows.value.filter(row => (
    row.searchText.includes(query)
    || row.type.toLowerCase().includes(query)
  ))
})

const busyConfigId = ref('')
const colorPickerRowId = ref('')
const colorPickerStyle = ref({})

const colorPickerRow = computed(() => (
  filteredConfigRows.value.find(row => row.id === colorPickerRowId.value) || null
))

function rowSwatchStyle(colorId) {
  return { background: getColorSwatchBackground(getMarkColor(colorId)) }
}

function placeColorPicker(anchorEl) {
  const rect = anchorEl.getBoundingClientRect()
  const estimatedWidth = 148
  const estimatedHeight = 130
  const gap = 6
  const openUpward = rect.bottom + estimatedHeight + gap > window.innerHeight
  const left = Math.min(
    Math.max(gap, rect.right - estimatedWidth),
    window.innerWidth - estimatedWidth - gap,
  )
  const top = openUpward
    ? Math.max(gap, rect.top - estimatedHeight - gap)
    : Math.min(rect.bottom + gap, window.innerHeight - estimatedHeight - gap)

  colorPickerStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
  }
}

function toggleColorPicker(rowId, event) {
  if (colorPickerRowId.value === rowId) {
    closeColorPicker()
    return
  }

  placeColorPicker(event.currentTarget)
  colorPickerRowId.value = rowId
}

function closeColorPicker() {
  colorPickerRowId.value = ''
}

function onDocumentPointerDown(event) {
  if (!colorPickerRowId.value) return
  const target = event.target
  if (target?.closest?.('.config-color-popover') || target?.closest?.('.config-color-swatch')) {
    return
  }
  closeColorPicker()
}

function onViewportChange() {
  if (!colorPickerRowId.value) return
  closeColorPicker()
}

async function setRowColor(row, colorId) {
  colorPickerRowId.value = ''
  if (colorId === row.colorId) return

  busyConfigId.value = row.id
  error.value = ''

  try {
    if (row.ruleId) {
      await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.updateTabMarkRule, {
        rule: { ...row.rule, colorId },
      }))
    } else {
      await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.updateTabMarkColor, {
        urlKey: row.markKey,
        colorId,
      }))
    }
    await loadOverview()
    showSaveIndicator(t('common.colorUpdated'))
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    busyConfigId.value = ''
  }
}

function showSaveIndicator(message = t('common.settingsSaved')) {
  window.clearTimeout(saveTimer)
  saveIndicator.value = message
  saveTimer = window.setTimeout(() => {
    saveIndicator.value = ''
  }, 2200)
}

function getBrowserExtensionApi() {
  return globalThis.browser || globalThis['ch' + 'rome'] || null
}

async function loadOverview() {
  try {
    overview.value = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.getTabMarkOverview))
  } catch {
    overview.value = null
  }
}

async function loadSettings() {
  loading.value = true
  error.value = ''

  try {
    const settings = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.getSettings))
    Object.assign(form, DEFAULT_SETTINGS, settings)
    await loadOverview()
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  error.value = ''

  try {
    const nextSettings = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.updateSettings, { ...form }))
    Object.assign(form, DEFAULT_SETTINGS, nextSettings)
    await loadOverview()
    showSaveIndicator()
  } catch (err) {
    error.value = err.message || String(err)
  }
}

function colorIdFromValue(value) {
  const normalized = String(value || '').toLowerCase()
  return MARK_COLORS.find(color => color.value.toLowerCase() === normalized)?.id || MARK_COLORS[0].id
}

function normalizePattern(pattern, type) {
  const value = String(pattern || '').trim().toLowerCase()
  if (!value) return ''

  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`)
    return type === 'path' ? `${parsed.hostname}${parsed.pathname}` : parsed.hostname
  } catch {
    return value
  }
}

function convertReferenceRule(rule) {
  if (rule.conditions) {
    if (rule.conditions.siteDomain) return rule

    // Let shared normalize migrate legacy condition fields on save/load.
    return rule
  }

  const type = rule.type || 'exact'
  const pattern = normalizePattern(rule.pattern, type)
  if (!pattern) return null

  const colorId = rule.colorId || colorIdFromValue(rule.color)
  let siteDomain = ''
  let keyword = ''

  if (type === 'subdomain') {
    // Wildcard subdomain rules keep suffix semantics via the legacy matcher.
    const host = pattern.replace(/^\*\./, '').replace(/^www\./, '')
    if (!host) return null

    return {
      name: rule.name || host,
      enabled: rule.enabled !== false,
      colorId,
      conditions: {
        hostnameSuffix: host,
      },
    }
  } else if (type === 'path') {
    const slashIndex = pattern.indexOf('/')
    const hostPart = (slashIndex >= 0 ? pattern.slice(0, slashIndex) : pattern).replace(/^www\./, '')
    const pathPart = slashIndex >= 0 ? pattern.slice(slashIndex + 1) : ''
    siteDomain = hostPart
    keyword = pathPart.replace(/\*/g, '').split('/').filter(Boolean)[0] || ''
  } else {
    siteDomain = pattern.replace(/^www\./, '')
  }

  if (!siteDomain) return null

  return {
    name: rule.name || createRuleDisplayName(siteDomain, keyword),
    enabled: rule.enabled !== false,
    colorId,
    conditions: {
      siteDomain,
      keyword,
    },
  }
}

function convertImportedData(data) {
  const settings = data.settings
    ? {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        lineWidth: data.settings.lineWidth ?? data.settings.lineThickness ?? DEFAULT_SETTINGS.lineWidth,
        linePosition: data.settings.linePosition || DEFAULT_SETTINGS.linePosition,
        tabGroupSync: data.settings.tabGroupSync !== false,
      }
    : undefined

  return {
    ...data,
    settings,
    rules: Array.isArray(data.rules)
      ? data.rules.map(convertReferenceRule).filter(Boolean)
      : [],
  }
}

async function exportData() {
  try {
    const data = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.exportTabMarkData))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = 'page-accent-config.json'
    anchor.click()
    URL.revokeObjectURL(url)
    showSaveIndicator(t('common.exported'))
  } catch (err) {
    error.value = err.message || String(err)
  }
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text())
    await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.importTabMarkData, {
      data: convertImportedData(data),
    }))
    await loadSettings()
    showSaveIndicator(t('common.imported'))
  } catch (err) {
    error.value = err.message || String(err)
  }
}

function chooseImportFile() {
  importInput.value?.click()
}

async function handleImportFile(event) {
  const file = event.target.files?.[0]
  if (!file) return

  await importData(file)
  event.target.value = ''
}

async function deleteConfigRow(row) {
  if (!row?.canDelete || (!row.ruleId && !row.markKey)) return
  const confirmKey = row.ruleId ? 'common.deleteRuleConfirm' : 'common.deleteMarkConfirm'
  if (!confirm(t(confirmKey, { target: `${row.site} · ${row.detail}` }))) return

  busyConfigId.value = row.id
  error.value = ''

  try {
    if (row.ruleId) {
      await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.deleteTabMarkRule, {
        id: row.ruleId,
      }))
    } else {
      await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.deleteTabMark, {
        urlKey: row.markKey,
      }))
    }
    await loadOverview()
    showSaveIndicator(t(row.ruleId ? 'common.ruleDeleted' : 'common.markDeleted'))
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    busyConfigId.value = ''
  }
}

const XHS_PROFILE_URL = 'https://xhslink.com/m/5mijycBQDNW'
const XHS_PROFILE_NAME = '@保哲的杂货铺'

const tipQrUrl = computed(() => assetUrl('assets/dashang_qr.jpg'))
const xhsQrUrl = computed(() => assetUrl('assets/redbook_qr.png'))

function assetUrl(path) {
  const extensionApi = getBrowserExtensionApi()
  if (extensionApi?.runtime?.getURL) {
    return extensionApi.runtime.getURL(path)
  }

  return `/${path}`
}

function openXhsProfile() {
  const extensionApi = getBrowserExtensionApi()
  if (extensionApi?.tabs?.create) {
    extensionApi.tabs.create({ url: XHS_PROFILE_URL })
    return
  }

  window.open(XHS_PROFILE_URL, '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  lensMapUrl.value = buildConvexLensMap()
  capsuleMapUrl.value = buildCapsuleLensMap()
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
  loadSettings()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <main class="options-container">
    <svg class="liquid-glass-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="liquid-glass" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.015" numOctaves="3" seed="42" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="3" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="liquid-glass-lens" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">
          <feImage
            :href="lensMapUrl"
            x="0" y="0" width="100%" height="100%" result="lensMap" preserveAspectRatio="none"
          />
          <feDisplacementMap in="SourceGraphic" in2="lensMap" scale="8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="liquid-glass-capsule" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feImage
            :href="capsuleMapUrl"
            x="0" y="0" width="100%" height="100%" result="capsuleMap" preserveAspectRatio="none"
          />
          <feDisplacementMap in="SourceGraphic" in2="capsuleMap" scale="11" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
    <header class="options-header">
      <div class="options-logo">
        <span class="logo-mark" aria-hidden="true"></span>
        <div>
          <h1>{{ APP_NAME }}</h1>
          <span class="version">v0.1.2</span>
        </div>
      </div>
    </header>

    <p v-if="error" class="status error">{{ error }}</p>
    <p v-else-if="loading" class="status">{{ t('common.loading') }}</p>

    <div class="options-grid">
      <section class="settings-card">
        <h2>{{ t('options.settings') }}</h2>

        <div class="setting-row">
          <div class="setting-info">
            <label for="linePosition">{{ t('options.linePosition') }}</label>
            <span class="setting-desc">{{ t('options.linePositionDesc') }}</span>
          </div>
          <select id="linePosition" v-model="form.linePosition" class="setting-select" @change="saveSettings">
            <option :value="LinePosition.top">{{ t('options.positionTop') }}</option>
            <option :value="LinePosition.bottom">{{ t('options.positionBottom') }}</option>
            <option :value="LinePosition.left">{{ t('options.positionLeft') }}</option>
            <option :value="LinePosition.right">{{ t('options.positionRight') }}</option>
            <option :value="LinePosition.frame">{{ t('options.positionFrame') }}</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <label for="lineThickness">{{ t('options.lineWidth') }}</label>
            <span class="setting-desc">{{ lineWidthText }}</span>
          </div>
          <div
            class="liquid-slider liquid-slider--line-preview"
            :style="{
              '--fill': lineFillRatio,
              '--line-width': `${form.lineWidth}px`,
            }"
          >
            <input
              id="lineThickness"
              v-model.number="form.lineWidth"
              type="range"
              min="1"
              max="10"
              step="1"
              class="liquid-slider__input"
              @change="saveSettings"
            />
            <div class="liquid-slider__visual" aria-hidden="true">
              <div class="liquid-slider__track">
                <div class="liquid-slider__level"></div>
              </div>
              <div class="liquid-slider__thumb"></div>
            </div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <label for="themeMode">{{ t('options.theme') }}</label>
            <span class="setting-desc">{{ t('options.themeDesc') }}</span>
          </div>
          <select id="themeMode" v-model="form.theme" class="setting-select" @change="saveSettings">
            <option :value="ThemeMode.system">{{ t('options.themeSystem') }}</option>
            <option :value="ThemeMode.light">{{ t('options.themeLight') }}</option>
            <option :value="ThemeMode.dark">{{ t('options.themeDark') }}</option>
          </select>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <label for="tabGroupSync">{{ t('options.tabGroupSync') }}</label>
            <span class="setting-desc">{{ t('options.tabGroupSyncDesc') }}</span>
          </div>
          <label class="toggle-switch">
            <input id="tabGroupSync" v-model="form.tabGroupSync" type="checkbox" @change="saveSettings" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <label for="cornerAddress">{{ t('options.cornerAddress') }}</label>
            <span class="setting-desc">{{ t('options.cornerAddressDesc') }}</span>
          </div>
          <label class="toggle-switch">
            <input id="cornerAddress" v-model="form.cornerAddress" type="checkbox" @change="saveSettings" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <label for="extensionEnabled">{{ t('options.extensionEnabled') }}</label>
            <span class="setting-desc">{{ t('options.extensionEnabledDesc') }}</span>
          </div>
          <label class="toggle-switch">
            <input id="extensionEnabled" v-model="form.enabled" type="checkbox" @change="saveSettings" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </section>

      <section class="settings-card">
        <h2>{{ t('options.dataManagement') }}</h2>

        <div class="config-toolbar">
          <input
            v-model="configSearch"
            class="config-search"
            type="search"
            :placeholder="t('options.searchPlaceholder')"
          />
        </div>

        <div class="config-table-wrap" @scroll.passive="closeColorPicker">
          <table class="config-table">
            <thead>
              <tr>
                <th>{{ t('options.type') }}</th>
                <th>{{ t('options.site') }}</th>
                <th>{{ t('options.ruleOrPath') }}</th>
                <th class="config-color-col">{{ t('options.color') }}</th>
                <th class="config-actions-col">{{ t('options.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!filteredConfigRows.length">
                <td colspan="5" class="config-empty">
                  {{ configRows.length ? t('options.noMatches') : t('options.noData') }}
                </td>
              </tr>
              <tr v-for="row in filteredConfigRows" :key="row.id">
                <td>
                  <span class="config-type" :data-type="row.typeId">{{ row.type }}</span>
                </td>
                <td class="config-name" :title="row.site">{{ row.site }}</td>
                <td class="config-meta" :title="row.detail">{{ row.detail }}</td>
                <td class="config-color-col">
                  <div class="config-color-cell">
                    <button
                      class="config-color-swatch"
                      type="button"
                      :title="colorLabel(getMarkColor(row.colorId))"
                      :style="rowSwatchStyle(row.colorId)"
                      :disabled="busyConfigId === row.id"
                      @click="toggleColorPicker(row.id, $event)"
                    ></button>
                  </div>
                </td>
                <td class="config-actions-col">
                  <button
                    v-if="row.canDelete"
                    class="config-delete-btn"
                    type="button"
                    :disabled="busyConfigId === row.id"
                    @click="deleteConfigRow(row)"
                  >
                    {{ t('options.delete') }}
                  </button>
                  <span v-else class="config-action-empty">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="data-actions">
          <button class="btn btn-secondary" type="button" @click="exportData">{{ t('options.exportRules') }}</button>
          <button class="btn btn-secondary" type="button" @click="chooseImportFile">{{ t('options.importRules') }}</button>
          <input ref="importInput" type="file" accept=".json,application/json" hidden @change="handleImportFile" />
        </div>
      </section>

      <section class="settings-card">
        <h2>{{ t('options.supportFeedback') }}</h2>
        <p class="support-desc">
          {{ t('options.supportDesc') }}
        </p>

        <div class="support-qr-box">
          <div class="support-qr-item">
            <img class="support-qr" :src="tipQrUrl" :alt="t('options.tipAlt')" />
            <strong>{{ t('options.tip') }}</strong>
            <span>{{ t('options.tipDesc') }}</span>
          </div>
          <div class="support-qr-item">
            <img class="support-qr" :src="xhsQrUrl" :alt="t('options.xhsAlt')" />
            <strong>{{ t('options.xhsFeedback') }}</strong>
            <span>{{ t('options.xhsDesc') }}</span>
            <a
              class="author-link"
              :href="XHS_PROFILE_URL"
              target="_blank"
              rel="noopener noreferrer"
              @click.prevent="openXhsProfile"
            >
              {{ XHS_PROFILE_NAME }}
            </a>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <h2>{{ t('options.about') }}</h2>
        <div class="about-info">
          <div class="about-row">
            <span>{{ t('options.version') }}</span>
            <span class="about-value">0.1.2</span>
          </div>
        </div>
      </section>
    </div>

    <div v-if="saveIndicator" class="save-indicator show">
      <span>✓</span>
      <span>{{ saveIndicator }}</span>
    </div>

    <Teleport to="body">
      <div
        v-if="colorPickerRow"
        class="config-color-popover"
        :style="colorPickerStyle"
        role="dialog"
        :aria-label="t('options.color')"
      >
        <button
          v-for="color in MARK_COLORS"
          :key="`picker-${colorPickerRow.id}-${color.id}`"
          class="config-color-swatch small"
          :class="{ active: color.id === colorPickerRow.colorId }"
          type="button"
          :title="colorLabel(color)"
          :style="rowSwatchStyle(color.id)"
          @click="setRowColor(colorPickerRow, color.id)"
        ></button>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.options-container {
  position: relative;
  max-width: 720px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 40px 24px;
  color: #1e293b;
  background:
    radial-gradient(ellipse 70% 50% at 10% 5%, rgba(0, 113, 227, 0.13) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 90% 20%, rgba(130, 90, 230, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse 55% 45% at 80% 85%, rgba(16, 185, 129, 0.07) 0%, transparent 50%),
    radial-gradient(ellipse 40% 35% at 15% 90%, rgba(236, 72, 153, 0.06) 0%, transparent 45%),
    linear-gradient(180deg, #e4ebf5, #d8e2ee 50%, #e1e9f3);
}

.options-header {
  display: flex;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 0.5px solid rgba(200, 210, 225, 0.4);
}

.options-logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #0071e3, #4da3ff);
  box-shadow: 0 4px 14px rgba(0, 113, 227, 0.3);
}

.options-logo h1 {
  font-size: 22px;
  font-weight: 700;
}

.version {
  color: #94a3b8;
  font-size: 12px;
}

.options-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ============================================
   LIQUID GLASS CARD
   Architecture from reference:
   - Container: isolation: isolate
   - ::before  = tint + inner shadow (z-index: 0)
   - ::after   = backdrop-blur + SVG distortion (z-index: -1)
   - Content at z-index: 10
   ============================================ */
.settings-card {
  position: relative;
  border-radius: 22px;
  padding: 24px;
  isolation: isolate;
  border: 0.5px solid rgba(255, 255, 255, 0.45);
  box-shadow:
    0 8px 32px rgba(31, 55, 89, 0.08),
    0 2px 6px rgba(31, 55, 89, 0.04);
  cursor: default;
  animation: card-in 0.5s cubic-bezier(0.2, 1, 0.3, 1) backwards;
}

.options-grid .settings-card:nth-child(1) { animation-delay: 0.05s; }
.options-grid .settings-card:nth-child(2) { animation-delay: 0.1s; }
.options-grid .settings-card:nth-child(3) { animation-delay: 0.15s; }
.options-grid .settings-card:nth-child(4) { animation-delay: 0.2s; }

@keyframes card-in {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

/* Tint + inner highlight layer */
.settings-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.25) 100%);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.8);
  pointer-events: none;
}

/* Backdrop blur + distortion layer */
.settings-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 22px;
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  filter: url(#liquid-glass);
  -webkit-filter: url(#liquid-glass);
  pointer-events: none;
}

/* Content above glass */
.settings-card > * {
  position: relative;
  z-index: 10;
}

.settings-card h2 {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 0.5px solid rgba(200, 210, 225, 0.4);
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 0;
  border-bottom: 0.5px solid rgba(220, 228, 238, 0.4);
}

.setting-row:last-of-type {
  border-bottom: 0;
}

.setting-info {
  flex: 1;
}

.setting-info label {
  display: block;
  margin-bottom: 2px;
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
}

.setting-desc {
  color: #94a3b8;
  font-size: 12px;
}

/* Select - frosted glass */
.setting-select {
  min-width: 140px;
  border: 0.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  padding: 9px 14px;
  color: #1e293b;
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.25s ease;
}

.setting-select:hover {
  background: rgba(255, 255, 255, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 4px 14px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}

.setting-select:focus {
  outline: 2px solid rgba(0, 113, 227, 0.4);
  outline-offset: 1px;
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 31px;
  flex: 0 0 51px;
}

.toggle-switch input {
  width: 0;
  height: 0;
  opacity: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(120, 130, 150, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 0.5px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: linear-gradient(180deg, #fff, #f2f4f7);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    inset 0 1px 1px rgba(255, 255, 255, 1);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.2s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background: #0071e3;
  border-color: rgba(0, 80, 200, 0.3);
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 113, 227, 0.25);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch input:focus-visible + .toggle-slider {
  outline: 3px solid rgba(0, 113, 227, 0.35);
  outline-offset: 2px;
}

.toggle-switch input:active + .toggle-slider::before {
  width: 33px;
}

.toggle-switch input:checked:active + .toggle-slider::before {
  transform: translateX(14px);
}

/* Config overview table */
.config-toolbar {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.config-search {
  width: 100%;
  border: 0.5px solid rgba(255, 255, 255, 0.45);
  border-radius: 12px;
  padding: 10px 14px;
  color: #1e293b;
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.config-search::placeholder {
  color: #94a3b8;
}

.config-search:focus {
  outline: 2px solid rgba(0, 113, 227, 0.35);
  outline-offset: 1px;
}

.config-summary {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.config-table-wrap {
  overflow: auto;
  max-height: 360px;
  margin-bottom: 16px;
  border: 0.5px solid rgba(200, 210, 225, 0.45);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.28);
}

.config-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.config-table th,
.config-table td {
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
  border-bottom: 0.5px solid rgba(220, 228, 238, 0.45);
}

.config-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: #64748b;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(8px);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.config-table tbody tr:last-child td {
  border-bottom: 0;
}

.config-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.35);
}

.config-empty {
  color: #94a3b8;
  text-align: center;
}

.config-type {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.config-type[data-type='rule'] {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.config-type[data-type='mark'] {
  background: rgba(249, 115, 22, 0.12);
  color: #ea580c;
}

.config-name,
.config-meta {
  max-width: 220px;
  overflow: hidden;
  color: #1e293b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-meta {
  color: #64748b;
}

.config-actions-col {
  width: 72px;
  text-align: right;
  white-space: nowrap;
}

.config-color-col {
  width: 56px;
  text-align: center;
  white-space: nowrap;
}

.config-color-cell {
  position: relative;
  display: inline-flex;
  justify-content: center;
}

.config-color-swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0.5px solid rgba(255, 255, 255, 0.7);
  border-radius: 7px;
  background-clip: padding-box;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 1px 4px rgba(31, 55, 89, 0.18);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.config-color-swatch:hover:not(:disabled) {
  transform: scale(1.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 3px 8px rgba(31, 55, 89, 0.25);
}

.config-color-swatch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.config-color-swatch.small {
  width: 18px;
  height: 18px;
  border-radius: 6px;
}

.config-color-swatch.small.active {
  outline: 2px solid rgba(0, 113, 227, 0.65);
  outline-offset: 1px;
}


.config-delete-btn {
  border: 0;
  border-radius: 0;
  padding: 0;
  color: #dc2626;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s ease;
}

.config-delete-btn:hover:not(:disabled) {
  color: #b91c1c;
  background: transparent;
}

.config-delete-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.config-action-empty {
  color: #cbd5e1;
}

/* Buttons */
.data-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.data-actions-danger {
  padding-top: 16px;
  border-top: 0.5px solid rgba(200, 210, 225, 0.3);
}

.btn,
.btn-danger-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-secondary {
  flex: 1;
  border: 0.5px solid rgba(255, 255, 255, 0.4);
  color: #475569;
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.05);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.45);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 4px 14px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.btn-secondary:active {
  transform: scale(0.97);
}

.btn-danger-outline {
  border: 0.5px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
  background: rgba(255, 240, 240, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.04);
}

.btn-danger-outline:hover {
  background: rgba(255, 230, 230, 0.45);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 4px 14px rgba(239, 68, 68, 0.1);
  transform: translateY(-1px);
}

/* About */
.about-info {
  margin-bottom: 8px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  font-size: 13px;
}

.about-row span:first-child {
  color: #64748b;
}

.about-value {
  color: #0071e3;
  font-weight: 600;
}

.support-desc {
  margin: 0 0 16px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.support-qr-box {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 28px;
  border: 0.5px solid rgba(255, 255, 255, 0.45);
  border-radius: 16px;
  padding: 18px 16px;
  background: rgba(255, 255, 255, 0.28);
}

.support-qr-item {
  display: grid;
  justify-items: center;
  gap: 6px;
  text-align: center;
}

.support-qr {
  width: 128px;
  height: 128px;
  border-radius: 12px;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 2px 10px rgba(31, 55, 89, 0.08);
}

.support-qr-item strong {
  color: #1e293b;
  font-size: 13px;
  font-weight: 600;
}

.support-qr-item span {
  color: #94a3b8;
  font-size: 11px;
}

.author-link {
  margin-top: 2px;
  color: #e11d48;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.author-link:hover {
  text-decoration: underline;
}

/* Save indicator */
.save-indicator {
  position: fixed;
  right: 24px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 16px;
  padding: 12px 20px;
  color: #fff;
  background: rgba(16, 185, 129, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 0.5px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 0 20px -5px rgba(16, 185, 129, 0.3);
  font-size: 14px;
  font-weight: 600;
}

.status {
  margin-bottom: 16px;
}

.status.error {
  color: #b42318;
  background: #fff0ed;
  padding: 8px 12px;
  border-radius: 8px;
}

@media (max-width: 600px) {
  .options-container {
    padding: 20px 16px;
  }
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }
  .setting-select,
  .liquid-slider {
    width: 100%;
    min-width: 0;
  }
}
</style>

<style>
/* Teleported outside the card stacking context so it never sits under
   import buttons / sibling glass cards. */
.config-color-popover {
  position: fixed;
  z-index: 2147483000;
  display: grid;
  grid-template-columns: repeat(5, 18px);
  gap: 6px;
  border: 0.5px solid rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 12px 32px rgba(31, 55, 89, 0.28);
}

.config-color-popover .config-color-swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0.5px solid rgba(255, 255, 255, 0.7);
  border-radius: 7px;
  background-clip: padding-box;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 1px 4px rgba(31, 55, 89, 0.18);
  cursor: pointer;
}

.config-color-popover .config-color-swatch.small {
  width: 18px;
  height: 18px;
  border-radius: 6px;
}

.config-color-popover .config-color-swatch.small.active {
  outline: 2px solid rgba(0, 113, 227, 0.65);
  outline-offset: 1px;
}
</style>
