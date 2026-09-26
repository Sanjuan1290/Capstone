// client/src/App.jsx
// ADDED: /terms route → TermsOfService page

import {
  RouterProvider, createBrowserRouter, createRoutesFromElements,
  Route, Navigate, useParams,
} from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

import { AuthProvider } from './context/AuthContext'
import { queryClient } from './lib/queryClient'
import Layout from './components/layouts/Layout'
import LandingPage from './pages/LandingPages/LandingPage'

import PatientRegister       from './pages/auth/Patient/PatientRegister'
import PatientLogin          from './pages/auth/Patient/PatientLogin'
import PatientRoute          from './components/PatientRoute'
import PatientAuthRoute      from './components/PatientAuthRoute'
import PatientLayout         from './components/layouts/PatientLayout'
import PatientDashboard      from './pages/patientPage/PatientDashboard'
import BookAppointment       from './pages/patientPage/BookAppointment'
import MyAppointments        from './pages/patientPage/MyAppointments'
import History               from './pages/patientPage/History'
import RescheduleAppointment from './pages/patientPage/ResheduleAppointment'

import StaffLayout           from './components/layouts/StaffLayout'
import Staff_Dashboard       from './pages/staffPage/Staff_Dashboard'
import Staff_Home             from './pages/staffPage/Staff_Home'
import Staff_AccountsView     from './pages/staffPage/Staff_AccountsView'
import Staff_BillingRecords   from './pages/staffPage/Staff_BillingRecords'
import Staff_Appointments    from './pages/staffPage/Staff_Appointments'
import Staff_Billing         from './pages/staffPage/Staff_Billing'
import Staff_CheckoutDetail  from './pages/staffPage/Staff_CheckoutDetail'
import Staff_WalkInQueue     from './pages/staffPage/Staff_WalkInQueue'
import Staff_PatientRecord   from './pages/staffPage/Staff_PatientRecord'
import StaffLogin            from './pages/auth/Staff/StaffLogin'
import Staff_Inventory       from './pages/staffPage/Staff_Inventory'
import Staff_SupplyRequests  from './pages/staffPage/Staff_SupplyRequests'
import Staff_DoctorSchedules from './pages/staffPage/Staff_DoctorSchedules'

import DoctorLogin              from './pages/auth/Doctor/DoctorLogin'
import DoctorLayout             from './components/layouts/DoctorLayout'
import Doctor_Dashboard         from './pages/doctorPage/Doctor_Dashboard'
import Doctor_Appointments      from './pages/doctorPage/Doctor_Appointments'
import Doctor_Consultation      from './pages/doctorPage/Doctor_Consultation'
import Doctor_ConsultationHistory from './pages/doctorPage/Doctor_ConsultationHistory'
import Doctor_Request           from './pages/doctorPage/Doctor_Request'
import Doctor_StockTransferRequest from './pages/doctorPage/Doctor_StockTransferRequest'
import Doctor_Schedule          from './pages/doctorPage/Doctor_Schedule'

import AdminLayout           from './components/layouts/AdminLayout'
import AdminLogin            from './pages/auth/Admin/AdminLogin'
import Admin_Dashboard       from './pages/adminPage/Admin_Dashboard'
import Admin_Reports         from './pages/adminPage/Admin_Reports'
import Admin_StaffAccount    from './pages/adminPage/Admin_StaffAccount'
import Admin_Accounts         from './pages/adminPage/Admin_Accounts'
import Admin_DoctorAccount   from './pages/adminPage/Admin_DoctorAccount'
import Admin_DoctorSchedules from './pages/adminPage/Admin_DoctorSchedules'
import Admin_Appointments    from './pages/adminPage/Admin_Appointments'
import Admin_PatientRecord    from './pages/adminPage/Admin_PatientRecord'
import Admin_PatientBooking  from './pages/adminPage/Admin_PatientBooking'
import Admin_BillingCatalog  from './pages/adminPage/Admin_BillingCatalog'
import Admin_Billing         from './pages/adminPage/Admin_Billing'
import Admin_CheckoutDetail  from './pages/adminPage/Admin_CheckoutDetail'
import Admin_BillingTransactions from './pages/adminPage/Admin_BillingTransactions'
import Admin_BillingTransactionDetail from './pages/adminPage/Admin_BillingTransactionDetail'
import Admin_BillingApprovals from './pages/adminPage/Admin_BillingApprovals'
import Admin_BillingPaymentMethods from './pages/adminPage/Admin_BillingPaymentMethods'
import Admin_BillingDiscounts from './pages/adminPage/Admin_BillingDiscounts'
import Admin_BillingReceiptSettings from './pages/adminPage/Admin_BillingReceiptSettings'
import Admin_BillingServiceForm from './pages/adminPage/Admin_BillingServiceForm'
import Admin_AuditLogs       from './pages/adminPage/Admin_AuditLogs'
import Admin_AuditArchive     from './pages/adminPage/Admin_AuditArchive'
import Admin_AuditArchiveDetail from './pages/adminPage/Admin_AuditArchiveDetail'
import Admin_SystemSetup      from './pages/adminPage/Admin_SystemSetup'
import Admin_SystemSetupBilling from './pages/adminPage/Admin_SystemSetupBilling'
import Admin_ClinicSettings  from './pages/adminPage/Admin_ClinicSettings'
import Admin_Inventory       from './pages/adminPage/Admin_Inventory'
import Admin_LandingPage     from './pages/adminPage/Admin_LandingPage'
import Admin_SupplyRequests  from './pages/adminPage/Admin_SupplyRequests'
import QueueDisplay          from './pages/displayPage/QueueDisplay'

