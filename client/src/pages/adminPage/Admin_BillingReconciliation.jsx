import { Navigate } from 'react-router-dom'

// Cashier shift reconciliation was retired. Financial collection reporting now lives in Admin Reports.
const Admin_BillingReconciliation = () => <Navigate to="/admin/reports" replace />

export default Admin_BillingReconciliation

