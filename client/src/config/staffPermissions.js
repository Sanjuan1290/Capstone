export const STAFF_PERMISSION_GROUPS = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Access the main Staff workspace and clinic summary.',
    permissions: [
      { key: 'dashboard', label: 'Dashboard', short: 'Clinic overview', description: 'View the Staff dashboard, clinic summaries, counts, and assigned operational information.' },
    ],
  },
  {
    key: 'clinic_operations',
    label: 'Clinic Operations',
    description: 'Access appointments, patient information, and doctor scheduling.',
    permissions: [
      { key: 'appointments', label: 'Appointments', short: 'Appointments + Walk-in Queue', description: 'View and manage scheduled appointments, patient check-ins, and the Walk-in Queue.' },
      { key: 'patient_records', label: 'Patient Records', short: 'Patient profiles and history', description: 'Search and view patient profiles, contact information, appointment history, and permitted patient records.' },
      { key: 'doctor_schedules', label: 'Doctor Schedules', short: 'Availability and schedules', description: 'View doctor schedules, clinic hours, availability, and unavailable dates.' },
    ],
  },
  {
    key: 'billing_stock',
    label: 'Billing & Stock',
    description: 'Control payment collection, billing visibility, inventory, and transfers.',
    permissions: [
      { key: 'checkout', label: 'Checkout', short: 'Collect patient payments', description: 'Open bills that are ready for payment and process patient checkout and payment collection.' },
      { key: 'billing', label: 'Billing', short: 'View billing records', description: 'View billing records, transactions, payment history, balances, and permitted billing information. Checkout actions still require Checkout access.' },
      { key: 'inventory', label: 'Inventory', short: 'Stock and batches', description: 'View and manage clinic inventory, stock levels, batches, and permitted stock movements.' },
      { key: 'stock_transfers', label: 'Stock Transfers', short: 'Transfer requests', description: 'View, review, and process stock-transfer requests between clinic locations.' },
    ],
  },
  {
    key: 'people_setup',
    label: 'People & Setup',
    description: 'Access account directories and clinic configuration.',
    permissions: [
      { key: 'accounts', label: 'Accounts', short: 'Staff + Doctor directory', description: 'View Staff and Doctor account information. Creating accounts and changing Staff permissions remain Administrator-only.' },
      { key: 'system_setup', label: 'System Setup', short: 'Clinic configuration', description: 'Manage Patient Visits, Billing Setup, Service Categories, Units of Measure, Suppliers, Storage Classifications, and Movement Reasons.' },
    ],
  },
  {
    key: 'insights_system',
    label: 'Insights & System',
    description: 'Access reporting, audit history, and public website management.',
    permissions: [
      { key: 'reports', label: 'Reports', short: 'Clinic analytics', description: 'View clinic operational, financial, appointment, inventory, and other available reports.' },
      { key: 'audit_logs', label: 'Audit Logs', short: 'Read system activity', description: 'View system audit activity and historical actions. Archive creation and permanent deletion remain Administrator-only.' },
      { key: 'landing_page', label: 'Landing Page', short: 'Public website content', description: 'Manage the public clinic website content and landing-page information.' },
    ],
  },
]

export const STAFF_PERMISSIONS = STAFF_PERMISSION_GROUPS.flatMap((group) => group.permissions)
export const STAFF_PERMISSION_KEYS = STAFF_PERMISSIONS.map((item) => item.key)

// Default access for newly created Staff accounts. These mirror the operational
// areas Staff could access before customizable permissions were introduced.
export const DEFAULT_STAFF_PERMISSIONS = Object.freeze([
  'dashboard',
  'appointments',
  'patient_records',
  'doctor_schedules',
  'checkout',
  'inventory',
  'stock_transfers',
])
export const STAFF_PERMISSION_MAP = Object.fromEntries(STAFF_PERMISSIONS.map((item) => [item.key, item]))

export const normalizeStaffPermissions = (value) => [...new Set((Array.isArray(value) ? value : []).filter((key) => STAFF_PERMISSION_KEYS.includes(key)))]
export const hasStaffPermission = (user, key) => normalizeStaffPermissions(user?.permissions).includes(key)
