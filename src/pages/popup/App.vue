<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  DEFAULT_MARK_COLOR_ID,
  MARK_COLORS,
  MarkSource,
  buildKeywordSuggestions,
  createRuleDisplayName,
  doesRuleMatchUrl,
  getColorLineBackground,
  getColorSwatchBackground,
  getMarkColor,
  normalizeRuleSite,
} from '../../shared/tab-marks.js'
import { ExtensionMessage, createExtensionMessage, sendRuntimeMessage } from '../../extension/messaging.js'
import { APP_NAME } from '../../shared/app.js'
import { DEFAULT_SETTINGS } from '../../shared/settings.js'
import { buildCapsuleLensMap, buildConvexLensMap } from '../../shared/liquid-glass-lens.js'
import { colorLabel, t } from '../../shared/i18n.js'

const RECENT_COLOR_STORAGE_KEY = 'tab-finder-recent-colors'

const context = ref(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const toast = ref(null)
const lineWidth = ref(DEFAULT_SETTINGS.lineWidth)
const selectedColorId = ref(DEFAULT_MARK_COLOR_ID)
const recentColorIds = ref([])
const ruleFormOpen = ref(false)
const ruleSiteDomain = ref('')
const ruleKeyword = ref('')
const ruleSiteEditing = ref(false)
const ruleColorId = ref(DEFAULT_MARK_COLOR_ID)
let toastTimer = null

const resolved = computed(() => context.value?.resolved || null)
const tab = computed(() => context.value?.tab || null)
const urlInfo = computed(() => resolved.value?.urlInfo || null)
const currentColorId = computed(() => resolved.value?.mark?.colorId || '')
const currentColor = computed(() => (currentColorId.value ? getMarkColor(currentColorId.value) : null))
const canMark = computed(() => Boolean(urlInfo.value) && context.value?.settings?.enabled !== false)
const recentColors = computed(() => (
  recentColorIds.value
    .map(colorId => MARK_COLORS.find(color => color.id === colorId))
    .filter(Boolean)
))

const lineFillRatio = computed(() => `${(lineWidth.value - 1) / 9}`)
const sliderLineStyle = computed(() => {
  const color = currentColor.value
    || getMarkColor(selectedColorId.value || DEFAULT_MARK_COLOR_ID)

  return {
    '--fill': lineFillRatio.value,
    '--line-width': `${lineWidth.value}px`,
    '--slider-line-fill': getColorLineBackground(color),
  }
})
const lensMapUrl = ref('')
const capsuleMapUrl = ref('')

const keywordSuggestions = computed(() => (
  buildKeywordSuggestions(urlInfo.value, tab.value?.title || '')
))

const draftRuleMatchesCurrent = computed(() => {
  const siteDomain = normalizeRuleSite(ruleSiteDomain.value)
  if (!siteDomain || !urlInfo.value) return false

  return doesRuleMatchUrl(
    {
      enabled: true,
      conditions: {
        siteDomain,
        keyword: ruleKeyword.value.trim(),
      },
    },
    urlInfo.value,
    { title: tab.value?.title || '' },
  )
})

const matchLabel = computed(() => {
  switch (resolved.value?.source) {
    case MarkSource.direct:
      return t('common.currentPageMark')
    case MarkSource.rule:
      return t('common.matchingRuleWithName', {
        name: resolved.value.rule?.name || t('common.unnamed'),
      })
    case MarkSource.tabGroup:
      return t('common.tabGroupColor')
    case MarkSource.skipped:
      return t('common.pageSkipped')
    case MarkSource.disabled:
      return t('common.paused')
    case MarkSource.unsupported:
      return t('common.unsupportedPage')
    default:
      return t('common.unmarked')
  }
})

function isKnownColorId(colorId) {
  return MARK_COLORS.some(color => color.id === colorId)
}

function getSwatchRingColor(color) {
  if (!color) return 'transparent'

  if (color.badgeText === '#172033') {
    return `color-mix(in srgb, ${color.value} 60%, #374151)`
  }

  return color.value
}

function getSwatchButtonStyle(color) {
  if (!color) return {}

  return {
    background: getColorSwatchBackground(color),
    '--swatch-ring': getSwatchRingColor(color),
  }
}

/** The compact status dot stays a solid color even for composite marks. */
function getStatusDotStyle(color) {
  if (!color) return {}

  return {
    backgroundColor: color.value,
    '--swatch-ring': getSwatchRingColor(color),
  }
}

function getColorTitle(color) {
  return colorLabel(color)
}

function isColorApplied(colorId) {
  return currentColorId.value === colorId
}

function loadRecentColors() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_COLOR_STORAGE_KEY) || '[]')
    recentColorIds.value = Array.isArray(parsed) ? parsed.filter(isKnownColorId).slice(0, 5) : []
  } catch {
    recentColorIds.value = []
  }
}

