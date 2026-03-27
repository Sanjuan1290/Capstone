import {
  RouterProvider, createBrowserRouter, createRoutesFromElements,
  Route
} from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'
import Layout from './components/layouts/Layout'
import LandingPage from './pages/LandingPages/LandingPage'

import PatientRegister      from './pages/auth/Patient/PatientRegister'
import PatientLogin         from './pages/auth/Patient/PatientLogin'
import PatientRoute         from './components/PatientRoute'
import PatientAuthRoute     from './components/PatientAuthRoute'
import PatientLayout        from './components/layouts/PatientLayout'
import PatientDashboard     from './pages/patientPage/PatientDashboard'
import BookAppointment      from './pages/patientPage/BookAppointment'
import MyAppointments       from './pages/patientPage/MyAppointments'
import History              from './pages/patientPage/History'
import RescheduleAppointment from './pages/patientPage/ResheduleAppointment'

import StaffLayout          from './components/layouts/StaffLayout'
import Staff_Dashboard      from './pages/staffPage/Staff_Dashboard'
import Staff_Appointments   from './pages/staffPage/Staff_Appointments'
import Staff_WalkInQueue    from './pages/staffPage/Staff_WalkInQueue'
import Staff_PatientRecord  from './pages/staffPage/Staff_PatientRecord'
import StaffLogin           from './pages/auth/Staff/StaffLogin'
import Staff_Inventory      from './pages/staffPage/Staff_Inventory'
import Staff_SupplyRequests from './pages/staffPage/Staff_SupplyRequests'

import DoctorLogin              from './pages/auth/Doctor/DoctorLogin'
import DoctorLayout             from './components/layouts/DoctorLayout'
import Doctor_Dashboard         from './pages/doctorPage/Doctor_Dashboard'
import Doctor_DailyAppointments from './pages/doctorPage/Doctor_DailyAppointments'
import Doctor_Consultation      from './pages/doctorPage/Doctor_Consultation'
import Doctor_Request           from './pages/doctorPage/Doctor_Request'

import AdminLayout           from './components/layouts/AdminLayout'
import AdminLogin            from './pages/auth/Admin/AdminLogin'
import Admin_Dashboard       from './pages/adminPage/Admin_Dashboard'
import Admin_Reports         from './pages/adminPage/Admin_Reports'
import Admin_StaffAccount    from './pages/adminPage/Admin_StaffAccount'
import Admin_DoctorAccount   from './pages/adminPage/Admin_DoctorAccount'
import Admin_DoctorSchedules from './pages/adminPage/Admin_DoctorSchedules'
import Admin_Appointments    from './pages/adminPage/Admin_Appointments'
import Admin_Inventory       from './pages/adminPage/Admin_Inventory'
import QueueDisplay          from './pages/displayPage/QueueDisplay'
import StaffRoute  from './components/StaffRoute'
import DoctorRoute from './components/DoctorRoute'
import AdminRoute  from './components/AdminRoute'

// ✅ Shared forgot/reset password page for all 3 roles
import ForgotPassword from './pages/auth/ForgotPassword'

const router = createBrowserRouter(createRoutesFromElements(
  <>
    <Route path='/' element={<Layout />}>
      <Route index element={<LandingPage />} />

      {/* ── Patient ─────────────────────────────────────── */}
      <Route path='/patient/register'        element={<PatientAuthRoute><PatientRegister /></PatientAuthRoute>} />
      <Route path='/patient/login'           element={<PatientAuthRoute><PatientLogin /></PatientAuthRoute>} />
      <Route path='/patient/forgot-password' element={<ForgotPassword role="patient" />} />
      <Route path='/patient/reset-password'  element={<ForgotPassword role="patient" />} />

      <Route path='/patient' element={<PatientLayout />}>
        <Route index                         element={<PatientRoute><PatientDashboard /></PatientRoute>} />
        <Route path='book'                   element={<PatientRoute><BookAppointment /></PatientRoute>} />
        <Route path='appointments'           element={<PatientRoute><MyAppointments /></PatientRoute>} />
        <Route path='reschedule-appointment' element={<PatientRoute><RescheduleAppointment /></PatientRoute>} />
        <Route path='history'                element={<PatientRoute><History /></PatientRoute>} />
      </Route>

      {/* ── Staff ───────────────────────────────────────── */}
      <Route path='/staff/login'           element={<StaffLogin />} />
      <Route path='/staff/forgot-password' element={<ForgotPassword role="staff" />} />
      <Route path='/staff/reset-password'  element={<ForgotPassword role="staff" />} />

      <Route path='/staff' element={<StaffLayout />}>
        <Route index                  element={<StaffRoute><Staff_Dashboard /></StaffRoute>} />
        <Route path='appointments'    element={<StaffRoute><Staff_Appointments /></StaffRoute>} />
        <Route path='walkin'          element={<StaffRoute><Staff_WalkInQueue /></StaffRoute>} />
        <Route path='inventory'       element={<StaffRoute><Staff_Inventory /></StaffRoute>} />
        <Route path='patient-records' element={<StaffRoute><Staff_PatientRecord /></StaffRoute>} />
        <Route path='supply-requests' element={<StaffRoute><Staff_SupplyRequests /></StaffRoute>} />
      </Route>

      {/* ── Doctor ──────────────────────────────────────── */}
      <Route path='/doctor/login'           element={<DoctorLogin />} />
      <Route path='/doctor/forgot-password' element={<ForgotPassword role="doctor" />} />
      <Route path='/doctor/reset-password'  element={<ForgotPassword role="doctor" />} />

      <Route path='/doctor' element={<DoctorLayout />}>
        <Route index                     element={<DoctorRoute><Doctor_Dashboard /></DoctorRoute>} />
        <Route path='daily-appointments' element={<DoctorRoute><Doctor_DailyAppointments /></DoctorRoute>} />
        <Route path='consultation'       element={<DoctorRoute><Doctor_Consultation /></DoctorRoute>} />
        <Route path='request'            element={<DoctorRoute><Doctor_Request /></DoctorRoute>} />
      </Route>

      {/* ── Admin ───────────────────────────────────────── */}
      <Route path='/admin/login' element={<AdminLogin />} />
      <Route path='/admin' element={<AdminLayout />}>
        <Route index                   element={<AdminRoute><Admin_Dashboard /></AdminRoute>} />
        <Route path='reports'          element={<AdminRoute><Admin_Reports /></AdminRoute>} />
        <Route path='staff-accounts'   element={<AdminRoute><Admin_StaffAccount /></AdminRoute>} />
        <Route path='doctor-accounts'  element={<AdminRoute><Admin_DoctorAccount /></AdminRoute>} />
        <Route path='doctor-schedules' element={<AdminRoute><Admin_DoctorSchedules /></AdminRoute>} />
        <Route path='appointments'     element={<AdminRoute><Admin_Appointments /></AdminRoute>} />
        <Route path='inventory'        element={<AdminRoute><Admin_Inventory /></AdminRoute>} />
      </Route>

      <Route path='/display/queue' element={<QueueDisplay />} />
    </Route>
  </>
))

const App = () => (
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>
)

export default App