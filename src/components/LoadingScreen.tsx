import { Logo } from './AppShell'

export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return <main className="centred-screen"><Logo /><div className="loader" aria-hidden="true" /><p role="status">{message}</p></main>
}
