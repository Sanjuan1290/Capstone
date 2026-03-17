import { 
  RouterProvider, 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route } from 'react-router-dom'

import Layout from './components/layouts/Layout'
import LandingPage from './pages/LandingPages/LandingPage'

const App = () => {
  const router = createBrowserRouter(createRoutesFromElements(
    <Route path='/' element={<Layout />}>
      <Route index element={<LandingPage />} />
    </Route>
  ))
  return (
    <RouterProvider router={router}/>
  )
}

export default App