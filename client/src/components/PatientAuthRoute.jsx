import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const PatientAuthRoute = ({ children }) => {
  const [isAuth, setIsAuth] = useState(null);
  const navigate = useNavigate()

  useEffect(() => {
    fetch("http://localhost:3000/api/v1/patient/auth/check", {
      credentials: "include", // 🔥 important for cookies
    })
      .then(res => res.json())
      .then(data => setIsAuth(data.authenticated))
      .catch(() => setIsAuth(false));
  }, []);

  if (isAuth === null) return <h1>Loading...</h1>;
  if (isAuth) return navigate('/patient/dashboard'); // or redirect

  return <>{children}</>;
};

export default PatientAuthRoute;