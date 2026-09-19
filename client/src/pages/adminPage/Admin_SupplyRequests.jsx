import SupplyRequestReviewPanel from '../../components/supply/SupplyRequestReviewPanel'
import { getSupplyRequests, resolveSupplyRequest } from '../../services/admin.service'

const Admin_SupplyRequests = () => (
  <div className="mx-auto w-full max-w-7xl">
    <SupplyRequestReviewPanel
      title="Stock Transfer Requests"
      subtitle="Approve requests to transfer stock per batch from Main Stockroom to the doctor or treatment room without counting it as clinical consumption."
      getRequests={getSupplyRequests}
      resolveRequest={resolveSupplyRequest}
      theme={{
        accentBg: 'bg-amber-500',
        accentSoft: 'bg-amber-50',
        accentBorder: 'border-amber-200',
        accentText: 'text-amber-700',
        accentButton: 'bg-amber-500 hover:bg-amber-600',
        accentRing: 'focus:ring-amber-200 focus:border-amber-400',
        accentIconBg: 'bg-amber-100',
        accentIconText: 'text-amber-700',
      }}
    />
  </div>
)

export default Admin_SupplyRequests
