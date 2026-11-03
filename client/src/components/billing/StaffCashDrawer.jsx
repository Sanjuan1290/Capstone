import CashierDrawerCard from './CashierDrawerCard'
import { getMyCashierClosing, closeMyCashier } from '../../services/staff.service'

export default function StaffCashDrawer() {
  return <CashierDrawerCard loadDrawer={getMyCashierClosing} closeDrawer={closeMyCashier} />
}
