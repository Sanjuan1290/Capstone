import { fileURLToPath } from 'node:url'
import base from '../../client/playwright.config.mjs'
export default {
  ...base,
  testDir: fileURLToPath(new URL('./browser-tests', import.meta.url)),
  testMatch: 'review.spec.mjs',
  timeout: 20000,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('./browser-results.json', import.meta.url)) }]],
  outputDir: fileURLToPath(new URL('./browser-artifacts', import.meta.url)),
  webServer: undefined,
}
