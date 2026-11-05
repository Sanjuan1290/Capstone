import BillCheckout from '../../components/billing/BillCheckout'
import * as api from '../../services/admin.service'
const services={...api,
 finalizeBill:api.finalizeAdminCheckoutBill,getBillById:api.getAdminCheckoutBill,
 getBillingAdjustmentRequests:api.getAdminBillAdjustmentRequests,getDiscountPresets:api.getAdminDiscountPresets,
 getFinalizePreview:api.getAdminFinalizePreview,payBill:api.payAdminCheckoutBill,reopenBill:api.reopenAdminCheckoutBill,
 updateBill:api.updateAdminCheckoutBill,uploadDiscountProofImage:api.uploadAdminDiscountProofImage,
 createStaffQrPayment:api.createAdminQrPayment,getStaffQrStatus:api.getAdminQrStatus,cancelStaffQrPayment:api.cancelAdminQrPayment,
}
export default function Admin_CheckoutDetail(){return <BillCheckout services={services} admin/>}
