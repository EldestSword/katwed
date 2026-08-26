import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/AppShell'

export function LandingPage() {
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    const code = roomCode.replace(/\D/g, '')
    if (code.length !== 6) {
      setError('Enter the six-digit room code.')
      return
    }
    void navigate(`/join?room=${code}`)
  }

  return (
    <main>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Live questions. Shared suspense. One room code.</p>
          <h1><Logo /> <span className="sr-only">live team quiz</span></h1>
          <p className="hero__lead">Run a lively multi-format quiz while everyone answers from their own device.</p>
          <form className="room-entry" onSubmit={submit} noValidate>
            <label htmlFor="landing-room">Room code</label>
            <div className="room-entry__row">
              <input id="landing-room" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={roomCode} onChange={(event) => { setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                placeholder="123456" aria-invalid={Boolean(error)} aria-describedby={error ? 'landing-error' : undefined} />
              <button className="button button--primary" type="submit">Join game</button>
            </div>
            {error && <p id="landing-error" className="field-error" role="alert">{error}</p>}
          </form>
          <Link className="text-link" to="/host">I’m hosting the quiz →</Link>
        </div>
        <div className="odd-face" aria-hidden="true"><i /><i /><b /></div>
      </section>
      <section className="how-it-works" aria-labelledby="how-title">
        <p className="eyebrow">The wonderfully strict rule</p>
        <h2 id="how-title">Exactly two. Both correct. No half points.</h2>
        <div className="steps">
          <article><span>1</span><h3>Join quickly</h3><p>Enter the room code on any phone, tablet or computer.</p></article>
          <article><span>2</span><h3>Answer clearly</h3><p>Choose, slide, pinpoint or solve the original two-person mash-up.</p></article>
          <article><span>3</span><h3>Share the reveal</h3><p>Follow results and standings on a clean presentation screen.</p></article>
        </div>
      </section>
    </main>
  )
}
