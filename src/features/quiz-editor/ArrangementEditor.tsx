import type { MatchingQuestion, OrderingQuestion } from '../../types/domain'

export function ArrangementEditor({ question, onChange }: { question: OrderingQuestion | MatchingQuestion; onChange(question: OrderingQuestion | MatchingQuestion): void }) {
  const count = question.type === 'ordering' ? question.items.length : question.leftItems.length
  const move = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= count) return
    if (question.type === 'ordering') {
      const correctItemIds = [...question.correctItemIds]
      ;[correctItemIds[index], correctItemIds[target]] = [correctItemIds[target], correctItemIds[index]]
      onChange({ ...question, correctItemIds })
    } else {
      const correctPairs = [...question.correctPairs]
      ;[correctPairs[index], correctPairs[target]] = [correctPairs[target], correctPairs[index]]
      onChange({ ...question, correctPairs })
    }
  }
  const remove = (index: number) => {
    if (count <= 2) return
    if (question.type === 'ordering') {
      const id = question.correctItemIds[index]
      onChange({ ...question, items: question.items.filter((item) => item.id !== id), correctItemIds: question.correctItemIds.filter((item) => item !== id) })
    } else {
      const pair = question.correctPairs[index]
      onChange({ ...question, leftItems: question.leftItems.filter((item) => item.id !== pair.leftId), rightItems: question.rightItems.filter((item) => item.id !== pair.rightId), correctPairs: question.correctPairs.filter((_, i) => i !== index) })
    }
  }
  const add = () => {
    if (count >= 8) return
    if (question.type === 'ordering') {
      const item = { id: crypto.randomUUID(), label: `Item ${count + 1}` }
      onChange({ ...question, items: [...question.items, item], correctItemIds: [...question.correctItemIds, item.id] })
    } else {
      const left = { id: crypto.randomUUID(), label: `Left ${count + 1}` }, right = { id: crypto.randomUUID(), label: `Right ${count + 1}` }
      onChange({ ...question, leftItems: [...question.leftItems, left], rightItems: [...question.rightItems, right], correctPairs: [...question.correctPairs, { leftId: left.id, rightId: right.id }] })
    }
  }
  return <fieldset className="arrangement-editor"><legend>{question.type === 'ordering' ? 'Correct order' : 'Correct pairs'}</legend>
    <p>{question.type === 'ordering' ? 'Arrange the correct sequence here.' : 'Each row is one correct pair.'} Players receive scrambled items.</p>
    {Array.from({ length: count }, (_, index) => <div className="arrangement-editor-row" key={question.type === 'ordering' ? question.correctItemIds[index] : question.correctPairs[index].leftId}>
      <span>{index + 1}</span>
      {question.type === 'ordering' ? <label>Item {index + 1}<input maxLength={120} value={question.items.find((item) => item.id === question.correctItemIds[index])?.label ?? ''} onChange={(event) => onChange({ ...question, items: question.items.map((item) => item.id === question.correctItemIds[index] ? { ...item, label: event.target.value } : item) })} /></label>
        : (['left', 'right'] as const).map((side) => {
          const key = side === 'left' ? 'leftItems' : 'rightItems'
          const id = side === 'left' ? question.correctPairs[index].leftId : question.correctPairs[index].rightId
          return <label key={side}>{side === 'left' ? 'Left' : 'Right'} {index + 1}<input maxLength={120} value={question[key].find((item) => item.id === id)?.label ?? ''} onChange={(event) => onChange({ ...question, [key]: question[key].map((item) => item.id === id ? { ...item, label: event.target.value } : item) })} /></label>
        })}
      <div className="arrangement-editor-controls"><button type="button" disabled={index === 0} aria-label={`Move row ${index + 1} up`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === count - 1} aria-label={`Move row ${index + 1} down`} onClick={() => move(index, 1)}>↓</button><button type="button" disabled={count <= 2} aria-label={`Remove row ${index + 1}`} onClick={() => remove(index)}>Remove</button></div>
    </div>)}
    <button type="button" className="button button--secondary" disabled={count >= 8} onClick={add}>{question.type === 'ordering' ? 'Add item' : 'Add pair'}</button>
    {question.type === 'matching' && <label>Matching scoring<select value={question.scoringMode} onChange={(event) => onChange({ ...question, scoringMode: event.target.value as 'exact' | 'partial' })}><option value="partial">Partial — points for each correct pair</option><option value="exact">Exact — all pairs required</option></select></label>}
  </fieldset>
}
