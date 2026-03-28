import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DoctorRoute = ({ children }) => {
  const { user, role, ready } = useAuth();

  if (!ready) return <div>Loading...</div>; // Wait for the check to finish
  if (!user || role !== 'doctor') return <Navigate to="/doctor/login" />;

  return children;
};

export default DoctorRoute;