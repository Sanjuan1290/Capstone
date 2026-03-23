import { 
  RouterProvider, 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route, 
  Navigate} from 'react-router-dom'

import Layout from './components/layouts/Layout'
import LandingPage from './pages/landingPages/LandingPage'

import PatientRegister from './pages/auth/Patient/PatientRegister'
import PatientLogin from './pages/auth/Patient/PatientLogin'

//patient pages
import PatientDashboard from './pages/patientPage/PatientDashboard'
import PatientRoute from './components/PatientRoute'
import PatientAuthRoute from './components/PatientAuthRoute'

import PatientLayout from './components/layouts/PatientLayout'
import BookAppointment from './pages/patientPage/BookAppointment'
import MyAppointments from './pages/patientPage/MyAppointments'
import History from './pages/patientPage/History'
import RescheduleAppointment from './pages/patientPage/ResheduleAppointment'

import StaffLayout from './components/layouts/StaffLayout'
import Staff_Dashboard from './pages/staffPage/Staff_Dashboard'
import Staff_Appointments from './pages/staffPage/Staff_Appointments'
import Staff_WalkInQueue from './pages/staffPage/Staff_WalkInQueue'
import Staff_PatientRecord from './pages/staffPage/Staff_PatientRecord'
import StaffLogin from './pages/auth/Staff/StaffLogin'

const App = () => {
  const router = createBrowserRouter(createRoutesFromElements(
    <>
      <Route path='/' element={<Layout />}>
        <Route index element={<LandingPage />} />

        <Route path='/patient/register' element={<PatientAuthRoute><PatientRegister /></PatientAuthRoute>}/>
        <Route path='/patient/login' element={<PatientAuthRoute><PatientLogin /></PatientAuthRoute>}/>
          
        <Route path='/patient' element={<PatientLayout />}>
          <Route index element={
            <PatientRoute>
              <PatientDashboard />
            </PatientRoute>
          }/>
          <Route path='book' element={
            <PatientRoute>
              <BookAppointment />
            </PatientRoute>
          }/>
          <Route path='appointments' element={
            <PatientRoute>
              <MyAppointments />
            </PatientRoute>
          }/>
          <Route path='reschedule-appointment' element={
            <PatientRoute>
              <RescheduleAppointment />
            </PatientRoute>
          }/>
          <Route path='history' element={
            <PatientRoute>
              <History />
            </PatientRoute>
          }/>


        </Route>
          
        <Route path='/staff' element={<StaffLayout />}>
          <Route index element={<Staff_Dashboard />}/>

          <Route path='login' element={<StaffLogin />}/>

          <Route path='appointments' element={<Staff_Appointments />}/>
          <Route path='walkin' element={<Staff_WalkInQueue />}/>
          <Route path='patient-records' element={<Staff_PatientRecord />}/>
        </Route>
      
      </Route>

    </>
  ))
  return (
    <RouterProvider router={router}/>
  )
}

export default App