import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import '../styles/landing.css'

type IconName = 'arrow' | 'spark' | 'phone' | 'screen' | 'trophy' | 'people' | 'heart' | 'check'

function HomeIcon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    arrow: 'M5 12h14M13 6l6 6-6 6',
    spark: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z',
    phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM10 18h4',
    screen: 'M3 3h18v13H3V3ZM8 21h8M12 16v5',
    trophy: 'M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v6M8 21h8',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 7M19 15a5 5 0 0 1 3 5v1',
    heart: 'M12 21 3.6 12.6A5.7 5.7 0 0 1 12 5a5.7 5.7 0 0 1 8.4 7.6L12 21Z',
    check: 'm5 12 4 4L19 6',
  }
  return <svg className={`kw-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}

const FORMAT_NAMES = ['Single Choice', 'Multiple Select', 'True / False', 'Slider', 'Pinpoint', 'Typed Answer', 'Mash-up', 'Ordering', 'Matching', 'Connections']
const EXAMPLE_CLUES = ['Mercury', 'Venus', 'Earth', 'Mars']

/** An entirely local illustration, deliberately independent of live game state. */
function ConnectionsPreview() {
  const [clueCount, setClueCount] = useState(2)
  const [revealed, setRevealed] = useState(false)
  const points = 250 * (5 - clueCount)

  function advancePreview() {
    if (revealed) { setClueCount(2); setRevealed(false) }
    else if (clueCount < EXAMPLE_CLUES.length) setClueCount(clueCount + 1)
    else setRevealed(true)
  }

  return (
    <div className="kw-showcase">
      <div className="kw-showcase__halo" aria-hidden="true" />
      <div className="kw-stage">
        <div className="kw-stage__top"><span className="kw-stage__wordmark">Katwed<span>!</span></span><span className="kw-stage__example"><i /> EXAMPLE ROUND</span></div>
        <div className="kw-stage__body">
          <div className="kw-stage__type"><HomeIcon name="spark" /> CONNECTIONS</div>
          <h2>Four clues.<br />One connection.</h2>
          <p className="kw-stage__instruction">The sooner you know, the more you score.</p>
          <div className="kw-clues" aria-label="Example Connections clues">
            {EXAMPLE_CLUES.map((clue, index) => (
              <div key={clue} className={`kw-clue ${index < clueCount || revealed ? 'kw-clue--open' : ''}`}>
                <span className="kw-clue__number">0{index + 1}</span>
                <span>{index < clueCount || revealed ? clue : <span aria-label="Unrevealed clue">?</span>}</span>
                {(index < clueCount || revealed) && <HomeIcon name="check" />}
              </div>
            ))}
          </div>
          <div className="kw-stage__bottom">
            <div className="kw-stage__value" aria-live="polite" aria-atomic="true">
              <span>{revealed ? 'THE CONNECTION' : 'POINTS AVAILABLE'}</span>
              <strong>{revealed ? 'Planets' : points}<small>{!revealed && ' pts'}</small></strong>
            </div>
            <button type="button" className="kw-preview-button" onClick={advancePreview}>
              {revealed ? 'Try again' : clueCount < EXAMPLE_CLUES.length ? 'Reveal next clue' : 'Show connection'}<HomeIcon name="arrow" />
            </button>
          </div>
        </div>
      </div>
      <div className="kw-showcase__caption"><span className="kw-caption-line" />Try the preview. Imagine the room.<span className="kw-caption-line" /></div>
      <div className="kw-showcase__stamp" aria-hidden="true"><HomeIcon name="spark" /><span>LESS GUESSWORK.<br />MORE GAME SHOW.</span></div>
    </div>
  )
}

export function LandingPage() {
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const roomInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    const code = roomCode.replace(/\D/g, '')
    if (code.length !== 6) {
      setError('Enter the six-digit room code.')
      roomInput.current?.focus()
      return
    }
    void navigate(`/join?room=${code}`)
  }

  function updateCode(value: string) {
    setRoomCode(value.replace(/\D/g, '').slice(0, 6))
    setError('')
  }

  return (
    <main className="kw-home" id="main-content">
      <section className="kw-hero kw-wrap" aria-labelledby="kw-hero-title">
        <div className="kw-hero__copy">
          <p className="kw-eyebrow"><span className="kw-eyebrow__dash" />THE LIVE QUIZ PLATFORM</p>
          <h1 id="kw-hero-title">Bring your<br /><span>A-game.</span><HomeIcon name="spark" className="kw-hero__spark" /></h1>
          <p className="kw-hero__lead">Your questions. Your people. A little friendly rivalry.</p>
          <p className="kw-hero__description">Turn any get-together into a live game show. You take the controls. Everyone else plays from their phone.</p>
          <form className="kw-join" id="join-game" onSubmit={submit} noValidate aria-label="Join a game">
            <label htmlFor="landing-room">Got a room code? You’re in.</label>
            <div className="kw-join__row">
              <input ref={roomInput} id="landing-room" name="room" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={roomCode}
                onChange={(event) => updateCode(event.target.value)}
                onPaste={(event) => { event.preventDefault(); updateCode(event.clipboardData.getData('text')) }}
                placeholder="123456" aria-label="Room code" aria-invalid={Boolean(error)} aria-describedby={error ? 'landing-error' : 'landing-room-help'} />
              <button className="kw-button kw-button--ink" type="submit">Join game<HomeIcon name="arrow" /></button>
            </div>
            {error ? <p id="landing-error" className="kw-join__error" role="alert">{error}</p> : <p id="landing-room-help" className="kw-join__help">Six digits. No player account needed.</p>}
          </form>
          <Link className="kw-host-link" to="/host">Taking the lead? <strong>Host a game</strong><HomeIcon name="arrow" /></Link>
        </div>
        <ConnectionsPreview />
      </section>

      <div className="kw-proof kw-wrap" aria-label="At a glance">
        <span><HomeIcon name="spark" /><strong>10</strong> question formats</span>
        <span><HomeIcon name="screen" />Made for the big screen</span>
        <span><HomeIcon name="phone" />Played on your phone</span>
        <span className="kw-proof__last">One room code. Everyone in.</span>
      </div>

      <section className="kw-modes kw-wrap" aria-labelledby="kw-modes-title">
        <div className="kw-section-head">
          <div><p className="kw-eyebrow">THE SAME PEOPLE. A DIFFERENT GAME.</p><h2 id="kw-modes-title">Pick your kind<br />of competitive.</h2></div>
          <p>A straight points race. A team effort. Or last player standing. Your quiz sets the scene. You choose the stakes.</p>
        </div>
        <div className="kw-mode-grid">
          <article className="kw-mode kw-mode--points">
            <div className="kw-mode__heading"><HomeIcon name="trophy" /><span>01 / POINTS</span></div>
            <div className="kw-mini-ranks" aria-hidden="true"><div><span>01</span><i /><b>2,450</b></div><div><span>02</span><i /><b>2,100</b></div><div><span>03</span><i /><b>1,850</b></div></div>
            <h3>Every answer counts.</h3><p>Climb the leaderboard, build a streak and chase the top spot. A classic quiz with a proper finish.</p>
          </article>
          <article className="kw-mode kw-mode--teams">
            <div className="kw-mode__heading"><HomeIcon name="people" /><span>02 / TEAMS</span></div>
            <div className="kw-mini-teams" aria-hidden="true"><div><i /><i /><i /><span>YOUR TEAM</span></div><b>vs</b><div><i /><i /><i /><span>THE RIVALS</span></div></div>
            <h3>Better together.</h3><p>Everyone answers on their own phone. Every individual score contributes to the team total.</p>
          </article>
          <article className="kw-mode kw-mode--survivor">
            <div className="kw-mode__heading"><HomeIcon name="heart" /><span>03 / SURVIVOR</span></div>
            <div className="kw-mini-lives" aria-hidden="true"><HomeIcon name="heart" /><HomeIcon name="heart" /><HomeIcon name="heart" /><span>MAKE EVERY LIFE COUNT</span></div>
            <h3>Stay in the game.</h3><p>Start with one or three lives. A wrong or missed ordinary answer costs a life. How far will you get?</p>
          </article>
        </div>
        <p className="kw-duel"><span>Just the two of you?</span> Head-to-Head brings its own one-on-one rivalry.<Link to="/host">Settle it here<HomeIcon name="arrow" /></Link></p>
      </section>

      <section className="kw-variety kw-wrap" aria-labelledby="kw-variety-title">
        <div className="kw-variety__formats"><p className="kw-eyebrow">KEEP THEM GUESSING</p><h2 id="kw-variety-title">More than<br />multiple choice.</h2><p>Put it in order. Match the pairs. Pinpoint the place.<br className="kw-desktop-break" /> Find the connection. Mix things up, round after round.</p>
          <ul className="kw-format-list" aria-label="Question formats">{FORMAT_NAMES.map((format) => <li key={format}>{format}</li>)}</ul>
        </div>
        <div className="kw-variety__twists">
          <div className="kw-powerups" aria-hidden="true"><span><b>×2</b>DOUBLE UP</span><span><b>50<span>/</span>50</b>FIFTY-FIFTY</span><span><b>−5<small>s</small></b>FAST FIVE</span></div>
          <p className="kw-eyebrow">A LITTLE TACTICAL ADVANTAGE</p><h3>Know when to<br />make your move.</h3><p>Optional power-ups. Well-timed wagers. First-to-buzz questions. Add a twist when the occasion calls for it.</p>
          <span className="kw-variety__note">You choose the extras. The quiz stays yours.</span>
        </div>
      </section>

      <section className="kw-how" id="how-it-works" aria-labelledby="kw-how-title">
        <div className="kw-wrap"><div className="kw-section-head"><div><p className="kw-eyebrow">FROM “FANCY A QUIZ?” TO GAME ON.</p><h2 id="kw-how-title">You host.<br />Everyone plays.</h2></div><p>One private control screen for you. One presentation for the room. A place in the game for every phone.</p></div>
          <div className="kw-steps">
            <article><span className="kw-steps__number">01</span><h3>Make it your quiz.</h3><p>Create your questions, arrange your rounds and choose a look that sets the mood.</p></article>
            <article><span className="kw-steps__number">02</span><h3>Take the big screen.</h3><p>Open the presentation on a shared display or share its window on your video call. Keep the host controls to yourself.</p></article>
            <article><span className="kw-steps__number">03</span><h3>Bring everyone in.</h3><p>Share the room code. Players join in their browser, lock in their answers and watch the standings unfold.</p></article>
          </div>
        </div>
      </section>

      <section className="kw-finale kw-wrap" aria-labelledby="kw-finale-title"><HomeIcon name="spark" /><p className="kw-eyebrow">THE ROOM IS YOURS</p><h2 id="kw-finale-title">Shall we make<br />it interesting?</h2><Link className="kw-button kw-button--lilac" to="/host">Host a game<HomeIcon name="arrow" /></Link><a className="kw-finale__join" href="#join-game">Already have a code? Join a game.</a></section>
      <footer className="kw-footer kw-wrap"><Link to="/" aria-label="Katwed home"><Logo /></Link><p>Built for questions. Made for competition.</p><a href="#join-game">Back to the game<HomeIcon name="arrow" /></a></footer>
    </main>
  )
}
