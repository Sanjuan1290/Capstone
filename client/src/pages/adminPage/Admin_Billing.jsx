import BillingWorkspace from '../../components/billing/BillingWorkspace'

// The one daily billing entry point for Admin and Super Admin branch workspaces.
export default function Admin_Billing() {
  return <BillingWorkspace role="admin" />
}
