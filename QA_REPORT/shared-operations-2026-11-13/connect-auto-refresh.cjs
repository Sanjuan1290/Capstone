const fs=require('node:fs'),path=require('node:path'),parser=require('../../client/node_modules/espree')
const root=path.resolve(__dirname,'../../client/src')
const settings={
 'pages/superAdminPage/BranchPortals.jsx':['reload','reload','open'],
 'pages/adminPage/Admin_PatientBooking.jsx':['loadReasons','loadReasons','saving'],
 'components/billing/BillCorrectionsPanel.jsx':['loadUsage'],
 'components/billing/BillFinancialTools.jsx':['load'],
 'components/billing/BillHistory.jsx':['load'],
 'components/billing/BillHistoryDetail.jsx':['load'],
 'components/system/InventoryExcelTools.jsx':['loadUploads','() => loadUploads(historyPage)'],
 'pages/adminPage/Admin_AuditArchive.jsx':['load'],
 'pages/adminPage/Admin_BillingApprovals.jsx':['load'],
 'pages/adminPage/Admin_BillingCatalog.jsx':['load'],
 'pages/adminPage/Admin_BillingDiscounts.jsx':['load','load','saving'],
 'pages/adminPage/Admin_BillingPaymentMethods.jsx':['load','load','dirty || saving'],
 'pages/adminPage/Admin_Dashboard.jsx':['load'],
 'pages/adminPage/Admin_PaymentIssues.jsx':['load'],
 'pages/doctorPage/Doctor_Dashboard.jsx':['load'],
 'pages/staffPage/Staff_AccountsView.jsx':['load'],
 'pages/staffPage/Staff_Dashboard.jsx':['load'],
 'pages/superAdminPage/redesign/Accounts.jsx':['reload','reload','open || saving'],
 'pages/superAdminPage/redesign/Audits.jsx':['refresh'],
 'pages/superAdminPage/redesign/Branches.jsx':['load','load','open || saving'],
 'pages/superAdminPage/redesign/Patients.jsx':['loadList'],
 'pages/superAdminPage/redesign/TeamAccounts.jsx':['reload','reload','open || saving'],
}
for(const [file,[loader,callback=loader,skip]] of Object.entries(settings)){
 const full=path.join(root,file);let source=fs.readFileSync(full,'utf8')
 if(source.includes('useClinicRefresh('))continue
 const ast=parser.parse(source,{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}})
 let end
 function walk(node){if(!node||typeof node!=='object')return
  if(node.type==='VariableDeclaration'&&node.declarations.some(d=>d.id.name===loader))end=node.end
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value)
 }
 walk(ast);if(!end)throw Error('Loader not found: '+file)
 source=source.slice(0,end)+`\n  useClinicRefresh(${callback}, [], { fallbackMs: 60000${skip?', skip: () => '+skip:''} })\n`+source.slice(end)
 let relative=path.posix.relative(path.posix.dirname(file),'hooks/useClinicRefresh');if(!relative.startsWith('.'))relative='./'+relative
 fs.writeFileSync(full,`import useClinicRefresh from '${relative}'\n`+source)
}
