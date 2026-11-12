const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const client = path.resolve(__dirname, '../../client')
const log = fs.openSync(path.join(__dirname, 'preview.log'), 'w')
require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, '../reports-walkin-inventory-2026-11-13/prepare-fixtures.cjs')], { stdio: 'inherit', windowsHide: true })
const preview = spawn(process.execPath, [path.join(client, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { cwd: client, windowsHide: true, stdio: ['ignore', log, log] })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function run() {
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      if (preview.exitCode !== null) throw Error(`Preview stopped: ${preview.exitCode}`)
      try { ready = (await fetch('http://127.0.0.1:4178')).ok } catch {}
      if (ready) break
      await pause(100)
    }
    if (!ready) throw Error('Preview not ready')
    const browser = spawn(process.execPath, [path.join(client, 'node_modules/@playwright/test/cli.js'), 'test', '--config', path.join(__dirname, 'playwright.config.mjs')], { cwd: client, windowsHide: true, stdio: 'inherit', env: { ...process.env, CARAIT_UI_EXTERNAL_SERVER: '1', CARAIT_GUEST_QA_DIR: path.basename(__dirname) } })
    process.exitCode = await new Promise((resolve, reject) => { browser.on('error', reject); browser.on('exit', code => resolve(code ?? 1)) })
  } finally {
    const closed = new Promise(resolve => preview.once('exit', resolve))
    preview.kill()
    await Promise.race([closed, pause(3000)])
    fs.closeSync(log)
  }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
