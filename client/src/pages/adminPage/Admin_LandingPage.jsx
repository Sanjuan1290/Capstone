import { useEffect, useState } from 'react'
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
  MdTitle,
} from 'react-icons/md'
import { getAdminLandingPage, saveAdminLandingPage } from '../../services/landing.service'
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

const cardClass = 'rounded-[28px] border border-slate-200 bg-white p-5 md:p-6 shadow-sm'
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
        setIsDirty(false)
      })
      .catch(err => setLoadError(err.message || 'Failed to load landing page editor.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadEditor()
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

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await saveAdminLandingPage(form)
      setForm(normalizeContent(saved.content))
      setIsDirty(false)
      showToast('Landing page saved.')
    } catch (err) {
      showToast(err.message || 'Failed to save landing page.', 'error')
    } finally {
      setSaving(false)
    }
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

  const previewSite = () => window.open('/', '_blank')

  return (
    <div className="max-w-7xl pb-28">
      <Toast toasts={toasts} />

      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
              <MdLanguage className="text-sm" />
              Website Editor
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Landing Page Editor</h1>
            <p className="mt-2 text-sm text-slate-500">
              Update your public website section by section. Only one section is shown at a time to keep editing simple.
            </p>
          </div>

          <button
            onClick={previewSite}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <MdOpenInNew className="text-[18px]" />
            Preview Site
          </button>
        </div>

        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex min-w-max gap-6 border-b border-slate-200">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap transition ${
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
        </div>

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
                    <Field label="Link Target (e.g. #about)">
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
              <Field label="Background Dimming (0 = clear, 1 = full white)">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={form.hero.overlay_opacity ?? 0.7}
                  onChange={e => setValue('hero', 'overlay_opacity', e.target.value)}
                  className={inputClass}
                />
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
                          <Field label="Background Color Class">
                            <input value={item.bg || ''} onChange={e => setArrayItem('services', 'items', index, 'bg', e.target.value)} className={inputClass} />
                          </Field>
                          <Field label="Description" className="md:col-span-2">
                            <textarea value={item.description || ''} onChange={e => setArrayItem('services', 'items', index, 'description', e.target.value)} className={textareaClass} />
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
                            <textarea value={item.description || ''} onChange={e => setArrayItem('doctors', 'items', index, 'description', e.target.value)} className={textareaClass} />
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

            <div className="grid gap-6 lg:grid-cols-3">
              <SubCard title="Contact Info" className="lg:col-span-1">
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
                    />
                    <input
                      value={form.contact.address_lines?.[1] || ''}
                      onChange={e => setValue('contact', 'address_lines', [form.contact.address_lines?.[0] || '', e.target.value])}
                      className={inputClass}
                      placeholder="Address line 2"
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

              <SubCard title="Map" className="lg:col-span-1">
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

              <SubCard title="Call to Action" className="lg:col-span-1">
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

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-100 bg-white px-4 py-3 shadow-lg pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="text-sm font-semibold text-amber-600">
            {isDirty ? 'Unsaved changes' : ''}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <MdSave className="text-[18px]" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`text-[18px] ${iconClass}`} />
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      </div>
      <div className="space-y-2">{children}</div>
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
