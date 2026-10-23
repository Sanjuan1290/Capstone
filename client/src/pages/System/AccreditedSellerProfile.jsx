import { useMemo } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiArrowLeft, FiEye, FiRefreshCw, FiUser } from 'react-icons/fi'
import { useFetch } from '../../utils/useFetch'
import { getSellerRoleLabel } from '../../config/sellerRoles'

const Value = ({ name, value }) => <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{name}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || 'Not recorded'}</dd></div>
const formatDate = value => value ? String(value).slice(0, 10) : 'Not recorded'

// This page is intentionally read-only and requires only SYSTEM_ACCREDITED_VIEW.
const AccreditedSellerProfile = () => {
  const { sellerId } = useParams()
  const location = useLocation()
  const role = location.pathname.split('/')[2] || 'super_admin'
  const reviewParams = new URLSearchParams(location.search)
  const reviewView = reviewParams.get('reviewView') === '1'
  const reviewId = Number(reviewParams.get('reviewId') || 0)
  const returnToReview = `/portal/${role}/review-center/reviews/${reviewId}`
  const params = useMemo(() => { const query = new URLSearchParams(location.search); query.delete('from'); return query.toString() }, [location.search])
  const returnPath = reviewView && Number.isSafeInteger(reviewId) && reviewId > 0 ? returnToReview : `/portal/${role}/accredited${params ? `?${params}` : ''}`
  const query = useQuery({
    queryKey: ['accredited-seller-read-only', Number(sellerId)],
    queryFn: () => useFetch(`/accredited/sellers/${sellerId}/profile`),
    enabled: Number.isSafeInteger(Number(sellerId)) && Number(sellerId) > 0,
    retry: 1,
  })
  const seller = query.data?.data
  return <main className="mx-auto grid w-full max-w-5xl gap-5 p-4 pb-12 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><NavLink to={returnPath} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiArrowLeft /> {reviewView ? 'Back to Review Center' : 'Back to Accredited Sellers'}</NavLink><span className="text-xs font-medium text-slate-500">{reviewView ? 'Review Record · Current Seller Form · View Only' : 'Read-only member details'}</span></div>
    {query.isPending ? <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading seller details…</div> : null}
    {query.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900"><p className="font-bold">Seller details are unavailable.</p><p className="mt-1">{query.error?.message || 'Please try again.'}</p><button type="button" onClick={() => query.refetch()} className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 font-semibold">Try Again</button></div> : null}
    {reviewView && seller && Number(seller.accredited_seller_id) !== Number(sellerId) ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">The returned seller does not match the review target. No substitute record will be shown.</div> : null}
    {seller && (!reviewView || Number(seller.accredited_seller_id) === Number(sellerId)) ? <>
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><FiUser /></span><div><h1 className="text-xl font-bold text-slate-950">{seller.full_name || seller.account_code || 'Seller'}</h1><p className="mt-1 text-sm text-slate-600">{getSellerRoleLabel(seller.role)} · {seller.seller_group_name || 'No Network assigned'}</p><p className="mt-2 text-sm font-semibold text-slate-700">{seller.user_status === 'active' && seller.accredited_seller_status === 'active' ? 'Active' : 'Inactive'} · View only</p></div></div><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><FiRefreshCw />Refresh</button></header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-slate-900">Seller Information</h2><p className="mb-4 mt-1 text-sm text-slate-600">Current saved details. Viewing this page does not change the seller or Network.</p><dl className="grid gap-3 sm:grid-cols-2"><Value name="Account Code" value={seller.account_code}/><Value name="Position" value={getSellerRoleLabel(seller.role)}/><Value name="Email" value={seller.email}/><Value name="Contact Number" value={seller.contact_no}/><Value name="Network" value={seller.seller_group_name}/><Value name="Reports To" value={seller.reports_under_name || (seller.role === 'division_manager' ? 'Developer' : 'Not assigned')}/><Value name="Accreditation Date" value={formatDate(seller.accredited_seller_accreditation_date)}/><Value name="Accreditation Status" value={seller.accredited_seller_status}/><Value name="TIN" value={seller.tin_no}/><Value name="PRC Number" value={seller.prc_no}/><div className="sm:col-span-2"><Value name="Address" value={seller.address}/></div></dl></section>
      {seller.seller_group_type === 'in_house' && seller.seller_group_id && seller.user_id ? <NavLink to={`/portal/${role}/accredited/groups/in-house/${seller.seller_group_id}/members/${seller.user_id}?from=directory${params ? `&${params}` : ''}`} className="inline-flex w-fit items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700"><FiEye /> View reporting team</NavLink> : null}
    </> : null}
  </main>
}

export default AccreditedSellerProfile

