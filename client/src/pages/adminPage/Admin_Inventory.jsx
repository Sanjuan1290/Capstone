// client/src/pages/adminPage/Admin_Inventory.jsx
// Thin wrapper — passes admin service functions to the shared Inventory component.
// Route stays: /admin/inventory

import Inventory from '../shared/Inventory'
import {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '../../services/admin.service'

const adminServices = {
  getInventory,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
}

const Admin_Inventory = () => <Inventory services={adminServices} />

export default Admin_Inventory