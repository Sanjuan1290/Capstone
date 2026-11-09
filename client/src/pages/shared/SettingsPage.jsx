import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdBusiness, MdCloudUpload, MdDeleteOutline, MdEdit, MdPhoneAndroid, MdSave, MdVerifiedUser, MdWarningAmber } from 'react-icons/md'
import PhilippinePhoneInput, { formatPhilippinePhone } from '../../components/ui/PhilippinePhoneInput'
import Modal from '../../components/ui/Modal'
import {
  confirmPatientPhoneChange,
  confirmPatientEmailVerification,
  getSettings,
  requestPatientEmailVerificationCode,
  requestPatientPhoneChangeCode,
  updateSettings,
  uploadToCloudinary,
  saveProfilePhoto,
  removeProfilePhoto,
} from '../../services/portal.service'
import { doctorClinicLabel } from '../../utils/doctor'
import { getClinicSettings, updateClinicSettings } from '../../services/admin.service'
import { useAuth } from '../../context/AuthContext'
import ProfileAvatar from '../../components/ProfileAvatar'
import RecoveryPhoneCard from '../../components/RecoveryPhoneCard'
import { patientEmailIsVerified, isSamePatientAccount, isEditingDifferentEmail } from '../../utils/patientEmailVerification.mjs'

const GENDER_OPTIONS = ['Male', 'Female', 'Other']
const CLINIC_EMPTY = { clinic_name: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC', address: '', phone: '', email: '', report_footer: '', receipt_footer: '' }
const today = () => new Date().toISOString().slice(0, 10)
const minBirthdate = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 100); return d.toISOString().slice(0, 10) }

