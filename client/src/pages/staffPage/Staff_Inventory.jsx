// client/src/pages/staffPage/Staff_Inventory.jsx
// Thin wrapper — passes staff service functions to the shared Inventory component.
// Route stays: /staff/inventory

import Inventory from '../shared/Inventory'
import SupplyRequestReviewPanel from '../../components/supply/SupplyRequestReviewPanel'
import {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getSupplyRequests,
  resolveSupplyRequest,
} from '../../services/staff.service'

const staffServices = {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
}

const Staff_Inventory = () => (
  <div className="space-y-6">
    <Inventory services={staffServices} />
    <SupplyRequestReviewPanel
      title="Supply Request Oversight"
      subtitle="Staff can review and resolve doctor supply requests inside inventory, same as admin."
      getRequests={getSupplyRequests}
      resolveRequest={resolveSupplyRequest}
      compact
    />
  </div>
)

export default Staff_Inventory
