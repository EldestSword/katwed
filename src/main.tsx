import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { AuthProvider } from './features/auth/AuthProvider'
import './styles/global.css'
import './styles/tokens.css'
import './styles/theme-fonts.css'
import './styles/typography.css'
import './styles/primitives.css'
import './styles/design-system.css'
import './styles/live-game.css'
import './styles/presentation.css'
import './styles/player.css'
import './styles/backstage.css'
import './styles/audio.css'
import './styles/teams.css'
import './styles/arrangement.css'
import './styles/connections.css'
import './styles/progressive-reveal.css'
import './styles/buzz.css'
import './styles/survivor.css'
import './styles/tiebreakers.css'
import './styles/premium-studio.css'
import './styles/studio-settings-mobile.css'
import './styles/landing-synthwave.css'
import './styles/brand-polish.css'
import './styles/premium-compat.css'

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
