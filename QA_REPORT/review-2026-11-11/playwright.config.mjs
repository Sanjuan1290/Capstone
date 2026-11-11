import {defineConfig} from '../../client/node_modules/@playwright/test/index.mjs'
import {fileURLToPath} from 'node:url'
export default defineConfig({
 testDir:fileURLToPath(new URL('../../client/tests/browser',import.meta.url)),workers:1,timeout:20000,
 reporter:[['list'],['json',{outputFile:fileURLToPath(new URL(process.env.CARAIT_QA_BASELINE?'baseline-browser-results.json':'browser-results.json',import.meta.url))}]],
 outputDir:fileURLToPath(new URL(process.env.CARAIT_QA_BASELINE?'browser-artifacts/baseline-playwright':'browser-artifacts/playwright',import.meta.url)),
 use:{baseURL:process.env.CARAIT_QA_BROWSER_ORIGIN,headless:true,launchOptions:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'},screenshot:'only-on-failure'},
})
