import { BrandBang } from './design-system/BrandBang'

export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return (
    <main className="centred-screen loading-screen" aria-busy="true">
      <div className="loading-status" role="status" aria-live="polite">
        <BrandBang className="loading-status__mark" />
        <p>{message}</p>
        <span className="loading-status__pulse" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </main>
  )
}
