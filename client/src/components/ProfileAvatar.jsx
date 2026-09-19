const colors = ['bg-amber-100 text-amber-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700']

const ProfileAvatar = ({ user, size = 'md' }) => {
  const label = user?.full_name || user?.email || 'User'
  const initials = label.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-16 h-16 text-lg' : 'w-10 h-10 text-sm'
  const colorClass = colors[(label.length || 0) % colors.length]

  if (user?.profile_image_url) {
    return <img src={user.profile_image_url} alt={label} className={`${sizeClass} rounded-xl object-cover border border-white/20`} />
  }

  return (
    <div className={`${sizeClass} rounded-xl flex items-center justify-center font-bold ${colorClass}`}>
      {initials || 'U'}
    </div>
  )
}

export default ProfileAvatar
