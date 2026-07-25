import assert from 'node:assert/strict'
import { ExtensionTarget, defineExtensionManifest } from '../src/manifest.config.js'

const targets = Object.values(ExtensionTarget)

function validateLeastPrivilege(manifest, target) {
  assert.equal(manifest.manifest_version, 3, `${target}: manifest_version must be 3`)
  assert.ok(Array.isArray(manifest.permissions), `${target}: permissions must be an array`)
  assert.ok(!manifest.permissions.includes('scripting'), `${target}: scripting must stay optional by default`)

  if (target === ExtensionTarget.firefox) {
    assert.ok(!manifest.host_permissions?.length, `${target}: host_permissions should not be required by default`)
    assert.deepEqual(
      manifest.optional_host_permissions,
      ['http://*/*', 'https://*/*'],
      `${target}: tab marking should support common web pages`,
    )
  } else {
    assert.deepEqual(
      manifest.host_permissions,
      ['http://*/*', 'https://*/*'],
      `${target}: favicon composition requires host access`,
    )
  }

  for (const resourceGroup of manifest.web_accessible_resources || []) {
    assert.ok(
      !resourceGroup.matches?.includes('<all_urls>'),
      `${target}: web_accessible_resources must not expose assets to <all_urls>`,
    )
  }

  assert.ok(manifest.commands?.['color-red'], `${target}: red shortcut should be configured`)
  assert.ok(manifest.commands?.['color-blue'], `${target}: blue shortcut should be configured`)
  assert.ok(manifest.commands?.['color-green'], `${target}: green shortcut should be configured`)
  assert.ok(manifest.commands?.['remove-color'], `${target}: remove shortcut should be configured`)
}

function validateTargetCapabilities(manifest, target) {
  if (target === ExtensionTarget.firefox) {
    assert.ok(!manifest.permissions.includes('sidePanel'), `${target}: sidePanel permission is Chromium-only`)
    assert.ok(!manifest.permissions.includes('tabGroups'), `${target}: tabGroups permission is Chromium-only`)
    assert.ok(!manifest.side_panel, `${target}: side_panel is Chromium-only`)
    assert.ok(manifest.sidebar_action, `${target}: sidebar_action should be configured`)
    return
  }

  assert.ok(manifest.permissions.includes('sidePanel'), `${target}: sidePanel permission is required`)
  assert.ok(manifest.permissions.includes('tabGroups'), `${target}: tabGroups permission is required`)
  assert.ok(manifest.side_panel, `${target}: side_panel should be configured`)
}

for (const target of targets) {
  const manifest = defineExtensionManifest({ target })

  validateLeastPrivilege(manifest, target)
  validateTargetCapabilities(manifest, target)
}

console.log(`Validated extension manifests: ${targets.join(', ')}`)
