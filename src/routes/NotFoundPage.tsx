import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <main className="centred-screen"><p className="giant-number">404</p><h1>This face doesn’t ring a bell</h1><p>The page wandered off to mingle.</p><Link className="button button--primary" to="/">Back home</Link></main>
}
