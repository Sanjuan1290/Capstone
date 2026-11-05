import BillingWorkspace from '../../components/billing/BillingWorkspace'

// Staff actions use the same UI and stay subject to server permissions.
export default function Staff_Billing() {
  return <BillingWorkspace role="staff" />
}
