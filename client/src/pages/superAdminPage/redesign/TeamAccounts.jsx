import {useCallback,useEffect,useMemo,useState} from 'react'
import {MdPeople,MdRefresh} from 'react-icons/md'
import {Banner,Card,Empty,Loading,Modal,PageHead,PrimaryButton,SecondaryButton,fetchJson} from './shared'

// Super Admin only: staff and doctor account directory and guarded branch changes.
export default function TeamAccounts({branches=[]}) {
  const [accounts,setAccounts]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [role,setRole]=useState('all')
  const [branch,setBranch]=useState('all')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState(null)
  const [destination,setDestination]=useState('')
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const reload=useCallback(async()=>{
    setLoading(true);setError('')
    try {setAccounts(await fetchJson('/accounts/team'))}
    catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{reload()},[reload])
  const rows=useMemo(()=>accounts.filter(a=>
    (role==='all'||a.role===role) &&
    (branch==='all'||Number(a.branch_id)===Number(branch)) &&
    `${a.full_name} ${a.email} ${a.branch_name}`.toLowerCase().includes(search.toLowerCase())
  ),[accounts,role,branch,search])
  const startMove=a=>{setSelected(a);setDestination('');setError('');setMessage('')}
  const move=async()=>{
    if(!selected||!destination||Number(destination)===Number(selected.branch_id))return
    setSaving(true);setError('')
    try {
      const result=await fetchJson(`/accounts/team/${selected.role}/${selected.id}/branch`,{
        method:'PUT',body:JSON.stringify({branch_id:Number(destination),confirm:true})
      })
      setMessage(result.message)
      setSelected(null)
      await reload()
    }catch(e){setError(e.message)}
    finally{setSaving(false)}
  }
  return <section className="mt-8 space-y-4" aria-label="Staff and doctor accounts">
    <PageHead title="Staff & Doctor Accounts" description="View operational accounts from all clinic branches and safely reassign their branch." action={<SecondaryButton onClick={reload}><MdRefresh/> Refresh</SecondaryButton>}/>
    {message&&<Banner type="success" title="Account updated" onDismiss={()=>setMessage('')}>{message}</Banner>}
    {error&&!selected&&<Banner onRetry={reload}>{error}</Banner>}
    <Card><div className="grid gap-3 md:grid-cols-3">
      <input aria-label="Search staff and doctors" className="form-control" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email or branch"/>
      <select className="form-control" aria-label="Filter staff and doctors by role" value={role} onChange={e=>setRole(e.target.value)}><option value="all">All roles</option><option value="staff">Staff</option><option value="doctor">Doctor</option></select>
      <select className="form-control" aria-label="Filter staff and doctors by branch" value={branch} onChange={e=>setBranch(e.target.value)}><option value="all">All branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
    </div></Card>
    {loading?<Loading/>:<Card title={`${rows.length} operational accounts`} description="Historic records remain in their original branch after an account moves.">
      {rows.length?<div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="border-b bg-slate-50"><tr>{['Name','Role','Branch','Status','Action'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(a=><tr className="border-b" key={`${a.role}:${a.id}`}><td className="p-3 font-semibold">{a.full_name}<p className="text-xs font-normal text-slate-500">{a.email}</p></td><td className="p-3 capitalize">{a.role}</td><td className="p-3">{a.branch_name}</td><td className="p-3 capitalize">{a.account_status}</td><td className="p-3"><SecondaryButton onClick={()=>startMove(a)}>Move branch</SecondaryButton></td></tr>)}</tbody></table></div>:<Empty icon={MdPeople} title="No matching staff or doctors" description="Adjust the search or filters."/>}
    </Card>}
    <Modal open={Boolean(selected)} title="Move account to another branch" description="Existing sessions will be revoked. Historical clinic records will not move." onClose={()=>!saving&&setSelected(null)}>
      <div className="space-y-4">
        <p className="text-sm"><strong>{selected?.full_name}</strong> currently belongs to <strong>{selected?.branch_name}</strong>.</p>
        <label className="block text-sm font-semibold">Destination branch<select required className="form-control mt-2" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Select active destination</option>{branches.filter(b=>Number(b.is_active)===1&&Number(b.id)!==Number(selected?.branch_id)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <Banner type="warning" title="Safety checks">Doctors with active upcoming appointments and Staff with open cashier shifts cannot be moved. Your confirmation will revoke existing login sessions.</Banner>
        {error&&<Banner>{error}</Banner>}
        <div className="flex justify-end gap-2"><SecondaryButton onClick={()=>setSelected(null)} disabled={saving}>Cancel</SecondaryButton><PrimaryButton onClick={move} disabled={saving||!destination}>{saving?'Moving...':'Confirm Branch Move'}</PrimaryButton></div>
      </div>
    </Modal>
  </section>
}


