import { 
  RouterProvider, 
  createBrowserRouter, 
  createRoutesFromElements, 
  Route } from 'react-router-dom'

import Layout from './components/layouts/Layout'


const App = () => {
  const router = createBrowserRouter(createRoutesFromElements(
    <Route path='/' element={<Layout />}>
    </Route>
  ))
  return (
    <RouterProvider router={router}/>
  )
}

export default App