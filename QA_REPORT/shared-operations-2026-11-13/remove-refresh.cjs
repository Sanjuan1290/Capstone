const fs = require('node:fs'), path = require('node:path')
const parser = require('../../client/node_modules/espree')
const root = path.resolve(__dirname, '../../client/src')
const files = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.jsx'))
const changes = []
for (const file of files) {
  const full = path.join(root, file), source = fs.readFileSync(full, 'utf8')
  const ast = parser.parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true })
  const edits = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXElement') {
      const name = node.openingElement.name?.name || ''
      if (/button$/i.test(name)) {
        const body = source.slice(node.openingElement.end, node.closingElement?.start ?? node.end)
        const attrs = node.openingElement.attributes.map(a => a.value?.value || '').join(' ')
        const words = body.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim()
        const refreshLabel = /^(?:Refresh(?: List| History| Status| Data| Dashboard)?|Reload)$/i.test(words)
          || /\b(?:Refresh|Reload)\b/i.test(attrs)
          || (!words && /<MdRefresh\b/.test(body) && !/Try Again|Retry|Sync|Review|Reset/.test(body))
          || /['"]Refresh(?:ing[^'"]*)?['"]/.test(body)
        if (refreshLabel && !/Try Again|Retry/i.test(words + attrs)) {
          edits.push([node.start, node.end]); return
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'range') continue
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(ast)
  if (edits.length) {
    let next = source
    for (const [start, end] of edits.sort((a,b) => b[0] - a[0])) next = next.slice(0,start) + '<></>' + next.slice(end)
    fs.writeFileSync(full, next)
    changes.push({ file: file.replaceAll('\\','/'), buttons: edits.length })
  }
}
fs.writeFileSync(path.join(__dirname, 'refresh-removal.json'), JSON.stringify(changes,null,2))
console.log(`Removed ${changes.reduce((sum,row)=>sum+row.buttons,0)} manual refresh buttons from ${changes.length} files. Error retries retained.`)
