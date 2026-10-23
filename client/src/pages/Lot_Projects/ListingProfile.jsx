import { useEffect, useMemo, useState } from 'react'
import ReviewLiveRecordPanel from '../../components/Shared/ReviewLiveRecordPanel'
import ReviewReturnLink from '../../components/Shared/ReviewReturnLink'
import { dismissReviewRecordQuery } from '../../utils/reviewRecordNavigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FiArrowLeft,
  FiCreditCard,
  FiClock,
  FiFileText,
  FiHome,
  FiLink,
  FiPrinter,
  FiPauseCircle,
  FiRefreshCw,
  FiUnlock,
  FiUser,
  FiUserCheck,
} from 'react-icons/fi'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import StatusAlert from '../../components/Shared/StatusAlert'
import TabErrorBoundary from '../../components/Shared/TabErrorBoundary'
import UnitStatus from '../../components/Lot_Projects/ListingProfileComponents/UnitStatus/UnitStatus'
import ClientProfile from '../../components/Lot_Projects/ListingProfileComponents/ClientProfile/ClientProfile'
import PaymentsSOA from '../../components/Lot_Projects/ListingProfileComponents/PaymentsSOA/Payments_SOA'
import Documents from '../../components/Lot_Projects/ListingProfileComponents/Documents/Documents'
import Printouts from '../../components/Lot_Projects/ListingProfileComponents/Printouts/Printouts'
import AccountHistoryPanel from '../../components/Lot_Projects/ListingProfileComponents/AccountHistory/AccountHistoryPanel'
import ReservationCorrectionModal from '../../components/Lot_Projects/ListingProfileComponents/ReservationCorrection/ReservationCorrectionModal'
import ReserveListingModal from '../../components/Lot_Projects/ListingProfileComponents/ReserveListingModal/ReserveListingModal'
import BuyerFormLinkModal from '../../components/Lot_Projects/ListingProfileComponents/BuyerForm/BuyerFormLinkModal'
import BuyerFormStatusBanner from '../../components/Lot_Projects/ListingProfileComponents/BuyerForm/BuyerFormStatusBanner'
import {useFetch, useFetchPatch, useFetchPost, useFetchPut, getDoubleCheckNotice} from '../../utils/useFetch'
import useCurrentUser from '../../utils/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../../config/permissions'

const money = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))

const tabs = [
  { key: 'unit', label: 'Unit & Status', icon: FiHome },
  { key: 'client', label: 'Client Profile', icon: FiUser },
  { key: 'payments', label: 'Payments / SOA', icon: FiCreditCard },
  { key: 'documents', label: 'Documents', icon: FiFileText },
  { key: 'accounts', label: 'Account History', icon: FiClock },
  { key: 'printouts', label: 'Printouts', icon: FiPrinter },
]

const emptyListing = {
  unit_id: '-',
  unitCode: '-',
  project_name: 'Lot Project',
  listing_status: '-',
  tcp: '₱0.00',
  tcpAmount: 0,
  balance: '₱0.00',
  balanceAmount: 0,
  status: '-',
}


const HoldListingModal = ({ listing, isSaving, onClose, onSubmit }) => {
  const [clientName, setClientName] = useState(listing?.heldForName || '')
  const [note, setNote] = useState(listing?.holdNote || '')

  const submit = (event) => {
    event.preventDefault()
    if (!clientName.trim()) return
    onSubmit?.({ clientName: clientName.trim(), note: note.trim() })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
      <form onSubmit={submit} className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">Hold Listing</h3>
            <p className="text-sm font-semibold text-slate-500">Temporarily hold {listing?.unit_id || listing?.unitCode || 'this unit'} for a client.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60">
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-black text-slate-700">Client Name <span className="text-red-500">*</span></span>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} disabled={isSaving} placeholder="Enter client name" className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-100" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-black text-slate-700">Note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={isSaving} rows={4} placeholder="Optional hold note" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-100" />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" onClick={onClose} disabled={isSaving} className="h-10 rounded-lg border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">Cancel</button>
          <button type="submit" disabled={isSaving || !clientName.trim()} className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-600 px-5 text-sm font-black text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300">
            {isSaving ? 'Saving...' : 'Hold Listing'}
          </button>
        </div>
      </form>
    </div>
  )
}

