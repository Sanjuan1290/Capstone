import Inventory from '../shared/Inventory'
import {
  getInventory,
  getInventoryMasterData,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
} from '../../services/staff.service'

const staffServices = {
  getInventory,
  getInventoryMasterData,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
}

const Staff_Inventory = () => <Inventory services={staffServices} />

export default Staff_Inventory

