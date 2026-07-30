import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AuthProvider } from './features/auth/AuthProvider'
import './styles/global.css'

const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  </React.StrictMode>,
)
