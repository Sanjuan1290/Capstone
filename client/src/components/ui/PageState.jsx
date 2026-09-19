import { MdErrorOutline, MdInbox, MdRefresh } from 'react-icons/md'

export const LoadingState = ({ label = 'Loading records...' }) => (
  <div className="page-state" role="status">
    <span className="loading-spinner" />
    <p>{label}</p>
  </div>
)

export const ErrorState = ({ message = 'The records could not be loaded.', onRetry }) => (
  <div className="page-state" role="alert">
    <MdErrorOutline className="text-3xl text-red-500" />
    <p>{message}</p>
    {onRetry && <button type="button" className="button-secondary" onClick={onRetry}><MdRefresh /> Try again</button>}
  </div>
)

export const EmptyState = ({ title = 'No records found', description = 'Try changing your search or filters.' }) => (
  <div className="page-state">
    <MdInbox className="text-3xl text-slate-400" />
    <p className="font-bold text-slate-700">{title}</p>
    <p className="text-xs text-slate-500">{description}</p>
  </div>
)
