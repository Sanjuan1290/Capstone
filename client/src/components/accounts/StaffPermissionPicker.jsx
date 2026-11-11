import { useMemo, useState } from 'react'
import { MdCheckBox, MdCheckBoxOutlineBlank, MdInfoOutline } from 'react-icons/md'
import { STAFF_PERMISSION_GROUPS, STAFF_PERMISSION_KEYS, normalizeStaffPermissions } from '../../config/staffPermissions'

const StaffPermissionPicker = ({ value = [], onChange, disabled = false }) => {
  const selected = useMemo(() => normalizeStaffPermissions(value), [value])
  const [openHelp, setOpenHelp] = useState(null)
  const selectedSet = new Set(selected)

  const setPermissions = (next) => onChange?.(normalizeStaffPermissions(next))
  const toggle = (key) => setPermissions(selectedSet.has(key) ? selected.filter((item) => item !== key) : [...selected, key])
  const toggleGroup = (group) => {
    const keys = group.permissions.map((item) => item.key)
    const allSelected = keys.every((key) => selectedSet.has(key))
    setPermissions(allSelected ? selected.filter((key) => !keys.includes(key)) : [...selected, ...keys])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-800">Customize Permissions</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Choose exactly which areas this staff member can access. Hover over or tap the information icon to see what each permission includes.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={() => setPermissions(STAFF_PERMISSION_KEYS)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Select All</button>
          <button type="button" disabled={disabled} onClick={() => setPermissions([])} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Clear</button>
        </div>
      </div>

      {STAFF_PERMISSION_GROUPS.map((group) => {
        const keys = group.permissions.map((item) => item.key)
        const count = keys.filter((key) => selectedSet.has(key)).length
        const allSelected = count === keys.length
        return (
          <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button type="button" disabled={disabled} onClick={() => toggleGroup(group)} className="flex w-full items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-left disabled:cursor-not-allowed">
              {allSelected ? <MdCheckBox className="shrink-0 text-xl text-amber-500" /> : <MdCheckBoxOutlineBlank className="shrink-0 text-xl text-slate-300" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-800">{group.label}</p>
                <p className="text-xs text-slate-500">{group.description}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">{count}/{keys.length}</span>
            </button>

            <div className="grid gap-2 p-3 sm:grid-cols-2">
              {group.permissions.map((permission) => {
                const checked = selectedSet.has(permission.key)
                const helpOpen = openHelp === permission.key
                return (
                  <div key={permission.key} className={`rounded-xl border p-3 transition ${checked ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start gap-2">
                      <button type="button" disabled={disabled} onClick={() => toggle(permission.key)} className="mt-0.5 shrink-0 disabled:opacity-40" aria-label={`${checked ? 'Remove' : 'Grant'} ${permission.label} permission`}>
                        {checked ? <MdCheckBox className="text-xl text-amber-500" /> : <MdCheckBoxOutlineBlank className="text-xl text-slate-300" />}
                      </button>
                      <button type="button" disabled={disabled} onClick={() => toggle(permission.key)} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed">
                        <p className="text-sm font-bold text-slate-800">{permission.label}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{permission.short}</p>
                      </button>
                      <button type="button" title={permission.description} aria-label={`About ${permission.label}`} onClick={() => setOpenHelp(helpOpen ? null : permission.key)} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700">
                        <MdInfoOutline />
                      </button>
                    </div>
                    {helpOpen && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 shadow-sm">{permission.description}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
        {selected.length} of {STAFF_PERMISSION_KEYS.length} permissions selected
      </div>
    </div>
  )
}

export default StaffPermissionPicker
