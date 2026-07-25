<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createRuleDisplayName, getColorSwatchBackground, getMarkColor, MarkSource } from '../../shared/tab-marks.js'
import {
  ExtensionMessage,
  addRuntimeMessageHandlers,
  createExtensionMessage,
  sendRuntimeMessage,
} from '../../extension/messaging.js'
import { buildCapsuleLensMap, buildConvexLensMap } from '../../shared/liquid-glass-lens.js'
import { t } from '../../shared/i18n.js'

const activeContext = ref(null)
const overview = ref(null)
const error = ref('')
const lensMapUrl = ref('')
const capsuleMapUrl = ref('')
let removeRuntimeHandlers = null

const marks = computed(() => overview.value?.marks || [])
const rules = computed(() => overview.value?.rules || [])
const resolved = computed(() => activeContext.value?.resolved || null)

const statusText = computed(() => {
  switch (resolved.value?.source) {
    case MarkSource.direct:
      return t('common.currentPageMark')
    case MarkSource.rule:
      return resolved.value.rule?.name || t('common.matchingRule')
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

async function loadPanel() {
  error.value = ''

  try {
    const [context, markOverview] = await Promise.all([
      sendRuntimeMessage(createExtensionMessage(ExtensionMessage.getActiveTabMark)),
      sendRuntimeMessage(createExtensionMessage(ExtensionMessage.getTabMarkOverview)),
    ])

    activeContext.value = context
    overview.value = markOverview
  } catch (err) {
    error.value = err.message || String(err)
  }
}

function shortUrlKey(urlKey) {
  if (!urlKey) return ''

  try {
    const url = new URL(urlKey)
    return `${url.hostname}${url.pathname}`
  } catch {
    return urlKey
  }
}

function ruleTitle(rule) {
  const conditions = rule?.conditions || {}
  if (conditions.siteDomain) {
    return createRuleDisplayName(conditions.siteDomain, conditions.keyword, {
      wholeSite: t('common.wholeSite'),
      untitledRule: t('common.untitledRule'),
    })
  }

  return rule?.name || t('common.matchingRule')
}

function ruleSubtitle(rule) {
  const conditions = rule?.conditions || {}
  if (conditions.siteDomain) {
    return conditions.keyword ? t('common.matchKeyword') : t('common.wholeSite')
  }

  return rule?.enabled === false ? t('common.disabled') : t('common.enabled')
}

function ruleDisabledSuffix(rule) {
  const conditions = rule?.conditions || {}
  return rule?.enabled === false && conditions.siteDomain ? ` · ${t('common.disabled')}` : ''
}

async function openMarkedUrl(mark) {
  if (!mark.url) return

  await sendRuntimeMessage(createExtensionMessage(ExtensionMessage.openMarkedUrl, {
    url: mark.url,
  }))
}

function notifyClosed() {
  sendRuntimeMessage(createExtensionMessage(ExtensionMessage.sidePanelClosed)).catch(() => {})
}

function closePanel() {
  notifyClosed()
  window.close()

  return { closed: true }
}

onMounted(() => {
  lensMapUrl.value = buildConvexLensMap()
  capsuleMapUrl.value = buildCapsuleLensMap()

  removeRuntimeHandlers = addRuntimeMessageHandlers({
    [ExtensionMessage.closeSidePanel]: closePanel,
  })

  loadPanel()
})

onBeforeUnmount(() => {
  removeRuntimeHandlers?.()
  notifyClosed()
})
</script>

<template>
  <main class="app-shell side-panel-shell">
    <svg class="liquid-glass-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="liquid-glass" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.014" numOctaves="2" seed="8" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="3" result="softNoise" />
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="5" xChannelSelector="R" yChannelSelector="G" />
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

    <section class="panel panel-stack">
      <div class="row">
        <h1 class="title">{{ t('side.title') }}</h1>
        <button class="button secondary" type="button" @click="loadPanel">{{ t('side.refresh') }}</button>
      </div>

      <p v-if="error" class="status error">{{ error }}</p>

      <div class="current-box">
        <span
          class="current-dot"
          :style="{ background: resolved?.mark ? getColorSwatchBackground(getMarkColor(resolved.mark.colorId)) : '#d9dfeb' }"
        ></span>
        <div>
          <strong>{{ statusText }}</strong>
          <span>{{ resolved?.urlInfo?.displayUrl || activeContext?.tab?.url || '-' }}</span>
        </div>
      </div>
    </section>

    <section class="panel panel-stack">
      <div class="row">
        <h2 class="section-title">{{ t('side.pageMarks') }}</h2>
        <span class="count">{{ marks.length }}</span>
      </div>

      <div v-if="!marks.length" class="empty-state">{{ t('side.emptyMarks') }}</div>
      <button
        v-for="mark in marks"
        :key="mark.urlKey"
        class="mark-row"
        type="button"
        @click="openMarkedUrl(mark)"
      >
        <span class="mark-dot" :style="{ background: getColorSwatchBackground(getMarkColor(mark.colorId)) }"></span>
        <span>
          <strong>{{ mark.title || shortUrlKey(mark.urlKey) }}</strong>
          <em>{{ shortUrlKey(mark.urlKey) }}</em>
        </span>
      </button>
    </section>

    <section class="panel panel-stack">
      <div class="row">
        <h2 class="section-title">{{ t('side.custom') }}</h2>
        <span class="count">{{ rules.length }}</span>
      </div>

      <div v-if="!rules.length" class="empty-state">{{ t('side.emptyRules') }}</div>
      <div v-for="rule in rules" :key="rule.id" class="rule-row">
        <span class="mark-dot" :style="{ background: getColorSwatchBackground(getMarkColor(rule.colorId)) }"></span>
        <span class="rule-copy">
          <strong>{{ ruleTitle(rule) }}</strong>
          <em>{{ ruleSubtitle(rule) }}{{ ruleDisabledSuffix(rule) }}</em>
        </span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.side-panel-shell {
  display: grid;
  min-width: 320px;
  align-content: start;
  gap: 12px;
  padding: 14px;
}

.panel-stack {
  display: grid;
  gap: 12px;
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.row {
  align-items: center;
}

.title {
  color: var(--gray-900);
  font-size: 16px;
  font-weight: 700;
}

.section-title {
  margin: 0;
  color: var(--gray-800);
  font-size: 13px;
  font-weight: 600;
}

.count {
  color: var(--gray-500);
  font-size: 12px;
}

.current-box,
.mark-row,
.rule-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.current-box {
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  padding: 10px 11px;
  background: var(--gray-50);
}

.current-box div,
.mark-row span:last-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.current-box strong,
.mark-row strong {
  overflow: hidden;
  color: var(--gray-800);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-box span:last-child,
.mark-row em,
.rule-row span {
  overflow: hidden;
  color: var(--gray-500);
  font-size: 11px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-dot,
.mark-dot {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  margin-top: 2px;
  border: 1px solid rgba(31, 41, 55, 0.18);
  border-radius: 4px;
  background-clip: padding-box;
  box-shadow: var(--shadow-sm);
}

.mark-row {
  width: 100%;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  padding: 9px 11px;
  color: var(--gray-800);
  background: var(--gray-50);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mark-row:hover {
  border-color: var(--primary-200);
  background: var(--primary-50);
}

.rule-row {
  align-items: center;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  padding: 9px 10px;
  background: var(--gray-50);
}

.rule-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.rule-copy strong {
  overflow: hidden;
  color: var(--gray-800);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-copy em {
  color: var(--gray-400);
  font-size: 10px;
  font-style: normal;
}

.rule-row strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--gray-800);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  border-radius: 10px;
  padding: 12px;
  color: var(--gray-500);
  background: var(--gray-50);
  font-size: 12px;
  text-align: center;
}

.status.error {
  color: #b42318;
  background: #fff0ed;
}

.side-panel-shell {
  position: relative;
  isolation: isolate;
  background:
    linear-gradient(150deg, rgba(255, 255, 255, 0.92), rgba(232, 243, 251, 0.9) 48%, rgba(247, 250, 255, 0.96)),
    linear-gradient(115deg, rgba(0, 113, 227, 0.13), rgba(16, 185, 129, 0.08) 52%, rgba(236, 72, 153, 0.07)),
    #eef3f8;
}

.side-panel-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.32) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.28) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.26), transparent 78%);
  pointer-events: none;
}

.panel-stack {
  border: 0.5px solid var(--lg-stroke);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.34)),
    rgba(255, 255, 255, 0.34);
  backdrop-filter: blur(24px) saturate(1.6) url(#liquid-glass);
  -webkit-backdrop-filter: blur(24px) saturate(1.6) url(#liquid-glass);
  box-shadow: var(--lg-shadow);
}

.panel-stack:hover {
  box-shadow: var(--lg-shadow-hover);
}

.button.secondary,
.current-box,
.mark-row,
.rule-row,
.empty-state,
.count {
  border-color: var(--lg-stroke);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.28)),
    rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(16px) saturate(1.45);
  -webkit-backdrop-filter: blur(16px) saturate(1.45);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    0 2px 8px rgba(31, 55, 89, 0.06);
}

