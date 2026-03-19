import { useEffect, useState } from "react";

const PatientRoute = ({ children }) => {
  const [isAuth, setIsAuth] = useState(null);

  useEffect(() => {
    fetch("http://localhost:5000/api/v1/auth/check", {
      credentials: "include", // 🔥 important for cookies
    })
      .then(res => res.json())
      .then(data => setIsAuth(data.authenticated))
      .catch(() => setIsAuth(false));
  }, []);

  if (isAuth === null) return <h1>Loading...</h1>;
  if (!isAuth) return <h1>Not Authorized</h1>; // or redirect

  return <>{children}</>;
};

export default PatientRoute;