import SupplyRequestReviewPanel from '../../components/supply/SupplyRequestReviewPanel'
import { getSupplyRequests, resolveSupplyRequest } from '../../services/admin.service'

const Admin_SupplyRequests = () => (
  <div className="max-w-6xl">
    <SupplyRequestReviewPanel
      title="Supply Requests"
      subtitle="Review doctor requests, keep inventory moving, and resolve pending supply needs."
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
