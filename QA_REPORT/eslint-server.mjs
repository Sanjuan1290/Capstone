import {createRequire} from 'node:module'
const require=createRequire(new URL('../client/package.json',import.meta.url))
const globals=require('globals')
export default [{
  ignores:['**/node_modules/**','**/coverage/**','**/dist/**'],
},{
  files:['server/**/*.{js,cjs}','scripts/**/*.{js,cjs}'],
  languageOptions:{ecmaVersion:'latest',sourceType:'commonjs',globals:{...globals.node,...globals.vitest}},
  rules:{'no-undef':'error','no-unreachable':'error','no-constant-binary-expression':'error','no-dupe-args':'error','no-dupe-keys':'error','no-self-assign':'error','no-unsafe-finally':'error'},
},{
  files:['server/**/*.mjs','scripts/**/*.mjs'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:globals.node},
  rules:{'no-undef':'error','no-unreachable':'error','no-dupe-keys':'error'},
}]
