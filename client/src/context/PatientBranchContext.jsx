import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getActiveBranches } from '../services/patient.service'

const PatientBranchContext = createContext(null)
const keyFor = (patientId) => `carait:selected-branch:${patientId}`
export const PatientBranchProvider = ({ patientId, children }) => {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refreshBranches = useCallback(async () => {
    if (!patientId) return
    setLoading(true); setError('')
    try {
      const rows = await getActiveBranches()
      const valid = Array.isArray(rows) ? rows.filter(b => Number.isSafeInteger(Number(b.id)) && Number(b.id) > 0) : []
      setBranches(valid)
      const saved = sessionStorage.getItem(keyFor(patientId)) || ''
      setBranchId(valid.some(b => String(b.id) === saved) ? saved : '')
      if (saved && !valid.some(b => String(b.id) === saved)) sessionStorage.removeItem(keyFor(patientId))
    } catch (e) { setError(e.message || 'Unable to load clinic branches.'); setBranchId('') }
    finally { setLoading(false) }
  }, [patientId])
  useEffect(() => { void refreshBranches() }, [refreshBranches])
  const selectBranch = useCallback((value) => {
    const selected = String(value || '')
    if (selected && !branches.some(b => String(b.id) === selected)) return false
    setBranchId(selected)
    if (selected) sessionStorage.setItem(keyFor(patientId), selected)
    else sessionStorage.removeItem(keyFor(patientId))
    return true
  }, [branches, patientId])
  const clearBranch = useCallback(() => selectBranch(''), [selectBranch])
  const selectedBranch = useMemo(() => branches.find(b => String(b.id) === branchId) || null, [branches, branchId])
  return <PatientBranchContext.Provider value={{ branches, branchId, selectedBranch, selectBranch, clearBranch, loading, error, refreshBranches }}>{children}</PatientBranchContext.Provider>
}
export const usePatientBranch = () => {
  const value = useContext(PatientBranchContext)
  if (!value) throw new Error('Patient branch selection must be inside PatientBranchProvider.')
  return value
}