import StaffRoute  from './components/StaffRoute'
import StaffPermissionRoute from './components/StaffPermissionRoute'
import DoctorRoute from './components/DoctorRoute'
import AdminRoute  from './components/AdminRoute'

import ForgotPassword from './pages/auth/ForgotPassword'
import SettingsPage   from './pages/shared/SettingsPage'
import RequiredPasswordChange from './pages/shared/RequiredPasswordChange'
import ChangePassword from './pages/shared/ChangePassword'
import DoctorAvailability from './pages/patientPage/DoctorAvailability'
import PrivacyPolicys from './pages/shared/PrivacyPolicys'
import TermsOfService from './pages/shared/TermsOfService'   // NEW


const LegacyCheckoutDetailRedirect = () => {
  const { billingId } = useParams()
  return <Navigate to={`/admin/billing/checkout/${billingId}`} replace />
}

const LegacyBillingServiceEditRedirect = () => {
  const { serviceId } = useParams()
  return <Navigate to={`/admin/system-setup/billing/services/${serviceId}/edit`} replace />
}

const router = createBrowserRouter(createRoutesFromElements(
  <>
    <Route path='/' element={<Layout />}>
      <Route index element={<LandingPage />} />

      {/* ── Legal pages ──────────────────────────────────── */}
      <Route path='/privacy-policy' element={<PrivacyPolicys />} />
      <Route path='/terms'          element={<TermsOfService />} />   {/* NEW */}

      {/* ── Patient auth ────────────────────────────────── */}
      <Route path='/login'                  element={<PatientAuthRoute><PatientLogin /></PatientAuthRoute>} />
      <Route path='/patient/register'        element={<PatientAuthRoute><PatientRegister /></PatientAuthRoute>} />
      <Route path='/patient/login'           element={<PatientAuthRoute><PatientLogin /></PatientAuthRoute>} />
      <Route path='/patient/forgot-password' element={<ForgotPassword role="patient" />} />
      <Route path='/patient/reset-password'  element={<ForgotPassword role="patient" />} />

      {/* ── Patient protected ───────────────────────────── */}
      <Route path='/patient' element={<PatientRoute><PatientLayout /></PatientRoute>}>
        <Route index                         element={<PatientDashboard />} />
        <Route path='doctors'                element={<DoctorAvailability />} />
        <Route path='book'                   element={<BookAppointment />} />
        <Route path='appointments'           element={<MyAppointments />} />
        <Route path='reschedule-appointment' element={<RescheduleAppointment />} />
        <Route path='history'                element={<History />} />
        <Route path='settings'               element={<SettingsPage />} />
        <Route path='change-password'        element={<ChangePassword />} />
      </Route>

      {/* ── Staff auth ──────────────────────────────────── */}
      <Route path='/staff/login'           element={<StaffLogin />} />
      <Route path='/staff/change-password-required' element={<RequiredPasswordChange />} />
      <Route path='/staff/forgot-password' element={<ForgotPassword role="staff" />} />
      <Route path='/staff/reset-password'  element={<ForgotPassword role="staff" />} />

      {/* ── Staff protected ─────────────────────────────── */}
      <Route path='/staff' element={<StaffRoute><StaffLayout /></StaffRoute>}>
        <Route index element={<Staff_Home />} />
        <Route path='appointments' element={<StaffPermissionRoute permission="appointments"><Staff_Appointments /></StaffPermissionRoute>} />
        <Route path='walkin' element={<StaffPermissionRoute permission="appointments"><Staff_WalkInQueue /></StaffPermissionRoute>} />
        <Route path='patient-records' element={<StaffPermissionRoute permission="patient_records"><Staff_PatientRecord /></StaffPermissionRoute>} />
        <Route path='doctor-schedules' element={<StaffPermissionRoute permission="doctor_schedules"><Staff_DoctorSchedules /></StaffPermissionRoute>} />
        <Route path='checkout' element={<StaffPermissionRoute permission="checkout"><Staff_Billing /></StaffPermissionRoute>} />
        <Route path='checkout/:billingId' element={<StaffPermissionRoute permission="checkout"><Staff_CheckoutDetail /></StaffPermissionRoute>} />
        <Route path='billing' element={<StaffPermissionRoute permission="billing"><Staff_BillingRecords /></StaffPermissionRoute>} />
        <Route path='inventory' element={<StaffPermissionRoute permission="inventory"><Staff_Inventory /></StaffPermissionRoute>} />
        <Route path='supply-requests' element={<StaffPermissionRoute permission="stock_transfers"><Staff_SupplyRequests /></StaffPermissionRoute>} />
        <Route path='accounts' element={<StaffPermissionRoute permission="accounts"><Staff_AccountsView /></StaffPermissionRoute>} />
        <Route path='system-setup' element={<StaffPermissionRoute permission="system_setup"><Admin_SystemSetup /></StaffPermissionRoute>} />
        <Route path='system-setup/billing' element={<StaffPermissionRoute permission="system_setup"><Admin_SystemSetupBilling /></StaffPermissionRoute>}>
          <Route index element={<Navigate to='services' replace />} />
          <Route path='services' element={<Admin_BillingCatalog />} />
          <Route path='services/new' element={<Admin_BillingServiceForm />} />
          <Route path='services/:serviceId/edit' element={<Admin_BillingServiceForm />} />
          <Route path='payment-methods' element={<Admin_BillingPaymentMethods />} />
          <Route path='discounts' element={<Admin_BillingDiscounts />} />
          <Route path='receipt' element={<Admin_BillingReceiptSettings />} />
        </Route>
        <Route path='reports' element={<StaffPermissionRoute permission="reports"><Admin_Reports /></StaffPermissionRoute>} />
        <Route path='audit-logs' element={<StaffPermissionRoute permission="audit_logs"><Admin_AuditLogs /></StaffPermissionRoute>} />
        <Route path='audit-logs/archive' element={<StaffPermissionRoute permission="audit_logs"><Admin_AuditArchive /></StaffPermissionRoute>} />
        <Route path='audit-logs/archive/:archiveId' element={<StaffPermissionRoute permission="audit_logs"><Admin_AuditArchiveDetail /></StaffPermissionRoute>} />
        <Route path='landingpage' element={<StaffPermissionRoute permission="landing_page"><Admin_LandingPage /></StaffPermissionRoute>} />
        <Route path='settings' element={<SettingsPage />} />
        <Route path='change-password' element={<ChangePassword />} />
      </Route>

      {/* ── Doctor auth ─────────────────────────────────── */}
      <Route path='/doctor/login'           element={<DoctorLogin />} />
      <Route path='/doctor/change-password-required' element={<RequiredPasswordChange />} />
      <Route path='/doctor/forgot-password' element={<ForgotPassword role="doctor" />} />
      <Route path='/doctor/reset-password'  element={<ForgotPassword role="doctor" />} />

      {/* ── Doctor protected ────────────────────────────── */}
      <Route path='/doctor' element={<DoctorRoute><DoctorLayout /></DoctorRoute>}>
        <Route index                     element={<Doctor_Dashboard />} />
        <Route path='appointments'       element={<Doctor_Appointments />} />
        <Route path='daily-appointments' element={<Navigate to='/doctor/appointments' replace />} />
        <Route path='consultation'       element={<Doctor_Consultation />} />
        <Route path='consultation-history' element={<Doctor_ConsultationHistory />} />
        <Route path='request'            element={<Doctor_Request />} />
        <Route path='request/stock-transfer' element={<Doctor_StockTransferRequest />} />
        <Route path='schedule'           element={<Doctor_Schedule />} />
        <Route path='settings'           element={<SettingsPage />} />
        <Route path='change-password'    element={<ChangePassword />} />
      </Route>

      {/* ── Admin auth ──────────────────────────────────── */}
      <Route path='/admin/login' element={<AdminLogin />} />

      {/* ── Admin protected ─────────────────────────────── */}
      <Route path='/admin' element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index                   element={<Admin_Dashboard />} />
        <Route path='reports'          element={<Admin_Reports />} />
        <Route path='audit-logs'       element={<Admin_AuditLogs />} />
        <Route path='audit-logs/archive' element={<Admin_AuditArchive />} />
        <Route path='audit-logs/archive/:archiveId' element={<Admin_AuditArchiveDetail />} />
        <Route path='clinic-settings'  element={<Navigate to='/admin/settings' replace />} />
        <Route path='accounts'         element={<Admin_Accounts />} />
        <Route path='staff-accounts'   element={<Navigate to='/admin/accounts?tab=staff' replace />} />
        <Route path='doctor-accounts'  element={<Navigate to='/admin/accounts?tab=doctors' replace />} />
        <Route path='doctor-schedules' element={<Admin_DoctorSchedules />} />
        <Route path='appointments'     element={<Admin_Appointments />} />
        <Route path='patient-records'   element={<Admin_PatientRecord />} />
        <Route path='patient-booking' element={<Navigate to='/admin/system-setup' replace />} />
        <Route path='patient-visit-details' element={<Navigate to='/admin/system-setup' replace />} />
        <Route path='system-setup' element={<Admin_SystemSetup />} />
        <Route path='system-setup/billing' element={<Admin_SystemSetupBilling />}>
          <Route index element={<Navigate to='services' replace />} />
          <Route path='services' element={<Admin_BillingCatalog />} />
          <Route path='services/new' element={<Admin_BillingServiceForm />} />
          <Route path='services/:serviceId/edit' element={<Admin_BillingServiceForm />} />
          <Route path='payment-methods' element={<Admin_BillingPaymentMethods />} />
          <Route path='discounts' element={<Admin_BillingDiscounts />} />
          <Route path='receipt' element={<Admin_BillingReceiptSettings />} />
        </Route>
        <Route path='billing'          element={<Admin_Billing />} />
        <Route path='billing/checkout/:billingId' element={<Admin_CheckoutDetail />} />
        <Route path='billing/transactions' element={<Admin_BillingTransactions />} />
        <Route path='billing/transactions/:billingId' element={<Admin_BillingTransactionDetail />} />
        <Route path='billing/adjustments' element={<Admin_BillingApprovals />} />
        <Route path='billing/approvals' element={<Navigate to='/admin/billing/adjustments' replace />} />
        <Route path='billing/reconciliation' element={<Navigate to='/admin/reports' replace />} />
        <Route path='checkout' element={<Navigate to='/admin/billing?tab=checkout' replace />} />
        <Route path='checkout/:billingId' element={<LegacyCheckoutDetailRedirect />} />
        <Route path='billing/setup' element={<Navigate to='/admin/system-setup/billing/services' replace />} />
        <Route path='billing/setup/services' element={<Navigate to='/admin/system-setup/billing/services' replace />} />
        <Route path='billing/setup/services/new' element={<Navigate to='/admin/system-setup/billing/services/new' replace />} />
        <Route path='billing/setup/services/:serviceId/edit' element={<LegacyBillingServiceEditRedirect />} />
        <Route path='billing/setup/payment-methods' element={<Navigate to='/admin/system-setup/billing/payment-methods' replace />} />
        <Route path='billing/setup/discounts' element={<Navigate to='/admin/system-setup/billing/discounts' replace />} />
        <Route path='billing/setup/receipt' element={<Navigate to='/admin/system-setup/billing/receipt' replace />} />
        <Route path='service-catalog' element={<Navigate to='/admin/system-setup/billing/services' replace />} />
        <Route path='billing-catalog' element={<Navigate to='/admin/system-setup/billing/services' replace />} />
        <Route path='inventory'        element={<Admin_Inventory />} />
        <Route path='supply-requests'  element={<Admin_SupplyRequests />} />
        <Route path='landingpage'      element={<Admin_LandingPage />} />
        <Route path='settings'         element={<SettingsPage />} />
        <Route path='change-password'  element={<ChangePassword />} />
      </Route>

      {/* ── Public TV queue display ─────────────────────── */}
      <Route path='/display/queue' element={<QueueDisplay />} />

      {/* ── Catch-all 404 ───────────────────────────────── */}
      <Route path='*' element={<Navigate to='/' replace />} />
    </Route>
  </>
))

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </QueryClientProvider>
)

export default App
