import BillingWorkspace from '../../components/billing/BillingWorkspace'
import {useAuth} from '../../context/AuthContext'
import {hasStaffPermission} from '../../config/staffPermissions'
export default function Staff_Billing(){
 const {user}=useAuth(),canCheckout=hasStaffPermission(user,'checkout'),canBilling=hasStaffPermission(user,'billing')
 if(!canCheckout&&!canBilling)return <p role="alert">Your account does not have billing access.</p>
 return <BillingWorkspace canCheckout={canCheckout}/>
}
