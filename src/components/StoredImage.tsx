import { useEffect, useState, type ReactNode } from 'react'
import { resolveStoredImage } from '../services/questionImages'

interface StoredImageProps {
  reference: string
  alt: string
  className?: string
  fallback?: ReactNode
  loadingFallback?: ReactNode
}

export function StoredImage({
  reference,
  alt,
  className,
  fallback,
  loadingFallback,
}: StoredImageProps) {
  const isDemoImage = reference.startsWith('demo-image://')
  const [source, setSource] = useState(isDemoImage ? '' : reference)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSource(isDemoImage ? '' : reference)
    setFailed(false)
    void resolveStoredImage(reference).then((resolved) => {
      const resolvedObjectUrl = resolved.startsWith('blob:') ? resolved : ''
      if (!active) {
        if (resolvedObjectUrl) URL.revokeObjectURL(resolvedObjectUrl)
        return
      }
      objectUrl = resolvedObjectUrl
      setSource(resolved)
      if (!resolved) setFailed(true)
    }).catch(() => active && setFailed(true))
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isDemoImage, reference])

  if (failed) return fallback ?? <div className={`image-fallback ${className ?? ''}`} role="img" aria-label="Image failed to load">Image unavailable</div>
  if (!source) return loadingFallback ?? fallback ?? <div className={`image-fallback ${className ?? ''}`} role="status">Loading image…</div>
  return <img src={source} alt={alt} className={className} onError={() => setFailed(true)} />
}
