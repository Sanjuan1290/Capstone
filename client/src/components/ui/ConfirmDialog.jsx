import Modal from './Modal'

const ConfirmDialog = ({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', loading = false, confirmDisabled = false, warning, alternativeLabel, onAlternative, onConfirm, onCancel }) => (
  <Modal open={open} onClose={onCancel} closeDisabled={loading} title={title} description={message} size="md">
    {warning && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{warning}</p>}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className="button-secondary" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
      {alternativeLabel && <button type="button" className="button-secondary" disabled={loading} onClick={onAlternative}>{alternativeLabel}</button>}
      <button type="button" className={tone === 'danger' ? 'button-danger' : 'button-primary'} disabled={loading || confirmDisabled} onClick={onConfirm}>
        {loading ? 'Working...' : confirmLabel}
      </button>
    </div>
  </Modal>
)

export default ConfirmDialog

