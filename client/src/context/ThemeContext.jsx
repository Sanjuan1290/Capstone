import { createContext, useContext, useEffect } from 'react'

const ThemeContext = createContext({theme: 'light'})

export const ThemeProvider = ({children}) => {
  useEffect(() => {
    document.documentElement.classList.remove('dark')
    document.body.dataset.theme = 'light'
    // Remove old dark-mode selection from browsers that previously enabled it.
    try { localStorage.removeItem('app_theme') } catch { /* storage disabled */ }
  }, [])
  return <ThemeContext.Provider value={{theme:'light'}}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
