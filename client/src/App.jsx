import { 
  RouterProvider, 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route } from 'react-router-dom'

import Layout from './components/layouts/Layout'
import LandingPage from './pages/landingPages/LandingPage'

import PatientRegister from './pages/auth/PatientRegister'
import PatientLogin from './pages/auth/PatientLogin'

const App = () => {
  const router = createBrowserRouter(createRoutesFromElements(
    <Route path='/' element={<Layout />}>
      <Route index element={<LandingPage />} />

      <Route path='/patient/register' element={<PatientRegister />}/>
      <Route path='/patient/login' element={<PatientLogin />}/>
    </Route>
  ))
  return (
    <RouterProvider router={router}/>
  )
}

export default App