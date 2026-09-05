import type { LaunchGameSettings, SurvivorStartingLives } from '../../types/domain'

export function SurvivorSetup({ settings, onChange }: {
  settings: LaunchGameSettings
  onChange(settings: LaunchGameSettings): void
}) {
  const survivor = settings.competitionMode === 'survivor'
  const teams = settings.playMode === 'teams'
  return <fieldset className="survivor-setup">
    <legend>Game mode</legend>
    <p>Choose how this session is won. The saved quiz stays unchanged.</p>
    <div className="team-choice-grid">
      <button type="button" aria-pressed={!survivor} onClick={() => onChange({ ...settings, competitionMode: 'points' })}>Points</button>
      <button type="button" aria-pressed={survivor} disabled={teams}
        onClick={() => onChange({ ...settings, competitionMode: 'survivor', survivorStartingLives: settings.survivorStartingLives ?? 3 })}>Survivor</button>
    </div>
    {teams && <p className="setting-guidance">Survivor V1 is for individual play.</p>}
    {survivor && <div className="survivor-lives-choice">
      <h3>Starting lives</h3>
      <p>A wrong, partial or missed ordinary answer costs one life.</p>
      <div className="team-choice-grid">
        {([1, 3] as SurvivorStartingLives[]).map((lives) => <button type="button" key={lives}
          aria-pressed={(settings.survivorStartingLives ?? 3) === lives}
          onClick={() => onChange({ ...settings, survivorStartingLives: lives })}>{lives} {lives === 1 ? 'life' : 'lives'}</button>)}
      </div>
    </div>}
  </fieldset>
}
