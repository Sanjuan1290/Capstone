const fs = require('fs')
const path = require('path')

const readClient = (relativePath) => fs.readFileSync(path.join(__dirname, '../../../client/src', relativePath), 'utf8')

describe('UI runtime regression guards', () => {
  it('uses the useClientPagination pageItems contract in Staff Accounts', () => {
    const source = readClient('pages/adminPage/Admin_StaffAccount.jsx')
    expect(source).toContain('pagination.pageItems.length')
    expect(source).toContain('pagination.pageItems.map')
    expect(source).not.toContain('pagination.items.length')
    expect(source).not.toContain('pagination.items.map')
  })

  it('defines portalBase before System Setup passes it to reference managers', () => {
    const source = readClient('pages/adminPage/Admin_SystemSetup.jsx')
    expect(source).toContain("const portalBase = location.pathname.startsWith('/staff') ? '/staff' : '/admin'")
    expect(source).toContain('portalBase={portalBase}')
  })
})
