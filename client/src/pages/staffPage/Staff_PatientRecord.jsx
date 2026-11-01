import PatientRecordsPage from '../../components/patients/PatientRecordsPage'
import { getPatientDirectory, getPatientRecord } from '../../services/staff.service'

export default function Staff_PatientRecord() {
  return <PatientRecordsPage getDirectory={getPatientDirectory} getPatientRecord={getPatientRecord} />
}
