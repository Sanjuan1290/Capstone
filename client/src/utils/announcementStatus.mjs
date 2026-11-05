// The database keeps its original workflow status for editing and audit.
// The management UI shows "Expired" as soon as the local clinic end time passes.
export const clinicNow = (instant = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const part = type => parts.find(p => p.type === type)?.value || '00'
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}
export const announcementDisplayStatus = (post, instant = new Date()) => {
  const status = String(post?.status || 'draft')
  if (!['published', 'scheduled'].includes(status)) return status
  const expiry = String(post?.expires_at || '').replace('T', ' ').trim()
  const now = clinicNow(instant)
  if (expiry && expiry <= now) return 'expired'
  const start = String(post?.publish_at || '').replace('T', ' ').trim()
  if (status === 'scheduled' && start && start <= now) return 'published'
  return status
}
