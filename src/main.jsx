import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ThemeProvider } from '@/lib/ThemeContext'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import UpdateBanner from '@/components/UpdateBanner'
import TouchMode from '@/components/touch/TouchMode'
// Catches Chrome's install event on any screen, before the layout mounts.
import '@/lib/screen/installPrompt'

// Module 12: the theme provider and the corner switcher live OUTSIDE the
// router and the auth gate on purpose, so the switcher is also present on
// /login, /register, the onboarding screen and the 404. Module 30: the
// new-version notice sits beside it for the same reason (a tab parked on the
// login screen is just as stale).
ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <App />
    <ThemeSwitcher />
    <UpdateBanner />
    <TouchMode />
  </ThemeProvider>
)
