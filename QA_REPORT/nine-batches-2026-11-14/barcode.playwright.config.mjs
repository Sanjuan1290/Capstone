import {fileURLToPath} from 'node:url'
import base from './playwright.config.mjs'
export default {...base,testMatch:['inventory20261111.spec.mjs'],reporter:[['list'],['json',{outputFile:fileURLToPath(new URL('./barcode-results.json',import.meta.url))}]],outputDir:fileURLToPath(new URL('./barcode-artifacts',import.meta.url))}
