import { useEffect, useMemo, useState } from 'react'
import type { QuestionMedia as QuestionMediaModel } from '../types/domain'
import { ImageViewer } from './ImageViewer'
import { QuestionImage } from './QuestionImage'
import { TILE_REVEAL_COUNT, createTileRevealRanks } from '../features/media/tileReveal'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

export function QuestionMedia({
  media,
  openedAt,
  compact = false,
  allowEnlarge = true,
}: {
  media: QuestionMediaModel
  openedAt: string | null
  compact?: boolean
  allowEnlarge?: boolean
}) {
  const [now, setNow] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const reducedMotion = useReducedMotion()
  const duration = media.type === 'image' ? media.revealDurationSeconds * 1000 : 0
  const tileRevealRanks = useMemo(
    () => createTileRevealRanks(media.type === 'image' ? media.path : '', openedAt),
    [media, openedAt],
  )
  const progress = useMemo(() => {
    if (!openedAt || !duration) return 1
    return Math.max(0, Math.min(1, (now - new Date(openedAt).getTime()) / duration))
  }, [duration, now, openedAt])

  useEffect(() => {
    setNow(Date.now())
  }, [openedAt])

  useEffect(() => {
    if (progress >= 1 || reducedMotion) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [progress, reducedMotion])

  if (media.type === 'none') return null
  if (media.type === 'youtube') {
    const params = new URLSearchParams()
    if (media.startSeconds !== undefined) params.set('start', String(media.startSeconds))
    if (media.endSeconds !== undefined) params.set('end', String(media.endSeconds))
    if (compact) params.set('mute', '1')
    return (
      <div className="youtube-frame">
        <iframe
          title="YouTube question media"
          src={`https://www.youtube-nocookie.com/embed/${media.videoId}?${params.toString()}`}
          allow="accelerometer; encrypted-media; picture-in-picture"
          allowFullScreen
        />
        <p className="media-note">Use the video’s own play control if autoplay is blocked.</p>
      </div>
    )
  }

  const effectiveProgress = reducedMotion ? 1 : progress
  const style = media.revealEffect === 'blur'
    ? { filter: `blur(${(1 - effectiveProgress) * 28}px)` }
    : media.revealEffect === 'pixelate'
      ? { filter: `blur(${(1 - effectiveProgress) * 12}px)`, transform: `scale(${1 + (1 - effectiveProgress) * 0.04})` }
      : media.revealEffect === 'zoom-out'
        ? { transform: `scale(${1 + (1 - effectiveProgress) * 1.3})` }
        : undefined
  return (
    <div className={`question-media question-media--${media.revealEffect}`}>
      <div className="question-media__image" style={style}>
        <QuestionImage path={media.path} alt={media.altText || 'Question image'} />
      </div>
      {media.revealEffect === 'tiles' && effectiveProgress < 1 && (
        <div className="tile-cover" aria-hidden="true">
          {Array.from({ length: TILE_REVEAL_COUNT }, (_, index) => (
            <span
              key={index}
              data-tile-index={index}
              data-reveal-rank={tileRevealRanks[index]}
              style={{ opacity: tileRevealRanks[index] / TILE_REVEAL_COUNT < effectiveProgress ? 0 : 1 }}
            />
          ))}
        </div>
      )}
      {allowEnlarge && (
        <button className="enlarge-button" type="button" onClick={(event) => {
          event.stopPropagation()
          setViewerOpen(true)
        }}>Enlarge image</button>
      )}
      {viewerOpen && <ImageViewer path={media.path} alt={media.altText || 'Question image'} onClose={() => setViewerOpen(false)} />}
    </div>
  )
}
