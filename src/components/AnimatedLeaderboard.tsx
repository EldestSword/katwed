import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { compareLeaderboards } from '../features/game/leaderboardMovement'
import { selectLiveCommentary, type StreakCommentary } from '../features/game/streakCommentary'
import type { Player } from '../types/domain'
import { useReducedMotion } from '../hooks/useReducedMotion'
import type { LeaderboardReveal } from '../hooks/useRevealedLeaderboard'
import { LeaderboardRow } from './Leaderboard'

const COUNT_START_MS = 250
const COUNT_DURATION_MS = 750
const MOVE_START_MS = 1100
const MOVE_DURATION_MS = 900
const CLEAR_MARKERS_MS = 2600
type RevealStage = 'holding' | 'counting' | 'moving' | 'settled'

interface AnimatedLeaderboardProps {
  reveal: LeaderboardReveal
  limit?: number
  onSettled(id: number): void
  streakEvent?: StreakCommentary | null
  players?: readonly Player[]
}

export function AnimatedLeaderboard({ reveal, limit, onSettled, streakEvent, players }: AnimatedLeaderboardProps) {
  // Each revealed snapshot owns one sequence. Polling copies do not remount it.
  return <LeaderboardAnimation key={reveal.id} reveal={reveal} limit={limit} onSettled={onSettled} streakEvent={streakEvent} players={players} />
}

function LeaderboardAnimation({ reveal, limit, onSettled, streakEvent = null, players }: AnimatedLeaderboardProps) {
  const reduced = useReducedMotion()
  const entries = useMemo(() => limit ? reveal.entries.slice(0, limit) : reveal.entries, [reveal.entries, limit])
  const previous = useMemo(() => new Map((limit ? reveal.previous?.slice(0, limit) : reveal.previous)?.map((entry) => [entry.playerId, entry])), [reveal.previous, limit])
  const movements = useMemo(() => new Map(compareLeaderboards(reveal.previous, reveal.entries).map((movement) => [movement.playerId, movement])), [reveal])
  const commentary = useMemo(() => selectLiveCommentary(reveal.previous, reveal.entries, streakEvent), [reveal, streakEvent])
  const startingOrder = useMemo(() => {
    const current = new Map(entries.map((entry) => [entry.playerId, entry]))
    return [...previous.keys()].flatMap((id) => current.has(id) ? [current.get(id)!] : [])
      .concat(entries.filter((entry) => !previous.has(entry.playerId)))
  }, [entries, previous])
  const changed = Boolean(reveal.previous?.length) && entries.some((entry, index) => {
    const old = previous.get(entry.playerId)
    return (old && (old.totalScore !== entry.totalScore || old.rank !== entry.rank)) || startingOrder[index]?.playerId !== entry.playerId
  })
  const [stage, setStage] = useState<RevealStage>(changed && !reduced ? 'holding' : 'settled')
  const [progress, setProgress] = useState(changed && !reduced ? 0 : 1)
  const [markers, setMarkers] = useState(true)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const firstPositions = useRef(new Map<string, { left: number; top: number }>())
  const completed = useRef(false)

  useEffect(() => {
    if (reduced || !changed || completed.current) {
      completed.current = true
      setProgress(1)
      setStage('settled')
      onSettled(reveal.id)
      return
    }
    let frame = 0
    setProgress(0)
    setStage('holding')
    setMarkers(true)
    const count = window.setTimeout(() => {
      setStage('counting')
      const start = performance.now()
      const tick = (now: number) => {
        const fraction = Math.min(1, (now - start) / COUNT_DURATION_MS)
        setProgress(1 - (1 - fraction) ** 3)
        if (fraction < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, COUNT_START_MS)
    const move = window.setTimeout(() => {
      cancelAnimationFrame(frame)
      setProgress(1)
      // One read batch before reordering; no layout reads happen in the score clock.
      firstPositions.current = new Map([...rows.current].map(([id, row]) => [id, row.getBoundingClientRect()]))
      setStage('moving')
    }, MOVE_START_MS)
    const finish = window.setTimeout(() => {
      completed.current = true
      setStage('settled')
      onSettled(reveal.id)
    }, MOVE_START_MS + MOVE_DURATION_MS)
    const clear = window.setTimeout(() => setMarkers(false), CLEAR_MARKERS_MS)
    return () => {
      for (const timer of [count, move, finish, clear]) window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [changed, onSettled, reduced, reveal.id])

  useLayoutEffect(() => {
    if (stage !== 'moving' || reduced) return
    // Read every final position before writing animations to avoid interleaved layout work.
    const positions = [...rows.current].map(([id, row]) => ({ row, first: firstPositions.current.get(id), last: row.getBoundingClientRect() }))
    const animations = positions.flatMap(({ row, first, last }) => {
      if (!first || typeof row.animate !== 'function') return []
      const x = first.left - last.left
      const y = first.top - last.top
      if (Math.abs(x) < .5 && Math.abs(y) < .5) return []
      return [row.animate([
        { transform: `translate(${x}px, ${y}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: MOVE_DURATION_MS, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' })]
    })
    return () => animations.forEach((animation) => animation.cancel())
  }, [stage, reduced])

  const settled = reduced || stage === 'settled'
  const reordered = settled || stage === 'moving'
  const orderedEntries = reordered ? entries : startingOrder
  return (
    <div className="animated-leaderboard" data-reveal-stage={settled ? 'settled' : stage} data-reduced-motion={reduced || undefined}>
      {entries.length ? <ol className="leaderboard leaderboard--presentation leaderboard--animated" aria-label="Leaderboard" aria-live="off" data-variant="presentation">
        {orderedEntries.map((entry) => {
          const old = previous.get(entry.playerId)
          const movement = movements.get(entry.playerId)
          return <LeaderboardRow key={entry.playerId} showStreak entry={{ ...entry, currentCorrectStreak: players?.find(player => player.id === entry.playerId)?.currentCorrectStreak ?? entry.currentCorrectStreak }}
            rowRef={(row) => { if (row) rows.current.set(entry.playerId, row); else rows.current.delete(entry.playerId) }}
            visual={!settled ? {
              score: old ? Math.round(old.totalScore + (entry.totalScore - old.totalScore) * progress) : entry.totalScore,
              rank: old?.rank ?? entry.rank,
              layoutRank: reordered ? entry.rank : old?.rank ?? entry.rank,
            } : undefined}
            movement={markers || reduced ? movement?.places : undefined}
            emphasised={!settled && commentary?.playerId === entry.playerId} />
        })}
      </ol> : <p className="empty-note">No scores yet. A beautifully blank slate.</p>}
      <div className="leaderboard-commentary" role="status" aria-live="polite" aria-atomic="true" data-commentary={settled ? commentary?.kind : undefined}>
        {settled && commentary && <p>{commentary.message}</p>}
      </div>
    </div>
  )
}
