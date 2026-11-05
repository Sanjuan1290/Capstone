import {defineConfig} from '@playwright/test'
import {existsSync} from 'node:fs'
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const executablePath=process.env.CARAIT_BROWSER_PATH||(process.platform==='win32'&&existsSync(edge)?edge:undefined)
export default defineConfig({testDir:'./tests/browser',timeout:30000,fullyParallel:false,workers:1,reporter:[['list'],['json',{outputFile:'../docs/fix-2026-11-05/evidence/browser-results.json'}]],use:{baseURL:'http://127.0.0.1:4178',headless:true,launchOptions:{executablePath},screenshot:'only-on-failure'},outputDir:'../docs/fix-2026-11-05/evidence/browser-artifacts',webServer:process.env.CARAIT_UI_EXTERNAL_SERVER?undefined:{command:'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',url:'http://127.0.0.1:4178',reuseExistingServer:false}})