.button.secondary,
.mark-row,
.rule-row {
  transition:
    transform 0.24s var(--lg-fluid),
    box-shadow 0.24s var(--lg-fluid),
    border-color 0.24s ease,
    background 0.24s ease,
    color 0.24s ease;
}

.button.secondary:hover,
.mark-row:hover,
.rule-row:hover {
  border-color: rgba(0, 113, 227, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.34)),
    rgba(0, 113, 227, 0.05);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.74),
    0 8px 18px rgba(0, 113, 227, 0.08);
  transform: translateY(-1px) scale(1.01);
}

.button.secondary:active,
.mark-row:active,
.rule-row:active {
  transform: scale(0.97);
}

.current-box,
.mark-row,
.rule-row,
.empty-state {
  border-radius: 13px;
}

.count {
  min-width: 26px;
  border: 0.5px solid var(--lg-stroke);
  border-radius: 999px;
  padding: 2px 8px;
  text-align: center;
}

.current-dot,
.mark-dot {
  position: relative;
  overflow: hidden;
  border-color: rgba(255, 255, 255, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.46),
    0 2px 6px rgba(31, 55, 89, 0.1);
}

.current-dot::after,
.mark-dot::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.48), transparent 52%, rgba(0, 0, 0, 0.06));
  pointer-events: none;
}

.title,
.section-title {
  color: #172033;
}

.current-box span:last-child,
.mark-row em,
.rule-row span,
.count {
  color: rgba(71, 85, 105, 0.78);
}

</style>
