export function StatusMessage({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: React.ReactNode }) {
  return <div className={`status-message status-message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}
