import { MdArrowBack } from 'react-icons/md'
import { useNavigate } from 'react-router-dom'
import PasswordSecurityCard from '../../components/PasswordSecurityCard'

const ChangePassword = () => {
  const navigate = useNavigate()
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
        <MdArrowBack /> Back to Settings
      </button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Change Password</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your current password and create the new password first. We will send the email verification code only after those details are validated.</p>
      </div>
      <PasswordSecurityCard initialOpen />
    </div>
  )
}

export default ChangePassword
