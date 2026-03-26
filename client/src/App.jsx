import {
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  Navigate
} from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'

import Layout from './components/layouts/Layout'
import LandingPage from './pages/landingPages/LandingPage'

import PatientRegister from './pages/auth/Patient/PatientRegister'
import PatientLogin    from './pages/auth/Patient/PatientLogin'
import PatientRoute    from './components/PatientRoute'
import PatientAuthRoute from './components/PatientAuthRoute'
import PatientLayout   from './components/layouts/PatientLayout'
import PatientDashboard from './pages/patientPage/PatientDashboard'
import BookAppointment from './pages/patientPage/BookAppointment'
import MyAppointments  from './pages/patientPage/MyAppointments'
import History         from './pages/patientPage/History'
import RescheduleAppointment from './pages/patientPage/ResheduleAppointment'

import StaffLayout       from './components/layouts/StaffLayout'
import Staff_Dashboard   from './pages/staffPage/Staff_Dashboard'
import Staff_Appointments from './pages/staffPage/Staff_Appointments'
import Staff_WalkInQueue from './pages/staffPage/Staff_WalkInQueue'
import Staff_PatientRecord from './pages/staffPage/Staff_PatientRecord'
import StaffLogin        from './pages/auth/Staff/StaffLogin'
import Staff_Inventory   from './pages/staffPage/Staff_Inventory'

import DoctorLogin           from './pages/auth/Doctor/DoctorLogin'
import DoctorLayout          from './components/layouts/DoctorLayout'
import Doctor_Dashboard      from './pages/doctorPage/Doctor_Dashboard'
import Doctor_DailyAppointments from './pages/doctorPage/Doctor_DailyAppointments'
import Doctor_Consultation   from './pages/doctorPage/Doctor_Consultation'
import Doctor_Request        from './pages/doctorPage/Doctor_Request'

import AdminLayout          from './components/layouts/AdminLayout'
import AdminLogin           from './pages/auth/Admin/AdminLogin'
import Admin_Dashboard      from './pages/adminPage/Admin_Dashboard'
import Admin_Reports        from './pages/adminPage/Admin_Reports'
import Admin_StaffAccount   from './pages/adminPage/Admin_StaffAccount'
import Admin_DoctorAccount  from './pages/adminPage/Admin_DoctorAccount'
import Admin_DoctorSchedules from './pages/adminPage/Admin_DoctorSchedules'
import Admin_Appointments   from './pages/adminPage/Admin_Appointments'
import Admin_Inventory      from './pages/adminPage/Admin_Inventory'
import QueueDisplay         from './pages/displayPage/QueueDisplay'

const router = createBrowserRouter(createRoutesFromElements(
  <>
    <Route path='/' element={<Layout />}>
      <Route index element={<LandingPage />} />

      <Route path='/patient/register' element={<PatientAuthRoute><PatientRegister /></PatientAuthRoute>} />
      <Route path='/patient/login'    element={<PatientAuthRoute><PatientLogin /></PatientAuthRoute>} />

      <Route path='/patient' element={<PatientLayout />}>
        <Route index element={<PatientRoute><PatientDashboard /></PatientRoute>} />
        <Route path='book'                  element={<PatientRoute><BookAppointment /></PatientRoute>} />
        <Route path='appointments'          element={<PatientRoute><MyAppointments /></PatientRoute>} />
        <Route path='reschedule-appointment' element={<PatientRoute><RescheduleAppointment /></PatientRoute>} />
        <Route path='history'               element={<PatientRoute><History /></PatientRoute>} />
      </Route>

      <Route path='/staff/login' element={<StaffLogin />} />
      <Route path='/staff' element={<StaffLayout />}>
        <Route index element={<Staff_Dashboard />} />
        <Route path='appointments'    element={<Staff_Appointments />} />
        <Route path='walkin'          element={<Staff_WalkInQueue />} />
        <Route path='inventory'       element={<Staff_Inventory />} />
        <Route path='patient-records' element={<Staff_PatientRecord />} />
      </Route>

      <Route path='/doctor/login' element={<DoctorLogin />} />
      <Route path='/doctor' element={<DoctorLayout />}>
        <Route index element={<Doctor_Dashboard />} />
        <Route path='daily-appointments' element={<Doctor_DailyAppointments />} />
        <Route path='consultation'       element={<Doctor_Consultation />} />
        <Route path='request'            element={<Doctor_Request />} />
      </Route>

      <Route path='/admin/login' element={<AdminLogin />} />
      <Route path='/admin' element={<AdminLayout />}>
        <Route index element={<Admin_Dashboard />} />
        <Route path='reports'          element={<Admin_Reports />} />
        <Route path='staff-accounts'   element={<Admin_StaffAccount />} />
        <Route path='doctor-accounts'  element={<Admin_DoctorAccount />} />
        <Route path='doctor-schedules' element={<Admin_DoctorSchedules />} />
        <Route path='appointments'     element={<Admin_Appointments />} />
        <Route path='inventory'        element={<Admin_Inventory />} />
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