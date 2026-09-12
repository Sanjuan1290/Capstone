import { useEffect } from 'react'
import { MdClose } from 'react-icons/md'

const Modal = ({ open, onClose, title, description, children, size = 'lg', closeDisabled = false }) => {
  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !closeDisabled) onClose?.()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDisabled, onClose, open])

  if (!open) return null
  const widthClass = size === 'xl' ? 'max-w-6xl' : size === 'md' ? 'max-w-2xl' : 'max-w-5xl'

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-backdrop" onClick={() => !closeDisabled && onClose?.()} aria-label="Close modal" />
      <section className={`modal-panel ${widthClass}`}>
        <header className="modal-header">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-base font-black text-slate-800">{title}</h2>
            {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
          </div>
          <button type="button" disabled={closeDisabled} onClick={onClose} className="icon-button" aria-label="Close modal"><MdClose /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

export default Modal



