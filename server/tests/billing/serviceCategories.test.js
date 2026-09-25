const fs = require('fs')
const path = require('path')

describe('editable billing service categories', () => {
  const projectRoot = path.join(__dirname, '..', '..', '..')

  it('loads Add Service categories from System Setup instead of a hard-coded array', () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'client', 'src', 'pages', 'adminPage', 'Admin_BillingServiceForm.jsx'),
      'utf8'
    )
    expect(source).toContain('getSystemSetup()')
    expect(source).toContain('setup?.service_categories')
    expect(source).toContain('category_id')
    expect(source).not.toContain('const CATEGORY_OPTIONS')
  })

  it('exposes Service Categories in Admin System Setup', () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'client', 'src', 'pages', 'adminPage', 'Admin_SystemSetup.jsx'),
      'utf8'
    )
    expect(source).toContain("key: 'service_categories'")
    expect(source).toContain('saveBillingServiceCategory')
  })

  it('requires the database-backed category reference in the billing catalog schema', () => {
    const schema = fs.readFileSync(path.join(projectRoot, 'server', 'utils', 'schema.js'), 'utf8')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS billing_service_categories')
    expect(schema).toContain("ensureColumn('billing_service_catalog', 'category_id'")
    expect(schema).toContain('fk_billing_service_category')
  })
})

