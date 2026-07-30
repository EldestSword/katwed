import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <main className="centred-screen"><p className="giant-number">404</p><h1>This page does not ring a bell</h1><p>It may have wandered off between rounds.</p><Link className="button button--primary" to="/">Back home</Link></main>
}
