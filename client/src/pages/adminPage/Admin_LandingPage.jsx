import { useEffect, useState } from 'react'
import {
  MdAdd, MdCloudUpload, MdDelete, MdLanguage, MdSave,
} from 'react-icons/md'
import { getAdminLandingPage, saveAdminLandingPage } from '../../services/landing.service'
import { uploadToCloudinary } from '../../services/portal.service'

const cardClass = 'bg-white border border-slate-200 rounded-3xl p-6 space-y-4'
const inputClass = 'w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400'
const textareaClass = `${inputClass} min-h-[120px]`

const clone = (value) => JSON.parse(JSON.stringify(value))

const Admin_LandingPage = () => {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadingPath, setUploadingPath] = useState('')

  useEffect(() => {
    getAdminLandingPage()
      .then(data => setForm(clone(data?.content)))
      .catch(err => alert(err.message))
  }, [])

  const setValue = (section, key, value) => {
    setForm(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }))
  }

  const setArrayItem = (section, key, index, field, value) => {
    setForm(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: prev[section][key].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
      },
    }))
  }

  const addArrayItem = (section, key, item) => {
    setForm(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: [...(prev[section][key] || []), item],
      },
    }))
  }

  const removeArrayItem = (section, key, index) => {
    setForm(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: prev[section][key].filter((_, itemIndex) => itemIndex !== index),
      },
    }))
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
    } catch (err) {
      alert(err.message)
    } finally {
      setUploadingPath('')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await saveAdminLandingPage(form)
      setForm(clone(saved.content))
      alert('Landing page saved.')
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return <div className="p-10 text-sm text-slate-400">Loading landing page editor...</div>
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Landing Page</h1>
          <p className="text-sm text-slate-500 mt-1">Edit the public website header, navigation, sections, contact details, map, footer, and images.</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="rounded-2xl bg-[#0b1a2c] px-5 py-3 text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50">
          <MdSave className="text-[18px]" />
          {saving ? 'Saving...' : 'Save Landing Page'}
        </button>
      </div>

      <section className={cardClass}>
        <SectionTitle title="Header" />
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Clinic Name"><input value={form.header.clinic_name || ''} onChange={e => setValue('header', 'clinic_name', e.target.value)} className={inputClass} /></Field>
          <Field label="Logo URL"><input value={form.header.logo_url || ''} onChange={e => setValue('header', 'logo_url', e.target.value)} className={inputClass} /></Field>
          <Field label="Login Label"><input value={form.header.login_label || ''} onChange={e => setValue('header', 'login_label', e.target.value)} className={inputClass} /></Field>
          <Field label="Login Path"><input value={form.header.login_path || ''} onChange={e => setValue('header', 'login_path', e.target.value)} className={inputClass} /></Field>
          <Field label="CTA Label"><input value={form.header.cta_label || ''} onChange={e => setValue('header', 'cta_label', e.target.value)} className={inputClass} /></Field>
          <Field label="CTA Path"><input value={form.header.cta_path || ''} onChange={e => setValue('header', 'cta_path', e.target.value)} className={inputClass} /></Field>
        </div>

        <label className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
          <MdCloudUpload className="text-[18px]" />
          {uploadingPath === 'header.logo_url' ? 'Uploading...' : 'Upload Header Logo'}
          <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage('header', 'logo_url', e.target.files?.[0])} />
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Navigation Links</p>
            <button onClick={() => addArrayItem('header', 'nav_links', { label: 'New Link', path: '#section' })} className="text-sm font-semibold text-sky-700 flex items-center gap-1">
              <MdAdd /> Add Link
            </button>
          </div>
          {(form.header.nav_links || []).map((link, index) => (
            <div key={`${link.path}-${index}`} className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
              <input value={link.label || ''} onChange={e => setArrayItem('header', 'nav_links', index, 'label', e.target.value)} className={inputClass} placeholder="Label" />
              <input value={link.path || ''} onChange={e => setArrayItem('header', 'nav_links', index, 'path', e.target.value)} className={inputClass} placeholder="#section or /path" />
              <button onClick={() => removeArrayItem('header', 'nav_links', index)} className="rounded-2xl border border-red-200 text-red-500 px-4 py-3 flex items-center justify-center"><MdDelete /></button>
            </div>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <SectionTitle title="Hero" />
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Section ID"><input value={form.hero.section_id || ''} onChange={e => setValue('hero', 'section_id', e.target.value)} className={inputClass} /></Field>
          <Field label="Background Image URL"><input value={form.hero.background_image_url || ''} onChange={e => setValue('hero', 'background_image_url', e.target.value)} className={inputClass} /></Field>
          <Field label="Heading"><input value={form.hero.heading || ''} onChange={e => setValue('hero', 'heading', e.target.value)} className={inputClass} /></Field>
          <Field label="Heading Highlight"><input value={form.hero.heading_highlight || ''} onChange={e => setValue('hero', 'heading_highlight', e.target.value)} className={inputClass} /></Field>
          <Field label="Subheading"><input value={form.hero.subheading || ''} onChange={e => setValue('hero', 'subheading', e.target.value)} className={inputClass} /></Field>
          <Field label="Overlay Opacity"><input type="number" min="0" max="1" step="0.1" value={form.hero.overlay_opacity ?? 0.7} onChange={e => setValue('hero', 'overlay_opacity', e.target.value)} className={inputClass} /></Field>
          <Field label="Primary Button Label"><input value={form.hero.primary_button_label || ''} onChange={e => setValue('hero', 'primary_button_label', e.target.value)} className={inputClass} /></Field>
          <Field label="Primary Button Path"><input value={form.hero.primary_button_path || ''} onChange={e => setValue('hero', 'primary_button_path', e.target.value)} className={inputClass} /></Field>
          <Field label="Secondary Button Label"><input value={form.hero.secondary_button_label || ''} onChange={e => setValue('hero', 'secondary_button_label', e.target.value)} className={inputClass} /></Field>
          <Field label="Secondary Button Path"><input value={form.hero.secondary_button_path || ''} onChange={e => setValue('hero', 'secondary_button_path', e.target.value)} className={inputClass} /></Field>
          <Field label="Description"><textarea value={form.hero.description || ''} onChange={e => setValue('hero', 'description', e.target.value)} className={textareaClass} /></Field>
        </div>
        <UploadButton busy={uploadingPath === 'hero.background_image_url'} label="Upload Hero Background" onChange={e => uploadImage('hero', 'background_image_url', e.target.files?.[0])} />
      </section>

      <section className={cardClass}>
        <SectionTitle title="About and Testimonial" />
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="About Heading"><input value={form.about.heading || ''} onChange={e => setValue('about', 'heading', e.target.value)} className={inputClass} /></Field>
          <Field label="About Image URL"><input value={form.about.image_url || ''} onChange={e => setValue('about', 'image_url', e.target.value)} className={inputClass} /></Field>
          <Field label="Badge Title"><input value={form.about.badge_title || ''} onChange={e => setValue('about', 'badge_title', e.target.value)} className={inputClass} /></Field>
          <Field label="Badge Text"><input value={form.about.badge_text || ''} onChange={e => setValue('about', 'badge_text', e.target.value)} className={inputClass} /></Field>
          <Field label="Mission Title"><input value={form.about.mission_title || ''} onChange={e => setValue('about', 'mission_title', e.target.value)} className={inputClass} /></Field>
          <Field label="Vision Title"><input value={form.about.vision_title || ''} onChange={e => setValue('about', 'vision_title', e.target.value)} className={inputClass} /></Field>
          <Field label="About Body 1"><textarea value={form.about.body_primary || ''} onChange={e => setValue('about', 'body_primary', e.target.value)} className={textareaClass} /></Field>
          <Field label="About Body 2"><textarea value={form.about.body_secondary || ''} onChange={e => setValue('about', 'body_secondary', e.target.value)} className={textareaClass} /></Field>
          <Field label="Mission Body"><textarea value={form.about.mission_body || ''} onChange={e => setValue('about', 'mission_body', e.target.value)} className={textareaClass} /></Field>
          <Field label="Vision Body"><textarea value={form.about.vision_body || ''} onChange={e => setValue('about', 'vision_body', e.target.value)} className={textareaClass} /></Field>
          <Field label="Testimonial Heading"><input value={form.testimonial.heading || ''} onChange={e => setValue('testimonial', 'heading', e.target.value)} className={inputClass} /></Field>
          <Field label="Testimonial Subheading"><input value={form.testimonial.subheading || ''} onChange={e => setValue('testimonial', 'subheading', e.target.value)} className={inputClass} /></Field>
          <Field label="Quote"><textarea value={form.testimonial.quote || ''} onChange={e => setValue('testimonial', 'quote', e.target.value)} className={textareaClass} /></Field>
          <Field label="Testimonial Image URL"><input value={form.testimonial.image_url || ''} onChange={e => setValue('testimonial', 'image_url', e.target.value)} className={inputClass} /></Field>
        </div>
        <div className="flex gap-3 flex-wrap">
          <UploadButton busy={uploadingPath === 'about.image_url'} label="Upload About Image" onChange={e => uploadImage('about', 'image_url', e.target.files?.[0])} />
          <UploadButton busy={uploadingPath === 'testimonial.image_url'} label="Upload Testimonial Image" onChange={e => uploadImage('testimonial', 'image_url', e.target.files?.[0])} />
        </div>
      </section>

      <ArrayEditor
        title="Services"
        description="Edit service cards, text, and images."
        items={form.services.items}
        onAdd={() => addArrayItem('services', 'items', { name: 'New Service', description: '', image: '', bg: 'bg-slate-50' })}
        onRemove={(index) => removeArrayItem('services', 'items', index)}
        renderItem={(item, index) => (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Name"><input value={item.name || ''} onChange={e => setArrayItem('services', 'items', index, 'name', e.target.value)} className={inputClass} /></Field>
            <Field label="Background Class"><input value={item.bg || ''} onChange={e => setArrayItem('services', 'items', index, 'bg', e.target.value)} className={inputClass} /></Field>
            <Field label="Image URL"><input value={item.image || ''} onChange={e => setArrayItem('services', 'items', index, 'image', e.target.value)} className={inputClass} /></Field>
            <Field label="Description"><textarea value={item.description || ''} onChange={e => setArrayItem('services', 'items', index, 'description', e.target.value)} className={textareaClass} /></Field>
            <UploadButton busy={uploadingPath === `services.items.${index}`} label="Upload Service Image" onChange={e => uploadImage('services', 'items', e.target.files?.[0], index)} />
          </div>
        )}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Section ID"><input value={form.services.section_id || ''} onChange={e => setValue('services', 'section_id', e.target.value)} className={inputClass} /></Field>
          <Field label="Heading"><input value={form.services.heading || ''} onChange={e => setValue('services', 'heading', e.target.value)} className={inputClass} /></Field>
          <Field label="Description"><textarea value={form.services.description || ''} onChange={e => setValue('services', 'description', e.target.value)} className={textareaClass} /></Field>
        </div>
      </ArrayEditor>

      <ArrayEditor
        title="Doctors"
        description="Edit doctor cards and profile images."
        items={form.doctors.items}
        onAdd={() => addArrayItem('doctors', 'items', { name: 'New Doctor', specialize: '', description: '', image: '' })}
        onRemove={(index) => removeArrayItem('doctors', 'items', index)}
        renderItem={(item, index) => (
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Name"><input value={item.name || ''} onChange={e => setArrayItem('doctors', 'items', index, 'name', e.target.value)} className={inputClass} /></Field>
            <Field label="Specialize"><input value={item.specialize || ''} onChange={e => setArrayItem('doctors', 'items', index, 'specialize', e.target.value)} className={inputClass} /></Field>
            <Field label="Image URL"><input value={item.image || ''} onChange={e => setArrayItem('doctors', 'items', index, 'image', e.target.value)} className={inputClass} /></Field>
            <Field label="Description"><textarea value={item.description || ''} onChange={e => setArrayItem('doctors', 'items', index, 'description', e.target.value)} className={textareaClass} /></Field>
            <UploadButton busy={uploadingPath === `doctors.items.${index}`} label="Upload Doctor Image" onChange={e => uploadImage('doctors', 'items', e.target.files?.[0], index)} />
          </div>
        )}
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Section ID"><input value={form.doctors.section_id || ''} onChange={e => setValue('doctors', 'section_id', e.target.value)} className={inputClass} /></Field>
          <Field label="Heading"><input value={form.doctors.heading || ''} onChange={e => setValue('doctors', 'heading', e.target.value)} className={inputClass} /></Field>
          <Field label="Description"><textarea value={form.doctors.description || ''} onChange={e => setValue('doctors', 'description', e.target.value)} className={textareaClass} /></Field>
        </div>
      </ArrayEditor>

      <section className={cardClass}>
        <SectionTitle title="Contact and Footer" />
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Contact Heading"><input value={form.contact.heading || ''} onChange={e => setValue('contact', 'heading', e.target.value)} className={inputClass} /></Field>
          <Field label="Contact Description"><textarea value={form.contact.description || ''} onChange={e => setValue('contact', 'description', e.target.value)} className={textareaClass} /></Field>
          <Field label="Location Title"><input value={form.contact.location_title || ''} onChange={e => setValue('contact', 'location_title', e.target.value)} className={inputClass} /></Field>
          <Field label="Address Line 1"><input value={form.contact.address_lines?.[0] || ''} onChange={e => setValue('contact', 'address_lines', [e.target.value, form.contact.address_lines?.[1] || ''])} className={inputClass} /></Field>
          <Field label="Address Line 2"><input value={form.contact.address_lines?.[1] || ''} onChange={e => setValue('contact', 'address_lines', [form.contact.address_lines?.[0] || '', e.target.value])} className={inputClass} /></Field>
          <Field label="Phone Title"><input value={form.contact.phone_title || ''} onChange={e => setValue('contact', 'phone_title', e.target.value)} className={inputClass} /></Field>
          <Field label="Phone"><input value={form.contact.phone || ''} onChange={e => setValue('contact', 'phone', e.target.value)} className={inputClass} /></Field>
          <Field label="Hours Title"><input value={form.contact.hours_title || ''} onChange={e => setValue('contact', 'hours_title', e.target.value)} className={inputClass} /></Field>
          <Field label="Hours"><textarea value={form.contact.hours || ''} onChange={e => setValue('contact', 'hours', e.target.value)} className={textareaClass} /></Field>
          <Field label="Google Map Embed URL"><textarea value={form.contact.map_embed_url || ''} onChange={e => setValue('contact', 'map_embed_url', e.target.value)} className={textareaClass} /></Field>
          <Field label="CTA Heading"><input value={form.contact.cta_heading || ''} onChange={e => setValue('contact', 'cta_heading', e.target.value)} className={inputClass} /></Field>
          <Field label="CTA Description"><textarea value={form.contact.cta_description || ''} onChange={e => setValue('contact', 'cta_description', e.target.value)} className={textareaClass} /></Field>
          <Field label="CTA Label"><input value={form.contact.cta_label || ''} onChange={e => setValue('contact', 'cta_label', e.target.value)} className={inputClass} /></Field>
          <Field label="CTA Path"><input value={form.contact.cta_path || ''} onChange={e => setValue('contact', 'cta_path', e.target.value)} className={inputClass} /></Field>
          <Field label="Footer Copyright"><input value={form.footer.copyright || ''} onChange={e => setValue('footer', 'copyright', e.target.value)} className={inputClass} /></Field>
          <Field label="Facebook URL"><input value={form.footer.facebook_url || ''} onChange={e => setValue('footer', 'facebook_url', e.target.value)} className={inputClass} /></Field>
        </div>
      </section>
    </div>
  )
}

const SectionTitle = ({ title }) => (
  <div className="flex items-center gap-2">
    <MdLanguage className="text-sky-600 text-[20px]" />
    <h2 className="text-lg font-bold text-slate-800">{title}</h2>
  </div>
)

const Field = ({ label, children }) => (
  <label className="space-y-1.5 block">
    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    {children}
  </label>
)

const UploadButton = ({ busy, label, onChange }) => (
  <label className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
    <MdCloudUpload className="text-[18px]" />
    {busy ? 'Uploading...' : label}
    <input type="file" accept="image/*" className="hidden" onChange={onChange} />
  </label>
)

const ArrayEditor = ({ title, description, items, onAdd, onRemove, renderItem, children }) => (
  <section className={cardClass}>
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <SectionTitle title={title} />
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <button onClick={onAdd} className="text-sm font-semibold text-sky-700 flex items-center gap-1">
        <MdAdd /> Add Item
      </button>
    </div>

    {children}

    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={`${title}-${index}`} className="rounded-3xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">{title} Item {index + 1}</p>
            <button onClick={() => onRemove(index)} className="rounded-2xl border border-red-200 text-red-500 px-4 py-2 flex items-center gap-2">
              <MdDelete /> Remove
            </button>
          </div>
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  </section>
)

export default Admin_LandingPage
