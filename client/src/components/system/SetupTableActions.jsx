// Shared action column used by every System Setup table and reason list.
// Keep an empty second slot when a record only supports Edit. This keeps
// every action aligned without displaying a disabled or misleading control.
export const SETUP_ACTION_CELL = 'w-[272px] min-w-[272px] px-4 py-3 text-right align-middle'
export const SETUP_ACTION_BUTTON = 'button-secondary !inline-flex !h-10 !w-full !items-center !justify-center !gap-1.5 !whitespace-nowrap !px-2.5'

export default function SetupTableActions({ primary, secondary, note }) {
  return (
    <div className="ml-auto grid w-[232px] grid-cols-[88px_136px] items-center gap-2">
      {note ? (
        <span className="col-span-2 text-right text-xs font-medium text-slate-500">{note}</span>
      ) : (
        <>
          <div className="min-w-0">{primary}</div>
          <div className="min-w-0">{secondary || <span aria-hidden="true" className="block h-10" />}</div>
        </>
      )}
    </div>
  )
}
