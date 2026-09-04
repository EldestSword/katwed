import { useState } from 'react'
import type { MatchingPair, TextItem } from '../../types/domain'

export function PlayerMatchingAnswer({ leftItems, rightItems, pairs, disabled = false, onChange }: {
  leftItems: TextItem[]; rightItems: TextItem[]; pairs: MatchingPair[]; disabled?: boolean; onChange(pairs: MatchingPair[]): void
}) {
  const [selected, setSelected] = useState<{ side: 'left' | 'right'; id: string } | null>(null)
  const choose = (side: 'left' | 'right', id: string) => {
    if (disabled) return
    if (selected && selected.side !== side) {
      const leftId = side === 'left' ? id : selected.id, rightId = side === 'right' ? id : selected.id
      onChange([...pairs.filter((pair) => pair.leftId !== leftId && pair.rightId !== rightId), { leftId, rightId }])
      setSelected(null)
    } else {
      onChange(pairs.filter((pair) => (side === 'left' ? pair.leftId : pair.rightId) !== id))
      setSelected(selected?.id === id ? null : { side, id })
    }
  }
  return <div className="matching-answer">
    <p>Choose an item, then its partner on the other side. Choose a paired item to change it.</p>
    <p role="status">{pairs.length} of {leftItems.length} pairs made{selected ? ' · Choose its partner' : ''}</p>
    <div className="matching-columns">{(['left', 'right'] as const).map((side) => <div role="group" aria-label={`${side === 'left' ? 'Left' : 'Right'} items`} key={side}>
      <h2>{side === 'left' ? 'Left' : 'Right'}</h2>
      {(side === 'left' ? leftItems : rightItems).map((item) => {
        const pair = pairs.find((candidate) => (side === 'left' ? candidate.leftId : candidate.rightId) === item.id)
        const number = pair ? leftItems.findIndex((left) => left.id === pair.leftId) + 1 : null
        return <button type="button" className={`matching-card${pair ? ' is-paired' : ''}`} key={item.id} disabled={disabled}
          aria-pressed={selected?.side === side && selected.id === item.id} onClick={() => choose(side, item.id)}>
          <strong>{item.label}</strong><span>{number ? `Pair ${number}` : 'Unpaired'}</span>
        </button>
      })}
    </div>)}</div>
  </div>
}
