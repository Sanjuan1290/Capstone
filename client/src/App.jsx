import { 
  RouterProvider, 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route, 
  Navigate} from 'react-router-dom'

import Layout from './components/layouts/Layout'
import LandingPage from './pages/landingPages/LandingPage'

import PatientRegister from './pages/auth/PatientRegister'
import PatientLogin from './pages/auth/PatientLogin'

//patient pages
import Dashboard from './pages/patientPage/Dashboard'
import PatientRoute from './components/PatientRoute'
import PatientAuthRoute from './components/PatientAuthRoute'

import PatientLayout from './components/layouts/PatientLayout'

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
              <Dashboard />
            </PatientRoute>
          }/>


        </Route>

      
      </Route>

    </>
  ))
  return (
    <RouterProvider router={router}/>
  )
}

export default App