function addRecentColor(colorId) {
  if (!isKnownColorId(colorId)) return

  recentColorIds.value = [
    colorId,
    ...recentColorIds.value.filter(item => item !== colorId),
  ].slice(0, 5)
  localStorage.setItem(RECENT_COLOR_STORAGE_KEY, JSON.stringify(recentColorIds.value))
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer)
  toast.value = { message, isError }
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 2200)
}

function updateSelectedFromContext() {
  if (currentColorId.value) {
    selectedColorId.value = currentColorId.value
    ruleColorId.value = currentColorId.value
    return
  }

  selectedColorId.value = DEFAULT_MARK_COLOR_ID
  ruleColorId.value = DEFAULT_MARK_COLOR_ID
}

async function loadContext() {
  loading.value = true
  error.value = ''

  try {
    context.value = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.getActiveTabMark))
    if (context.value?.settings?.lineWidth != null) {
      lineWidth.value = context.value.settings.lineWidth
    }
    updateSelectedFromContext()
    if (urlInfo.value?.hostname && !ruleSiteDomain.value) {
      ruleSiteDomain.value = urlInfo.value.hostname
    }
  } catch (err) {
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}

async function updateLineWidth() {
  try {
    context.value = {
      ...(context.value || {}),
      settings: await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.updateSettings, {
        lineWidth: lineWidth.value,
      })),
    }
  } catch {
    // Best effort while the user drags.
  }
}

async function applyColor(colorId) {
  if (!canMark.value) {
    showToast(t('common.unsupportedPage'), true)
    return
  }

  if (busy.value) return

  if (colorId) {
    if (colorId === currentColorId.value && resolved.value?.source === MarkSource.rule) {
      selectedColorId.value = colorId
      return
    }
  } else if (!currentColorId.value) {
    selectedColorId.value = ''
    return
  }

  selectedColorId.value = colorId
  busy.value = true
  error.value = ''

  try {
    if (colorId) {
      context.value = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.setActiveTabMark, {
        colorId,
      }))
      addRecentColor(colorId)
      updateSelectedFromContext()
      showToast(t('common.saved'))
    } else {
      context.value = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.clearActiveTabMark))
      updateSelectedFromContext()
      showToast(t('common.markRemoved'))
    }
  } catch (err) {
    error.value = err.message || String(err)
    showToast(error.value, true)
  } finally {
    busy.value = false
  }
}

function selectColor(colorId) {
  applyColor(colorId)
}

function selectNoColor() {
  applyColor('')
}

function createRulePayload() {
  const siteDomain = normalizeRuleSite(ruleSiteDomain.value)
  const keyword = ruleKeyword.value.trim().toLowerCase()

  return {
    name: createRuleDisplayName(siteDomain, keyword, {
      wholeSite: t('common.wholeSite'),
      untitledRule: t('common.untitledRule'),
    }),
    enabled: true,
    colorId: ruleColorId.value,
    conditions: {
      siteDomain,
      keyword,
    },
  }
}

function openRuleForm() {
  ruleSiteDomain.value = urlInfo.value?.hostname || ''
  ruleKeyword.value = ''
  ruleSiteEditing.value = false
  ruleColorId.value = selectedColorId.value || currentColorId.value || DEFAULT_MARK_COLOR_ID
  ruleFormOpen.value = true
}

function closeRuleForm() {
  ruleFormOpen.value = false
  ruleSiteDomain.value = urlInfo.value?.hostname || ''
  ruleKeyword.value = ''
  ruleSiteEditing.value = false
  ruleColorId.value = DEFAULT_MARK_COLOR_ID
}

function applyKeywordSuggestion(keyword) {
  ruleKeyword.value = keyword
}

