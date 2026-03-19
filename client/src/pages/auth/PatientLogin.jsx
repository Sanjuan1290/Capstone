import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../../assets/logo-removebg.png'
import { FaRegEye } from "react-icons/fa";
import { FaRegEyeSlash } from "react-icons/fa";


const PatientLogin = () => {

  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)

  function handleFormChange(e) {
    const { name, value } = e.target
    setForm(prev => (
      {
        ...prev,
        [name]: value
      }
    ))
  }
  return (
    <form className='absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col rounded-xl w-[500px] bg-gray-100 '>
      <div className='text-gray-50 flex flex-col gap-2 items-center py-8 bg-[rgb(43,124,110)] rounded-t-xl'>
        <img src={logo} alt="Carait Clinic Logo" className='border rounded-full'/>
        <h3 className=' font-semibold text-2xl'>Welcome Back</h3>
        <p>Sign in to your patient account</p>
      </div>

      <div className='flex flex-col gap-2 my-6 px-12'>
        <label className='flex flex-col gap-1'>
          <p className='text-gray-500 font-semibold'>EMAIL ADDRESS</p>
          <input type="text" placeholder='you@example.com' className='border-[1px] border-gray-400 w-full py-3 px-4 rounded-md'
          name='email'
          onChange={handleFormChange}
          value={form.email}/>
        </label>

        <label className='flex flex-col gap-1 relative'>
          <div className='flex justify-between'>
            <p className='text-gray-500 font-semibold'>PASSWORD</p>
            <NavLink to="/forgot-password" className='text-[rgb(43,124,110)] font-semibold'>Forgot password?</NavLink>
          </div>
          <input type={showPassword ? 'text' : 'password'} placeholder='********' className='border-[1px] border-gray-400 w-full py-3 px-4 rounded-md'
          name='password'
          onChange={handleFormChange}
          value={form.password}/>

          {
            !showPassword ? 
            <FaRegEye onClick={() => {setShowPassword(true)}} className='h-5 w-5 cursor-pointer absolute right-16 top-[52px] -translate-y-1/2'/>
            :
            <FaRegEyeSlash onClick={() => {setShowPassword(false)}} className='h-5 w-5 cursor-pointer absolute right-16 top-[52px] -translate-y-1/2'/>
          }
        </label>

          <button className='bg-[rgb(43,124,110)] text-gray-50 mt-8 font-semibold py-3 rounded-md'>SIGN IN</button>
          <p className='text-center'>Don't have an account? <NavLink to={'/register'} className={'text-[rgb(43,124,110)]  cursor-pointer hover:text-[rgb(39,109,98)] duration-300'}>Register here</NavLink></p>
      </div>
    </form>
  )
}

export default PatientLogin