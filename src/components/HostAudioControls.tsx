import { useAudioPreferences } from '../hooks/useAudioPreferences'
import { getSoundPack } from '../features/audio/soundPacks'
import type { SoundPackId } from '../types/domain'

export function HostAudioControls({ soundPackId }: { soundPackId: SoundPackId }) {
  const [preferences, update] = useAudioPreferences()
  const pack = getSoundPack(soundPackId)
  const disabled = pack.id === 'none'

  return (
    <section className="host-audio-controls" aria-labelledby="host-audio-heading">
      <div className="controller-section-heading">
        <h2 id="host-audio-heading">Presentation audio</h2>
        <span>{pack.name}</span>
      </div>
      <button
        className={`button button--secondary button--compact${preferences.muted ? ' is-muted' : ''}`}
        type="button"
        aria-pressed={preferences.muted}
        disabled={disabled}
        onClick={() => update({ ...preferences, muted: !preferences.muted })}
      >{preferences.muted ? 'Unmute' : 'Mute'}</button>
      <label>
        <span>Music <output>{Math.round(preferences.musicVolume * 100)}%</output></span>
        <input aria-label="Music volume" type="range" min="0" max="100" step="5" value={Math.round(preferences.musicVolume * 100)} disabled={disabled} onChange={(event) => update({ ...preferences, musicVolume: Number(event.target.value) / 100 })} />
      </label>
      <label>
        <span>Effects <output>{Math.round(preferences.effectsVolume * 100)}%</output></span>
        <input aria-label="Effects volume" type="range" min="0" max="100" step="5" value={Math.round(preferences.effectsVolume * 100)} disabled={disabled} onChange={(event) => update({ ...preferences, effectsVolume: Number(event.target.value) / 100 })} />
      </label>
      <p>{disabled ? 'This quiz is configured without shared audio.' : 'If sound is blocked, use Enable sound in the Presentation window.'}</p>
    </section>
  )
}
