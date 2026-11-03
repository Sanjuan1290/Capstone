const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../..')
const account = fs.readFileSync(path.join(root, 'client/src/pages/adminPage/Admin_StaffAccount.jsx'), 'utf8')
const config = fs.readFileSync(path.join(root, 'client/src/config/staffPermissions.js'), 'utf8')
const picker = fs.readFileSync(path.join(root, 'client/src/components/accounts/StaffPermissionPicker.jsx'), 'utf8')

test('account summary uses the same dynamic permission total as the picker', () => {
  assert.match(account, /import\s*\{[^}]*STAFF_PERMISSION_KEYS[^}]*\}\s*from\s*['\"]\.\.\/\.\.\/config\/staffPermissions['\"]/s)
  assert.match(account, /\{permissionCount\}\/\{STAFF_PERMISSION_KEYS\.length\} enabled/)
  assert.doesNotMatch(account, /\{permissionCount\}\/\d+ enabled/)
  assert.match(account, /\{permissionCount\}\/\{STAFF_PERMISSION_KEYS\.length\} permissions/)
  assert.doesNotMatch(account, /\{permissionCount\}\/\d+ permissions/)
  assert.match(picker, /STAFF_PERMISSION_KEYS\.length/)
})

test('permission count reflects configured permissions, not a magic number', () => {
  const entries = [...config.matchAll(/\{ key: '[a-z_]+', label:/g)]
  assert.ok(entries.length >= 1)
  assert.match(config, /STAFF_PERMISSION_KEYS\s*=\s*STAFF_PERMISSIONS\.map/)
})
