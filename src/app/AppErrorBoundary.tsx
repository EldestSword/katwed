import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Logo } from '../components/AppShell'

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unexpected Katwed rendering error', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-screen">
          <Logo />
          <h1>Something went sideways</h1>
          <p>The app hit an unexpected problem. Your saved game data should still be there.</p>
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}>Reload Katwed!</button>
        </main>
      )
    }
    return this.props.children
  }
}
