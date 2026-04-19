import SupplyRequestReviewPanel from '../../components/supply/SupplyRequestReviewPanel'
import { getSupplyRequests, resolveSupplyRequest } from '../../services/staff.service'

const Staff_SupplyRequests = () => (
  <div className="max-w-6xl">
    <SupplyRequestReviewPanel
      title="Supply Requests"
      subtitle="Review doctor requests, keep inventory moving, and resolve pending supply needs."
      getRequests={getSupplyRequests}
      resolveRequest={resolveSupplyRequest}
      theme={{
        accentBg: 'bg-sky-600',
        accentSoft: 'bg-sky-50',
        accentBorder: 'border-sky-200',
        accentText: 'text-sky-700',
        accentButton: 'bg-sky-600 hover:bg-sky-700',
        accentRing: 'focus:ring-sky-200 focus:border-sky-400',
        accentIconBg: 'bg-sky-100',
        accentIconText: 'text-sky-700',
      }}
    />
  </div>
)

export default Staff_SupplyRequests