async function saveRule() {
  const siteDomain = normalizeRuleSite(ruleSiteDomain.value)
  if (!siteDomain) {
    showToast(t('common.openPageOrDomain'), true)
    return
  }

  if (!ruleColorId.value) {
    showToast(t('common.selectColor'), true)
    return
  }

  busy.value = true
  error.value = ''

  try {
    const nextRules = await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.addTabMarkRule, {
      rule: createRulePayload(),
    }))
    context.value = {
      ...(context.value || {}),
      rules: nextRules,
    }
    closeRuleForm()
    await loadContext()
    showToast(t('common.ruleSaved'))
  } catch (err) {
    error.value = err.message || String(err)
    showToast(error.value, true)
  } finally {
    busy.value = false
  }
}

async function openOptions() {
  await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.openOptions))
}

onMounted(() => {
  lensMapUrl.value = buildConvexLensMap()
  capsuleMapUrl.value = buildCapsuleLensMap()
  loadRecentColors()
  loadContext()
})
</script>

<template>
  <main class="app-shell popup-shell">
    <svg class="liquid-glass-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="liquid-glass" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
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
    <div class="popup-container">
      <header class="header">
        <div class="logo">
          <span class="logo-mark" aria-hidden="true"></span>
          <div>
            <h1>{{ APP_NAME }}</h1>
            <p>{{ matchLabel }}</p>
          </div>
        </div>
        <button class="btn-icon" type="button" :title="t('popup.settingsTitle')" @click="openOptions">
          <span aria-hidden="true">⚙</span>
        </button>
      </header>

      <p v-if="error" class="status error">{{ error }}</p>

      <section class="card">
        <p class="section-label">{{ t('popup.currentPage') }}</p>

        <div class="current-tab-info">
          <span class="current-domain">{{ loading ? t('common.loading') : (urlInfo?.hostname || tab?.url || t('common.specialPage')) }}</span>
          <div
            class="current-color-preview"
            :class="{ active: Boolean(currentColor) }"
            :style="getStatusDotStyle(currentColor)"
          ></div>
        </div>

        <div class="thickness-control">
          <div class="thickness-header">
            <label for="lineThickness">{{ t('popup.lineThickness') }}</label>
            <span class="thickness-value">{{ lineWidth }}px</span>
          </div>
          <div
            class="liquid-slider liquid-slider--wide liquid-slider--line-preview"
            :style="sliderLineStyle"
          >
            <input
              id="lineThickness"
              v-model.number="lineWidth"
              type="range"
              min="1"
              max="10"
              step="1"
              class="liquid-slider__input"
              @input="updateLineWidth"
            />
            <div class="liquid-slider__visual" aria-hidden="true">
              <div class="liquid-slider__track">
                <div class="liquid-slider__level"></div>
              </div>
              <div class="liquid-slider__thumb"></div>
            </div>
          </div>
        </div>

        <div v-if="recentColors.length" class="recent-colors">
          <label>{{ t('popup.recent') }}</label>
          <div class="recent-colors-list">
            <button
              v-for="color in recentColors"
              :key="color.id"
              class="color-btn recent-color-btn"
              :class="{ selected: isColorApplied(color.id) }"
              type="button"
              :title="getColorTitle(color)"
              :style="getSwatchButtonStyle(color)"
              :disabled="busy"
              @click="selectColor(color.id)"
            ></button>
          </div>
        </div>

        <div class="color-palette" :aria-label="t('popup.colors')">
          <button
            class="color-btn remove-color"
            :class="{ selected: !currentColorId }"
            type="button"
            :title="t('common.removeColor')"
            :disabled="busy"
            @click="selectNoColor"
          >
            ×
          </button>
          <button
            v-for="color in MARK_COLORS"
            :key="color.id"
            class="color-btn"
            :class="{ selected: isColorApplied(color.id) }"
            type="button"
            :title="getColorTitle(color)"
            :style="getSwatchButtonStyle(color)"
            :disabled="busy"
            @click="selectColor(color.id)"
          ></button>
        </div>
      </section>

      <section class="card">
        <div class="section-header">
          <p class="section-label">{{ t('popup.custom') }}</p>
          <button class="btn-icon small" type="button" :title="t('popup.newRule')" @click="openRuleForm">+</button>
        </div>

        <div v-if="ruleFormOpen" class="add-rule-form">
          <div class="form-group">
            <div class="site-row">
              <label>{{ t('popup.site') }}</label>
              <button
                class="btn-link"
                type="button"
                @click="ruleSiteEditing = !ruleSiteEditing"
              >
                {{ ruleSiteEditing ? t('popup.done') : t('popup.change') }}
              </button>
            </div>
            <p v-if="!ruleSiteEditing" class="site-domain">{{ ruleSiteDomain || t('popup.siteUnknown') }}</p>
            <input
              v-else
              id="ruleSiteDomain"
              v-model="ruleSiteDomain"
              class="input"
              type="text"
              :placeholder="t('popup.exampleDomain')"
            />
          </div>
          <div class="form-group">
            <label for="ruleKeyword">{{ t('popup.keyword') }}</label>
            <input
              id="ruleKeyword"
              v-model="ruleKeyword"
              class="input"
              type="text"
              :placeholder="t('popup.keywordPlaceholder')"
            />
            <p class="form-hint">
              {{ t('popup.keywordHint') }}
            </p>
            <div v-if="keywordSuggestions.length" class="chip-row">
              <button
                v-for="chip in keywordSuggestions"
                :key="chip"
                class="chip"
                type="button"
                :class="{ active: ruleKeyword.trim().toLowerCase() === chip }"
                @click="applyKeywordSuggestion(chip)"
              >
                {{ chip }}
              </button>
            </div>
            <p
              v-if="ruleSiteDomain && urlInfo"
              class="match-preview"
              :class="{ hit: draftRuleMatchesCurrent }"
            >
              {{ draftRuleMatchesCurrent ? t('popup.currentPageWillMatch') : t('popup.currentPageWillNotMatch') }}
            </p>
          </div>
          <div class="form-group">
            <label>{{ t('popup.color') }}</label>
            <div class="mini-palette">
              <button
                v-for="color in MARK_COLORS.slice(0, 9)"
                :key="`rule-${color.id}`"
                class="color-btn small"
                :class="{ selected: ruleColorId === color.id }"
                type="button"
                :title="getColorTitle(color)"
                :style="getSwatchButtonStyle(color)"
                @click="ruleColorId = color.id"
              ></button>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" type="button" :disabled="busy" @click="saveRule">{{ t('popup.save') }}</button>
            <button class="btn-secondary" type="button" :disabled="busy" @click="closeRuleForm">{{ t('popup.cancel') }}</button>
          </div>
        </div>

        <div v-if="!ruleFormOpen" class="rule-manage-hint">
          <p>{{ t('popup.addRuleCurrentSite') }}</p>
          <button class="btn-link" type="button" @click="openOptions">{{ t('popup.viewInDataManagement') }}</button>
        </div>
      </section>
    </div>

    <div v-if="toast" class="toast" :class="{ error: toast.isError }" role="status">
      <span class="toast-icon" aria-hidden="true">{{ toast.isError ? '!' : '✓' }}</span>
      <span class="toast-message">{{ toast.message }}</span>
    </div>
  </main>
