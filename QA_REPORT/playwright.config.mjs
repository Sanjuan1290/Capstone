import { defineConfig } from '../client/node_modules/@playwright/test/index.mjs'
import { fileURLToPath } from 'node:url'
const client = fileURLToPath(new URL('../client', import.meta.url))
export default defineConfig({
  testDir: fileURLToPath(new URL('../client/tests/browser', import.meta.url)),
  timeout: 12000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('evidence/browser-results.json', import.meta.url)) }]],
  outputDir: 'evidence/browser-artifacts',
  use: {
    baseURL: process.env.CARAIT_QA_BROWSER_ORIGIN || 'http://127.0.0.1:4189', headless: true,
    launchOptions: { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
    screenshot: 'only-on-failure',
  },
  webServer: process.env.CARAIT_QA_EXTERNAL_PREVIEW ? undefined : {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4189 --strictPort',
    cwd: client, url: 'http://127.0.0.1:4189', reuseExistingServer: false,
  },
})
