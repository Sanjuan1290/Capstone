import Inventory from '../shared/Inventory'
import {
  getInventory,
  getInventoryMasterData,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  moveInventoryStock,
  getInventoryLocations,
} from '../../services/staff.service'

const staffServices = {
  getInventory,
  getInventoryMasterData,
  updateStock,
  addInventoryItem,
  updateInventoryItem,
  moveInventoryStock,
  getInventoryLocations,
}

const Staff_Inventory = () => <Inventory services={staffServices} canManageSellingPrice={false} />

export default Staff_Inventory


