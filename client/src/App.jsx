// client/src/App.jsx
// ADDED: /terms route → TermsOfService page

import {
  RouterProvider, createBrowserRouter, createRoutesFromElements,
  Route, Navigate,
} from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'
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
import Staff_Appointments    from './pages/staffPage/Staff_Appointments'
import Staff_WalkInQueue     from './pages/staffPage/Staff_WalkInQueue'
import Staff_PatientRecord   from './pages/staffPage/Staff_PatientRecord'
import StaffLogin            from './pages/auth/Staff/StaffLogin'
import Staff_Inventory       from './pages/staffPage/Staff_Inventory'
import Staff_SupplyRequests  from './pages/staffPage/Staff_SupplyRequests'

import DoctorLogin              from './pages/auth/Doctor/DoctorLogin'
import DoctorLayout             from './components/layouts/DoctorLayout'
import Doctor_Dashboard         from './pages/doctorPage/Doctor_Dashboard'
import Doctor_DailyAppointments from './pages/doctorPage/Doctor_DailyAppointments'
import Doctor_Consultation      from './pages/doctorPage/Doctor_Consultation'
import Doctor_Request           from './pages/doctorPage/Doctor_Request'
import Doctor_Schedule          from './pages/doctorPage/Doctor_Schedule'

import AdminLayout           from './components/layouts/AdminLayout'
import AdminLogin            from './pages/auth/Admin/AdminLogin'
import Admin_Dashboard       from './pages/adminPage/Admin_Dashboard'
import Admin_Reports         from './pages/adminPage/Admin_Reports'
import Admin_StaffAccount    from './pages/adminPage/Admin_StaffAccount'
import Admin_DoctorAccount   from './pages/adminPage/Admin_DoctorAccount'
import Admin_DoctorSchedules from './pages/adminPage/Admin_DoctorSchedules'
import Admin_Appointments    from './pages/adminPage/Admin_Appointments'
import Admin_Inventory       from './pages/adminPage/Admin_Inventory'
import Admin_LandingPage     from './pages/adminPage/Admin_LandingPage'
import Admin_SupplyRequests  from './pages/adminPage/Admin_SupplyRequests'
import QueueDisplay          from './pages/displayPage/QueueDisplay'

import StaffRoute  from './components/StaffRoute'
import DoctorRoute from './components/DoctorRoute'
import AdminRoute  from './components/AdminRoute'

import ForgotPassword from './pages/auth/ForgotPassword'
import SettingsPage   from './pages/shared/SettingsPage'
import PrivacyPolicys from './pages/shared/PrivacyPolicys'
import TermsOfService from './pages/shared/TermsOfService'   // NEW

const router = createBrowserRouter(createRoutesFromElements(
  <>
    <Route path='/' element={<Layout />}>
      <Route index element={<LandingPage />} />

      {/* ── Legal pages ──────────────────────────────────── */}
      <Route path='/privacy-policy' element={<PrivacyPolicys />} />
      <Route path='/terms'          element={<TermsOfService />} />   {/* NEW */}

      {/* ── Patient auth ────────────────────────────────── */}
      <Route path='/patient/register'        element={<PatientAuthRoute><PatientRegister /></PatientAuthRoute>} />
      <Route path='/patient/login'           element={<PatientAuthRoute><PatientLogin /></PatientAuthRoute>} />
      <Route path='/patient/forgot-password' element={<ForgotPassword role="patient" />} />
      <Route path='/patient/reset-password'  element={<ForgotPassword role="patient" />} />

      {/* ── Patient protected ───────────────────────────── */}
      <Route path='/patient' element={<PatientRoute><PatientLayout /></PatientRoute>}>
        <Route index                         element={<PatientDashboard />} />
        <Route path='book'                   element={<BookAppointment />} />
        <Route path='appointments'           element={<MyAppointments />} />
        <Route path='reschedule-appointment' element={<RescheduleAppointment />} />
        <Route path='history'                element={<History />} />
        <Route path='settings'               element={<SettingsPage />} />
      </Route>

      {/* ── Staff auth ──────────────────────────────────── */}
      <Route path='/staff/login'           element={<StaffLogin />} />
      <Route path='/staff/forgot-password' element={<ForgotPassword role="staff" />} />
      <Route path='/staff/reset-password'  element={<ForgotPassword role="staff" />} />

      {/* ── Staff protected ─────────────────────────────── */}
      <Route path='/staff' element={<StaffRoute><StaffLayout /></StaffRoute>}>
        <Route index                  element={<Staff_Dashboard />} />
        <Route path='appointments'    element={<Staff_Appointments />} />
        <Route path='walkin'          element={<Staff_WalkInQueue />} />
        <Route path='inventory'       element={<Staff_Inventory />} />
        <Route path='patient-records' element={<Staff_PatientRecord />} />
        <Route path='supply-requests' element={<Staff_SupplyRequests />} />
        <Route path='settings'        element={<SettingsPage />} />
      </Route>

      {/* ── Doctor auth ─────────────────────────────────── */}
      <Route path='/doctor/login'           element={<DoctorLogin />} />
      <Route path='/doctor/forgot-password' element={<ForgotPassword role="doctor" />} />
      <Route path='/doctor/reset-password'  element={<ForgotPassword role="doctor" />} />

      {/* ── Doctor protected ────────────────────────────── */}
      <Route path='/doctor' element={<DoctorRoute><DoctorLayout /></DoctorRoute>}>
        <Route index                     element={<Doctor_Dashboard />} />
        <Route path='daily-appointments' element={<Doctor_DailyAppointments />} />
        <Route path='consultation'       element={<Doctor_Consultation />} />
        <Route path='request'            element={<Doctor_Request />} />
        <Route path='schedule'           element={<Doctor_Schedule />} />
        <Route path='settings'           element={<SettingsPage />} />
      </Route>

      {/* ── Admin auth ──────────────────────────────────── */}
      <Route path='/admin/login' element={<AdminLogin />} />

      {/* ── Admin protected ─────────────────────────────── */}
      <Route path='/admin' element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index                   element={<Admin_Dashboard />} />
        <Route path='reports'          element={<Admin_Reports />} />
        <Route path='staff-accounts'   element={<Admin_StaffAccount />} />
        <Route path='doctor-accounts'  element={<Admin_DoctorAccount />} />
        <Route path='doctor-schedules' element={<Admin_DoctorSchedules />} />
        <Route path='appointments'     element={<Admin_Appointments />} />
        <Route path='inventory'        element={<Admin_Inventory />} />
        <Route path='supply-requests'  element={<Admin_SupplyRequests />} />
        <Route path='landingpage'      element={<Admin_LandingPage />} />
        <Route path='settings'         element={<SettingsPage />} />
      </Route>

      {/* ── Public TV queue display ─────────────────────── */}
      <Route path='/display/queue' element={<QueueDisplay />} />

      {/* ── Catch-all 404 ───────────────────────────────── */}
      <Route path='*' element={<Navigate to='/' replace />} />
    </Route>
  </>
))

const App = () => (
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>
)

export default App
