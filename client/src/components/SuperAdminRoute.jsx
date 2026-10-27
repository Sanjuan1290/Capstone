import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
const SuperAdminRoute=({children})=>{const {user,role,ready}=useAuth();if(!ready)return <div className="p-12">Loading account…</div>;if(!user||role!=='superadmin'||user.account_role!=='superadmin')return <Navigate to="/superadmin/login" replace/>;return children}
export default SuperAdminRoute
