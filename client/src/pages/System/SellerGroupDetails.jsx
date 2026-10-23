import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FiArrowLeft,
  FiBriefcase,
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
  FiClipboard,
  FiDollarSign,
  FiClock,
  FiTool,
  FiEdit2,
  FiEye,
  FiExternalLink,
  FiMail,
  FiMapPin,
  FiPhone,
  FiRepeat,
  FiSearch,
  FiShoppingBag,
  FiTrendingUp,
  FiUserPlus,
  FiUsers,
} from 'react-icons/fi'
import PageHeader from '../../components/Shared/PageHeader'
import ReviewLiveRecordPanel from '../../components/Shared/ReviewLiveRecordPanel'
import ReviewReturnLink from '../../components/Shared/ReviewReturnLink'
import { dismissReviewRecordQuery } from '../../utils/reviewRecordNavigation'
import StatusAlert from '../../components/Shared/StatusAlert'
import EditGroupModal from '../../components/System/sellerGroupComponents/EditGroupModal'
import SellerSetupCheck from '../../components/System/sellerGroupComponents/SellerSetupCheck'
import ReplaceManagerModal from '../../components/System/sellerGroupComponents/ReplaceManagerModal'
import ManagerReplacementHistory from '../../components/System/sellerGroupComponents/ManagerReplacementHistory'
import NetworkMemberImportModal from '../../components/System/sellerGroupComponents/NetworkMemberImportModal'
import NetworkMemberImportHistoryModal from '../../components/System/sellerGroupComponents/NetworkMemberImportHistoryModal'
import NetworkMemberToolsModal from '../../components/System/sellerGroupComponents/NetworkMemberToolsModal'
import BulkEditMembersModal from '../../components/System/sellerGroupComponents/BulkEditMembersModal'
import CreateUserModal from '../../components/System/userComponents/CreateUserModal'
import EditUserModal from '../../components/System/userComponents/EditUserModal'
import DeactivateSystemUserModal from '../../components/System/userComponents/DeactivateSystemUserModal'
import ReactivateSystemUserModal from '../../components/System/userComponents/ReactivateSystemUserModal'
import { getSellerRoleLabel } from '../../config/sellerRoles'
import { getTeamCompletenessLabel, getTeamCompletenessHint } from '../../utils/sellerTeamStatus'
import { useFetch as fetchJson } from '../../utils/useFetch'
import useCurrentUser from '../../utils/useCurrentUser'
import { PERMISSIONS, hasPermission } from '../../config/permissions'
import { exportNetworkMembersWorkbook } from '../../utils/networkMemberExcel'

const money = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const formatDate = (value) => {
  const [year, month, day] = String(value || '')
    .slice(0, 10)
    .split('-')
    .map(Number)

  if (!year || !month || !day) return '-'

  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day))
}

const formatSaleStatus = (value) =>
  String(value || 'active')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const saleStatusClasses = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  pending_cancellation: 'bg-amber-50 text-amber-700 ring-amber-100',
  closed_fully_paid: 'bg-blue-50 text-blue-700 ring-blue-100',
  closed: 'bg-blue-50 text-blue-700 ring-blue-100',
}

const toDateInput = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

const defaultRange = () => ({
  from: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)),
  to: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)),
})

const MEMBERS_PER_PAGE = 5

const summaryToneClasses = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
}

