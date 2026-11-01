import PatientRecordsPage from '../../components/patients/PatientRecordsPage'
import { getPatientDirectory, getPatientRecord } from '../../services/admin.service'

export default function Admin_PatientRecord() {
  return <PatientRecordsPage getDirectory={getPatientDirectory} getPatientRecord={getPatientRecord} />
}
