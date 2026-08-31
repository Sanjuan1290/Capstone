import SupplyRequestReviewPanel from '../../components/supply/SupplyRequestReviewPanel'
import { getSupplyRequests, resolveSupplyRequest } from '../../services/staff.service'

const Staff_SupplyRequests = () => (
  <div className="mx-auto w-full max-w-7xl">
    <SupplyRequestReviewPanel
      title="Stock Transfer Requests"
      subtitle="Approve requests to transfer stock per batch from Main Stockroom to the doctor or treatment room without counting it as clinical consumption."
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
