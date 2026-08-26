export function BrandBang({ className = '' }: { className?: string }) {
  return <span className={`brand-bang-motif ${className}`.trim()} aria-hidden="true">!</span>
}
