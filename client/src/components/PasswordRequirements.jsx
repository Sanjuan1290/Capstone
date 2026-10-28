import { MdCheckCircle } from 'react-icons/md'
import { getPasswordChecks } from '../utils/passwordPolicy'

const Requirement = ({ met, children }) => (
  <p className="flex items-center gap-2">
    <MdCheckCircle className={met ? 'text-emerald-500' : 'text-slate-300'} />
    <span className={met ? 'text-slate-700' : 'text-slate-500'}>{children}</span>
  </p>
)

const PasswordRequirements = ({ password = '', className = '' }) => {
  const checks = getPasswordChecks(password)

  return (
    <div className={`rounded-2xl bg-slate-50 p-4 text-xs ${className}`.trim()}>
      <p className="font-bold text-slate-700">Password requirements</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <Requirement met={checks.minLength}>At least 8 characters</Requirement>
        <Requirement met={checks.uppercase}>At least 1 uppercase letter</Requirement>
        <Requirement met={checks.lowercase}>At least 1 lowercase letter</Requirement>
        <Requirement met={checks.number}>At least 1 number</Requirement>
      </div>
    </div>
  )
}

export default PasswordRequirements