const SettingsPage = () => {
  const navigate = useNavigate()
  const { role: accountRole, setUser } = useAuth()
  // Keep 'superadmin' distinct: the portal service sends X-Admin-Portal only for it,
  // and the server selects the Super Admin session cookie from that header.
  const role = accountRole
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingPhoto,setPendingPhoto] = useState(null)
  const [removePhotoOpen,setRemovePhotoOpen] = useState(false)
  const [photoMessage,setPhotoMessage] = useState('')
  const [error, setError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [phoneModalOpen, setPhoneModalOpen] = useState(false)
  const [phoneStep, setPhoneStep] = useState('number')
  const [newPhone, setNewPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneMessage, setPhoneMessage] = useState('')
  const [clinic, setClinic] = useState(CLINIC_EMPTY)
  const [clinicOriginal, setClinicOriginal] = useState(CLINIC_EMPTY)
  const [clinicEditing, setClinicEditing] = useState(false)
  const [clinicSaving, setClinicSaving] = useState(false)
  const [adminVerifyOpen, setAdminVerifyOpen] = useState(false)
  const [adminVerifyStage, setAdminVerifyStage] = useState('current_email')
  const [adminVerifyCode, setAdminVerifyCode] = useState('')
  const [adminPendingProfile, setAdminPendingProfile] = useState(null)
  const [adminVerifyMessage, setAdminVerifyMessage] = useState('')
  const [emailVerifyOpen, setEmailVerifyOpen] = useState(false)
  const [emailVerifyCode, setEmailVerifyCode] = useState('')
  const [emailVerifyBusy, setEmailVerifyBusy] = useState(false)
  const [emailVerifyMessage, setEmailVerifyMessage] = useState('')
  const [emailVerifyFeedback, setEmailVerifyFeedback] = useState('')

  const loadSettings = async () => {
    if (!role) return
    setError('')
    try {
      const data = await getSettings(role)
      setForm(data); setOriginal(data); setEditing(false)
      if (role === 'patient') {
        setUser((current) => isSamePatientAccount(data, current?.id) ? { ...current, ...data, role: 'patient' } : current)
      }
      if (role === 'superadmin') {
        const clinicData = { ...CLINIC_EMPTY, ...(await getClinicSettings()) }
        setClinic(clinicData); setClinicOriginal(clinicData); setClinicEditing(false)
      }
    } catch (err) { setError(err.message || 'Failed to load settings.'); setForm(null) }
  }

  useEffect(() => { loadSettings() }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayRows = useMemo(() => {
    if (!form) return []
    const rows = [
      ['Full Name', form.full_name || '—'],
      ['Email', form.email || '—'],
    ]
    if ('phone' in form) rows.push(['Mobile Number', formatPhilippinePhone(form.phone)])
    if (role === 'doctor') rows.push(['Clinic Assignment', doctorClinicLabel(form)])
    if (role === 'patient') rows.push(['Birthdate', form.birthdate || '—'], ['Gender', form.gender || '—'], ['Address', form.address || '—'])
    return rows
  }, [form, role])

  useEffect(()=>()=>{if(pendingPhoto?.preview)URL.revokeObjectURL(pendingPhoto.preview)},[pendingPhoto])

  if (!form) return <div className="p-10"><div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{error || 'Loading settings...'}</div></div>

  const onChange = (key) => (e) => {
    const value = e.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'email') setEmailVerifyFeedback('')
    if (key === 'birthdate') {
      if (!value) setBirthdateError('Birthdate is required.')
      else if (value > today()) setBirthdateError('Birthdate cannot be in the future.')
      else if (value < minBirthdate()) setBirthdateError('Patient age cannot exceed 100 years.')
      else setBirthdateError('')
    }
  }

  const handleUpload = (e) => {
    const file=e.target.files?.[0];e.target.value=''
    if(!file)return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size===0 || file.size>5*1024*1024) {
      setError('Choose a JPG, PNG or WebP photo smaller than 5 MB.');return
    }
    setError('');setPhotoMessage('');setPendingPhoto({file,preview:URL.createObjectURL(file)})
  }
  const savePendingPhoto = async () => {
    if(!pendingPhoto || uploading)return
    setUploading(true);setError('');setPhotoMessage('')
    try {
      const url=await uploadToCloudinary(pendingPhoto.file)
      const saved=await saveProfilePhoto(role,url)
      setForm(prev=>({...prev,profile_image_url:saved.profile_image_url}))
      setOriginal(prev=>({...prev,profile_image_url:saved.profile_image_url}))
      setUser(prev=>prev?{...prev,profile_image_url:saved.profile_image_url}:prev)
      setPendingPhoto(null);setPhotoMessage('Profile photo updated.')
    }catch(err){setError(err.message||'Profile photo could not be saved.')}finally{setUploading(false)}
  }
  const confirmRemovePhoto = async () => {
    setUploading(true);setError('');setPhotoMessage('')
    try {
      const saved=await removeProfilePhoto(role)
      setForm(prev=>({...prev,profile_image_url:saved.profile_image_url||null}))
      setOriginal(prev=>({...prev,profile_image_url:saved.profile_image_url||null}))
      setUser(prev=>prev?{...prev,profile_image_url:null}:prev)
      setPendingPhoto(null);setRemovePhotoOpen(false);setPhotoMessage('Profile photo removed.')
    }catch(err){setError(err.message||'Could not remove profile photo.')}finally{setUploading(false)}
  }

  const handleSave = async () => {
    if (role === 'patient') {
      if (!String(form.email || '').trim()) return setError('Email address is required.')
      if (!form.birthdate || birthdateError) return setError(birthdateError || 'Birthdate is required.')
      if (!form.gender) return setError('Gender is required.')
      if (!String(form.address || '').trim()) return setError('Address is required.')
    }
    if (role === 'admin' || role === 'superadmin') {
      setSaving(true); setError('')
      const payload = { full_name: form.full_name, email: form.email, profile_image_url: form.profile_image_url }
      try {
        const response = await fetch('/api/admin/settings/verification/request', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(role === 'superadmin' ? {'X-Admin-Portal':'superadmin'} : {}) }, body: JSON.stringify(payload) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || 'Could not send verification code.')
        setAdminPendingProfile(payload); setAdminVerifyStage('current_email'); setAdminVerifyCode(''); setAdminVerifyMessage(data.message || 'Verification code sent.'); setAdminVerifyOpen(true)
      } catch (err) { setError(err.message) }
      finally { setSaving(false) }
      return
    }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (role === 'patient') { delete payload.phone; delete payload.civil_status; delete payload.theme_preference }
      const saved = await updateSettings(role, payload)
      setForm(saved); setOriginal(saved); setEditing(false)
      setUser((prev) => prev ? { ...prev, ...saved, role } : prev)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const confirmAdminProfile = async () => {
    if (adminVerifyCode.length !== 6) return setAdminVerifyMessage('Enter the 6-digit verification code.')
    setSaving(true); setAdminVerifyMessage('')
    try {
      const response = await fetch('/api/admin/settings/verification/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(role === 'superadmin' ? {'X-Admin-Portal':'superadmin'} : {}) }, body: JSON.stringify({ stage: adminVerifyStage, code: adminVerifyCode }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Verification failed.')
      if (data.requires_new_email) {
        setAdminVerifyStage('new_email'); setAdminVerifyCode(''); setAdminVerifyMessage(data.message)
        return
      }
      const saved = data.settings || adminPendingProfile
      setForm((prev) => ({ ...prev, ...saved })); setOriginal((prev) => ({ ...prev, ...saved })); setEditing(false)
      setUser((prev) => prev ? { ...prev, ...saved, role } : prev)
      setAdminVerifyOpen(false); setAdminPendingProfile(null); setAdminVerifyCode(''); setAdminVerifyMessage('')
    } catch (err) { setAdminVerifyMessage(err.message || 'Verification failed.') }
    finally { setSaving(false) }
  }

  const saveClinic = async () => {
    if (!clinic.clinic_name.trim()) return setError('Clinic name is required.')
    setClinicSaving(true); setError('')
    try { const saved = { ...CLINIC_EMPTY, ...(await updateClinicSettings(clinic)) }; setClinic(saved); setClinicOriginal(saved); setClinicEditing(false) }
    catch (err) { setError(err.message || 'Could not save clinic settings.') }
    finally { setClinicSaving(false) }
  }

  const openPhoneChange = () => { setNewPhone(''); setPhoneCode(''); setPhoneMessage(''); setPhoneStep('number'); setPhoneModalOpen(true) }
  const sendPhoneCode = async () => {
    if (!newPhone) return setPhoneMessage('Enter the new mobile number.')
    setPhoneBusy(true); setPhoneMessage('')
    try { const result = await requestPatientPhoneChangeCode(newPhone); setPhoneMessage(result.message || 'Verification code sent.'); setPhoneStep('verify') }
    catch (err) { setPhoneMessage(err.message || 'Could not send the verification code.') }
    finally { setPhoneBusy(false) }
  }
  const confirmPhoneCode = async () => {
    if (String(phoneCode).trim().length !== 6) return setPhoneMessage('Enter the 6-digit verification code.')
    setPhoneBusy(true); setPhoneMessage('')
    try { const result = await confirmPatientPhoneChange(String(phoneCode).trim()); setPhoneModalOpen(false); await loadSettings(); setUser((prev) => prev ? { ...prev, phone: result.phone } : prev) }
    catch (err) { setPhoneMessage(err.message || 'The verification code could not be confirmed.') }
    finally { setPhoneBusy(false) }
  }

  // Always re-read the verified timestamp from the account settings endpoint.
  // The OTP endpoint confirms verification; it does not replace the database read.
  const refreshPatientEmailStatus = async () => {
    const saved = await getSettings('patient')
    if (!isSamePatientAccount(saved, form?.id)) throw new Error('Could not refresh email verification. Please sign in again.')
    setForm(saved)
    setOriginal(saved)
    setUser((current) => isSamePatientAccount(saved, current?.id) ? { ...current, ...saved, role: 'patient' } : current)
    return saved
  }

  const sendEmailVerificationCode = async () => {
    if (role !== 'patient' || !form?.email) return
    if (editing && isEditingDifferentEmail(form.email, original?.email)) {
      setEmailVerifyFeedback('Save the new email address before requesting a verification code.')
      return
    }
    setEmailVerifyBusy(true); setEmailVerifyMessage(''); setEmailVerifyFeedback('')
    try {
      const result = await requestPatientEmailVerificationCode()
      if (result?.already_verified) {
        const saved = await refreshPatientEmailStatus()
        if (!patientEmailIsVerified(saved)) throw new Error('Your verification status could not be confirmed. Please try again.')
        setEmailVerifyFeedback('Your email is verified. You can book an appointment.')
        setEmailVerifyOpen(false)
        return
      }
      setEmailVerifyCode('')
      setEmailVerifyMessage(result?.message || 'Verification code sent to your email.')
      setEmailVerifyOpen(true)
    } catch (err) {
      setEmailVerifyMessage(err.message || 'Could not send the verification code.')
      setEmailVerifyOpen(true)
    } finally {
      setEmailVerifyBusy(false)
    }
  }

  const confirmEmailVerification = async () => {
    if (emailVerifyCode.length !== 6) return setEmailVerifyMessage('Enter the 6-digit verification code.')
    setEmailVerifyBusy(true); setEmailVerifyMessage('')
    try {
      await confirmPatientEmailVerification(emailVerifyCode)
      const saved = await refreshPatientEmailStatus()
      if (!patientEmailIsVerified(saved)) throw new Error('The clinic could not confirm your email verification yet. Please try again.')
      setEmailVerifyOpen(false)
      setEmailVerifyCode('')
      setEmailVerifyMessage('')
      setEmailVerifyFeedback('Your email is verified. You can book an appointment.')
    } catch (err) {
      setEmailVerifyMessage(err.message || 'The verification code could not be confirmed.')
    } finally {
      setEmailVerifyBusy(false)
    }
  }

  const emailChangedInEditor = role === 'patient' && editing && isEditingDifferentEmail(form.email, original?.email)
  const emailVerified = role === 'patient' && patientEmailIsVerified(form) && !emailChangedInEditor

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-8">
      <div><h1 className="text-2xl font-bold text-slate-800">Settings</h1><p className="mt-1 text-sm text-slate-500">Manage account information and security. Appearance is controlled from the header.</p></div>
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {emailVerifyFeedback && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{emailVerifyFeedback}</p>}
      {role === 'patient' && form.email && !emailVerified && !emailChangedInEditor && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <MdWarningAmber className="mt-0.5 shrink-0 text-xl text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-bold">Email not verified</p>
              <p className="mt-1 text-sm text-amber-800">Your email address <strong>{form.email}</strong> has not been verified yet. You can still sign in normally, but please verify your email to help keep your account secure.</p>
            </div>
          </div>
          <button type="button" onClick={sendEmailVerificationCode} disabled={emailVerifyBusy} className="button-primary shrink-0 justify-center">
            <MdVerifiedUser /> {emailVerifyBusy ? 'Sending...' : 'Verify Email'}
          </button>
        </div>
      )}

      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">Profile Picture</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {pendingPhoto?.preview ? <img src={pendingPhoto.preview} alt="New profile picture preview" className="h-24 w-24 shrink-0 rounded-full border border-slate-200 object-cover"/> : <ProfileAvatar user={form} size="lg"/>}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate text-base font-bold text-slate-900">{form.full_name}</p>
              <p className="truncate text-xs text-slate-500">{form.email || formatPhilippinePhone(form.phone)}</p>
              <p className="text-xs text-slate-500">JPG, PNG or WebP · up to 5 MB. Preview before saving.</p>
              <div className="flex flex-wrap gap-2">
                <label className="button-secondary cursor-pointer"><MdCloudUpload/> {form.profile_image_url?'Change Photo':'Upload Photo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleUpload} disabled={uploading}/></label>
                {pendingPhoto && <><button type="button" className="button-primary" disabled={uploading} onClick={savePendingPhoto}>{uploading?'Saving…':'Save Photo'}</button><button type="button" className="button-secondary" disabled={uploading} onClick={()=>setPendingPhoto(null)}>Cancel</button></>}
                {form.profile_image_url && !pendingPhoto && <button type="button" className="button-secondary text-rose-700" onClick={()=>setRemovePhotoOpen(true)} disabled={uploading}><MdDeleteOutline/> Remove Photo</button>}
              </div>
              {photoMessage&&<p role="status" className="text-xs font-medium text-emerald-700">{photoMessage}</p>}
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Personal Information</h2><p className="mt-1 text-xs text-slate-500">Review your information. Click Edit before making changes.</p></div>{!editing && <button className="button-secondary" onClick={() => setEditing(true)}><MdEdit/> Edit</button>}</div>
          {!editing ? (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">{displayRows.map(([label, value]) => <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span><span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">{value}{role === 'patient' && label === 'Email' && form.email && <span aria-label={emailVerified ? 'Email verified' : 'Email not verified'} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}><MdVerifiedUser aria-hidden="true" />{emailVerified ? 'Verified' : 'Not Verified'}</span>}</span></div>)}</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5"><span className="form-label">Full Name *</span><input value={form.full_name || ''} onChange={onChange('full_name')} className="form-control"/></label>
              {'email' in form && <label className="space-y-1.5"><span className="form-label">Email {['patient','admin','superadmin'].includes(role) ? '*' : ''}</span><input type="email" required={['patient','admin','superadmin'].includes(role)} value={form.email || ''} onChange={onChange('email')} className="form-control"/>{role === 'patient' && <span className={`inline-flex items-center gap-1 text-xs font-semibold ${emailVerified ? 'text-emerald-700' : 'text-amber-700'}`}><MdVerifiedUser aria-hidden="true" /> {emailVerified ? 'Verified' : 'Not Verified'}{emailChangedInEditor ? ' — save the new address, then verify it' : ''}</span>}{['admin','superadmin'].includes(role) && <span className="form-helper">Saving personal information requires verification. Email changes are verified at both your current and new email addresses.</span>}</label>}
              {'phone' in form && role !== 'patient' && <label className="space-y-1.5"><span className="form-label">Phone</span><PhilippinePhoneInput value={form.phone || ''} onChange={onChange('phone')}/></label>}
              {role === 'patient' && <div className="space-y-1.5"><span className="form-label">Mobile Number *</span><PhilippinePhoneInput value={form.phone || ''} disabled/><button type="button" onClick={openPhoneChange} className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700"><MdPhoneAndroid/> Change mobile number securely</button></div>}
              {role === 'doctor' && <div className="space-y-1.5 md:col-span-2"><span className="form-label">Clinic Assignment</span><div className="form-control bg-slate-100 text-slate-600">{doctorClinicLabel(form)}</div><span className="form-helper">Clinic Assignment is managed by an Administrator.</span></div>}
              {role === 'patient' && <>
                <label className="space-y-1.5"><span className="form-label">Birthdate *</span><input type="date" min={minBirthdate()} max={today()} value={form.birthdate || ''} onChange={onChange('birthdate')} className="form-control"/>{birthdateError && <span className="form-error">{birthdateError}</span>}</label>
                <label className="space-y-1.5"><span className="form-label">Gender *</span><select value={form.gender || ''} onChange={onChange('gender')} className="form-control"><option value="">Select gender</option>{GENDER_OPTIONS.map((x)=><option key={x}>{x}</option>)}</select></label>
                <label className="space-y-1.5 md:col-span-2"><span className="form-label">Address *</span><textarea rows={2} value={form.address || ''} onChange={onChange('address')} className="form-control"/></label>
              </>}
              <div className="md:col-span-2 flex justify-end gap-2"><button className="button-secondary" onClick={() => { setForm(original); setEditing(false); setBirthdateError('') }}>Cancel</button><button className="button-primary" disabled={saving || Boolean(birthdateError)} onClick={handleSave}><MdSave/> {saving ? 'Saving...' : 'Save Changes'}</button></div>
            </div>
          )}
        </section>
      </div>

      {role === 'superadmin' && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><MdBusiness/> Clinic Information</h2><p className="mt-1 text-xs text-slate-500">Clinic branding used on reports, receipts, prescriptions, and public information.</p></div>{!clinicEditing && <button className="button-secondary" onClick={() => setClinicEditing(true)}><MdEdit/> Edit</button>}</div>
        {!clinicEditing ? <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200">{[['Clinic Name',clinic.clinic_name],['Address',clinic.address],['Phone',clinic.phone],['Email',clinic.email],['Report Footer',clinic.report_footer],['Receipt Footer',clinic.receipt_footer]].map(([k,v])=><div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">{k}</span><span className="text-sm text-slate-700">{v || '—'}</span></div>)}</div> : <div className="mt-5 grid gap-4 md:grid-cols-2">{['clinic_name','address','phone','email'].map((key)=><label key={key} className={key==='clinic_name'||key==='address'?'md:col-span-2':''}><span className="form-label">{key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}{key==='clinic_name'?' *':''}</span><input type={key==='email'?'email':'text'} className="form-control mt-1.5" value={clinic[key]||''} onChange={(e)=>setClinic(p=>({...p,[key]:e.target.value}))}/></label>)}<label className="md:col-span-2"><span className="form-label">Report Footer</span><textarea rows={2} className="form-control mt-1.5" value={clinic.report_footer||''} onChange={(e)=>setClinic(p=>({...p,report_footer:e.target.value}))}/></label><label className="md:col-span-2"><span className="form-label">Receipt Footer</span><textarea rows={2} className="form-control mt-1.5" value={clinic.receipt_footer||''} onChange={(e)=>setClinic(p=>({...p,receipt_footer:e.target.value}))}/></label><div className="md:col-span-2 flex justify-end gap-2"><button className="button-secondary" onClick={()=>{setClinic(clinicOriginal);setClinicEditing(false)}}>Cancel</button><button className="button-primary" disabled={clinicSaving} onClick={saveClinic}><MdSave/> {clinicSaving?'Saving...':'Save Changes'}</button></div></div>}
      </section>}

      <RecoveryPhoneCard role={role} phone={form?.phone} verified={Boolean(form?.phone_verified_at)} onVerified={loadSettings} />
      <section className="rounded-3xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold text-slate-900">Account Security</h2><p className="mt-1 text-sm text-slate-500">Change your password using current-password verification followed by an email code.</p></div><button type="button" className="button-secondary" onClick={() => navigate(`/${accountRole}/change-password`)}>Change Password</button></div></section>

      <Modal open={removePhotoOpen} onClose={()=>!uploading&&setRemovePhotoOpen(false)} title="Remove Profile Picture" description="Your default avatar will be shown instead. This does not change your personal information." size="sm">
        <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={uploading} onClick={()=>setRemovePhotoOpen(false)}>Cancel</button><button type="button" className="button-primary" disabled={uploading} onClick={confirmRemovePhoto}>{uploading?'Removing…':'Remove Photo'}</button></div>
      </Modal>
      <Modal open={adminVerifyOpen} onClose={() => !saving && setAdminVerifyOpen(false)} title="Verify Personal Information" description={adminVerifyStage === 'current_email' ? 'Enter the code sent to your current administrator email.' : 'Enter the second code sent to your new email address.'} size="md">
        <div className="space-y-4">
          <label className="block"><span className="form-label">6-Digit Verification Code</span><input value={adminVerifyCode} onChange={(e)=>setAdminVerifyCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} className="form-control mt-1.5 text-center text-xl font-black tracking-[.35em]" /></label>
          {adminVerifyMessage && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{adminVerifyMessage}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={saving} onClick={()=>setAdminVerifyOpen(false)}>Cancel</button><button type="button" className="button-primary" disabled={saving || adminVerifyCode.length !== 6} onClick={confirmAdminProfile}>{saving ? 'Verifying...' : adminVerifyStage === 'current_email' ? 'Verify Current Email' : 'Verify New Email & Save'}</button></div>
        </div>
      </Modal>

      <Modal open={emailVerifyOpen} onClose={() => !emailVerifyBusy && setEmailVerifyOpen(false)} title="Verify Email Address" description={`Enter the 6-digit verification code sent to ${form.email}.`} size="md">
        <div className="space-y-4">
          <label className="block">
            <span className="form-label">6-Digit Verification Code</span>
            <input value={emailVerifyCode} onChange={(e)=>setEmailVerifyCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="form-control mt-1.5 text-center text-xl font-black tracking-[.35em]" placeholder="000000" />
          </label>
          {emailVerifyMessage && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{emailVerifyMessage}</p>}
          <button type="button" onClick={sendEmailVerificationCode} disabled={emailVerifyBusy} className="text-xs font-bold text-sky-700 hover:underline">{emailVerifyBusy ? 'Sending...' : 'Resend verification code'}</button>
          <div className="flex justify-end gap-2">
            <button type="button" className="button-secondary" disabled={emailVerifyBusy} onClick={()=>setEmailVerifyOpen(false)}>Cancel</button>
            <button type="button" className="button-primary" disabled={emailVerifyBusy || emailVerifyCode.length !== 6} onClick={confirmEmailVerification}>{emailVerifyBusy ? 'Verifying...' : 'Verify Email'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={phoneModalOpen} onClose={() => !phoneBusy && setPhoneModalOpen(false)} title="Change Mobile Number" description="The new mobile number must be verified before it replaces your current number." size="md">
        <div className="space-y-4">{phoneStep === 'number' ? <><div><label className="form-label">New Mobile Number</label><PhilippinePhoneInput value={newPhone} onChange={(e)=>setNewPhone(e.target.value)}/><p className="mt-2 text-xs text-slate-500">We will send a 6-digit verification code to this number.</p></div><button type="button" onClick={sendPhoneCode} disabled={phoneBusy} className="button-primary w-full justify-center"><MdVerifiedUser/> {phoneBusy?'Sending...':'Send Verification Code'}</button></> : <><div><label className="form-label">Verification Code</label><input value={phoneCode} onChange={(e)=>setPhoneCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} className="form-control text-center text-lg font-black tracking-[.35em]"/></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setPhoneStep('number')} className="button-secondary justify-center">Back</button><button type="button" onClick={confirmPhoneCode} disabled={phoneBusy} className="button-primary justify-center">{phoneBusy?'Verifying...':'Verify & Change'}</button></div></>}{phoneMessage && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{phoneMessage}</p>}</div>
      </Modal>
    </div>
  )
}

export default SettingsPage


