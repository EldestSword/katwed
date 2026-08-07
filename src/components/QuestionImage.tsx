import { StoredImage } from './StoredImage'

export function QuestionImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  return (
    <StoredImage
      reference={path}
      alt={alt}
      className={className}
      fallback={<div className={`image-fallback ${className ?? ''}`} role="img" aria-label="Question image failed to load">Image unavailable</div>}
      loadingFallback={<div className={`image-fallback ${className ?? ''}`} role="status">Loading image…</div>}
    />
  )
}
