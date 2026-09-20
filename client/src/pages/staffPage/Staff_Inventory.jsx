import Inventory from '../shared/Inventory'
import {
  getInventory,
  getInventoryMasterData,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryLocations,
  createInventoryLocation,
  updateInventoryLocation,
} from '../../services/staff.service'

const staffServices = {
  getInventory,
  getInventoryMasterData,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryLocations,
  createInventoryLocation,
  updateInventoryLocation,
}

const Staff_Inventory = () => <Inventory services={staffServices} />

export default Staff_Inventory