const SummaryCard = ({ icon: Icon, label, value, helper, tone = 'blue' }) => (
  <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-950">
          {value}
        </p>
        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{helper}</p>
      </div>

      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${summaryToneClasses[tone]}`}
      >
        <Icon className="h-4 w-4" />
      </span>
    </div>
  </article>
)

const rateCardColorClasses = {
  blue: {
    card: 'border-blue-200 bg-blue-50/80',
    label: 'text-blue-600',
    value: 'text-blue-950',
    helper: 'text-blue-700',
    icon: 'text-blue-700 ring-blue-100',
  },
  purple: {
    card: 'border-purple-200 bg-purple-50/80',
    label: 'text-purple-600',
    value: 'text-purple-950',
    helper: 'text-purple-700',
    icon: 'text-purple-700 ring-purple-100',
  },
  yellow: {
    card: 'border-yellow-200 bg-yellow-50/80',
    label: 'text-yellow-700',
    value: 'text-yellow-950',
    helper: 'text-yellow-700',
    icon: 'text-yellow-700 ring-yellow-100',
  },
  gray: {
    card: 'border-gray-200 bg-gray-50/80',
    label: 'text-gray-600',
    value: 'text-gray-950',
    helper: 'text-gray-700',
    icon: 'text-gray-700 ring-gray-200',
  },
  green: {
    card: 'border-green-200 bg-green-50/80',
    label: 'text-green-600',
    value: 'text-green-950',
    helper: 'text-green-700',
    icon: 'text-green-700 ring-green-100',
  },
}

const RateCard = ({ label, value, helper, bgColor = 'blue' }) => {
  const colors = rateCardColorClasses[bgColor] || rateCardColorClasses.blue

  return (
    <article className={`rounded-2xl border p-5 ${colors.card}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.08em] ${colors.label}`}
          >
            {label}
          </p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${colors.value}`}>
            {Number(value || 0).toFixed(4)}%
          </p>
          <p className={`mt-1 text-xs font-medium ${colors.helper}`}>{helper}</p>
        </div>

        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ${colors.icon}`}
        >
          <FiTrendingUp className="h-4 w-4" />
        </span>
      </div>
    </article>
  )
}

const ContactItem = ({ icon: Icon, label, value, wide = false }) => (
  <div className={`flex min-w-0 items-start gap-3 ${wide ? 'md:col-span-2 xl:col-span-1' : ''}`}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
      <Icon className="h-4 w-4" />
    </span>

    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-slate-800">
        {value || '-'}
      </p>
    </div>
  </div>
)

const DetailItem = ({ label, children }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
      {label}
    </p>
    <div className="mt-1 text-sm font-semibold text-slate-900">{children}</div>
  </div>
)

const SectionHeading = ({ title, description, actions }) => (
  <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h2 className="text-base font-bold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
    </div>
    {actions}
  </div>
)

const SellerGroupDetails = ({ expectedGroupType }) => {
  const { groupId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const portalRole = location.pathname.split('/')[2] || 'super_admin'
  const rootPath = `/portal/${portalRole}`
  const [alert, setAlert] = useState(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [showSellerSetupCheck, setShowSellerSetupCheck] = useState(false)
  const [memberPage, setMemberPage] = useState(1)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [assignmentContext, setAssignmentContext] = useState(null)
  const [showMemberTools, setShowMemberTools] = useState(false)
  const [showBulkEditMembers, setShowBulkEditMembers] = useState(false)
  const [showMemberImport, setShowMemberImport] = useState(false)
  const [showImportHistory, setShowImportHistory] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [sellerStatusModal, setSellerStatusModal] = useState(null)
  const [sellerStatusTarget, setSellerStatusTarget] = useState(null)
  const [replaceManager, setReplaceManager] = useState(null)
  const [showReplacementHistory, setShowReplacementHistory] = useState(false)
  const [showEditGroupModal, setShowEditGroupModal] = useState(false)
  const [range, setRange] = useState(defaultRange)
  const [isExportingMembers, setIsExportingMembers] = useState(false)
  const workflowAutoOpenedRef = useRef(false)
  const workflowAction = searchParams.get('workflowAction') || ''
  const reviewView = searchParams.get('reviewView') === '1'
  const reviewEntityType = searchParams.get('reviewEntityType') || ''
  const reviewAccreditedSellerId = Number(searchParams.get('accreditedSellerId') || 0)
  const workflowReviewId = Number(searchParams.get('reviewId') || 0) || null
  const dismissedReviewId = Number(searchParams.get('reviewReturnId') || 0)
  const workflowAuditCaseId = Number(searchParams.get('auditCaseId') || 0) || null
  const workflowSellerId = Number(searchParams.get('sellerId') || 0) || null
  const selectedProjectId = Number(searchParams.get('project') || 0)
  const { data: currentUserData } = useCurrentUser()
  const actor = currentUserData?.user
  const canAddMember = hasPermission(actor, PERMISSIONS.SYSTEM_USERS_CREATE)
  const canEditSeller = hasPermission(actor, PERMISSIONS.SYSTEM_USERS_EDIT)
  const canEditNetwork = hasPermission(actor, PERMISSIONS.SYSTEM_SELLER_GROUPS_MANAGE)
  const canImportMembers = hasPermission(actor, PERMISSIONS.SYSTEM_SELLER_GROUPS_MANAGE)
    && hasPermission(actor, PERMISSIONS.SYSTEM_USERS_CREATE)
    && hasPermission(actor, PERMISSIONS.SYSTEM_USERS_EDIT)
  const canExportMembers = hasPermission(actor, PERMISSIONS.SYSTEM_SELLER_GROUPS_VIEW)
  const canCheckSellerSetup = ['super_admin','system_admin'].includes(actor?.role) && canExportMembers
  const canChangeSellerStatus = ['super_admin','system_admin'].includes(actor?.role)

  const exportMembers = async () => {
    setIsExportingMembers(true)
    setAlert({ type: 'loading', message: 'Preparing the Network member export...' })
    try {
      const result = await fetchJson(`/seller-groups/${groupId}`)
      const count = exportNetworkMembersWorkbook({
        network: result?.data?.group || {},
        members: result?.data?.members || [],
        projectRates: result?.data?.group?.project_rates || [],
      })
      setAlert({ type: 'success', message: `${count} member${count === 1 ? '' : 's'} exported.` })
    } catch (error) {
      setAlert({ type: 'error', message: error?.message || 'Could not export this Network.' })
    } finally {
      setIsExportingMembers(false)
    }
  }

  const projectOptionsQuery = useQuery({
    queryKey: ['seller-group-project-options', Number(groupId)],
    queryFn: () => fetchJson(`/seller-groups/${groupId}/projects`),
    enabled: Boolean(groupId),
  })

  const accreditedProjects = useMemo(
    () => projectOptionsQuery.data?.data || [],
    [projectOptionsQuery.data]
  )
  const groupOption = projectOptionsQuery.data?.group || {}
  const groupType = groupOption.type || expectedGroupType || 'in_house'
  const isExternal = groupType === 'external'
  const teamQuery = useQuery({
    queryKey: ['seller-team-completeness', Number(groupId)],
    queryFn: () => fetchJson(`/seller-groups/${groupId}/team-completeness`),
    enabled: Boolean(groupId) && !isExternal && Boolean(actor), staleTime: 0,
  })
  const teamByUserId = useMemo(() => new Map((teamQuery.data?.data?.records || []).map((team) => [Number(team.userId), team])), [teamQuery.data])
  const [teamFilter, setTeamFilter] = useState('all')
  const groupsPath = `${rootPath}/accredited/groups/${isExternal ? 'external' : 'in-house'}`

  // Old bookmarks and legacy Review Center links may contain the wrong section.
  // Correct the address to the network's verified type without dropping the
  // reviewId, workflowAction, project, or audit-case context.
  useEffect(() => {
    if (!expectedGroupType || !['in_house', 'external'].includes(groupOption.type) || expectedGroupType === groupOption.type) return
    const correctSection = groupOption.type === 'external' ? 'external' : 'in-house'
    navigate(`${rootPath}/accredited/groups/${correctSection}/${groupId}${location.search}`, { replace: true })
  }, [expectedGroupType, groupOption.type, groupId, location.search, navigate, rootPath])

  useEffect(() => {
    if (!accreditedProjects.length || (reviewView && reviewEntityType === 'seller_group_project_rates')) return

    if (
      !accreditedProjects.some(
        (project) => Number(project.lot_project_id) === selectedProjectId
      )
    ) {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('project', String(accreditedProjects[0].lot_project_id))
        return next
      }, { replace: true })
    }
  }, [accreditedProjects, selectedProjectId, setSearchParams, reviewView, reviewEntityType])

  const configurationQuery = useQuery({
    queryKey: [
      'seller-group-project-configuration',
      Number(groupId),
      selectedProjectId,
    ],
    queryFn: () =>
      fetchJson(`/seller-groups/${groupId}/projects/${selectedProjectId}`),
    enabled: Boolean(groupId && selectedProjectId),
    placeholderData: (previous) => previous,
  })

  const analyticsQuery = useQuery({
    queryKey: [
      'seller-group-project-analytics',
      Number(groupId),
      selectedProjectId,
      range.from,
      range.to,
    ],
    queryFn: () =>
      fetchJson(
        `/seller-groups/${groupId}/projects/${selectedProjectId}/analytics?${new URLSearchParams(
          range
        )}`
      ),
    enabled: Boolean(groupId && selectedProjectId && range.from && range.to),
    placeholderData: (previous) => previous,
  })

  const configuration = configurationQuery.data?.data || null
  const group = configuration?.group || {
    id: Number(groupId),
    name: groupOption.name || 'Network',
    type: groupType,
    status: groupOption.status,
    projectRates: accreditedProjects,
  }
  const project =
    configuration?.project ||
    accreditedProjects.find(
      (item) => Number(item.lot_project_id) === selectedProjectId
    ) ||
    {}
  const fixedRates = configuration?.fixedRates || {}
  const members = useMemo(
    () =>
      (configuration?.members || []).filter((member) => !member.is_system_dummy),
    [configuration]
  )
  const hierarchyHead = useMemo(
    () => members.find((member) => Number(member.user_id) === Number(group.headUserId || 0)) || null,
    [members, group.headUserId]
  )

  useEffect(() => {
    if (workflowAutoOpenedRef.current) return
    if (['network_edit_review', 'network_status_review', 'network_rates_review'].includes(workflowAction) && configuration) {
      workflowAutoOpenedRef.current = true
      setShowEditGroupModal(true)
      return
    }
    if (workflowAction === 'seller_edit_review' && workflowSellerId && members.length) {
      const member = members.find((item) => Number(item.user_id) === workflowSellerId)
      if (!member) return
      workflowAutoOpenedRef.current = true
      setSelectedMember({
        ...member,
        id: Number(member.user_id),
        status: member.user_status || member.accredited_seller_status,
        seller_group_id: Number(group.id || groupId),
        reports_under_user_id: member.accredited_seller_reports_under_user_id || '',
      })
    }
  }, [configuration, group.id, groupId, members, workflowAction, workflowSellerId])
  const analytics = analyticsQuery.data?.data?.summary || {}
  const recentSales = analyticsQuery.data?.data?.recentSales || []
  const filteredMembers = useMemo(() => {
    const key = memberSearch.trim().toLowerCase()

    const byTeam = teamFilter === 'all' ? members : members.filter((member) => teamByUserId.get(Number(member.user_id))?.status === teamFilter)
    return key
      ? byTeam.filter((member) =>
          `${member.display_name} ${member.full_name} ${member.role} ${member.reports_under_name}`
            .toLowerCase()
            .includes(key)
        )
      : byTeam
  }, [members, memberSearch, teamFilter, teamByUserId])

  const memberTotalPages = Math.max(
    Math.ceil(filteredMembers.length / MEMBERS_PER_PAGE),
    1
  )
  const memberPageStart = (memberPage - 1) * MEMBERS_PER_PAGE
  const memberPageEnd = Math.min(
    memberPageStart + MEMBERS_PER_PAGE,
    filteredMembers.length
  )
  const paginatedMembers = filteredMembers.slice(memberPageStart, memberPageEnd)

  useEffect(() => {
    setMemberPage((currentPage) => Math.min(currentPage, memberTotalPages))
  }, [memberTotalPages])

  useEffect(() => {
    setMemberPage(1)
  }, [selectedProjectId, groupId])

  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: ['seller-group-project-options', Number(groupId)],
    })
    queryClient.invalidateQueries({
      queryKey: ['seller-group-project-configuration', Number(groupId)],
    })
    queryClient.invalidateQueries({
      queryKey: ['seller-group-project-analytics', Number(groupId)],
    })
    queryClient.invalidateQueries({ queryKey: ['seller-team-completeness', Number(groupId)] })
    queryClient.invalidateQueries({ queryKey: ['seller-setup-check', Number(groupId)] })
    queryClient.invalidateQueries({ queryKey: ['seller-groups'] })
    queryClient.invalidateQueries({ queryKey: ['reservation-agents'] })
    queryClient.invalidateQueries({ queryKey: ['commission-preview'] })
  }

  const selectedGroupForEdit = {
    seller_group_id: group.id || Number(groupId),
    seller_group_type: group.type || groupType,
    seller_group_name: group.name || groupOption.name,
    seller_group_head_user_id: group.headUserId,
    seller_group_head_role: group.headRole,
    seller_group_description: group.description,
    broker_name: group.brokerName || '',
    broker_license_number: group.brokerLicenseNumber || '',
    realty_name: group.realtyName || '',
    broker_prc_number: group.brokerPrcNumber || '',
    seller_group_status: group.status || groupOption.status,
    seller_group_external_account_user_id: group.externalAccountUserId,
    external_account_user_id: group.externalAccountUserId,
    external_account_first_name: group.externalAccount?.firstName,
    external_account_middle_name: group.externalAccount?.middleName,
    external_account_last_name: group.externalAccount?.lastName,
    external_account_email: group.externalAccount?.email,
    external_account_contact_no: group.externalAccount?.contactNo,
    external_account_tin_no: group.externalAccount?.tinNo,
    external_account_prc_no: group.externalAccount?.prcNo,
    external_account_address: group.externalAccount?.address,
    project_rates: group.projectRates || accreditedProjects,
  }

  return (
    <main className="flex flex-col gap-5">
      <ReviewReturnLink role={portalRole} reviewId={dismissedReviewId} />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <PageHeader
            title={
              group.name ||
              groupOption.name ||
              (isExternal ? 'External Network' : 'In-House Network')
            }
            description={
              isExternal
                ? 'External network account, project pool rate, sales, commissions, and releases.'
                : 'Internal hierarchy, pool distribution, company profit, sales, commissions, and releases.'
            }
            icon={FiUsers}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <NavLink
            to={groupsPath}
            aria-label="Back to networks"
            className="flex h-11 w-fit px-4 text-sm items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
          >
            <FiArrowLeft /> Back
          </NavLink>

          {!isExternal && canCheckSellerSetup ? (
            <button type="button" onClick={() => setShowSellerSetupCheck(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <FiClipboard/> Check Seller Setup
            </button>
          ) : null}

          {!isExternal && canCheckSellerSetup ? <button type="button" onClick={()=>setShowReplacementHistory(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FiClock/> Replacement History</button>:null}
          {!isExternal && canAddMember ? (
            <button
              type="button"
              onClick={() => setShowCreateUser(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <FiUserPlus />
              Add Member
            </button>
          ) : null}

          {/* Consolidate the three member actions without changing their permissions or flows. */}
          {!isExternal && (canImportMembers || canExportMembers) ? (
            <button
              type="button"
              onClick={() => setShowMemberTools(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              <FiTool /> Member Tools
            </button>
          ) : null}

          {canEditNetwork ? <button
            type="button"
            onClick={() => setShowEditGroupModal(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <FiEdit2 />
            Edit Network
          </button> : null}
        </div>
      </div>

      {alert ? (
        <StatusAlert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      ) : null}

      {projectOptionsQuery.isLoading || configurationQuery.isLoading ? (
        <StatusAlert type="loading" message="Loading network details..." />
      ) : null}

      {projectOptionsQuery.isError || configurationQuery.isError ? (
        <StatusAlert
          type="error"
          message={
            projectOptionsQuery.error?.message ||
            configurationQuery.error?.message ||
            'Failed to load network details.'
          }
        />
      ) : null}


      
      {configuration ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
              <DetailItem label="Network Type">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                  <FiBriefcase className="h-3.5 w-3.5" />
                  {isExternal ? 'External Network' : 'In-House Network'}
                </span>
              </DetailItem>

              <DetailItem label="Status">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${group.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-red-50 text-red-700 ring-red-100'}`}>
                  {group.status === 'active' ? <FiCheckCircle className="h-3.5 w-3.5"/> : <FiXCircle className="h-3.5 w-3.5"/>}
                  {group.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </DetailItem>

              <DetailItem label="Broker Name">
                {group.brokerName || '-'}
              </DetailItem>

              <DetailItem label="Realty Name">
                {group.realtyName || '-'}
              </DetailItem>

              <DetailItem label="Broker License Number">
                {group.brokerLicenseNumber || '-'}
              </DetailItem>

              <DetailItem label="PRC Number">
                {group.brokerPrcNumber || '-'}
              </DetailItem>

              <DetailItem label={isExternal ? 'Representative' : 'Internal Hierarchy Head'}>
                {isExternal
                  ? group.externalAccount?.fullName || '-'
                  : group.headName || 'No hierarchy head assigned'}
              </DetailItem>

              <DetailItem label="Accredited Projects">
                {accreditedProjects.length}
              </DetailItem>
            </div>

            {isExternal ? (
              <div className="grid gap-5 border-t border-slate-100 bg-slate-50/60 p-5 md:grid-cols-2 xl:grid-cols-[0.8fr_0.7fr_1.8fr]">
                <ContactItem
                  icon={FiMail}
                  label="Email"
                  value={group.externalAccount?.email}
                />
                <ContactItem
                  icon={FiPhone}
                  label="Contact Number"
                  value={group.externalAccount?.contactNo}
                />
                <ContactItem
                  icon={FiMapPin}
                  label="Address"
                  value={group.externalAccount?.address}
                  wide
                />
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <SectionHeading
              title="Project Commission Structure"
              description={
                isExternal
                  ? 'The Pool Rate is the full commission assigned to this Network.'
                  : 'Company Profit is retained first; the remaining pool is automatically distributed using the configured position shares.'
              }
              actions={
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Project
                  </span>
                  <select
                    value={selectedProjectId || ''}
                    onChange={(event) =>
                      setSearchParams(
                        { project: event.target.value },
                        { replace: true }
                      )
                    }
                    className="h-10 min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="" disabled>
                      Select project
                    </option>
                    {accreditedProjects.map((item) => (
                      <option key={item.lot_project_id} value={item.lot_project_id}>
                        {item.lot_project_name}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />

            <div
              className={`grid gap-4 p-5 ${
                isExternal ? 'max-w-2xl' : 'sm:grid-cols-2 xl:grid-cols-4'
              }`}
            >
              <RateCard
                label="Pool Rate"
                value={fixedRates.poolRate}
                helper={project.lot_project_name || 'Selected project'}
                bgColor="blue"
              />

              {!isExternal ? (
                <>
                  <RateCard
                    label="Company Profit (CP)"
                    value={fixedRates.companyProfitRate}
                    helper="Actual rate retained by the company"
                    bgColor="gray"
                  />
                  <RateCard
                    label="Distributable Pool"
                    value={fixedRates.distributionPoolRate}
                    helper="Pool Rate less Company Profit"
                    bgColor="green"
                  />
                  <RateCard
                    label="Division Manager"
                    value={fixedRates.divisionManagerRate}
                    helper={`${Number(fixedRates.poolShares?.division_manager || 0).toFixed(2)}% of distributable pool`}
                    bgColor="purple"
                  />
                  <RateCard
                    label="Sales Director"
                    value={fixedRates.salesDirectorRate}
                    helper={`${Number(fixedRates.poolShares?.sales_director || 0).toFixed(2)}% of distributable pool`}
                    bgColor="yellow"
                  />
                  <RateCard
                    label="Unit Manager"
                    value={fixedRates.unitManagerRate}
                    helper={`${Number(fixedRates.poolShares?.unit_manager || 0).toFixed(2)}% of distributable pool`}
                    bgColor="gray"
                  />
                  <RateCard
                    label="Sales Agent"
                    value={fixedRates.salesAgentRate}
                    helper={`${Number(fixedRates.poolShares?.sales_agent || 0).toFixed(2)}% of distributable pool`}
                    bgColor="green"
                  />
                </>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <SectionHeading
              title="Performance"
              description="Released commissions are grouped by actual release date."
              actions={
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      From
                    </span>
                    <input
                      type="date"
                      value={range.from}
                      onChange={(event) =>
                        setRange((current) => ({
                          ...current,
                          from: event.target.value,
                        }))
                      }
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      To
                    </span>
                    <input
                      type="date"
                      value={range.to}
                      onChange={(event) =>
                        setRange((current) => ({
                          ...current,
                          to: event.target.value,
                        }))
                      }
                      className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    />
                  </label>
                </div>
              }
            />

            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <SummaryCard
                icon={FiUsers}
                label={isExternal ? 'Network Accounts' : 'Active Members'}
                value={
                  isExternal ? 1 : configuration.summary?.activeMembers || 0
                }
                helper={isExternal ? 'One account' : 'Active in-house sellers'}
                tone="blue"
              />
              <SummaryCard
                icon={FiShoppingBag}
                label="Sales"
                value={analytics.salesCount || 0}
                helper="Reserved accounts"
                tone="violet"
              />
              <SummaryCard
                icon={FiDollarSign}
                label="Sales Value"
                value={money(analytics.salesAmount)}
                helper="Total contract price"
                tone="cyan"
              />
              <SummaryCard
                icon={FiTrendingUp}
                label="Gross Commission"
                value={money(analytics.grossCommission)}
                helper="Accumulated commission"
                tone="amber"
              />
              <SummaryCard
                icon={FiDollarSign}
                label="Released"
                value={money(analytics.releasedCommission)}
                helper="Commission already paid"
                tone="emerald"
              />
              <SummaryCard
                icon={FiDollarSign}
                label="Remaining"
                value={money(analytics.remainingCommission)}
                helper="Commission not yet released"
                tone="slate"
              />
            </div>

            {analyticsQuery.isLoading ? (
              <div className="px-5 pb-5">
                <StatusAlert type="loading" message="Loading performance..." />
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <SectionHeading
              title="Recent Sales"
              description={`Latest reserved accounts for ${project.name || project.lot_project_name || 'the selected project'}.`}
            />

            {analyticsQuery.isLoading ? (
              <div className="p-5">
                <StatusAlert type="loading" message="Loading recent sales..." />
              </div>
            ) : analyticsQuery.isError ? (
              <div className="p-5">
                <StatusAlert
                  type="error"
                  message={analyticsQuery.error?.message || 'Failed to load recent sales.'}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      {[
                        'Reservation Date',
                        'Unit',
                        'Buyer',
                        'Selling Seller',
                        'Contract Price',
                        'Status',
                        'Action',
                      ].map((head) => (
                        <th
                          key={head}
                          className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {recentSales.map((sale) => {
                      const projectSlug =
                        sale.projectSlug ||
                        project.lot_project_slug ||
                        project.slug
                      const unitPath = projectSlug
                        ? `/portal/lot-projects/${projectSlug}/listings/${sale.listingId}${
                            sale.accountId ? `/accounts/${sale.accountId}` : ''
                          }`
                        : null
                      const statusKey = String(sale.status || 'active').toLowerCase()

                      return (
                        <tr
                          key={`${sale.accountId || 'profile'}-${sale.profileId}`}
                          className="transition hover:bg-slate-50/60"
                        >
                          <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-600">
                            {formatDate(sale.saleDate)}
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-950">
                            {sale.unitId || '-'}
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-900">
                              {sale.buyerName || 'Buyer'}
                            </p>
                            {sale.accountReference ? (
                              <p className="mt-1 text-xs font-medium text-slate-400">
                                {sale.accountReference}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-700">
                            {sale.sellerName || '-'}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-950">
                            {money(sale.contractPrice)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                                saleStatusClasses[statusKey] ||
                                'bg-slate-100 text-slate-700 ring-slate-200'
                              }`}
                            >
                              {formatSaleStatus(sale.status)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {unitPath ? (
                              <NavLink
                                to={unitPath}
                                target='_blank'
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                              >
                                View Unit
                                <FiExternalLink className="h-3.5 w-3.5" />
                              </NavLink>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">
                                Unit link unavailable
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}

                    {!recentSales.length ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-10 text-center font-medium text-slate-500"
                        >
                          No sales found for this group and project.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {isExternal ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <SectionHeading
                title="External Network Account"
                description="This single account receives all commissions for the group."
              />

              <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Name">
                  {group.externalAccount?.fullName || '-'}
                </DetailItem>
                <DetailItem label="Email">
                  {group.externalAccount?.email || '-'}
                </DetailItem>
                <DetailItem label="TIN">
                  {group.externalAccount?.tinNo || '-'}
                </DetailItem>
                <DetailItem label="Login">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                      group.externalAccount?.canLogin
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                        : 'bg-slate-100 text-slate-600 ring-slate-200'
                    }`}
                  >
                    {group.externalAccount?.canLogin ? 'Enabled' : 'Disabled'}
                  </span>
                </DetailItem>
              </div>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <SectionHeading
                title="In-House Members"
                description="Check reporting managers and the completeness of their teams. Division Managers report directly to the Developer."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Team completeness <select aria-label="Filter by team completeness" value={teamFilter} onChange={(event) => { setTeamFilter(event.target.value); setMemberPage(1) }} className="ml-2 rounded-lg border border-slate-200 bg-white p-2 text-sm"><option value="all">All</option><option value="needs_assignment">Needs Attention</option><option value="partial">Some Teams Incomplete</option><option value="complete">Team Complete</option><option value="inactive">Inactive</option></select></label>
                  <label className="relative block w-full lg:w-80">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={memberSearch}
                      onChange={(event) => {
                        setMemberSearch(event.target.value)
                        setMemberPage(1)
                      }}
                      placeholder="Search sellers or managers"
                      className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    />
                  </label>
                  </div>
                }
              />

              {teamQuery.data?.data?.summary ? <div className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-600"><span>Complete manager teams: {teamQuery.data.data.summary.complete}</span><span>Managers needing attention: {teamQuery.data.data.summary.needsAssignment}</span><span>Some teams incomplete: {teamQuery.data.data.summary.partial}</span><span>Inactive managers: {teamQuery.data.data.summary.inactive}</span><span>Agents with assignment issues: {teamQuery.data.data.summary.agentsNeedingManager}</span></div> : null}
              {teamQuery.isError ? <p className="p-3 text-xs text-amber-700">Team completeness unavailable. Refresh to try again.</p> : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      {['Seller', 'Position', 'Reports Under', 'Status', 'Team Completeness', 'Actions'].map(
                        (head) => (
                          <th
                            key={head}
                            className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500"
                          >
                            {head}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedMembers.map((member) => (
                      <tr
                        key={member.accredited_seller_id}
                        className="transition hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-4 font-semibold text-slate-950">
                          {member.display_name}
                          {member.role === 'division_manager' && Number(member.user_id) === Number(group.headUserId) ? (
                            <span className="ml-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-200">Network Head</span>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-700">
                          {getSellerRoleLabel(member.role)}
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-700">
                          {member.reports_under_name ||
                            ((member.role === 'division_manager' || Number(member.user_id) === Number(group.headUserId))
                              ? 'Developer'
                              : 'Not assigned')}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${member.user_status === 'active' && member.accredited_seller_status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-red-50 text-red-700 ring-red-100'}`}>
                            {member.user_status === 'active' && member.accredited_seller_status === 'active' ? <FiCheckCircle/> : <FiXCircle/>}
                            {member.user_status === 'active' && member.accredited_seller_status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                          {member.user_status !== member.accredited_seller_status && <span className="mt-1 flex items-center gap-1 text-xs text-amber-700"><FiAlertTriangle/> Statuses do not match</span>}
                        </td>
                        <td className="px-5 py-4">
                          {(() => {
                            const team = teamByUserId.get(Number(member.user_id))
                            if (!team) return <span className="text-xs text-slate-400">Checking…</span>
                            const label = getTeamCompletenessLabel(team, member.role)
                            return <button type="button" onClick={() => canCheckSellerSetup && setShowSellerSetupCheck(true)} disabled={!canCheckSellerSetup} title={getTeamCompletenessHint(team, member.role)} className={`rounded-full px-2.5 py-1 text-xs font-bold ${team.status === 'complete' ? 'bg-emerald-50 text-emerald-700' : team.status === 'inactive' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>{label}</button>
                          })()}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <NavLink
                            to={`${rootPath}/accredited/groups/in-house/${groupId}/members/${member.user_id}${selectedProjectId ? `?project=${selectedProjectId}` : ''}`}
                            aria-label={`View details for ${member.display_name || member.full_name || 'seller'}`}
                            className="mr-2 inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                          >
                            <FiEye aria-hidden="true" /> View
                          </NavLink>
                          {canEditSeller ? <button
                            type="button"
                            onClick={() => setSelectedMember({
                              ...member,
                              id: Number(member.user_id),
                              status:
                                member.user_status ||
                                member.accredited_seller_status,
                              seller_group_id: Number(group.id || groupId),
                              reports_under_user_id:
                                member.accredited_seller_reports_under_user_id || '',
                            })}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            <FiEdit2 />
                            Edit Seller
                          </button> : null}
                          {canChangeSellerStatus && ['division_manager','sales_director','unit_manager'].includes(member.role) && member.user_status === 'active' && member.accredited_seller_status === 'active' && (
                            <button type="button" onClick={() => setReplaceManager(member)} className="ml-2 inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50"><FiRepeat/> Replace Manager</button>
                          )}
                          {canChangeSellerStatus && !(['division_manager','sales_director','unit_manager'].includes(member.role) && member.user_status === 'active' && member.accredited_seller_status === 'active') && (
                            <button type="button" onClick={() => {setSellerStatusTarget({...member,id:Number(member.user_id),account_code:member.account_code || member.display_name});setSellerStatusModal(member.user_status === 'active' && member.accredited_seller_status === 'active' ? 'deactivate' : 'reactivate')}}
                              disabled={member.user_status === 'active' && member.accredited_seller_status === 'active' && ['division_manager','sales_director','unit_manager'].includes(member.role)}
                              title={['division_manager','sales_director','unit_manager'].includes(member.role) && member.user_status === 'active' && member.accredited_seller_status === 'active' ? 'A replacement manager is required. Available in the team-transfer phase.' : undefined}
                              className={`ml-2 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${member.user_status === 'active' && member.accredited_seller_status === 'active' ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-700'}`}>
                              {member.user_status === 'active' && member.accredited_seller_status === 'active' ? 'Deactivate Seller' : 'Activate Seller'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {!filteredMembers.length ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-10 text-center font-medium text-slate-500"
                        >
                          No members found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {filteredMembers.length ? (
                <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-slate-500">
                    Showing {memberPageStart + 1}-{memberPageEnd} of{' '}
                    {filteredMembers.length} members
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setMemberPage((currentPage) => Math.max(currentPage - 1, 1))
                      }
                      disabled={memberPage === 1}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>

                    <span className="min-w-[96px] text-center text-xs font-bold text-slate-600">
                      Page {memberPage} of {memberTotalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setMemberPage((currentPage) =>
                          Math.min(currentPage + 1, memberTotalPages)
                        )
                      }
                      disabled={memberPage === memberTotalPages}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </>
      ) : null}

      {showMemberTools && !isExternal && (canImportMembers || canExportMembers) ? (
        <NetworkMemberToolsModal
          networkName={group.name || groupOption.name || 'In-House Network'}
          canImportMembers={canImportMembers}
          canExportMembers={canExportMembers}
          canBulkEditMembers={canCheckSellerSetup && hasPermission(actor, PERMISSIONS.SYSTEM_SELLER_GROUPS_BULK_EDIT) && hasPermission(actor, PERMISSIONS.SYSTEM_USERS_EDIT)}
          onBulkEdit={() => { setShowMemberTools(false); setShowBulkEditMembers(true) }}
          isExportingMembers={isExportingMembers}
          onClose={() => setShowMemberTools(false)}
          onImport={() => {
            setShowMemberTools(false)
            setShowMemberImport(true)
          }}
          onUndo={() => {
            setShowMemberTools(false)
            setShowImportHistory(true)
          }}
          onExport={async () => {
            setShowMemberTools(false)
            await exportMembers()
          }}
        />
      ) : null}

      {showBulkEditMembers && !isExternal && canCheckSellerSetup ? <BulkEditMembersModal groupId={Number(group.id || groupId)} members={members} onClose={() => setShowBulkEditMembers(false)} onSaved={(message) => {setAlert({type:'success',message});queryClient.invalidateQueries();}}/> : null}

      {showSellerSetupCheck && !isExternal && canCheckSellerSetup ? (
        <SellerSetupCheck
          groupId={groupId}
          onClose={() => setShowSellerSetupCheck(false)}
          onAssignSeller={canAddMember ? (record) => {
            if (!canAddMember || !record.team?.missingRole) return
            setShowSellerSetupCheck(false)
            setAssignmentContext({ role: record.team.missingRole, parentUserId: record.userId })
            setShowCreateUser(true)
          } : undefined}
          onViewSeller={(userId) => {
            const member = members.find((item) => Number(item.user_id) === Number(userId))
            if (!member) return
            setShowSellerSetupCheck(false)
            setSelectedMember({
              ...member,
              id: Number(member.user_id),
              status: member.user_status,
              seller_group_id: Number(group.id || groupId),
              reports_under_user_id: member.accredited_seller_reports_under_user_id || '',
            })
          }}
        />
      ) : null}

      {showImportHistory ? (
        <NetworkMemberImportHistoryModal
          groupId={Number(group.id || groupId)}
          networkName={group.name || groupOption.name || 'In-House Network'}
          onClose={() => setShowImportHistory(false)}
          onUndone={(message) => {
            setShowImportHistory(false)
            setAlert({ type: 'success', message })
            refresh()
          }}
        />
      ) : null}

      {showMemberImport ? (
        <NetworkMemberImportModal
          groupId={Number(group.id || groupId)}
          networkName={group.name || groupOption.name || 'In-House Network'}
          hierarchyHead={hierarchyHead}
          onClose={() => setShowMemberImport(false)}
          onImported={(result) => {
            setShowMemberImport(false)
            setAlert({ type: 'success', message: result?.message || 'Network members imported successfully.' })
            refresh()
          }}
        />
      ) : null}

      {showCreateUser ? (
        <CreateUserModal
          setShowCreateUser={(open) => { setShowCreateUser(open); if (!open) setAssignmentContext(null) }}
          allowedRoles={assignmentContext ? [assignmentContext.role] : ['division_manager','sales_director','unit_manager','sales_agent']}
          initialReportsUnderUserId={assignmentContext?.parentUserId || ''}
          actorRole={portalRole}
          initialSellerGroupId={String(group.id || groupId)}
          lockSellerGroup
          title={`Add User to ${group.name}`}
          onSaved={(message) => {
            setAlert({ type: 'success', message })
            refresh()
          }}
        />
      ) : null}

      {showReplacementHistory && !isExternal && canCheckSellerSetup ? (
        <ManagerReplacementHistory groupId={Number(group.id || groupId)} networkName={group.name} onClose={() => setShowReplacementHistory(false)} canRestore={hasPermission(actor, PERMISSIONS.SYSTEM_SELLER_MANAGER_RESTORE) && hasPermission(actor, PERMISSIONS.SYSTEM_USERS_DEACTIVATE)} onSaved={(message) => {setAlert({type:'success',message});queryClient.invalidateQueries();}} />
      ) : null}

      {replaceManager ? <ReplaceManagerModal groupId={Number(group.id||groupId)} manager={replaceManager} onClose={()=>setReplaceManager(null)} onSaved={(message)=>{setReplaceManager(null);setAlert({type:'success',message});refresh()}}/> : null}
      {sellerStatusModal === 'deactivate' && sellerStatusTarget ? (
        <DeactivateSystemUserModal user={sellerStatusTarget} onClose={() => {setSellerStatusModal(null);setSellerStatusTarget(null)}} onSaved={(message)=>{setAlert({type:'success',message});refresh()}} />
      ) : null}
      {sellerStatusModal === 'reactivate' && sellerStatusTarget ? (
        <ReactivateSystemUserModal user={sellerStatusTarget} onClose={() => {setSellerStatusModal(null);setSellerStatusTarget(null)}} onSaved={(message)=>{setAlert({type:'success',message});refresh()}} />
      ) : null}
      {selectedMember ? (
        <EditUserModal
          key={selectedMember.id}
          setShowEditUser={(open) => {
            if (!open) setSelectedMember(null)
          }}
          selectedUser={selectedMember}
          allowedRoles={[
            'division_manager',
            'sales_director',
            'unit_manager',
            'sales_agent',
          ]}
          actorRole={portalRole}
          initialSellerGroupId={String(group.id || groupId)}
          lockSellerGroup
          workflowReviewId={workflowReviewId}
          workflowAuditCaseId={workflowAuditCaseId}
          onSaved={(message) => {
            setSelectedMember(null)
            setAlert({ type: 'success', message })
            refresh()
          }}
        />
      ) : null}

      {reviewView ? <ReviewLiveRecordPanel
        entityType={reviewEntityType}
        reviewId={workflowReviewId}
        loading={configurationQuery.isLoading}
        record={reviewEntityType === 'accredited_seller'
          ? members.find((member) => Number(member.accredited_seller_id) === reviewAccreditedSellerId)
          : reviewEntityType === 'seller_group_project_rates' && !accreditedProjects.some(item=>Number(item.lot_project_id)===selectedProjectId)
            ? null
            : { ...group, ...fixedRates }}
        error={configurationQuery.isError ? 'You cannot access this Network, or it is no longer available.' : reviewEntityType === 'seller_group_project_rates' && !accreditedProjects.some(item=>Number(item.lot_project_id)===selectedProjectId) ? 'The reviewed project is unavailable for this Network. Another project was not substituted.' : reviewEntityType === 'accredited_seller' && !members.find((member) => Number(member.accredited_seller_id) === reviewAccreditedSellerId) ? 'The selected seller was not found in this Network.' : ''}
        onDismiss={() => setSearchParams(dismissReviewRecordQuery(searchParams), { replace: true })}
        onBackToReview={() => navigate(`${rootPath}/review-center/reviews/${workflowReviewId}`)}
      /> : null}
      {showEditGroupModal ? (
        <EditGroupModal
          setShowEditGroupModal={setShowEditGroupModal}
          selectedGroup={selectedGroupForEdit}
          groupType={groupType}
          workflowReviewId={workflowReviewId}
          workflowAuditCaseId={workflowAuditCaseId}
          onSaved={(message, type = 'success') => {
            setAlert({ type, message })
            refresh()
          }}
        />
      ) : null}
    </main>
  )
}

export default SellerGroupDetails







