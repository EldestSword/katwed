import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { QuestionMedia as QuestionMediaModel } from '../types/domain'
import { ImageViewer } from './ImageViewer'
import { QuestionImage } from './QuestionImage'
import { PROGRESSIVE_NEUTRAL_ALT, PROGRESSIVE_REDUCED_MOTION_STEPS, progressiveRevealProgress } from '../features/scoring/progressiveReveal'
import {
  LEGACY_TILE_COLUMNS,
  LEGACY_TILE_ROWS,
  TILE_REVEAL_COUNT,
  createTileRevealRanks,
} from '../features/media/tileReveal'

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
  progressiveRevealEnabled = false,
  revealed = false,
}: {
  media: QuestionMediaModel
  openedAt: string | null
  compact?: boolean
  allowEnlarge?: boolean
  progressiveRevealEnabled?: boolean
  revealed?: boolean
}) {
  const [now, setNow] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const imagePath = media.type === 'image' ? media.path : ''
  const reducedMotion = useReducedMotion()
  const duration = media.type === 'image' ? media.revealDurationSeconds * 1000 : 0
  const tileColumns = media.type === 'image' && media.tileGridSize
    ? media.tileGridSize
    : LEGACY_TILE_COLUMNS
  const tileRows = media.type === 'image' && media.tileGridSize
    ? media.tileGridSize
    : LEGACY_TILE_ROWS
  const tileCount = media.type === 'image' && media.tileGridSize
    ? media.tileGridSize * media.tileGridSize
    : TILE_REVEAL_COUNT
  const tileRevealRanks = useMemo(
    () => createTileRevealRanks(media.type === 'image' ? media.path : '', openedAt, tileCount),
    [media, openedAt, tileCount],
  )
  const progress = useMemo(() => {
    if (progressiveRevealEnabled) return revealed ? 1 : progressiveRevealProgress(openedAt, now, duration)
    if (!openedAt || !duration) return 1
    return Math.max(0, Math.min(1, (now - new Date(openedAt).getTime()) / duration))
  }, [duration, now, openedAt, progressiveRevealEnabled, revealed])

  useEffect(() => {
    setNow(Date.now())
  }, [openedAt])

  useEffect(() => {
    if (progress >= 1 || (reducedMotion && !progressiveRevealEnabled)) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [progress, reducedMotion, progressiveRevealEnabled])

  useEffect(() => setViewerOpen(false), [imagePath, openedAt, progressiveRevealEnabled])

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

  const effectiveProgress = reducedMotion
    ? progressiveRevealEnabled ? Math.floor(progress * PROGRESSIVE_REDUCED_MOTION_STEPS) / PROGRESSIVE_REDUCED_MOTION_STEPS : 1
    : progress
  const mayEnlarge = allowEnlarge && (!progressiveRevealEnabled || progress >= 1)
  const alt = progressiveRevealEnabled && progress < 1 ? PROGRESSIVE_NEUTRAL_ALT : media.altText || 'Question image'
  const style = media.revealEffect === 'blur'
    ? { filter: `blur(${(1 - effectiveProgress) * 28}px)` }
    : media.revealEffect === 'pixelate'
      ? { filter: `blur(${(1 - effectiveProgress) * 12}px)`, transform: `scale(${1 + (1 - effectiveProgress) * 0.04})` }
      : media.revealEffect === 'zoom-out'
        ? { transform: `scale(${1 + (1 - effectiveProgress) * 1.3})` }
        : undefined
  return (
    <div className={`question-media question-media--${media.revealEffect}`} data-progressive={progressiveRevealEnabled || undefined} data-reveal-progress={effectiveProgress}>
      <div className="question-media__image" style={{ ...style, ...(progressiveRevealEnabled && reducedMotion ? { transition: 'none' } : {}) }}>
        <QuestionImage path={media.path} alt={alt} />
      </div>
      {media.revealEffect === 'tiles' && effectiveProgress < 1 && (
        <div
          className="tile-cover"
          aria-hidden="true"
          style={{ '--tile-columns': tileColumns, '--tile-rows': tileRows } as CSSProperties}
        >
          {Array.from({ length: tileCount }, (_, index) => (
            <span
              key={index}
              data-tile-index={index}
              data-reveal-rank={tileRevealRanks[index]}
              style={{ opacity: tileRevealRanks[index] / tileCount < effectiveProgress ? 0 : 1 }}
            />
          ))}
        </div>
      )}
      {mayEnlarge && (
        <button className="enlarge-button" type="button" onClick={(event) => {
          event.stopPropagation()
          setViewerOpen(true)
        }}>Enlarge image</button>
      )}
      {viewerOpen && mayEnlarge && <ImageViewer path={media.path} alt={alt} onClose={() => setViewerOpen(false)} />}
    </div>
  )
}
