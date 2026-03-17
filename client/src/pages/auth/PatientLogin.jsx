// src/PatientLogin.jsx
import { useState } from "react";
import { FaEye as EyeIcon, FaEyeSlash as EyeOffIcon } from "react-icons/fa";
import { NavLink } from "react-router-dom";
import logo from '../../assets/logo.png';

const PatientLogin = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Patient Login:", form);
    alert("Login successful!");
  };

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[rgb(43,124,110)] focus:bg-white focus:border-transparent transition-all placeholder-gray-400";

  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[rgb(240,250,247)] to-[rgb(225,242,238)] p-6">
      <div className="w-full max-w-md bg-white shadow-xl shadow-green-900/10 rounded-3xl overflow-hidden">

        {/* Header Banner */}
        <div className="bg-[rgb(43,124,110)] px-10 py-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-white/20 rounded-2xl p-3">
              <img src={logo} alt="Clinic Logo" className="w-16 h-16 object-contain" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Welcome Back</h1>
          <p className="text-green-100 text-sm mt-1">Sign in to your patient account</p>
        </div>

        {/* Form Body */}
        <div className="px-10 py-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelClass} style={{ marginBottom: 0 }}>Password</label>
                <NavLink
                  to="/forgot-password"
                  className="text-xs text-[rgb(43,124,110)] hover:underline font-medium"
                >
                  Forgot password?
                </NavLink>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="w-full bg-[rgb(43,124,110)] hover:bg-[rgb(35,105,93)] active:scale-[0.99] text-white py-3 rounded-xl font-semibold text-sm tracking-wider uppercase transition-all duration-150 shadow-md shadow-green-900/20 mt-2"
            >
              Sign In
            </button>

            {/* Register link */}
            <p className="text-center text-sm text-gray-400 pb-1">
              Don't have an account?{" "}
              <NavLink
                to="/patient/register"
                className="text-[rgb(43,124,110)] font-medium hover:underline"
              >
                Register here
              </NavLink>
            </p>

          </form>
        </div>
      </div>
    </div>
  );
};

export default PatientLogin;