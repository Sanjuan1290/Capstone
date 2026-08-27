import Modal from './Modal'

const ConfirmDialog = ({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', loading = false, onConfirm, onCancel }) => (
  <Modal open={open} onClose={onCancel} closeDisabled={loading} title={title} description={message} size="md">
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className="button-secondary" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className={tone === 'danger' ? 'button-danger' : 'button-primary'} disabled={loading} onClick={onConfirm}>
        {loading ? 'Working...' : confirmLabel}
      </button>
    </div>
  </Modal>
)

export default ConfirmDialog

