export const visiblePromotions = (rows,featured=false) => {
  const active=(Array.isArray(rows)?rows:[]).filter(p=>p && p.is_active !== false && p.is_active !== 0 && p.is_active !== '0')
  const sorted=[...active].sort((a,b)=>Number(a.featured_order||0)-Number(b.featured_order||0)||String(a.ends_on).localeCompare(String(b.ends_on))||Number(b.id)-Number(a.id))
  return featured?sorted.filter(p=>p.show_on_dashboard).slice(0,3):sorted
}


