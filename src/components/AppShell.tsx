import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { config } from '../lib/config'

export function Logo() {
  return <span className="brand-mark" aria-label="Katwed!"><span className="brand-mark__kat">Kat</span><span className="brand-mark__wed">wed</span><span className="brand-bang" aria-hidden="true">!</span></span>
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const activeGame = location.pathname.startsWith('/play/') || location.pathname.startsWith('/host/game/')
  const hostArea = location.pathname.startsWith('/host') && location.pathname !== '/host/login' && !activeGame
  return (
    <div className={`app-shell${hostArea ? ' app-shell--host' : ''}`}>
      {!activeGame && (
        <header className={hostArea ? 'host-shell-header' : 'site-header'}>
          <Link to={hostArea ? '/host' : '/'} className="brand-link"><Logo /></Link>
          <nav aria-label={hostArea ? 'Host navigation' : 'Main navigation'}>
            {hostArea ? <>
              <Link to="/host" aria-current={location.pathname === '/host' ? 'page' : undefined}>Quizzes</Link>
              <Link to="/host/storage" aria-current={location.pathname === '/host/storage' ? 'page' : undefined}>Storage</Link>
              <Link to="/host/design-system" aria-current={location.pathname === '/host/design-system' ? 'page' : undefined}>Visual lab</Link>
            </> : <>
              <Link to="/join">Join</Link>
              <Link to="/host">Host</Link>
            </>}
          </nav>
        </header>
      )}
      {config.demoMode && <div className="demo-ribbon" role="status">Development demo mode · data stays in this browser</div>}
      <div className="app-content">{children}</div>
    </div>
  )
}
