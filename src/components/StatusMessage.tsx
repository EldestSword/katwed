import type { HTMLAttributes, ReactNode } from 'react'

type StatusMessageProps = HTMLAttributes<HTMLDivElement> & {
  tone?: 'info' | 'error' | 'success'
  children: ReactNode
}

export function StatusMessage({ tone = 'info', children, className = '', role, ...props }: StatusMessageProps) {
  return <div {...props} className={`status-message status-message--${tone} ${className}`.trim()} role={role ?? (tone === 'error' ? 'alert' : 'status')}>{children}</div>
}
