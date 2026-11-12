import { fileURLToPath } from 'node:url'
import base from '../../client/playwright.config.mjs'
export default {
  ...base,
  testDir: fileURLToPath(new URL('../../client/tests/browser', import.meta.url)),
  testMatch: 'guestBooking20261112.spec.mjs',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('./browser-results.json', import.meta.url)) }]],
  outputDir: fileURLToPath(new URL('./browser-artifacts', import.meta.url)),
  use: { ...base.use, timezoneId: 'Asia/Manila' },
  webServer: undefined,
}
