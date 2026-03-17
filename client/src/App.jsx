import { 
  RouterProvider, 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route } from 'react-router-dom'

import Layout from './components/layouts/Layout'

import HomePage from './pages/HomePage'

const App = () => {
  const router = createBrowserRouter(createRoutesFromElements(
    <Route path='/' element={<Layout />}>
      <Route index element={<HomePage />} />
    </Route>
  ))
  return (
    <RouterProvider router={router}/>
  )
}

export default App