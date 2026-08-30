import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnswerTile, type AnswerTileState } from '../components/design-system/AnswerTile'
import { BrandBang } from '../components/design-system/BrandBang'
import { GameBadge, type GameBadgeTone } from '../components/design-system/GameBadge'
import { GameTimer } from '../components/design-system/GameTimer'
import { LobbyPlayerTile, QuestionProgressBadge, RevealAnswerTile, SubmissionStatus } from '../components/design-system/LiveGamePrimitives'
import { ImageViewer } from '../components/ImageViewer'
import { answerColourStyle, answerPalettes, resolveAnswerColours } from '../features/answer-palettes/answerPalettes'
import { backgroundsForTheme } from '../features/themes/quizBackgrounds'
import { quizThemeSurfaceProps } from '../features/themes/quizThemeSurface'
import { quizThemes } from '../features/themes/quizThemes'
import { ThemeBrowser } from '../features/themes/ThemeBrowser'
import { themeFonts } from '../features/themes/themeFonts'
import type { AnswerPaletteId, QuizBackgroundId, QuizThemeId } from '../types/domain'
import { HostAudioControls } from '../components/HostAudioControls'

const tileExamples: readonly {
  label: string
  state?: AnswerTileState
  selected?: boolean
  disabled?: boolean
  image?: boolean
  className?: string
}[] = [
  { label: 'Default answer' },
  { label: 'Selected answer', selected: true },
  { label: 'Locked answer', state: 'locked' },
  { label: 'Correct answer', state: 'correct' },
  { label: 'Incorrect answer', state: 'incorrect' },
  { label: 'Disabled answer', disabled: true },
  { label: 'Image answer', image: true },
  { label: 'Focus treatment', className: 'is-focus-demo' },
]

const badgeExamples: readonly [string, GameBadgeTone][] = [
  ['Lobby', 'info'], ['Double score', 'accent'], ['Connected', 'success'],
  ['Locked', 'warning'], ['Urgent', 'danger'], ['Archived', 'neutral'],
]

