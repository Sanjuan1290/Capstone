const FormField = ({ id, label, required = false, error = '', helper = '', children }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="form-label">
      {label}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
    </label>
    {children}
    {error ? <p className="form-error" id={`${id}-error`}>{error}</p> : helper ? <p className="form-helper" id={`${id}-help`}>{helper}</p> : null}
  </div>
)

export default FormField



