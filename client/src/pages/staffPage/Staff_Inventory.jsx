// client/src/pages/staffPage/Staff_Inventory.jsx
// Thin wrapper — passes staff service functions to the shared Inventory component.
// Route stays: /staff/inventory

import Inventory from '../shared/Inventory'
import {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '../../services/staff.service'

const staffServices = {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
}

const Staff_Inventory = () => <Inventory services={staffServices} />

export default Staff_Inventory