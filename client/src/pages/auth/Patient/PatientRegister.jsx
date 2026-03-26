// src/PatientRegister.jsx
import { useState } from "react";
import logo from '../../../assets/logo-removebg.png';
import { FaEye as EyeIcon } from "react-icons/fa";
import { FaEyeSlash as EyeOffIcon } from "react-icons/fa";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from '../../../context/AuthContext'  // add this import


const PasswordInput = ({ name, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        name={name}
        value={value}
        onChange={onChange}
        required
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 pr-10 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[rgb(43,124,110)] focus:bg-white focus:border-transparent transition-all placeholder-gray-400"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
};

const PatientRegister = () => {
  const [form, setForm] = useState({
    fullName: "",
    birthdate: "",
    sex: "",
    civilStatus: "",
    phone: "",
    address: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

// Replace only the handleSubmit function inside PatientRegister:


  // Inside PatientRegister component, add:
  const navigate = useNavigate()
  const { login } = useAuth()

  // Replace the existing handleSubmit with:
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match!')
      return
    }
    try {
      const res = await fetch('/api/patient/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Registration failed'); return }
      login(data.user, 'patient')
      navigate('/patient')
    } catch {
      setError('Cannot connect to server.')
    }
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[rgb(43,124,110)] focus:bg-white focus:border-transparent transition-all placeholder-gray-400";

  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[rgb(240,250,247)] to-[rgb(225,242,238)] p-6">
      <div className="w-full max-w-2xl bg-white shadow-xl shadow-green-900/10 rounded-3xl overflow-hidden mb-20">

        {/* Header Banner */}
        <div className="bg-[rgb(43,124,110)] px-10 py-8 text-center">
          <div className="flex justify-center mb-4">
            <div className=" rounded-2xl p-3">
              <img src={logo} alt="Clinic Logo" className="border border-white rounded-full w-16 h-16 object-contain" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Patient Registration</h1>
          <p className="text-green-100 text-sm mt-1">Please fill in your information below</p>
        </div>

        {/* Form Body */}
        <div className="px-10 py-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Full Name */}
            <div>
              <label className={labelClass}>Full Name</label>
              <input type="text" name="fullName" value={form.fullName} onChange={handleChange} required placeholder="e.g. Juan dela Cruz" className={inputClass} />
            </div>

            {/* Birthdate + Sex */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Birthdate</label>
                <input type="date" name="birthdate" value={form.birthdate} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Sex</label>
                <select name="sex" value={form.sex} onChange={handleChange} required className={inputClass}>
                  <option value="">Select sex</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Civil Status + Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Civil Status <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                <select name="civilStatus" value={form.civilStatus} onChange={handleChange} className={inputClass}>
                  <option value="">Select status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Divorced">Divorced</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" name="phone" value={form.phone} onChange={handleChange} required placeholder="+63 9XX XXX XXXX" className={inputClass} />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className={labelClass}>Address</label>
              <input type="text" name="address" value={form.address} onChange={handleChange} required placeholder="Street, Barangay, City, Province" className={inputClass} />
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>Email Address</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="you@example.com" className={inputClass} />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 pt-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-4">Security</p>
            </div>

            {/* Password + Confirm Password */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Password</label>
                <PasswordInput name="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
              </div>
              <div>
                <label className={labelClass}>Confirm Password</label>
                <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="••••••••" />
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
              Create Account
            </button>

            {/* Login link */}
            <p className="text-center text-sm text-gray-400 pb-1">
              Already have an account?{" "}
              <NavLink to="/patient/login" className="text-[rgb(43,124,110)] font-medium hover:underline">Sign in</NavLink>
            </p>

          </form>
        </div>
      </div>
    </div>
  );
};

export default PatientRegister;