</template>

<style scoped>
.popup-shell {
  width: 320px;
  min-height: 0;
  padding: 0;
  background:
    radial-gradient(ellipse 80% 60% at 10% 5%, rgba(0, 113, 227, 0.12) 0%, transparent 55%),
    radial-gradient(ellipse 60% 50% at 95% 30%, rgba(130, 90, 230, 0.07) 0%, transparent 50%),
    radial-gradient(ellipse 60% 50% at 80% 90%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
    linear-gradient(180deg, #e4ebf5, #dae3ef 50%, #e0e9f3);
}

.popup-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  animation: fadeIn 0.18s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.header,
.logo,
.current-tab-info,
.thickness-header,
.recent-colors,
.section-header,
.form-actions {
  display: flex;
  align-items: center;
}

.header {
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--gray-200);
}

.logo {
  gap: 8px;
  min-width: 0;
}

.logo-mark {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: linear-gradient(135deg, #0071e3, #5eb0ff);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4), var(--shadow-sm);
}

.logo h1 {
  color: var(--gray-900);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.2;
}

.logo p {
  color: var(--gray-500);
  font-size: 10px;
  line-height: 1.2;
}

.btn-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: 0.5px solid rgba(255, 255, 255, 0.5);
  border-radius: 9px;
  color: var(--gray-500);
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  font-size: 16px;
  transition: all 0.25s cubic-bezier(0.2, 1, 0.3, 1);
}

.btn-icon:hover {
  color: var(--lg-blue, #0071e3);
  background: rgba(0, 113, 227, 0.06);
  border-color: rgba(0, 113, 227, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 3px 10px rgba(0, 113, 227, 0.08);
  transform: translateY(-0.5px);
}

.btn-icon:active {
  transform: scale(0.93);
}

.btn-icon.small {
  width: 28px;
  height: 28px;
  flex-basis: 28px;
  font-size: 16px;
  font-weight: 600;
}

.card {
  position: relative;
  border-radius: 18px;
  padding: 14px;
  isolation: isolate;
  border: 0.5px solid rgba(255, 255, 255, 0.45);
  box-shadow:
    0 6px 24px rgba(31, 55, 89, 0.07),
    0 2px 5px rgba(31, 55, 89, 0.04);
  animation: card-enter 0.4s cubic-bezier(0.2, 1, 0.3, 1) backwards;
}

.card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.25) 100%);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.8);
  pointer-events: none;
}

