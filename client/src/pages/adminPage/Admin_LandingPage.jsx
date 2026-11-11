import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import {
  MdAccessTime,
  MdAdd,
  MdCalendarMonth,
  MdCheck,
  MdCloudUpload,
  MdContactPhone,
  MdDelete,
  MdDragIndicator,
  MdError,
  MdExpandLess,
  MdExpandMore,
  MdGavel,
  MdHomeFilled,
  MdInfoOutline,
  MdLanguage,
  MdLink,
  MdLocationOn,
  MdMap,
  MdMedicalServices,
  MdNotes,
  MdOpenInNew,
  MdOutlineWebAsset,
  MdPeople,
  MdPhone,
  MdPrivacyTip,
  MdSave,
  MdVisibility,
  MdUndo,
  MdPublish,
  MdSmartphone,
  MdDesktopWindows,
  MdClose,
  MdArrowUpward,
  MdArrowDownward,
  MdTitle,
} from 'react-icons/md'
import { getAdminLandingPage, getPublicLandingDirectory, saveLandingDraft, publishLandingDraft, restoreLandingVersion } from '../../services/landing.service'
import LandingDraftPreview from '../../components/system/LandingDraftPreview'
import { uploadToCloudinary } from '../../services/portal.service'

const Toast = ({ toasts }) => (
  <div className="fixed bottom-20 right-4 z-[100] space-y-2 pointer-events-none">
    {toasts.map(t => (
      <div key={t.id}
        className={`px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white
          flex items-center gap-2 pointer-events-auto transition-all
          ${t.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
        {t.type === 'success' ? <MdCheck /> : <MdError />}
        {t.message}
      </div>
    ))}
  </div>
)

const cardClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-5 md:p-6'
const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100'
const textareaClass = `${inputClass} min-h-[120px] resize-y`

const clone = (value) => JSON.parse(JSON.stringify(value))

const normalizeContent = (content = {}) => ({
  ...clone(content),
  header: {
    ...(content.header || {}),
    nav_links: Array.isArray(content.header?.nav_links) ? content.header.nav_links : [],
  },
  hero: { ...(content.hero || {}) },
  about: { ...(content.about || {}) },
  testimonial: { ...(content.testimonial || {}) },
  services: {
    ...(content.services || {}),
    items: Array.isArray(content.services?.items) ? content.services.items : [],
  },
  doctors: {
    ...(content.doctors || {}),
    items: Array.isArray(content.doctors?.items) ? content.doctors.items : [],
  },
  contact: {
    ...(content.contact || {}),
    address_lines: Array.isArray(content.contact?.address_lines) ? content.contact.address_lines : ['', ''],
  },
  section_order: Array.isArray(content.section_order) ? content.section_order : ['hero','services','doctors','about','testimonial','contact'],
  footer: {
    ...(content.footer || {}),
    terms_url: content.footer?.terms_url || '',
    privacy_url: content.footer?.privacy_url || '',
  },
})

const tabs = [
  { id: 'header', label: 'Header', icon: MdOutlineWebAsset },
  { id: 'hero', label: 'Hero', icon: MdHomeFilled },
  { id: 'about', label: 'About', icon: MdInfoOutline },
  { id: 'services', label: 'Services', icon: MdMedicalServices },
  { id: 'doctors', label: 'Doctors', icon: MdPeople },
  { id: 'contact', label: 'Contact', icon: MdContactPhone },
  { id: 'footer', label: 'Footer', icon: MdLink },
]

const Admin_LandingPage = () => {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadingPath, setUploadingPath] = useState('')
  const [activeTab, setActiveTab] = useState('header')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [toasts, setToasts] = useState([])
  const [flashPath, setFlashPath] = useState('')
  const [expandedServices, setExpandedServices] = useState({})
  const [expandedDoctors, setExpandedDoctors] = useState({})
  const [revision, setRevision] = useState(0)
  const [hasDraft, setHasDraft] = useState(false)
  const [versions, setVersions] = useState([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [directory, setDirectory] = useState({ services: [], doctors: [] })
  const [previewDevice, setPreviewDevice] = useState('mobile')
  const [previewFull, setPreviewFull] = useState(false)
  const mutationInFlight=useRef(false)
  useEffect(()=>{
    if(!previewFull)return undefined
    const previous=document.activeElement,overflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    const close=event=>{if(event.key==='Escape')setPreviewFull(false)}
    document.addEventListener('keydown',close)
    document.querySelector('[aria-label="Close preview"]')?.focus()
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',close);previous?.focus?.()}
  },[previewFull])

  const showToast = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  const loadEditor = () => {
    setLoading(true)
    setLoadError('')
    getAdminLandingPage()
      .then(data => {
        setForm(normalizeContent(data?.content))
        setRevision(Number(data?.revision || 0))
        setHasDraft(Boolean(data?.has_draft))
        setVersions(Array.isArray(data?.history) ? data.history : [])
        setIsDirty(false)
      })
      .catch(err => setLoadError(err.message || 'Failed to load landing page editor.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadEditor()
    getPublicLandingDirectory().then(data => setDirectory({services: data?.services || [], doctors: data?.doctors || []})).catch(()=>{})
  }, [])

  const setValue = (section, key, value) => {
    setForm(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }))
    setIsDirty(true)
  }

  const setArrayItem = (section, key, index, field, value) => {
    setForm(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: prev[section][key].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
      },
    }))
    setIsDirty(true)
  }

  const addArrayItem = (section, key, item) => {
    setForm(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: [...(prev[section][key] || []), item],
      },
    }))
    setIsDirty(true)
  }

  const removeArrayItem = (section, key, index) => {
    setForm(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: prev[section][key].filter((_, itemIndex) => itemIndex !== index),
      },
    }))
    setIsDirty(true)
  }

  const uploadImage = async (section, key, file, index = null) => {
    if (!file) return
    const path = index === null ? `${section}.${key}` : `${section}.${key}.${index}`
    setUploadingPath(path)
    try {
      const url = await uploadToCloudinary(file)
      if (index === null) {
        setValue(section, key, url)
      } else {
        setArrayItem(section, key, index, 'image', url)
      }
      setFlashPath(path)
      setTimeout(() => setFlashPath(current => (current === path ? '' : current)), 1200)
      showToast('Image uploaded successfully.')
    } catch (err) {
      showToast(err.message || 'Image upload failed.', 'error')
    } finally {
      setUploadingPath('')
    }
  }

  const applyServer = (data) => {
    setForm(normalizeContent(data?.content))
    setRevision(Number(data?.revision || 0))
    setHasDraft(Boolean(data?.has_draft))
    setVersions(Array.isArray(data?.history) ? data.history : [])
    setIsDirty(false)
  }
  const handleSave = async () => {
    if(mutationInFlight.current)return
    mutationInFlight.current=true
    setSaving(true)
    try {
      const saved = await saveLandingDraft(form, revision)
      applyServer(saved)
      showToast('Draft saved. The public website has not changed.')
    } catch (err) { showToast(err.message || 'Could not save your draft.', 'error') }
    finally { mutationInFlight.current=false;setSaving(false) }
  }
  const handlePublish = async () => {
    if(mutationInFlight.current)return
    if (!window.confirm('Publish these changes to the public CARAIT Clinic website?')) return
    mutationInFlight.current=true
    setSaving(true)
    try {
      const published = await publishLandingDraft(form, revision)
      applyServer(published)
      showToast('Changes are now published on the website.')
    } catch (err) { showToast(err.message || 'Could not publish changes.', 'error') }
    finally { mutationInFlight.current=false;setSaving(false) }
  }
  const handleRestore = async () => {
    if(mutationInFlight.current)return
    if (!selectedVersion || !window.confirm('Restore this older version as a draft? The public website will stay the same until you publish.')) return
    mutationInFlight.current=true
    setSaving(true)
    try {
      const restored = await restoreLandingVersion(selectedVersion, revision)
      applyServer(restored)
      setSelectedVersion('')
      showToast('Previous version loaded as a draft. Review it before publishing.')
    } catch (err) { showToast(err.message || 'Could not restore this version.', 'error') }
    finally { mutationInFlight.current=false;setSaving(false) }
  }

  const toggleService = (index) => {
    setExpandedServices(prev => ({ ...prev, [index]: !prev[index] }))
  }

  const toggleDoctor = (index) => {
    setExpandedDoctors(prev => ({ ...prev, [index]: !prev[index] }))
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
        <p className="text-sm font-medium text-slate-500">Loading editor...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700">
          <p className="text-sm font-semibold">{loadError}</p>
        </div>
        <button
          onClick={loadEditor}
          className="min-h-[44px] rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!form) return null

  const previewSite = () => window.open('/', '_blank', 'noopener,noreferrer')
  const toggleVisibility = (section) => setValue(section, 'visible', form[section]?.visible === false)
  const moveSection = (id, direction) => {
    const entries = form.section_order || ['hero','services','doctors','about','testimonial','contact']
    const index = entries.indexOf(id), target = index + direction
    if (index < 0 || target < 0 || target >= entries.length) return
    const next = [...entries]
    ;[next[index],next[target]] = [next[target],next[index]]
    setForm(current => ({...current,section_order:next}))
    setIsDirty(true)
  }

  return (
    <div className="w-full min-w-0 max-w-[1600px] pb-6">
      <Toast toasts={toasts} />

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
        <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
              <MdLanguage className="text-sm" />
              Website Editor
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Landing Page Editor</h1>
            <p className="mt-2 text-sm text-slate-500">
              Edit one section at a time. Changes appear in the live draft preview immediately. Use Save Draft to keep your work private, or Publish Changes to update the public website.
            </p>
          </div>

          <button
            onClick={previewSite}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <MdOpenInNew className="text-[18px]" />
            Open Published Website
          </button>
        </div>

        <button type="button" onClick={()=>setPreviewFull(true)} className="button-secondary xl:hidden"><MdVisibility/> Preview Website</button>
        <nav aria-label="Website sections" className="min-w-0">
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-200">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ${
                    isActive
                      ? 'border-sky-600 text-sky-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Icon className="text-[18px]" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </nav>

        {activeTab === 'header' && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Homepage Section Order</h2>
          <p className="mt-1 text-sm text-slate-600">Move a section up or down. The live preview will follow the new order.</p>
          <div className="mt-4 grid gap-2">{(form.section_order || []).map((id,index,list) => <div key={id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><span className="text-sm font-semibold capitalize text-slate-800">{id==='hero'?'Home Banner':id==='testimonial'?'Patient Feedback':id}</span><div className="flex gap-1"><button type="button" disabled={index===0} aria-label={`Move ${id} up`} onClick={()=>moveSection(id,-1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-slate-700 disabled:opacity-30"><MdArrowUpward/></button><button type="button" disabled={index===list.length-1} aria-label={`Move ${id} down`} onClick={()=>moveSection(id,1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-slate-700 disabled:opacity-30"><MdArrowDownward/></button></div></div>)}</div>
        </section>}

        {activeTab === 'header' && (
          <section className={cardClass}>
            <SectionHeader
              icon={MdOutlineWebAsset}
              title="Header"
              description="Edit the top part of the website, including the clinic name, buttons, logo, and menu links."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Clinic Name">
                <input value={form.header.clinic_name || ''} onChange={e => setValue('header', 'clinic_name', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Login Button Text">
                <input value={form.header.login_label || ''} onChange={e => setValue('header', 'login_label', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Login Button Link">
                <input value={form.header.login_path || ''} onChange={e => setValue('header', 'login_path', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Button Text">
                <input value={form.header.cta_label || ''} onChange={e => setValue('header', 'cta_label', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Button Link">
                <input value={form.header.cta_path || ''} onChange={e => setValue('header', 'cta_path', e.target.value)} className={inputClass} />
              </Field>
            </div>

            <ImageUploadField
              value={form.header.logo_url || ''}
              label={form.header.logo_url ? 'Change Image' : 'Upload Image'}
              busy={uploadingPath === 'header.logo_url'}
              flash={flashPath === 'header.logo_url'}
              onChange={e => uploadImage('header', 'logo_url', e.target.files?.[0])}
            />

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold text-slate-800">Website Menu</p>
                  <p className="mt-1 text-xs text-slate-500">Set the labels and link targets that appear in the top menu.</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {(form.header.nav_links || []).map((link, index) => (
                  <div key={`${link.path}-${index}`} className="group grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[auto_1fr_1fr_auto] md:items-center">
                    <div className="hidden md:flex items-center justify-center text-slate-300">
                      <MdDragIndicator className="text-[20px]" />
                    </div>
                    <Field label="Menu Label">
                      <input
                        value={link.label || ''}
                        onChange={e => setArrayItem('header', 'nav_links', index, 'label', e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Menu Destination">
                      <select className={`${inputClass} mb-2`} aria-label={`Destination for ${link.label || 'menu item'}`} value={['#home','#about','#services','#doctors','#contact','/news'].includes(link.path)?link.path:'custom'} onChange={e => e.target.value !== 'custom' && setArrayItem('header','nav_links',index,'path',e.target.value)}>
                        <option value="custom">Custom link</option><option value="#home">Home</option><option value="#services">Services</option><option value="#doctors">Doctors</option><option value="#about">About</option><option value="#contact">Contact</option><option value="/news">News & Offers</option>
                      </select>
                      <input
                        value={link.path || ''}
                        onChange={e => setArrayItem('header', 'nav_links', index, 'path', e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <button
                      onClick={() => removeArrayItem('header', 'nav_links', index)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-red-200 px-4 py-3 text-red-600 hover:bg-red-50"
                    >
                      <MdDelete className="text-[18px]" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addArrayItem('header', 'nav_links', { label: 'New Link', path: '#section' })}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-dashed border-sky-300 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50"
              >
                <MdAdd className="text-[18px]" />
                Add Menu Link
              </button>
            </div>
          </section>
        )}

        {activeTab === 'hero' && (
          <section className={cardClass}>
            <SectionHeader
              icon={MdHomeFilled}
              title="Hero"
              description="Edit the first section visitors see, including the title, subtitle, buttons, and background image."
            />
            <VisibilitySwitch shown={form.hero.visible !== false} onClick={() => toggleVisibility('hero')} />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title">
                <input value={form.hero.heading || ''} onChange={e => setValue('hero', 'heading', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Highlighted Word in Title">
                <input value={form.hero.heading_highlight || ''} onChange={e => setValue('hero', 'heading_highlight', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Subtitle">
                <input value={form.hero.subheading || ''} onChange={e => setValue('hero', 'subheading', e.target.value)} className={inputClass} />
              </Field>
              <Field label={`Image Brightness / White Overlay: ${Math.round(Number(form.hero.overlay_opacity ?? 0.68) * 100)}%`}>
                <input type="range" min="0" max="1" step="0.05" value={form.hero.overlay_opacity ?? 0.68} onChange={e => setValue('hero','overlay_opacity', Number(e.target.value))} className="mt-3 w-full accent-sky-700" />
                <p className="text-xs text-slate-500">Move right to make text easier to read on a lighter background.</p>
              </Field>
              <Field label="Primary Button Text">
                <input value={form.hero.primary_button_label || ''} onChange={e => setValue('hero', 'primary_button_label', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Primary Button Link">
                <input value={form.hero.primary_button_path || ''} onChange={e => setValue('hero', 'primary_button_path', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Secondary Button Text">
                <input value={form.hero.secondary_button_label || ''} onChange={e => setValue('hero', 'secondary_button_label', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Secondary Button Link">
                <input value={form.hero.secondary_button_path || ''} onChange={e => setValue('hero', 'secondary_button_path', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Main Description" className="md:col-span-2">
                <textarea value={form.hero.description || ''} onChange={e => setValue('hero', 'description', e.target.value)} className={textareaClass} />
              </Field>
            </div>

            <ImageUploadField
              value={form.hero.background_image_url || ''}
              label={form.hero.background_image_url ? 'Change Image' : 'Upload Image'}
              busy={uploadingPath === 'hero.background_image_url'}
              flash={flashPath === 'hero.background_image_url'}
              onChange={e => uploadImage('hero', 'background_image_url', e.target.files?.[0])}
            />
          </section>
        )}

        {activeTab === 'about' && (
          <section className="space-y-6">
            <div className={cardClass}>
              <SectionHeader
                icon={MdInfoOutline}
                title="About"
                description="Edit the clinic story, badge, mission, vision, and supporting image."
              />
              <VisibilitySwitch shown={form.about.visible !== false} onClick={() => toggleVisibility('about')} />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="About Title">
                  <input value={form.about.heading || ''} onChange={e => setValue('about', 'heading', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Experience Badge Number (e.g. 10+)">
                  <input value={form.about.badge_title || ''} onChange={e => setValue('about', 'badge_title', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Experience Badge Label (e.g. Years Experience)">
                  <input value={form.about.badge_text || ''} onChange={e => setValue('about', 'badge_text', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Mission Title">
                  <input value={form.about.mission_title || ''} onChange={e => setValue('about', 'mission_title', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Vision Title">
                  <input value={form.about.vision_title || ''} onChange={e => setValue('about', 'vision_title', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Main Description" className="md:col-span-2">
                  <textarea value={form.about.body_primary || ''} onChange={e => setValue('about', 'body_primary', e.target.value)} className={textareaClass} />
                </Field>
                <Field label="Secondary Description" className="md:col-span-2">
                  <textarea value={form.about.body_secondary || ''} onChange={e => setValue('about', 'body_secondary', e.target.value)} className={textareaClass} />
                </Field>
                <Field label="Mission Description">
                  <textarea value={form.about.mission_body || ''} onChange={e => setValue('about', 'mission_body', e.target.value)} className={textareaClass} />
                </Field>
                <Field label="Vision Description">
                  <textarea value={form.about.vision_body || ''} onChange={e => setValue('about', 'vision_body', e.target.value)} className={textareaClass} />
                </Field>
              </div>

              <ImageUploadField
                value={form.about.image_url || ''}
                label={form.about.image_url ? 'Change Image' : 'Upload Image'}
                busy={uploadingPath === 'about.image_url'}
                flash={flashPath === 'about.image_url'}
                onChange={e => uploadImage('about', 'image_url', e.target.files?.[0])}
              />
            </div>

            <div className={cardClass}>
              <SectionHeader
                icon={MdNotes}
                title="Testimonial"
                description="Update the patient quote and testimonial image shown near the About section."
              />
              <VisibilitySwitch shown={form.testimonial.visible !== false} onClick={() => toggleVisibility('testimonial')} />
              <p className="mb-4 text-xs text-slate-500">Only publish patient feedback with documented consent.</p>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Testimonial Title">
                  <input value={form.testimonial.heading || ''} onChange={e => setValue('testimonial', 'heading', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Testimonial Subtitle">
                  <input value={form.testimonial.subheading || ''} onChange={e => setValue('testimonial', 'subheading', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Main Description" className="md:col-span-2">
                  <textarea value={form.testimonial.quote || ''} onChange={e => setValue('testimonial', 'quote', e.target.value)} className={textareaClass} />
                </Field>
              </div>

              <ImageUploadField
                value={form.testimonial.image_url || ''}
                label={form.testimonial.image_url ? 'Change Image' : 'Upload Image'}
                busy={uploadingPath === 'testimonial.image_url'}
                flash={flashPath === 'testimonial.image_url'}
                onChange={e => uploadImage('testimonial', 'image_url', e.target.files?.[0])}
              />
            </div>
          </section>
        )}

        {activeTab === 'services' && (
          <section className={cardClass}>
            <SectionHeader
              icon={MdMedicalServices}
              title="Services"
              description="Edit the services section title, description, and each service card."
            />
            <VisibilitySwitch shown={form.services.visible !== false} onClick={() => toggleVisibility('services')} />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Section Title">
                <input value={form.services.heading || ''} onChange={e => setValue('services', 'heading', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Main Description">
                <textarea value={form.services.description || ''} onChange={e => setValue('services', 'description', e.target.value)} className={textareaClass} />
              </Field>
            </div>

            <div className="space-y-4">
              {(form.services.items || []).map((item, index) => {
                const expanded = !!expandedServices[index]
                return (
                  <div key={`service-${index}`} className="group overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3 px-4 py-4">
                      <button
                        onClick={() => toggleService(index)}
                        className="flex min-h-[44px] flex-1 items-center gap-3 text-left"
                      >
                        <ThumbPreview src={item.image || ''} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800">{item.name || `Service ${index + 1}`}</p>
                          <p className="truncate text-xs text-slate-400">{expanded ? 'Tap to collapse' : 'Tap to edit this service'}</p>
                        </div>
                        {expanded ? <MdExpandLess className="text-[22px] text-slate-500" /> : <MdExpandMore className="text-[22px] text-slate-500" />}
                      </button>
                      <button
                        onClick={() => {
                          removeArrayItem('services', 'items', index)
                        }}
                        className={`min-h-[44px] rounded-2xl border border-red-200 px-3 text-red-600 hover:bg-red-50 ${
                          expanded ? 'inline-flex items-center justify-center' : 'hidden group-hover:inline-flex opacity-80'
                        }`}
                      >
                        <MdDelete className="text-[18px]" />
                      </button>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-200 bg-white p-4 md:p-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Service Name">
                            <input value={item.name || ''} onChange={e => setArrayItem('services', 'items', index, 'name', e.target.value)} className={inputClass} />
                          </Field>
                          <Field label="Card Color">
                            <select value={item.bg || 'bg-slate-50'} onChange={e => setArrayItem('services','items',index,'bg',e.target.value)} className={inputClass}>
                              {[['bg-slate-50','White'],['bg-blue-50','Light Blue'],['bg-green-50','Light Green'],['bg-purple-50','Lavender'],['bg-yellow-50','Warm Cream']].map(([value,label])=><option key={value} value={value}>{label}</option>)}
                            </select>
                          </Field>
                          <Field label="Description" className="md:col-span-2">
                            <textarea value={item.description || ''} onChange={e => setArrayItem('services', 'items', index, 'description', e.target.value)} className={textareaClass} />
                          </Field>
                          <Field label="Link to a Bookable Service" className="md:col-span-2">
                            <select className={inputClass} value={item.catalog_service_id && item.branch_id ? `${item.catalog_service_id}:${item.branch_id}` : ''} onChange={e=>{const [id,branch]=e.target.value.split(':').map(Number); const linked=directory.services.find(row=>Number(row.id)===id && Number(row.branch_id)===branch);setArrayItem('services','items',index,'catalog_service_id',linked?.id||null);setArrayItem('services','items',index,'branch_id',linked?.branch_id||null);if(linked)setArrayItem('services','items',index,'name',linked.service_name)}}>
                              <option value="">General booking (no linked service)</option>{directory.services.map(row=><option key={`${row.id}:${row.branch_id}`} value={`${row.id}:${row.branch_id}`}>{row.branch_name} — {row.service_name}</option>)}
                            </select>
                            <p className="text-xs text-slate-500">Linked services must stay active in the clinic catalog to open the matching booking flow.</p>
                          </Field>
                          <Field label="Booking Button Link" className="md:col-span-2">
                            <input value={item.booking_path || ''} placeholder="Leave blank to use the main Book Appointment link" onChange={e => setArrayItem('services','items',index,'booking_path',e.target.value)} className={inputClass}/>
                          </Field>
                        </div>

                        <div className="mt-4">
                          <ImageUploadField
                            value={item.image || ''}
                            label={item.image ? 'Change Image' : 'Upload Image'}
                            busy={uploadingPath === `services.items.${index}`}
                            flash={flashPath === `services.items.${index}`}
                            onChange={e => uploadImage('services', 'items', e.target.files?.[0], index)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => addArrayItem('services', 'items', { name: 'New Service', description: '', image: '', bg: 'bg-slate-50' })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-dashed border-sky-300 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50"
            >
              <MdAdd className="text-[18px]" />
              Add Service
            </button>
          </section>
        )}

        {activeTab === 'doctors' && (
          <section className={cardClass}>
            <SectionHeader
              icon={MdPeople}
              title="Doctors"
              description="Edit the doctor section title, description, and each doctor card."
            />
            <VisibilitySwitch shown={form.doctors.visible !== false} onClick={() => toggleVisibility('doctors')} />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Section Title">
                <input value={form.doctors.heading || ''} onChange={e => setValue('doctors', 'heading', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Main Description">
                <textarea value={form.doctors.description || ''} onChange={e => setValue('doctors', 'description', e.target.value)} className={textareaClass} />
              </Field>
            </div>

            <div className="space-y-4">
              {(form.doctors.items || []).map((item, index) => {
                const expanded = !!expandedDoctors[index]
                return (
                  <div key={`doctor-${index}`} className="group overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-3 px-4 py-4">
                      <button
                        onClick={() => toggleDoctor(index)}
                        className="flex min-h-[44px] flex-1 items-center gap-3 text-left"
                      >
                        <ThumbPreview src={item.image || ''} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800">{item.name || `Doctor ${index + 1}`}</p>
                          <p className="truncate text-xs text-slate-400">{expanded ? 'Tap to collapse' : 'Tap to edit this doctor'}</p>
                        </div>
                        {expanded ? <MdExpandLess className="text-[22px] text-slate-500" /> : <MdExpandMore className="text-[22px] text-slate-500" />}
                      </button>
                      <button
                        onClick={() => {
                          removeArrayItem('doctors', 'items', index)
                        }}
                        className={`min-h-[44px] rounded-2xl border border-red-200 px-3 text-red-600 hover:bg-red-50 ${
                          expanded ? 'inline-flex items-center justify-center' : 'hidden group-hover:inline-flex opacity-80'
                        }`}
                      >
                        <MdDelete className="text-[18px]" />
                      </button>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-200 bg-white p-4 md:p-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Doctor Name">
                            <input value={item.name || ''} onChange={e => setArrayItem('doctors', 'items', index, 'name', e.target.value)} className={inputClass} />
                          </Field>
                          <Field label="Specialization">
                            <input value={item.specialize || ''} onChange={e => setArrayItem('doctors', 'items', index, 'specialize', e.target.value)} className={inputClass} />
                          </Field>
                          <Field label="Main Description" className="md:col-span-2">
                            <textarea value={item.description || ''} onChange={e => setArrayItem('doctors','items',index,'description',e.target.value)} className={textareaClass}/>
                          </Field>
                          <Field label="Link to a Doctor Account" className="md:col-span-2">
                            <select className={inputClass} value={item.doctor_id && item.branch_id ? `${item.doctor_id}:${item.branch_id}` : ''} onChange={e=>{const [id,branch]=e.target.value.split(':').map(Number);const linked=directory.doctors.find(row=>Number(row.id)===id && Number(row.branch_id)===branch);setArrayItem('doctors','items',index,'doctor_id',linked?.id||null);setArrayItem('doctors','items',index,'branch_id',linked?.branch_id||null);if(linked)setArrayItem('doctors','items',index,'name',linked.full_name)}}>
                              <option value="">General booking (no linked doctor)</option>{directory.doctors.map(row=><option key={`${row.id}:${row.branch_id}`} value={`${row.id}:${row.branch_id}`}>{row.full_name} — {row.branch_name}</option>)}
                            </select>
                            <p className="text-xs text-slate-500">The clinic checks live doctor schedules during booking.</p>
                          </Field>
                          <Field label="Booking Button Link" className="md:col-span-2">
                            <input value={item.booking_path || ''} placeholder="Leave blank to use the main Book Appointment link" onChange={e => setArrayItem('doctors','items',index,'booking_path',e.target.value)} className={inputClass}/>
                          </Field>
                        </div>

                        <div className="mt-4">
                          <ImageUploadField
                            value={item.image || ''}
                            label={item.image ? 'Change Image' : 'Upload Image'}
                            busy={uploadingPath === `doctors.items.${index}`}
                            flash={flashPath === `doctors.items.${index}`}
                            onChange={e => uploadImage('doctors', 'items', e.target.files?.[0], index)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => addArrayItem('doctors', 'items', { name: 'New Doctor', specialize: '', description: '', image: '' })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-dashed border-sky-300 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50"
            >
              <MdAdd className="text-[18px]" />
              Add Doctor
            </button>
          </section>
        )}

        {activeTab === 'contact' && (
          <section className={cardClass}>
            <SectionHeader
              icon={MdContactPhone}
              title="Contact"
              description="Update the clinic contact section, map, and call-to-action."
            />
            <VisibilitySwitch shown={form.contact.visible !== false} onClick={() => toggleVisibility('contact')} />

            <div className="space-y-6">
              <SubCard title="A. Contact Information">
                <IconField icon={MdTitle} iconClass="text-slate-500" label="Contact Heading">
                  <input value={form.contact.heading || ''} onChange={e => setValue('contact', 'heading', e.target.value)} className={inputClass} />
                </IconField>
                <IconField icon={MdNotes} iconClass="text-slate-500" label="Contact Description">
                  <textarea value={form.contact.description || ''} onChange={e => setValue('contact', 'description', e.target.value)} className={textareaClass} />
                </IconField>
                <IconField icon={MdPhone} iconClass="text-emerald-600" label="Phone Number">
                  <input value={form.contact.phone || ''} onChange={e => setValue('contact', 'phone', e.target.value)} className={inputClass} />
                </IconField>
                <IconField icon={MdAccessTime} iconClass="text-amber-600" label="Clinic Hours">
                  <textarea value={form.contact.hours || ''} onChange={e => setValue('contact', 'hours', e.target.value)} className={textareaClass} />
                </IconField>
                <IconField icon={MdLocationOn} iconClass="text-red-500" label="Address Line 1 / Address Line 2">
                  <div className="grid gap-3">
                    <input
                      value={form.contact.address_lines?.[0] || ''}
                      onChange={e => setValue('contact', 'address_lines', [e.target.value, form.contact.address_lines?.[1] || ''])}
                      className={inputClass}
                      placeholder="Address line 1"
                      aria-label="Address line 1"
                    />
                    <input
                      value={form.contact.address_lines?.[1] || ''}
                      onChange={e => setValue('contact', 'address_lines', [form.contact.address_lines?.[0] || '', e.target.value])}
                      className={inputClass}
                      placeholder="Address line 2"
                      aria-label="Address line 2"
                    />
                  </div>
                </IconField>
                <Field label="Location Title">
                  <input value={form.contact.location_title || ''} onChange={e => setValue('contact', 'location_title', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Phone Title">
                  <input value={form.contact.phone_title || ''} onChange={e => setValue('contact', 'phone_title', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Hours Title">
                  <input value={form.contact.hours_title || ''} onChange={e => setValue('contact', 'hours_title', e.target.value)} className={inputClass} />
                </Field>
              </SubCard>

              <SubCard title="B. Google Maps">
                <IconField icon={MdMap} iconClass="text-sky-600" label="Google Maps Embed URL">
                  <textarea value={form.contact.map_embed_url || ''} onChange={e => setValue('contact', 'map_embed_url', e.target.value)} className={textareaClass} />
                </IconField>
                {form.contact.map_embed_url ? (
                  <iframe
                    title="Map Preview"
                    src={form.contact.map_embed_url}
                    className="h-48 w-full rounded-2xl border border-slate-200"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                    Map preview appears here
                  </div>
                )}
              </SubCard>

              <SubCard title="C. Call to Action">
                <IconField icon={MdCalendarMonth} iconClass="text-sky-600" label="Call-to-Action Title">
                  <input value={form.contact.cta_heading || ''} onChange={e => setValue('contact', 'cta_heading', e.target.value)} className={inputClass} />
                </IconField>
                <IconField icon={MdCalendarMonth} iconClass="text-sky-600" label="Call-to-Action Subtitle">
                  <textarea value={form.contact.cta_description || ''} onChange={e => setValue('contact', 'cta_description', e.target.value)} className={textareaClass} />
                </IconField>
                <IconField icon={MdCalendarMonth} iconClass="text-sky-600" label="Button Text">
                  <input value={form.contact.cta_label || ''} onChange={e => setValue('contact', 'cta_label', e.target.value)} className={inputClass} />
                </IconField>
                <IconField icon={MdCalendarMonth} iconClass="text-sky-600" label="Button Link">
                  <input value={form.contact.cta_path || ''} onChange={e => setValue('contact', 'cta_path', e.target.value)} className={inputClass} />
                </IconField>
              </SubCard>
            </div>
          </section>
        )}

        {activeTab === 'footer' && (
          <section className={cardClass}>
            <SectionHeader
              icon={MdLink}
              title="Footer"
              description="Edit the bottom part of the website and optional legal links."
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Footer Copyright">
                <input value={form.footer.copyright || ''} onChange={e => setValue('footer', 'copyright', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Facebook Page URL">
                <input value={form.footer.facebook_url || ''} onChange={e => setValue('footer', 'facebook_url', e.target.value)} className={inputClass} />
              </Field>
              <IconField icon={MdGavel} iconClass="text-slate-500" label="Terms of Service URL">
                <input value={form.footer.terms_url || ''} onChange={e => setValue('footer', 'terms_url', e.target.value)} className={inputClass} />
                <p className="text-xs text-slate-400">Leave blank to hide this link in the footer</p>
              </IconField>
              <IconField icon={MdPrivacyTip} iconClass="text-sky-600" label="Privacy Policy URL">
                <input value={form.footer.privacy_url || ''} onChange={e => setValue('footer', 'privacy_url', e.target.value)} className={inputClass} />
                <p className="text-xs text-slate-400">Leave blank to hide this link in the footer</p>
              </IconField>
            </div>
          </section>
        )}
        </div>
        <aside className="hidden min-w-0 xl:block" aria-label="Live draft preview">
          <div className="sticky top-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-4">
              <div><p className="text-sm font-bold text-slate-800">Live Draft Preview</p><p className="text-xs text-slate-500">Updates as you edit. Not published.</p></div>
              <button type="button" onClick={() => setPreviewFull(true)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-sky-50">Expand Preview</button>
            </div>
            <div role="group" aria-label="Preview device" className="flex gap-2 border-b border-slate-200 p-3">{['mobile','desktop'].map(device=><button type="button" key={device} aria-pressed={previewDevice===device} onClick={()=>setPreviewDevice(device)} className="button-secondary capitalize">{device} preview</button>)}</div>
            <LandingDraftPreview content={form} directory={directory} device={previewDevice} section={activeTab}/>
          </div>
        </aside>
      </div>

      {previewFull && <div role="dialog" aria-modal="true" aria-label="Full website preview" className="fixed inset-0 z-[100] flex flex-col bg-slate-950/80 p-2 sm:p-5">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 rounded-t-2xl bg-white p-3">
          <div><p className="font-bold text-slate-800">Unpublished Website Preview</p><p className="text-xs text-slate-500">This is a preview only. Changes are not yet public.</p></div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Mobile preview" onClick={() => setPreviewDevice('mobile')} aria-pressed={previewDevice==='mobile'} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${previewDevice==='mobile'?'bg-sky-700 text-white':'bg-slate-100 text-slate-700'}`}><MdSmartphone /></button>
            <button type="button" aria-label="Desktop preview" onClick={() => setPreviewDevice('desktop')} aria-pressed={previewDevice==='desktop'} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${previewDevice==='desktop'?'bg-sky-700 text-white':'bg-slate-100 text-slate-700'}`}><MdDesktopWindows /></button>
            <button type="button" onClick={() => setPreviewFull(false)} aria-label="Close preview" className="flex min-h-11 items-center gap-1 rounded-lg bg-slate-100 px-3 font-semibold"><MdClose /> Close</button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto rounded-b-2xl bg-slate-100 p-2 sm:p-4">
          <div className={`mx-auto overflow-hidden bg-white shadow-xl transition-[max-width] duration-300 ${previewDevice==='mobile'?'max-w-[390px]':'max-w-6xl'}`}><LandingDraftPreview content={form} directory={directory} device={previewDevice}/></div>
        </div>
      </div>}

      <div className="sticky bottom-0 z-20 mt-6 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-600" role="status">{isDirty ? 'Unsaved changes' : hasDraft ? 'Private draft saved' : 'All published changes saved'}</div>
          <div className="flex flex-wrap items-center gap-2">
            {versions.length > 0 && <><select aria-label="Previous published versions" value={selectedVersion} onChange={e=>setSelectedVersion(e.target.value)} className="min-h-11 max-w-44 rounded-xl border border-slate-200 bg-white px-2 text-xs"><option value="">Previous versions</option>{versions.map(v=><option value={v.id} key={v.id}>{new Date(v.at).toLocaleString('en-PH')}</option>)}</select><button onClick={handleRestore} disabled={!selectedVersion || saving} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-50"><MdUndo /> Restore Draft</button></>}
            <button type="button" onClick={handleSave} disabled={saving || !isDirty} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-600 px-4 py-2 text-sm font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50"><MdSave />{saving?'Saving…':'Save Draft'}</button>
            <button type="button" onClick={handlePublish} disabled={saving || (!isDirty && !hasDraft)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"><MdPublish /> Publish Changes</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const VisibilitySwitch = ({ shown, onClick }) => (
  <button type="button" role="switch" aria-checked={shown} onClick={onClick} className={`mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${shown?'border-teal-200 bg-teal-50 text-teal-800':'border-slate-200 bg-slate-100 text-slate-600'}`}>
    <MdVisibility /> {shown ? 'Visible on website' : 'Hidden from website'}
  </button>
)

const SectionHeader = ({ icon, title, description }) => {
  const Icon = icon
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
        <Icon className="text-[20px]" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}

const Field = ({ label, children, className = '' }) => (
  <label className={`block space-y-2 ${className}`}>
    <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{label}</span>
    {children}
  </label>
)

const IconField = ({ icon, iconClass, label, children }) => {
  const Icon = icon
  const id=useId()
  const controls=Children.toArray(children)
  const control=controls.find(child=>isValidElement(child)&&['input','textarea','select'].includes(child.type))
  return (
    <div className="space-y-2">
      <label htmlFor={control?id:undefined} className="flex items-center gap-2">
        <Icon className={`text-[18px] ${iconClass}`} />
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      </label>
      <div className="space-y-2">{controls.map(child=>child===control?cloneElement(child,{id}):child)}</div>
    </div>
  )
}

const SubCard = ({ title, className = '', children }) => (
  <div className={`rounded-3xl border border-slate-200 bg-slate-50 p-4 md:p-5 ${className}`}>
    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
    <div className="mt-4 space-y-4">{children}</div>
  </div>
)

const ThumbPreview = ({ src }) => (
  src ? (
    <img src={src} alt="" className="h-8 w-8 rounded-xl object-contain bg-white border border-slate-200" />
  ) : (
    <div className="h-8 w-8 rounded-xl border border-dashed border-slate-300 bg-white" />
  )
)

const ImageUploadField = ({ value, label, busy, flash, onChange }) => (
  <div className="space-y-3">
    {value && (
      <div className={`relative overflow-hidden rounded-2xl border bg-slate-50 p-3 transition ${
        flash ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
      }`}>
        <img src={value} alt="" className="max-h-32 w-full rounded-2xl object-contain bg-slate-50" />
        <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-1 text-xs font-semibold text-white">
          <MdCheck className="text-[14px]" />
          Ready
        </span>
      </div>
    )}

    <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
      <MdCloudUpload className="text-[18px]" />
      {busy ? 'Uploading...' : label}
      <input type="file" accept="image/*" className="hidden" onChange={onChange} />
    </label>
  </div>
)

export default Admin_LandingPage

