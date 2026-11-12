import WalkInQueuePage from '../shared/WalkInQueuePage'
import { getQueue, updateQueueStatus } from '../../services/staff.service'
const services = { getQueue, updateQueueStatus }
export default function Staff_WalkInQueue() { return <WalkInQueuePage services={services} /> }
