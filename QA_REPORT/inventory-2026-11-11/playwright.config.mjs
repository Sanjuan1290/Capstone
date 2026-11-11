import { fileURLToPath } from 'node:url'
import base from '../../client/playwright.config.mjs'
const client = fileURLToPath(new URL('../../client', import.meta.url))
export default {
  ...base,
  testDir: `${client}/tests/browser`,
  testMatch: 'inventory20261111.spec.mjs',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('./browser-results.json', import.meta.url)) }]],
  outputDir: fileURLToPath(new URL('./browser-artifacts', import.meta.url)),
  webServer: process.env.CARAIT_UI_EXTERNAL_SERVER ? undefined : { ...base.webServer, command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run preview -- --host 127.0.0.1 --port 4178 --strictPort`, cwd: client },
}