.card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 18px;
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  filter: url(#liquid-glass);
  -webkit-filter: url(#liquid-glass);
  pointer-events: none;
}

.card > * {
  position: relative;
  z-index: 10;
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
    filter: blur(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

.popup-container .card:nth-child(1) { animation-delay: 0.03s; }
.popup-container .card:nth-child(2) { animation-delay: 0.09s; }
.popup-container .card:nth-child(3) { animation-delay: 0.15s; }
.popup-container .card:nth-child(4) { animation-delay: 0.21s; }

.section-label {
  margin-bottom: 10px;
  color: var(--gray-500);
  font-size: 11px;
  font-weight: 500;
}

.section-header {
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-header .section-label {
  margin-bottom: 0;
}

.current-tab-info {
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  border: 0.5px solid rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  padding: 9px 11px;
  background: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 1px 3px rgba(0, 0, 0, 0.03);
}

.current-domain {
  max-width: 210px;
  overflow: hidden;
  color: var(--gray-700);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-color-preview {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  background: transparent;
  background-clip: padding-box;
  transition: box-shadow 0.15s ease;
}

.current-color-preview.active {
  border-color: transparent;
  box-shadow:
    0 0 0 2px var(--app-panel),
    0 0 0 3px var(--swatch-ring);
}

.thickness-control {
  margin-bottom: 10px;
}


.thickness-header {
  justify-content: space-between;
  margin-bottom: 6px;
}

.thickness-header label,
.recent-colors label,
.form-group label {
  color: var(--gray-500);
  font-size: 11px;
  font-weight: 500;
}

.recent-colors {
  gap: 10px;
  margin-top: 2px;
  margin-bottom: 14px;
}

.recent-colors label {
  flex-shrink: 0;
  line-height: 1.2;
  white-space: nowrap;
}

.thickness-value {
  min-width: 30px;
  border: 1px solid var(--gray-200);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--gray-600);
  background: var(--gray-100);
  font-size: 10px;
  font-weight: 500;
  text-align: center;
}

.recent-colors-list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  padding: 2px;
}

.color-palette,
.mini-palette {
  display: grid;
  gap: 10px;
  padding: 3px;
}

.color-palette {
  grid-template-columns: repeat(7, 1fr);
}

.mini-palette {
  grid-template-columns: repeat(9, 1fr);
  gap: 8px;
}

.color-btn {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  /* Keep gradient fills inside the rounded border so edges stay crisp. */
  background-clip: padding-box;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    filter 0.15s ease,
    transform 0.1s ease,
    opacity 0.15s ease,
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.color-btn:hover:not(:disabled) {
  filter: brightness(1.06);
  box-shadow: var(--shadow-md);
}

.color-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.color-btn.selected:not(.remove-color) {
  border-color: transparent;
  box-shadow:
    0 0 0 2px var(--app-panel),
    0 0 0 3px var(--swatch-ring);
}

.color-btn.selected:hover:not(:disabled):not(.remove-color) {
  filter: brightness(1.04);
}

.color-btn.recent-color-btn {
  width: 22px;
  height: 22px;
  aspect-ratio: auto;
  border-radius: 6px;
}

.color-btn.small {
  border-radius: 6px;
}

.color-btn.remove-color {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--gray-300);
  color: var(--gray-400);
  background: var(--app-panel);
  box-shadow: none;
  font-size: 12px;
}

.color-btn.remove-color:hover:not(:disabled) {
  border-color: var(--danger-500);
  color: var(--danger-500);
  background: var(--danger-50);
  filter: none;
}

.color-btn.remove-color.selected {
  border: 2px solid var(--gray-500);
  color: var(--gray-600);
  background: var(--gray-100);
  box-shadow: none;
}

.color-btn.remove-color.selected:hover:not(:disabled) {
  border-color: var(--gray-500);
  color: var(--gray-600);
  background: var(--gray-100);
}

.form-actions {
  gap: 8px;
}

.btn-primary,
.btn-secondary {
  flex: 1;
  min-height: 34px;
}

.btn-primary {
  border: 0;
  border-radius: 10px;
  padding: 0 14px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  box-shadow:
    0 2px 8px rgba(0, 113, 227, 0.3),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.25s cubic-bezier(0.2, 1, 0.3, 1);
}

.btn-primary:hover {
  box-shadow:
    0 4px 16px rgba(0, 113, 227, 0.4),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-secondary {
  border: 0.5px solid rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  padding: 0 14px;
  color: var(--gray-700);
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    inset 0 1px 1px rgba(0, 0, 0, 0.04),
    0 0.5px 0 rgba(255, 255, 255, 0.7),
    0 1px 4px rgba(0, 0, 0, 0.03);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.25s cubic-bezier(0.2, 1, 0.3, 1);
}

.btn-secondary:hover {
  background: rgba(0, 113, 227, 0.06);
  border-color: rgba(0, 113, 227, 0.2);
  transform: translateY(-0.5px);
}

.btn-secondary:active {
  transform: scale(0.97);
}

.btn-primary:disabled,
.btn-secondary:disabled,
.color-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  filter: none;
  transform: none;
}

.add-rule-form {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  border: 0.5px solid rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.form-group {
  display: grid;
  gap: 6px;
}

.site-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.site-domain {
  margin: 0;
  color: var(--gray-800);
  font-size: 13px;
  font-weight: 600;
}

.btn-link {
  border: 0;
  padding: 0;
  color: var(--primary-600, #2563eb);
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}

.btn-link:hover {
  text-decoration: underline;
}

.form-hint {
  margin: 0;
  color: var(--gray-400);
  font-size: 10px;
  line-height: 1.4;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  padding: 3px 8px;
  color: var(--gray-700);
  background: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.chip:hover {
  border-color: rgba(37, 99, 235, 0.35);
  background: rgba(219, 234, 254, 0.8);
}

.chip.active {
  border-color: transparent;
  color: #fff;
  background: #2563eb;
}

.match-preview {
  margin: 0;
  color: var(--gray-400);
  font-size: 11px;
}

.match-preview.hit {
  color: #059669;
  font-weight: 600;
}

.rule-manage-hint {
  display: grid;
  gap: 6px;
  padding-top: 2px;
}

.rule-manage-hint p {
  margin: 0;
  color: var(--gray-500);
  font-size: 12px;
}

.rule-manage-hint .btn-link {
  justify-self: start;
  border: 0;
  padding: 0;
  color: var(--primary-600, #2563eb);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}

.rule-manage-hint .btn-link:hover {
  text-decoration: underline;
}

.status.error {
  color: #b42318;
  background: #fff0ed;
}

/* Toast: frosted glass capsule matching the liquid-glass design language. */
.toast {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 280px;
  border: 0.5px solid rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  padding: 7px 15px 7px 8px;
  color: #1e293b;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(16px) saturate(1.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 8px 24px rgba(31, 55, 89, 0.16),
    0 1px 3px rgba(31, 55, 89, 0.08);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  animation: toast-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.toast-icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 50%;
  color: #ffffff;
  background: linear-gradient(180deg, #34d399, #10b981);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 1px 4px rgba(16, 185, 129, 0.35);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.toast-message {
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast.error .toast-icon {
  background: linear-gradient(180deg, #f87171, #ef4444);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 1px 4px rgba(239, 68, 68, 0.35);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(8px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

</style>
