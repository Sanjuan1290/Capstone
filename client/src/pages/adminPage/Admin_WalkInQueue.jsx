import WalkInQueuePage from '../shared/WalkInQueuePage'
import { getQueue, updateQueueStatus } from '../../services/admin.service'
const services = { getQueue, updateQueueStatus }
export default function Admin_WalkInQueue() { return <WalkInQueuePage services={services} /> }
