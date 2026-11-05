import BillCheckout from '../../components/billing/BillCheckout'
import * as api from '../../services/staff.service'
const services={...api,reopenBill:api.reopenBillForEditing}
export default function Staff_CheckoutDetail(){return <BillCheckout services={services}/>}
