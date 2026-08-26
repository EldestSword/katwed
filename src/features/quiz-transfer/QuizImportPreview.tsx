import { getQuizBackground } from '../themes/quizBackgrounds'
import { quizThemes } from '../themes/quizThemes'
import type { QuizImportSummary } from './katwedQuizFormat'
import { getAnswerPaletteDefinition } from '../answer-palettes/answerPalettes'

interface QuizImportPreviewProps {
  summary: QuizImportSummary
  importing: boolean
  onImport: () => void
  onCancel: () => void
}

export function QuizImportPreview({
  summary,
  importing,
  onImport,
  onCancel,
}: QuizImportPreviewProps) {
  return (
    <section className="import-preview" aria-label="Quiz import preview">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ready to import</p>
          <h2>{summary.title}</h2>
        </div>
        <span className="quiz-type-badge">
          {summary.quizType === 'head-to-head' ? 'Head to Head' : 'Standard'}
        </span>
      </div>
      <dl className="import-preview__metadata">
        <div><dt>Questions</dt><dd>{summary.questionCount}</dd></div>
        {summary.quizType === 'head-to-head' && (
          <div><dt>Competitors</dt><dd>{summary.competitorNames.join(' vs ')}</dd></div>
        )}
        <div>
          <dt>Theme</dt>
          <dd>{quizThemes.find((theme) => theme.id === summary.themeId)?.name ?? summary.themeId}</dd>
        </div>
        <div>
          <dt>Background</dt>
          <dd>{summary.backgroundId ? getQuizBackground(summary.backgroundId)?.name : 'Theme default'}</dd>
        </div>
        <div><dt>Answer palette</dt><dd>{summary.answerPaletteId === 'custom' ? 'Custom' : getAnswerPaletteDefinition(summary.answerPaletteId)?.name ?? 'Classic'}</dd></div>
        <div><dt>Referenced images</dt><dd>{summary.hasReferencedMedia ? 'Present' : 'None'}</dd></div>
      </dl>
      <p>This preview hides questions and answers. Importing always creates a new Active quiz.</p>
      <div className="card-actions">
        <button className="button button--primary" type="button" disabled={importing} onClick={onImport}>
          {importing ? 'Importing…' : 'Import'}
        </button>
        <button className="button button--ghost" type="button" disabled={importing} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}
