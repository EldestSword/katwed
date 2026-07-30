import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { config } from '../lib/config'

export function Logo() {
  return <span className="brand-mark" aria-label="Katwed!">Kat<span>wed!</span></span>
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const activeGame = location.pathname.startsWith('/play/') || location.pathname.startsWith('/host/game/')
  return (
    <div className="app-shell">
      {!activeGame && (
        <header className="site-header">
          <Link to="/" className="brand-link"><Logo /></Link>
          <nav aria-label="Main navigation">
            <Link to="/join">Join</Link>
            <Link to="/host">Host</Link>
          </nav>
        </header>
      )}
      {config.demoMode && <div className="demo-ribbon" role="status">Development demo mode · data stays in this browser</div>}
      <div className="app-content">{children}</div>
    </div>
  )
}
