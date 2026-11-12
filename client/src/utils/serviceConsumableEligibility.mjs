// A service may use any active inventory item owned by its branch, regardless
// of whether that item is categorized General Medicine or Dermatology.
// Ownership and Selling Price are revalidated by the server on save.
export const isSelectableServiceConsumable = (item) => Boolean(item && !item.archived_at)

export const filterServiceConsumables = (items, { query = '', selectedId = '' } = {}) => {
  const text = String(query || '').trim().toLowerCase()
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!isSelectableServiceConsumable(item)) return false
    if (!text || String(item.id) === String(selectedId)) return true
    return [item.name, item.barcode, item.id, item.category === 'derma' ? 'Dermatology' : item.category === 'medical' ? 'General Medicine' : 'Other']
      .some((value) => String(value || '').toLowerCase().includes(text))
  })
}
