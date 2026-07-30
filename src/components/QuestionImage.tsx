import { useEffect, useState } from 'react'
import { resolveQuestionImage } from '../services/questionImages'

export function QuestionImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [source, setSource] = useState(path.startsWith('demo-image://') ? '' : path)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setFailed(false)
    void resolveQuestionImage(path).then((resolved) => {
      if (!active) return
      objectUrl = resolved.startsWith('blob:') ? resolved : ''
      setSource(resolved)
      if (!resolved) setFailed(true)
    }).catch(() => active && setFailed(true))
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  if (failed) return <div className={`image-fallback ${className ?? ''}`} role="img" aria-label="Question image failed to load">Image unavailable</div>
  if (!source) return <div className={`image-fallback ${className ?? ''}`} role="status">Loading image…</div>
  return <img src={source} alt={alt} className={className} onError={() => setFailed(true)} />
}
