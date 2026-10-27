'use strict'

const path = require('node:path')
const { generateSourceExports } = require('./sourceExport')

const root = path.resolve(__dirname, '../..')
const result = generateSourceExports({ root })
console.log('Generated deterministic source exports:')
console.log(result.textPath + ' (' + result.readableFiles + ' readable files)')
console.log(result.zipPath + ' (' + result.zipEntries + ' entries, ' + result.binaryFiles + ' binary assets)')


