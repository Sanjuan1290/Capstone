import {fileURLToPath} from 'node:url'
import base from '../nine-batches-2026-11-14/playwright.config.mjs'
export default {...base,testMatch:['nineBatches20261114.spec.mjs'],reporter:[['list'],['json',{outputFile:fileURLToPath(new URL('./browser-results.json',import.meta.url))}]],outputDir:fileURLToPath(new URL('./browser-artifacts',import.meta.url))}
