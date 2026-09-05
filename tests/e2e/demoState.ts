import { expect, type Page } from '@playwright/test'
import type { GameSession } from '../../src/types/domain'

export async function waitForDemoLobby(page: Page): Promise<GameSession> {
  // Start lobby awaits the Demo write lock and repository persistence before
  // navigating. A dispatched click alone does not prove either has completed.
  await expect(page).toHaveURL(/\/host\/game\/[^/]+\/control$/)
  const sessionId = page.url().split('/').at(-2)
  const read = () => page.evaluate(id => {
    const state = JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { sessions: GameSession[] }
    return state.sessions.find(session => session.id === id)
  }, sessionId)
  await expect.poll(async () => (await read())?.phase).toBe('lobby')
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
  return (await read())!
}
