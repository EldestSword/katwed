import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <main className="centred-screen not-found-screen"><p className="eyebrow">Page not found</p><p className="giant-number" aria-hidden="true">404</p><h1>This page does not ring a bell</h1><p>It may have wandered off between rounds.</p><div className="recovery-actions"><Link className="button button--primary" to="/">Back home</Link><Link className="button button--secondary" to="/join">Join a game</Link></div></main>
}