const ListingProfile = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { projectSlug, listingId, accountId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: currentUserData } = useCurrentUser()
  const user = currentUserData?.user
  const isSuperAdmin = ['super_admin', 'system_admin'].includes(user?.role)
  const canEditListingPermission = hasPermission(user, PERMISSIONS.LOT_LISTINGS_EDIT)
  const canReservePermission = hasPermission(user, PERMISSIONS.LOT_RESERVATIONS_CREATE)
  const canEditBuyerProfile = hasPermission(user, PERMISSIONS.LOT_BUYER_PROFILE_EDIT)
  const canViewPayments = hasPermission(user, PERMISSIONS.LOT_PAYMENTS_VIEW)
  const canCreatePayment = hasPermission(user, PERMISSIONS.LOT_PAYMENTS_CREATE)
  const canEditPayment = hasPermission(user, PERMISSIONS.LOT_PAYMENTS_EDIT)
  const canDeletePayment = hasPermission(user, PERMISSIONS.LOT_PAYMENT_DELETE)
  const canViewBuyerDocuments = hasPermission(user, PERMISSIONS.LOT_BUYER_DOCUMENTS_VIEW)
  const canUpdateBuyerDocuments = hasPermission(user, PERMISSIONS.LOT_BUYER_DOCUMENTS_UPDATE)
  const canViewAccountHistory = hasPermission(user, PERMISSIONS.LOT_ACCOUNT_HISTORY_VIEW)
  const canUsePrintouts = hasPermission(user, PERMISSIONS.LOT_PRINTOUTS_USE)
  const canViewCommissions = hasPermission(user, PERMISSIONS.LOT_COMMISSIONS_VIEW)
  const canViewSystemDocuments = hasPermission(user, PERMISSIONS.SYSTEM_DOCUMENTS_VIEW)
  const canAdjustCommission = hasPermission(user, PERMISSIONS.LOT_COMMISSIONS_ADJUST)
  const canChangeAssignedSeller = hasPermission(user, PERMISSIONS.LOT_ASSIGNED_SELLER_EDIT)
  const canManageCancellation = hasPermission(user, PERMISSIONS.LOT_CANCELLATIONS_MANAGE)
  const canSettleCancellation = hasPermission(user, PERMISSIONS.LOT_CANCELLATIONS_SETTLE)
  const canReleaseCancelledUnit = hasPermission(user, PERMISSIONS.LOT_CANCELLATIONS_RELEASE_UNIT)
  const canCorrectReservation = hasPermission(user, PERMISSIONS.LOT_RESERVATION_CORRECT)
  const workflowAuditCaseId = Number(searchParams.get('auditCaseId') || 0)
  const workflowReviewId = Number(searchParams.get('reviewId') || 0)
  const dismissedReviewId = Number(searchParams.get('reviewReturnId') || 0)
  const workflowAction = String(searchParams.get('workflowAction') || '').trim()
  const reviewView = searchParams.get('reviewView') === '1'
  const reviewEntityType = String(searchParams.get('reviewEntityType') || '')
  const reviewTargetId = Number(searchParams.get('reviewTargetId') || 0)
  const reviewPaymentId = Number(searchParams.get('paymentId') || 0)
  const reviewScheduleId = Number(searchParams.get('scheduleId') || 0)
  const reviewTab = searchParams.get('reviewTab') || ''
  const isAccountRoute = Boolean(accountId)
  const profileKey = ['lot-listing-profile', projectSlug, listingId, accountId || 'current']
  const profileUrl = accountId
    ? `/projects/lot-projects/${projectSlug}/listings/${listingId}/accounts/${accountId}`
    : `/projects/lot-projects/${projectSlug}/listings/${listingId}`

  const [activeTab, setActiveTab] = useState(
    ['payment_correction','penalty_adjustment','lmf_correction','payment_proof_review'].includes(workflowAction)
      ? 'payments'
      : workflowAction === 'buyer_profile_edit_review'
        ? 'client'
        : 'unit'
  )
  const [showReserveModal, setShowReserveModal] = useState(false)
  const [reserveMode, setReserveMode] = useState('manual')
  const [showBuyerFormLinkModal, setShowBuyerFormLinkModal] = useState(false)
  const [generatedBuyerFormUrl, setGeneratedBuyerFormUrl] = useState('')
  const [buyerFormNotice, setBuyerFormNotice] = useState(null)
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [showReservationCorrectionModal, setShowReservationCorrectionModal] = useState(false)
  const [alert, setAlert] = useState(null)

  const visibleTabs = useMemo(() => tabs.filter((tab) => {
    if (tab.key === 'payments') return canViewPayments
    if (tab.key === 'documents') return canViewBuyerDocuments
    if (tab.key === 'accounts') return canViewAccountHistory
    if (tab.key === 'printouts') return canUsePrintouts
    return true
  }), [canUsePrintouts, canViewAccountHistory, canViewBuyerDocuments, canViewPayments])

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) setActiveTab('unit')
  }, [activeTab, visibleTabs])

  const profileQuery = useQuery({
    queryKey: profileKey,
    queryFn: () => useFetch(profileUrl),
    enabled: Boolean(projectSlug && listingId),
    retry: false,
  })

  const buyerFormStateQuery = useQuery({
    queryKey: ['lot-buyer-form-state', projectSlug, listingId],
    queryFn: () => useFetch(`/projects/lot-projects/${projectSlug}/listings/${listingId}/buyer-form`),
    enabled: Boolean(projectSlug && listingId && !isAccountRoute && canViewBuyerDocuments),
    retry: false,
    refetchOnWindowFocus: true,
  })

  const profile = profileQuery.data?.data || {}
  const account = profile.account || null
  // A review record is strictly read-only. The normal page fetch is still
  // protected by its existing project/account permissions.
  const reviewedPayment = (profile.payments || []).find((payment) => Number(payment.paymentId || payment.id || payment.lot_project_payment_id) === reviewPaymentId)
  const exactAccount = !accountId || Number(profile.account?.id || profile.account?.lot_project_account_id || 0) === Number(accountId)
  const exactListing = Number(profile.listing?.id || profile.listing?.listingId || profile.listing?.lot_project_listing_id || 0) === Number(listingId)
  const reviewRecord = reviewView && exactAccount && exactListing ? (
    reviewEntityType === 'lot_project_listing' ? reviewTargetId === Number(profile.listing?.id || 0) ? profile.listing : null :
    reviewEntityType === 'lot_project_client_profile' ? reviewTargetId === Number(profile.client?.id || 0) ? profile.client : null :
    ['lot_project_payment','lot_project_payment_proof','lot_project_signed_receipt'].includes(reviewEntityType) ? reviewedPayment :
    ['lot_project_account','lot_project_commission_account','lot_project_reservation','lot_project_cancellation'].includes(reviewEntityType) ? reviewTargetId === Number(profile.account?.id || 0) ? profile.account : null :
    ['lot_project_lmf_schedule','lot_project_penalty_schedule'].includes(reviewEntityType) ? (profile.soaRows || []).find((row)=>Number(row.scheduleId||row.id||row.lot_project_payment_schedule_id)===reviewScheduleId && reviewScheduleId === reviewTargetId) : null
  ) : null
  const readOnly = Boolean(profile.readOnly)
  useEffect(() => {
    if (reviewView && visibleTabs.some(tab => tab.key === reviewTab)) setActiveTab(reviewTab)
  }, [reviewView, reviewTab, visibleTabs])
  useEffect(() => {
    if (['payment_correction','penalty_adjustment','lmf_correction','payment_proof_review'].includes(workflowAction)) setActiveTab('payments')
    if (workflowAction === 'signed_receipt_review') setActiveTab('printouts')
    if (workflowAction === 'buyer_profile_edit_review') setActiveTab('client')
    if (['commission_adjustment','seller_change_review'].includes(workflowAction)) setActiveTab('unit')
    if (workflowAction === 'reservation_correction' && canCorrectReservation && !readOnly) {
      setActiveTab('unit')
      setShowReservationCorrectionModal(true)
    }
  }, [workflowAction, canCorrectReservation, readOnly])
  const financialSnapshot = profile.financialSnapshot || null
  const project = profile.project || {}
  const listing = profile.listing || emptyListing
  const client = profile.client || {}
  const soaRows = profile.soaRows || []
  const payments = profile.payments || []
  const documents = profile.documents || []
  const profileBuyerForm = profile.buyerForm || {}
  const buyerForm = !readOnly && buyerFormStateQuery.isSuccess
    ? { ...profileBuyerForm, ...(buyerFormStateQuery.data?.data || {}) }
    : profileBuyerForm
  const pendingBuyerFormSubmission = buyerForm.pendingSubmission || null
  const currentBuyerFormLink = buyerForm.currentLink || null
  const listingInventoryStatus = String(
    listing?.rawStatus ||
      listing?.lot_project_listing_status ||
      listing?.listing_status ||
      listing?.status ||
      ''
  ).trim().toLowerCase()
  const listingIsFreelyEditableInventory = ['available', 'hold'].includes(listingInventoryStatus)
  // Reserved/sold listings: Operations Head edits directly, Operations Staff
  // get a Head approval request, Super Admin is the emergency fallback.
  const canEditProtectedListing = isSuperAdmin || ['operations_head', 'operations_staff'].includes(user?.role)
  const canEditListing = Boolean(!readOnly && canEditListingPermission && (listingIsFreelyEditableInventory || canEditProtectedListing))
  const canEditListingRequirements = Boolean(!readOnly && canUpdateBuyerDocuments && listingIsFreelyEditableInventory)

  const reserveDocumentsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: () => useFetch('/documents/getDocuments'),
    enabled: !readOnly && canViewSystemDocuments && (canReservePermission || canViewBuyerDocuments),
    staleTime: 1000 * 60 * 5,
  })

  const reserveTemplatesQuery = useQuery({
    queryKey: ['document-templates'],
    queryFn: () => useFetch('/documents/getTemplates'),
    enabled: !readOnly && canViewSystemDocuments && (showReserveModal || (activeTab === 'documents' && canViewBuyerDocuments)),
    staleTime: 1000 * 60 * 5,
  })

  const documentTemplates = reserveTemplatesQuery.data?.templates || []
  const templateDocuments = reserveTemplatesQuery.data?.template_documents || []

  const documentLibrary = useMemo(
    () =>
      (reserveDocumentsQuery.data?.documents || []).map((document) => ({
        id: document.document_id,
        document_id: document.document_id,
        name: document.document_name,
        description: document.document_description || 'No description',
        requirement: document.document_is_required ? 'required' : 'optional',
        status: document.document_status || 'active',
      })),
    [reserveDocumentsQuery.data]
  )

  const paymentListing = useMemo(
    () => ({
      ...listing,
      tcp: listing.tcpAmount ?? listing.tcp ?? 0,
      balance: listing.balanceAmount ?? listing.balance ?? 0,
      accountId: account?.id || null,
      accountReference: account?.accountReference || '',
      readOnly,
      financialSnapshot,
    }),
    [listing, account, readOnly, financialSnapshot]
  )

  const updateListingMutation = useMutation({
    mutationFn: (payload) => {
      const workflowPayload = ['listing_edit_review', 'listing_documents_update_review'].includes(workflowAction)
        ? {
            ...payload,
            ...(workflowReviewId ? { reviewId: workflowReviewId } : {}),
            ...(workflowAuditCaseId ? { auditCaseId: workflowAuditCaseId } : {}),
          }
        : payload
      return useFetchPut(`/projects/lot-projects/${projectSlug}/listings/${listingId}`, workflowPayload, {
        doubleCheck: {
          type: 'listing',
          mode: 'edit',
          summary: `${project?.name || project?.lot_project_name || 'Project'} · ${listing?.unit_id || listing?.unitCode || listingId}`,
          data: {
            currentListing: {
              unit: listing?.unit_id || listing?.unitCode,
              cadastralLot: listing?.cadastral_lot_no,
              lotType: listing?.lot_type || listing?.lotType,
              areaSqm: listing?.lotAreaSqm || listing?.lot_project_listing_area_sqm,
              installmentPricePerSqm: listing?.installmentPricePerSqm || listing?.pricePerSqm,
              cashPricePerSqm: listing?.cashPricePerSqm,
              legalMiscRate: listing?.legalMiscRate,
              annualInterestRate: listing?.annualInterestRate,
              reservationFee: listing?.reservationFee,
              status: listing?.listing_status || listing?.status,
            },
            newValues: {
              ...payload,
              projectName: project?.name || project?.lot_project_name || listing?.project_name || projectSlug,
            },
          },
        },
      })
    },
    onMutate: (payload) => {
      setAlert({ type: 'loading', message: `Preparing ${payload.unitCode || payload.unit_id || 'listing'} review...` })
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Listing updated successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to update listing.'))
    },
  })


  const requestCancellationCodeMutation = useMutation({
    mutationFn: (payload) =>
      useFetchPost(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/cancellation-code`,
        payload,
        { confirmationHandled: 'technical' }
      ),
  })

  const requestCommissionAdjustmentCodeMutation = useMutation({
    mutationFn: (payload) =>
      useFetchPost(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/commission-adjustment-code`,
        payload,
        { confirmationHandled: 'compact' }
      ),
  })

  const adjustCommissionMutation = useMutation({
    mutationFn: (payload) =>
      useFetchPost(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/adjust-commission`,
        payload,
        { confirmationHandled: 'compact' }
      ),
    onMutate: () => {
      setAlert({
        type: 'loading',
        message: `Applying the unit commission adjustment for ${listing.unit_id || listing.unitCode || 'this unit'}...`,
      })
    },
    onSuccess: (result) => {
      setAlert({
        type: 'success',
        message: result?.message || 'Unit commission adjusted successfully.',
      })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-commissions', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    },
    onError: (error) => {
      setAlert({
        type: 'error',
        message: error?.message || 'Failed to adjust the unit commission.',
      })
    },
  })

  // Phase 7: this is a separate protected action, not a rate adjustment.
  const sellerChangePath = `/projects/lot-projects/${projectSlug}/listings/${listingId}/change-seller`
  const loadSellerChangeOptions = (payload) => useFetch(`${sellerChangePath}/options?accountId=${Number(payload.accountId)}&q=${encodeURIComponent(String(payload.query || ''))}`)
  const previewSellerChange = (payload) => useFetchPost(`${sellerChangePath}/preview`, payload, { confirmationHandled: 'compact' })
  const requestSellerChange = (payload) => useFetchPost(`${sellerChangePath}/request`, payload, { confirmationHandled: 'compact' })
  const confirmSellerChange = async (payload) => {
    const result = await useFetchPost(`${sellerChangePath}/confirm`, payload, { confirmationHandled: 'compact' })
    setAlert({ type: 'success', message: result?.message || 'Assigned seller updated.' })
    queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
    queryClient.invalidateQueries({ queryKey: ['lot-commissions', projectSlug] })
    queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    return result
  }

  const reserveListingMutation = useMutation({
    mutationFn: (payload) => {
      const { reviewData = {}, ...requestPayload } = payload || {}

      return useFetchPost(`/projects/lot-projects/${projectSlug}/listings/${listingId}/reserve`, requestPayload, {
        doubleCheck: {
          type: 'reservation',
          summary: `${project?.name || project?.lot_project_name || 'Project'} · ${listing?.unit_id || listing?.unitCode || listingId}`,
          data: {
            listing: {
              project: project?.name || project?.lot_project_name || listing?.project_name || '-',
              unit: listing?.unit_id || listing?.unitCode || listingId,
              lotType: listing?.lot_type || listing?.lotType || '-',
              areaSqm: listing?.lotAreaSqm || listing?.lot_project_listing_area_sqm || listing?.area || '-',
            },
            buyerProfile: requestPayload?.clientProfile || {},
            documentRequirements: (requestPayload?.documents || []).map((document) => ({
              name: document?.name || document?.document_name || 'Document',
              source: document?.source || 'Document Library',
              requirement: document?.requirement || 'required',
              status: document?.status || 'active',
            })),
            paymentTerms: requestPayload?.reservation?.paymentTerms || {},
            commissionPreview: reviewData?.commissionPreview || null,
          },
        },
      })
    },
    onMutate: (payload) => {
      setAlert({ type: 'loading', message: `Preparing reservation review for ${payload?.clientProfile?.buyerName || 'listing'}...` })
    },
    onSuccess: (result) => {
      setShowReserveModal(false)
      setAlert({ type: 'success', message: result?.message || 'Reservation saved successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['system-payment-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['system-document-notifications'] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to reserve listing.'))
    },
  })

  const createBuyerFormLinkMutation = useMutation({
    mutationFn: (payload) =>
      useFetchPost(`/projects/lot-projects/${projectSlug}/listings/${listingId}/buyer-form-links`, payload, {
        doubleCheck: {
          type: 'buyer-form',
          variant: 'link',
          data: { ...payload, unit: listing?.unit_id || listing?.unitCode || listingId },
        },
      }),
    onMutate: () => {
      setBuyerFormNotice({ type: 'loading', message: 'Generating a secure buyer form link...' })
      setGeneratedBuyerFormUrl('')
    },
    onSuccess: (result) => {
      setGeneratedBuyerFormUrl(result?.data?.publicUrl || '')
      setBuyerFormNotice({ type: 'success', message: result?.message || 'Buyer form link created.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
    },
    onError: (error) => {
      setBuyerFormNotice(getDoubleCheckNotice(error, 'Failed to generate buyer form link.'))
    },
  })

  const revokeBuyerFormLinkMutation = useMutation({
    mutationFn: (link) =>
      useFetchPost(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/buyer-form-links/${link.id}/revoke`,
        {},
        { confirmationHandled: 'compact' }
      ),
    onMutate: () => setBuyerFormNotice({ type: 'loading', message: 'Revoking buyer form link...' }),
    onSuccess: (result) => {
      setGeneratedBuyerFormUrl('')
      setBuyerFormNotice({ type: 'success', message: result?.message || 'Buyer form link revoked.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
    },
    onError: (error) => setBuyerFormNotice(getDoubleCheckNotice(error, 'Failed to revoke buyer form link.')),
  })

  const rejectBuyerFormSubmissionMutation = useMutation({
    mutationFn: ({ submission, reason }) =>
      useFetchPost(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/buyer-form-submissions/${submission.id}/reject`,
        { reason },
        { confirmationHandled: 'compact' }
      ),
    onMutate: () => setAlert({ type: 'loading', message: 'Rejecting buyer form submission...' }),
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Buyer form submission rejected.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    },
    onError: (error) => setAlert(getDoubleCheckNotice(error, 'Failed to reject buyer form submission.')),
  })

  const holdListingMutation = useMutation({
    mutationFn: (payload) =>
      useFetchPatch(`/projects/lot-projects/${projectSlug}/listings/${listingId}/hold`, payload, { confirmationHandled: 'compact' }),
    onMutate: (payload) => {
      setAlert({ type: 'loading', message: `Holding unit for ${payload.clientName || 'client'}...` })
    },
    onSuccess: (result) => {
      setShowHoldModal(false)
      setAlert({ type: 'success', message: result?.message || 'Listing held successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to hold listing.'))
    },
  })

  const unholdListingMutation = useMutation({
    mutationFn: () =>
      useFetchPatch(`/projects/lot-projects/${projectSlug}/listings/${listingId}/unhold`, {}, { confirmationHandled: 'compact' }),
    onMutate: () => {
      setAlert({ type: 'loading', message: 'Returning listing to available...' })
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Listing returned to available.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to unhold listing.'))
    },
  })

  const uploadDocumentMutation = useMutation({
    mutationFn: ({ document, payload }) =>
      useFetchPut(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/documents/${document.id}/upload`,
        payload,
        { confirmationToken: payload?.confirmationToken }
      ),
    onMutate: ({ document }) => {
      setAlert({ type: 'loading', message: `Uploading ${document?.name || 'document'}...` })
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Document uploaded successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['system-document-notifications'] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to upload document.'))
    },
  })

  const approveDocumentMutation = useMutation({
    mutationFn: (document) =>
      useFetchPatch(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/documents/${document.id}/approve`,
        {},
        { confirmationHandled: 'compact' }
      ),
    onMutate: (document) => {
      setAlert({ type: 'loading', message: `Approving ${document?.name || 'document'}...` })
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Document approved successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['system-document-notifications'] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to approve document.'))
    },
  })

  const requestDocumentResubmissionMutation = useMutation({
    mutationFn: ({ document, payload }) =>
      useFetchPatch(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/documents/${document.id}/resubmission`,
        payload || {},
        { confirmationHandled: 'compact' }
      ),
    onMutate: ({ document }) => {
      setAlert({ type: 'loading', message: `Requesting corrected ${document?.name || 'document'}...` })
    },
    onSuccess: (result) => {
      setAlert({ type: 'warning', message: result?.message || 'Document marked for resubmission.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['system-document-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to request document resubmission.'))
    },
  })

  const clearDocumentMutation = useMutation({
    mutationFn: (document) =>
      useFetchPatch(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/documents/${document.id}/clear`,
        {},
        { confirmationHandled: 'compact' }
      ),
    onMutate: (document) => {
      setAlert({ type: 'loading', message: `Clearing ${document?.name || 'document'}...` })
    },
    onSuccess: (result) => {
      setAlert({ type: 'warning', message: result?.message || 'Document cleared successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['system-document-notifications'] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to clear document.'))
    },
  })

  const updateDocumentRequirementsMutation = useMutation({
    mutationFn: (nextDocuments) =>
      useFetchPut(
        `/projects/lot-projects/${projectSlug}/listings/${listingId}/document-requirements`,
        {
          documents: nextDocuments,
          ...(['listing_documents_update_review', 'listing_edit_review'].includes(workflowAction) && workflowReviewId ? { reviewId: workflowReviewId } : {}),
          ...(['listing_documents_update_review', 'listing_edit_review'].includes(workflowAction) && workflowAuditCaseId ? { auditCaseId: workflowAuditCaseId } : {}),
        },
        {
          doubleCheck: {
            type: 'listing-documents',
            data: { documents: nextDocuments },
            summary: `${project?.name || project?.lot_project_name || 'Project'} · ${listing?.unit_id || listing?.unitCode || listingId}`,
          },
        }
      ),
    onMutate: () => {
      setAlert({ type: 'loading', message: 'Preparing document checklist review...' })
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Document requirements updated successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['system-document-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
      queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to update document requirements.'))
    },
  })

  const updateClientProfileMutation = useMutation({
    mutationFn: (payload) => {
      const workflowPayload = workflowAction === 'buyer_profile_edit_review'
        ? {
            ...payload,
            ...(workflowReviewId ? { reviewId: workflowReviewId } : {}),
            ...(workflowAuditCaseId ? { auditCaseId: workflowAuditCaseId } : {}),
          }
        : payload
      return useFetchPut(`/projects/lot-projects/${projectSlug}/listings/${listingId}/client-profile`, workflowPayload, {
        doubleCheck: { type: 'buyer-profile', mode: 'edit', data: payload },
      })
    },
    onMutate: (payload) => {
      setAlert({ type: 'loading', message: `Preparing ${payload.buyerName || 'buyer profile'} review...` })
    },
    onSuccess: (result) => {
      setAlert({ type: 'success', message: result?.message || 'Buyer profile updated successfully.' })
      queryClient.invalidateQueries({ queryKey: ['lot-listing-profile', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-buyer-form-state', projectSlug, listingId] })
      queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
    },
    onError: (error) => {
      setAlert(getDoubleCheckNotice(error, 'Failed to update buyer profile.'))
    },
  })

  const handleReserveListing = (reservationPayload) => reserveListingMutation.mutateAsync(reservationPayload)

  const openManualReservation = () => {
    setReserveMode('manual')
    setShowReserveModal(true)
  }

  const reviewBuyerFormSubmission = () => {
    if (!pendingBuyerFormSubmission) return
    setReserveMode('submission-review')
    setShowReserveModal(true)
  }

  const rejectBuyerFormSubmission = (submission) => {
    const reason = window.prompt('Reason for rejecting this buyer form submission:', 'Buyer information requires correction.')
    if (reason === null) return
    if (!window.confirm(`Reject ${submission?.buyerName || 'this buyer'} and return the unit to available?`)) return
    rejectBuyerFormSubmissionMutation.mutate({ submission, reason: reason.trim() })
  }

  const handleRefresh = () => {
    profileQuery.refetch()
    if (!readOnly) buyerFormStateQuery.refetch()
  }

  const isHeld = listing.rawStatus === 'hold' || listing.listing_status === 'Hold'
  const canHold = listing.rawStatus === 'available' || listing.listing_status === 'Available'
  const canReserveInventory = listing.rawStatus === 'available' || listing.listing_status === 'Available'
  const isBuyerFormHold = Boolean(isHeld && pendingBuyerFormSubmission)
  const canManageBuyerForm = Boolean(canUpdateBuyerDocuments && canReserveInventory && !buyerForm.migrationRequired)
  const hasActiveBuyerFormLink = ['active', 'opened'].includes(String(currentBuyerFormLink?.status || '').toLowerCase())
  const canManageDocuments = Boolean(!readOnly && canUpdateBuyerDocuments && listing.hasClientProfile && listing.canEditBuyerProfile)

  return (
    <main className="flex flex-col gap-6">
      <ReviewReturnLink role={user?.role} reviewId={dismissedReviewId} />
      {alert ? (
        <StatusAlert
          type={alert.type}
          message={alert.message}
          onClose={alert.type === 'loading' ? undefined : () => setAlert(null)}
        />
      ) : null}

      {profileQuery.isLoading ? <StatusAlert type="loading" message="Loading listing profile from database..." /> : null}
      {profileQuery.isFetching && !profileQuery.isLoading ? <StatusAlert type="info" message="Refreshing listing profile..." /> : null}
      {profileQuery.isError ? (
        <StatusAlert type="error" message={profileQuery.error?.message || 'Failed to load listing profile.'} />
      ) : null}

      {!readOnly && buyerForm.migrationRequired ? (
        <StatusAlert type="warning" message={buyerForm.message || 'Run the buyer form database migration before using form links.'} />
      ) : null}

      {!readOnly && canViewBuyerDocuments ? <BuyerFormStatusBanner
        submission={pendingBuyerFormSubmission}
        onReview={canReservePermission ? reviewBuyerFormSubmission : undefined}
        onReject={canUpdateBuyerDocuments ? rejectBuyerFormSubmission : undefined}
        isSaving={rejectBuyerFormSubmissionMutation.isPending}
      /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => navigate(readOnly ? `/portal/lot-projects/${projectSlug}/listings/${listingId}` : `/portal/lot-projects/${projectSlug}/listings`)}
              className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 active:scale-[0.98]"
              aria-label={readOnly ? 'Back to current listing' : 'Back to listings'}
            >
              <FiArrowLeft className="h-4 w-4" />
            </button>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">{readOnly ? 'Historical Buyer Account' : 'Listing Details'}</p>

              <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">
                {listing.unit_id || listing.unitCode || '-'}
              </h1>

              {listing.buyer_name || listing.buyerName || listing.clientName || account?.buyerName ? (
                <p className="mt-1 text-base font-black text-slate-800">
                  {listing.buyer_name || listing.buyerName || listing.clientName || account?.buyerName}
                </p>
              ) : null}

              <p className="mt-1 text-sm font-semibold text-slate-500">
                {listing.project_name || project.name || 'Lot Project'} • {readOnly ? account?.statusLabel || listing.listing_status || '-' : listing.listing_status || '-'}
              </p>

                {listing.rawStatus === 'hold' && listing.heldForName ? (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-black text-amber-700">
                      Held for: {listing.heldForName}
                    </p>

                    {listing.holdNote ? (
                      <p className="mt-1 text-xs font-semibold text-amber-800">
                        Reason: {listing.holdNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}

            </div>
          </div>

          <div className={`grid gap-3 sm:grid-cols-2 ${readOnly ? 'xl:grid-cols-4' : 'xl:grid-cols-7'}`}>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-black uppercase text-slate-500">TCP</p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {typeof listing.tcp === 'string' ? listing.tcp : money(listing.tcpAmount || listing.tcp)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-black uppercase text-slate-500">Balance</p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {typeof listing.balance === 'string' ? listing.balance : money(listing.balanceAmount || listing.balance)}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-black uppercase text-emerald-700">Status</p>
              <p className="mt-1 text-sm font-black text-emerald-800">
                {listing.listing_status || '-'}
              </p>
              {listing.rawStatus === 'hold' && listing.heldForName ? (
                <p className="mt-1 text-xs font-black text-amber-700">Held for: {listing.heldForName}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={profileQuery.isFetching}
              className="inline-flex min-h-[68px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
            >
              <FiRefreshCw className={`h-4 w-4 ${profileQuery.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {!readOnly ? <>
            {canEditListingPermission ? <button
              type="button"
              onClick={() => {
                if (isBuyerFormHold) return
                if (isHeld) {
                  if (window.confirm('Unhold this listing and return it to available?')) {
                    unholdListingMutation.mutate()
                  }
                  return
                }

                setShowHoldModal(true)
              }}
              disabled={
                profileQuery.isLoading ||
                holdListingMutation.isPending ||
                unholdListingMutation.isPending ||
                (!canHold && !isHeld) ||
                isBuyerFormHold
              }
              className={`inline-flex min-h-[68px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98] ${
                isHeld
                  ? 'bg-slate-700 hover:bg-slate-800'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isHeld ? <FiUnlock className="h-4 w-4" /> : <FiPauseCircle className="h-4 w-4" />}
              {isBuyerFormHold ? 'Buyer Form Hold' : isHeld ? 'Unhold' : 'Hold'}
            </button> : null}

            {canUpdateBuyerDocuments ? <button
              type="button"
              onClick={() => {
                setGeneratedBuyerFormUrl('')
                setBuyerFormNotice(null)
                setShowBuyerFormLinkModal(true)
              }}
              disabled={!canManageBuyerForm || profileQuery.isLoading}
              className="inline-flex min-h-[68px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
            >
              <FiLink className="h-4 w-4" />
              {hasActiveBuyerFormLink ? 'Manage Form Link' : 'Send Buyer Form'}
            </button> : null}

            {canReservePermission ? <button
              type="button"
              onClick={isBuyerFormHold ? reviewBuyerFormSubmission : openManualReservation}
              disabled={(!canReserveInventory && !isBuyerFormHold) || profileQuery.isLoading}
              className="inline-flex min-h-[68px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
            >
              <FiUserCheck className="h-4 w-4" />
              {isBuyerFormHold ? 'Review Form' : 'Reserve'}
            </button> : null}
            </> : (
              <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-xs font-black uppercase text-blue-700">Account</p>
                <p className="mt-1 text-sm font-black text-blue-950">{account?.accountReference || '-'}</p>
                <p className="mt-1 text-xs font-semibold text-blue-800">{account?.buyerName || listing.buyer_name || '-'}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-black transition active:scale-[0.98] ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </section>

      <TabErrorBoundary resetKey={`${activeTab}-${projectSlug}-${listingId}-${accountId || 'current'}`}>
      {!profileQuery.isLoading && !profileQuery.isError && activeTab === 'unit' ? (
        <UnitStatus
          listing={listing}
          project={project}
          listingDocuments={documents}
          libraryDocuments={documentLibrary}
          projectDefaultDocuments={project.defaultDocuments || []}
          onSave={(payload) => updateListingMutation.mutateAsync(payload)}
          canEditListing={canEditListing}
          canAdjustCommission={canAdjustCommission}
          canChangeAssignedSeller={canChangeAssignedSeller}
          buyerAccountId={account?.id || null}
          onLoadSellerChangeOptions={loadSellerChangeOptions}
          onPreviewSellerChange={previewSellerChange}
          onRequestSellerChange={requestSellerChange}
          onConfirmSellerChange={confirmSellerChange}
          canManageCancellation={canManageCancellation}
          canSettleCancellation={canSettleCancellation}
          canReleaseCancelledUnit={canReleaseCancelledUnit}
          onRequestCancellationCode={(payload) => requestCancellationCodeMutation.mutateAsync(payload)}
          onRequestCommissionAdjustmentCode={(payload) => requestCommissionAdjustmentCodeMutation.mutateAsync(payload)}
          onAdjustCommission={(payload) => adjustCommissionMutation.mutateAsync(payload)}
          canCorrectReservation={canCorrectReservation}
          onCorrectReservation={() => setShowReservationCorrectionModal(true)}
          isSaving={updateListingMutation.isPending}
          isRequestingCancellationCode={requestCancellationCodeMutation.isPending}
          isRequestingCommissionCode={requestCommissionAdjustmentCodeMutation.isPending}
          isAdjustingCommission={adjustCommissionMutation.isPending}
          actorRole={user?.role || ''}
          workflowAuditCaseId={workflowAuditCaseId || null}
          autoOpenEdit={['listing_edit_review', 'listing_documents_update_review'].includes(workflowAction)}
          autoOpenCommissionAdjustment={workflowAction === 'commission_adjustment'}
          autoOpenSellerChange={workflowAction === 'seller_change_review' && !reviewView}
          readOnly={readOnly}
        />
      ) : null}

      {!profileQuery.isLoading && !profileQuery.isError && activeTab === 'client' ? (
        <ClientProfile
          client={client}
          listing={listing}
          onSave={(payload) => updateClientProfileMutation.mutateAsync(payload)}
          isSaving={updateClientProfileMutation.isPending}
          readOnly={readOnly || !canEditBuyerProfile}
          autoOpenEdit={workflowAction === 'buyer_profile_edit_review'}
        />
      ) : null}

      {!profileQuery.isLoading && !profileQuery.isError && activeTab === 'payments' ? (
        <PaymentsSOA
          listing={paymentListing}
          soaRows={soaRows}
          payments={payments}
          readOnly={readOnly}
          canCreate={canCreatePayment}
          canEdit={canEditPayment}
          canDelete={canDeletePayment}
          profileQueryKey={profileKey}
        />
      ) : null}

      {!profileQuery.isLoading && !profileQuery.isError && activeTab === 'documents' ? (
        <Documents
          documents={documents}
          canManage={canManageDocuments}
          canEditRequirements={Boolean(canEditListingRequirements && (listing.id || listing.routeId || listingId))}
          projectSlug={projectSlug}
          listingId={listingId}
          project={project}
          listing={listing}
          client={client}
          libraryDocuments={documentLibrary}
          projectDefaultDocuments={project.defaultDocuments || []}
          documentTemplates={documentTemplates}
          templateDocuments={templateDocuments}
          onUploadDocument={(document, payload) => uploadDocumentMutation.mutateAsync({ document, payload })}
          onApproveDocument={(document) => approveDocumentMutation.mutateAsync(document)}
          onRequestResubmission={(document, payload) => requestDocumentResubmissionMutation.mutateAsync({ document, payload })}
          onClearDocument={(document) => clearDocumentMutation.mutateAsync(document)}
          onSaveRequirements={(nextDocuments) => updateDocumentRequirementsMutation.mutateAsync(nextDocuments)}
          isSaving={
            uploadDocumentMutation.isPending ||
            approveDocumentMutation.isPending ||
            requestDocumentResubmissionMutation.isPending ||
            clearDocumentMutation.isPending
          }
          isSavingRequirements={updateDocumentRequirementsMutation.isPending}
          readOnly={readOnly}
        />
      ) : null}

      {!profileQuery.isLoading && !profileQuery.isError && activeTab === 'accounts' ? (
        <AccountHistoryPanel
          projectSlug={projectSlug}
          listingId={listingId}
          canPermanentlyDelete={currentUserData?.user?.role === 'super_admin'}
        />
      ) : null}

      {!profileQuery.isLoading && !profileQuery.isError && activeTab === 'printouts' ? (
        <Printouts
          projectSlug={projectSlug}
          project={project}
          listing={listing}
          client={client}
          soaRows={soaRows}
          payments={payments}
          documents={documents}
          account={account}
          readOnly={readOnly}
          autoOpenAcknowledgements={workflowAction === 'signed_receipt_review'}
          workflowPaymentId={Number(searchParams.get('paymentId') || 0)}
          workflowReviewId={workflowReviewId || null}
          workflowAuditCaseId={workflowAuditCaseId || null}
        />
      ) : null}
      </TabErrorBoundary>

      {!readOnly && showReservationCorrectionModal ? (
        <ReservationCorrectionModal
          open
          projectSlug={projectSlug}
          listingId={listingId}
          actorRole={user?.role || ''}
          auditCaseId={workflowAuditCaseId || null}
          onClose={() => setShowReservationCorrectionModal(false)}
          onCorrected={(result) => {
            const destinationId = result?.data?.destinationListingId
            setShowReservationCorrectionModal(false)
            queryClient.invalidateQueries({ queryKey: ['lot-listings', projectSlug] })
            queryClient.invalidateQueries({ queryKey: ['lot-dashboard', projectSlug] })
            queryClient.invalidateQueries({ queryKey: ['system-reports'] })
            if (destinationId) navigate(`/portal/lot-projects/${projectSlug}/listings/${destinationId}`)
          }}
        />
      ) : null}

      {!readOnly && canEditListingPermission && showHoldModal ? (
        <HoldListingModal
          listing={listing}
          isSaving={holdListingMutation.isPending}
          onClose={() => setShowHoldModal(false)}
          onSubmit={(payload) => holdListingMutation.mutateAsync(payload)}
        />
      ) : null}

      {!readOnly && canReservePermission && showReserveModal ? (
        <ReserveListingModal
          listing={listing}
          client={reserveMode === 'submission-review' ? pendingBuyerFormSubmission?.submittedPayload || {} : client}
          mode={reserveMode}
          buyerFormSubmissionId={reserveMode === 'submission-review' ? pendingBuyerFormSubmission?.id : null}
          submissionMeta={reserveMode === 'submission-review' ? pendingBuyerFormSubmission : null}
          onClose={() => {
            setShowReserveModal(false)
            setReserveMode('manual')
          }}
          project={project}
          documentLibrary={documentLibrary}
          listingDocuments={documents}
          projectDefaultDocuments={project.defaultDocuments || []}
          documentTemplates={documentTemplates}
          templateDocuments={templateDocuments}
          isLoadingDocuments={reserveDocumentsQuery.isLoading || reserveTemplatesQuery.isLoading}
          onReserve={handleReserveListing}
        />
      ) : null}


      {reviewView ? <ReviewLiveRecordPanel
        entityType={reviewEntityType}
        reviewId={workflowReviewId}
        record={reviewRecord}
        loading={profileQuery.isLoading}
        error={profileQuery.isError ? 'You cannot access this record, or it is no longer available.' : !profileQuery.isLoading && !exactAccount ? 'This buyer account does not match the requested review record.' : !profileQuery.isLoading && !exactListing ? 'This listing does not match the requested review record.' : !profileQuery.isLoading && !reviewRecord ? 'The exact record was not found. Return to Review Center to see its saved history.' : ''}
        onDismiss={() => setSearchParams(dismissReviewRecordQuery(searchParams), { replace: true })}
        onBackToReview={() => navigate(`/portal/${user?.role || 'super_admin'}/review-center/reviews/${workflowReviewId}`)}
      /> : null}
      {!readOnly && canUpdateBuyerDocuments && showBuyerFormLinkModal ? (
        <BuyerFormLinkModal
          listing={listing}
          currentLink={currentBuyerFormLink}
          generatedUrl={generatedBuyerFormUrl}
          notice={buyerFormNotice}
          isSaving={createBuyerFormLinkMutation.isPending || revokeBuyerFormLinkMutation.isPending}
          onGenerate={(payload) => createBuyerFormLinkMutation.mutate(payload)}
          onRevoke={(link) => {
            if (window.confirm('Revoke this buyer form link? The buyer will no longer be able to submit it.')) {
              revokeBuyerFormLinkMutation.mutate(link)
            }
          }}
          onClearNotice={() => setBuyerFormNotice(null)}
          onClose={() => {
            setShowBuyerFormLinkModal(false)
            setBuyerFormNotice(null)
            setGeneratedBuyerFormUrl('')
          }}
        />
      ) : null}
    </main>
  )
}

export default ListingProfile




