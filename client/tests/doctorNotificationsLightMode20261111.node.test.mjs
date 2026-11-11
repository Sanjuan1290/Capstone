import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=p=>readFileSync(path.join(root,p),'utf8')

test('Super Admin owns a dedicated System Setup notification page',()=>{
  const app=read('src/App.jsx')
  const sidebar=read('src/pages/superAdminPage/BranchPortals.jsx')
  const page=read('src/pages/superAdminPage/redesign/SystemSetup.jsx')
  assert.match(app,/path='system-setup' element=\{<SuperAdminSystemSetup\s*\/>\}/)
  assert.match(sidebar,/\/superadmin\/system-setup/)
  assert.match(page,/Email doctor/)
  assert.match(page,/SMS doctor/)
  assert.match(page,/X-Admin-Portal':'superadmin'/)
})

test('four portal layouts no longer offer theme toggles',()=>{
  for(const name of ['AdminLayout','StaffLayout','PatientLayout','DoctorLayout']){
    const layout=read(`src/components/layouts/${name}.jsx`)
    assert.doesNotMatch(layout,/toggleTheme|MdDarkMode|MdLightMode|useTheme/,name)
  }
})

test('app runs in light mode without saved dark preference',()=>{
  const theme=read('src/context/ThemeContext.jsx')
  const css=read('src/index.css')
  assert.match(theme,/classList.remove\('dark'\)/)
  assert.match(theme,/localStorage.removeItem\('app_theme'\)/)
  assert.doesNotMatch(css,/^\.dark\b/m)
  assert.doesNotMatch(read('tailwind.config.js'),/darkMode/)
})

test('no dark: utility classes remain across source',()=>{
  const files=[]
  const walk=(dir)=>{for(const ent of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.(jsx|js|mjs|css)$/.test(ent.name))files.push(p)}}
  walk(path.join(root,'src'))
  assert.equal(files.filter(p=>readFileSync(p,'utf8').includes('dark:')).length,0)
})
