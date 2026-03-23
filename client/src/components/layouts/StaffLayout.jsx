import { Outlet } from "react-router-dom"

const StaffLayout = () => {

    const sideNav = [
        {
            name: 'Dashboard', path: '/staff/dashboard'
        },
        {
            name: 'appointments', path: '/staff/appointments'
        },
        {
            name: 'Walk-in Queue', path: '/staff/walkin'
        },
        {
            name: 'Patient Records', path: '/staff/patient-records'
        },
    ]

  return (
    <>
        <Outlet />
    </>
  )
}

export default StaffLayout