export function DesignSystemPage() {
  const [themeId, setThemeId] = useState<QuizThemeId>('katwed')
  const [backgroundId, setBackgroundId] = useState<QuizBackgroundId | null>(null)
  const [paletteId, setPaletteId] = useState<AnswerPaletteId>('katwed')
  const [selectedPosition, setSelectedPosition] = useState(1)
  const [motionKey, setMotionKey] = useState(0)
  const [imageOpen, setImageOpen] = useState(false)
  const colours = resolveAnswerColours(paletteId, null)
  const selectedTheme = quizThemes.find((theme) => theme.id === themeId) ?? quizThemes[0]

  function changeTheme(nextTheme: QuizThemeId) {
    setThemeId(nextTheme)
    setBackgroundId(null)
  }

  return (
    <main className="design-system-page">
      <header className="design-system-hero">
        <div>
          <p className="eyebrow">Protected host visual lab</p>
          <h1>Katwed! design system</h1>
          <p>Reusable foundations and live-game primitives for the Katwed stage and contestant control pad.</p>
        </div>
        <div className="heading-actions"><BrandBang /><Link className="button button--secondary" to="/host">Back to quizzes</Link></div>
      </header>

      <section className="design-system-controls surface surface--raised" aria-labelledby="lab-controls-heading">
        <div><h2 id="lab-controls-heading">Theme controls</h2><p>Switch the live specimen without changing any quiz data.</p></div>
        <label>Quiz theme<select value={themeId} onChange={(event) => changeTheme(event.target.value as QuizThemeId)}>{quizThemes.map((theme) => <option value={theme.id} key={theme.id}>{theme.name}</option>)}</select></label>
        <label>Background<select value={backgroundId ?? ''} onChange={(event) => setBackgroundId(event.target.value ? event.target.value as QuizBackgroundId : null)}><option value="">Theme default</option>{backgroundsForTheme(themeId).map((background) => <option value={background.id} key={background.id}>{background.name}</option>)}</select></label>
        <label>Answer palette<select value={paletteId} onChange={(event) => setPaletteId(event.target.value as AnswerPaletteId)}>{answerPalettes.map((palette) => <option value={palette.id} key={palette.id}>{palette.name}</option>)}</select></label>
      </section>

      <section className="design-system-stage quiz-themed-surface" {...quizThemeSurfaceProps(themeId, backgroundId)} aria-labelledby="answer-tiles-heading">
        <div className="design-system-stage__intro">
          <GameBadge tone="accent">{selectedTheme.name} theme</GameBadge>
          <div><p className="eyebrow">Core game primitive</p><h2 id="answer-tiles-heading">Answer tiles</h2></div>
          <GameTimer seconds={12} totalSeconds={30} />
        </div>
        <div className="design-system-answer-grid">
          {tileExamples.map((example, position) => (
            <AnswerTile
              key={example.label}
              label={example.label}
              accessibleLabel={example.label}
              position={position}
              selected={example.selected || selectedPosition === position}
              disabled={example.disabled}
              state={example.state}
              className={example.className}
              image={example.image ? { path: '/demo/portrait-1.svg', alt: 'Fictional portrait answer' } : undefined}
              style={answerColourStyle(colours, position)}
              onSelect={() => setSelectedPosition(position)}
              onEnlarge={example.image ? () => setImageOpen(true) : undefined}
            />
          ))}
        </div>
        {imageOpen && <ImageViewer path="/demo/portrait-1.svg" alt="Fictional portrait answer" onClose={() => setImageOpen(false)} />}
      </section>

      <section className="design-system-section" aria-labelledby="themes-heading">
        <div className="design-system-section__heading"><div><p className="eyebrow">Theme compatibility</p><h2 id="themes-heading">Selected quiz theme</h2></div><p>Use discovery below to inspect one semantic surface without rendering the full catalogue twice.</p></div>
        <div className="design-system-theme-grid">
          <article className="design-system-theme-card quiz-themed-surface" {...quizThemeSurfaceProps(selectedTheme.id)}>
            <GameBadge tone="accent">{selectedTheme.name}</GameBadge>
            <h3>{selectedTheme.name}</h3><p>{selectedTheme.description}</p>
            <div className="design-system-theme-card__swatches" aria-label={`${selectedTheme.name} key colours`}>{selectedTheme.swatches.map((colour) => <i key={colour} style={{ backgroundColor: colour }}><span className="sr-only">{colour}</span></i>)}</div>
          </article>
        </div>
      </section>

      <section className="design-system-section design-system-live-primitives" aria-labelledby="live-primitives-heading">
        <div className="design-system-section__heading"><div><p className="eyebrow">Live game language</p><h2 id="live-primitives-heading">Stage status and reveals</h2></div><p>Compact broadcast information, calm lobby arrivals and colour-independent answer payoff.</p></div>
        <div className="design-system-live-grid">
          <article className="surface surface--raised design-system-specimen">
            <h3>Question status</h3>
            <div className="design-system-row"><QuestionProgressBadge questionNumber={7} totalQuestions={20} /><GameBadge tone="accent">2x points</GameBadge></div>
            <SubmissionStatus submitted={6} total={8} />
            <ul className="design-system-lobby-tiles"><LobbyPlayerTile>Debs</LobbyPlayerTile><LobbyPlayerTile>Roger with a very long name</LobbyPlayerTile><LobbyPlayerTile connected={false}>Carol</LobbyPlayerTile></ul>
          </article>
          <article className="surface surface--raised design-system-specimen">
            <h3>Reveal answers</h3>
            <div className="design-system-reveal-grid"><RevealAnswerTile label="Paris" position={0} style={answerColourStyle(colours, 0)} correct responseCount={5} /><RevealAnswerTile label="London" position={1} style={answerColourStyle(colours, 1)} correct={false} responseCount={2} /></div>
          </article>
        </div>
      </section>

      <section className="design-system-section design-system-columns" aria-labelledby="primitives-heading">
        <div className="surface surface--raised design-system-specimen">
          <p className="eyebrow">Action hierarchy</p><h2 id="primitives-heading">Buttons</h2>
          <div className="design-system-row"><button className="button button--primary" type="button">Primary</button><button className="button button--secondary" type="button">Secondary</button><button className="button button--ghost" type="button">Ghost</button><button className="button button--danger" type="button">Danger</button><button className="button button--primary" type="button" disabled>Disabled</button><button className="button button--primary" type="button" aria-busy="true">Loading</button></div>
          <div className="design-system-dark-row"><button className="button button--light" type="button">Light on dark</button><button className="button button--ghost-light" type="button">Ghost light</button></div>
          <button className="button button--primary button--wide button--large" type="button">Wide large action</button>
        </div>
        <div className="surface surface--raised design-system-specimen">
          <p className="eyebrow">Status at a glance</p><h2>Badges and timers</h2>
          <div className="design-system-row">{badgeExamples.map(([label, tone]) => <GameBadge tone={tone} key={label}>{label}</GameBadge>)}</div>
          <div className="design-system-timers"><GameTimer seconds={24} /><GameTimer seconds={5} /><GameTimer seconds={0} /><GameTimer seconds={4} compact /></div>
        </div>
      </section>

      <section className="design-system-section design-system-columns" aria-labelledby="backstage-heading">
        <div className="surface surface--raised design-system-specimen"><p className="eyebrow">Pass 3 · Backstage</p><h2 id="backstage-heading">Professional host primitives</h2><div className="backstage-lab-row is-selected"><b>07</b><span><strong>Which of these launched first?</strong><small>Multiple select · Ross</small></span></div><div className="backstage-lab-row"><b>08</b><span><strong>Name both people</strong><small>Mash-up · Jess</small></span></div></div>
        <div className="surface surface--raised design-system-specimen"><p className="eyebrow">Production status</p><h2>Phase-led controls</h2><div className="backstage-lab-stats"><span><small>Time</small><strong>14s</strong></span><span><small>Answered</small><strong>6 / 8</strong></span><span><small>Connected</small><strong>8 / 8</strong></span></div><button className="button button--primary button--wide" type="button">Reveal answer</button></div>
      </section>

      <section className="design-system-section design-system-theme-browser" aria-labelledby="theme-browser-heading">
        <div className="design-system-section__heading"><div><p className="eyebrow">Growing catalogue</p><h2 id="theme-browser-heading">Theme discovery</h2></div><p>Search terms and stable categories keep the selector usable as the approved catalogue grows.</p></div>
        <ThemeBrowser selectedId={themeId} onSelect={changeTheme} description="Browse the current approved themes without changing quiz data." />
      </section>

      <section className="design-system-section" aria-labelledby="font-registry-heading">
        <div className="design-system-section__heading"><div><p className="eyebrow">Approved typography</p><h2 id="font-registry-heading">Theme font registry</h2></div><p>Theme authors choose a licensed registry ID; arbitrary font names and remote font URLs are not accepted.</p></div>
        <div className="design-system-font-grid">
          {themeFonts.map((font) => <article className="surface design-system-font-card" key={font.id}>
            <small>{font.category} · {font.weights}</small>
            <strong style={{ fontFamily: font.family }}>The quick quiz round</strong>
            <span>{font.name}</span>
          </article>)}
        </div>
      </section>

      <section className="design-system-section design-system-columns" aria-labelledby="audio-heading">
        <div className="surface surface--raised design-system-specimen"><p className="eyebrow">Audio Pass 1</p><h2 id="audio-heading">Presentation audio controls</h2><p>Local host-device preferences use the same compact control used by the live Controller.</p></div>
        <HostAudioControls soundPackId="katwed" />
      </section>

      <section className="design-system-section design-system-columns" aria-labelledby="foundation-heading">
        <div className="surface design-system-specimen">
          <p className="eyebrow">Type scale</p><h2 id="foundation-heading">Typography</h2><p className="design-system-display">Play loud. Host clearly.</p><h3>Display and section headings use Bricolage Grotesque.</h3><p>Utility copy and controls use the system UI stack for crisp, dependable reading at every size.</p><small>Small metadata remains legible and never carries meaning by colour alone.</small>
        </div>
        <form className="surface design-system-specimen" onSubmit={(event) => event.preventDefault()}>
          <p className="eyebrow">Clear interaction</p><h2>Form controls</h2><label htmlFor="lab-name">Player name</label><input id="lab-name" defaultValue="Taylor" /><label htmlFor="lab-mode">Question type</label><select id="lab-mode" defaultValue="single"><option value="single">Single choice</option><option value="multiple">Multiple select</option></select><label htmlFor="lab-notes">Supporting text</label><textarea id="lab-notes" defaultValue="A short clue for the room." /><label><input type="checkbox" defaultChecked /> Randomise options</label><input aria-label="Disabled field" value="Unavailable" disabled readOnly />
        </form>
      </section>

      <section className="design-system-section surface surface--raised design-system-motion" aria-labelledby="motion-heading">
        <div><p className="eyebrow">Purposeful feedback</p><h2 id="motion-heading">Motion primitives</h2><p>Short pop, rise and loading motions reinforce state changes. Reduced-motion preferences collapse them to near-instant feedback.</p><button className="button button--secondary" type="button" onClick={() => setMotionKey((value) => value + 1)}>Replay motion</button></div>
        <div className="design-system-motion__samples" key={motionKey}><BrandBang className="motion-pop" /><GameBadge tone="success" className="motion-rise">Answer locked</GameBadge><span className="design-system-shimmer motion-shimmer">Loading surface</span></div>
      </section>
    </main>
  )
}
