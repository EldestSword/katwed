import { expect, test, type Locator, type Page } from '@playwright/test'

async function draw(page: Page, layer: Locator, points: Array<[number, number]>, touch: boolean) {
  await layer.scrollIntoViewIfNeeded()
  const box = await layer.boundingBox()
  if (!box) throw new Error('Image coordinate layer unavailable')
  const pixels = points.map(([x, y]) => ({ x: box.x + x * box.width, y: box.y + y * box.height }))
  if (touch) {
    const session = await page.context().newCDPSession(page)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pixels[0]] })
    for (const point of pixels.slice(1)) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await session.detach()
  } else {
    await page.mouse.move(pixels[0].x, pixels[0].y)
    await page.mouse.down()
    for (const point of pixels.slice(1)) await page.mouse.move(point.x, point.y, { steps: 8 })
    await page.mouse.up()
  }
}

test('Pinpoint authoring draws every shape and preserves saved coordinates across reload and resize', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('link', { name: 'Edit' }).click()
  const selectPinpoint = () => page.locator('.question-navigator').getByRole('button').filter({ hasText: 'Pinpoint the centre' }).click()
  await selectPinpoint()
  const editor = page.locator('.pinpoint-editor')
  const layer = editor.getByTestId('pinpoint-coordinate-layer')
  const overlay = editor.getByTestId('pinpoint-correct-target')
  await expect(overlay).toHaveAttribute('data-shape', 'circle')
  await expect(layer).toHaveCSS('touch-action', 'none')
  // A click in the surrounding contained-image letterbox must not alter a target.
  const before = await overlay.locator('circle').getAttribute('r')
  await editor.locator('.pinpoint-coordinate-surface').click({ position: { x: 2, y: 2 } })
  await expect(overlay.locator('circle')).toHaveAttribute('r', before!)

  await draw(page, layer, [[.5, .5], [.65, .5]], isMobile)
  await expect(overlay.locator('circle')).toHaveAttribute('r', /0\.1[45]/)
  await editor.getByRole('button', { name: 'Rectangle', exact: true }).click()
  await draw(page, layer, [[.2, .2], [.75, .7]], isMobile)
  await expect(overlay).toHaveAttribute('data-shape', 'rectangle')
  await expect(page.locator('.editor-preview').getByTestId('pinpoint-correct-target')).toHaveAttribute('data-shape', 'rectangle')

  await editor.getByRole('button', { name: 'Freehand', exact: true }).click()
  await draw(page, layer, [[.2, .2], [.8, .2], [.8, .4], [.4, .4], [.4, .8], [.2, .8], [.2, .2]], isMobile)
  await expect(overlay).toHaveAttribute('data-shape', 'polygon')
  const points = await overlay.locator('polygon').getAttribute('points')
  expect(points!.split(' ').length).toBeLessThanOrEqual(64)
  await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
  await expect(page.getByText('Quiz saved.')).toBeVisible()
  await page.reload()
  await selectPinpoint()
  await expect(overlay.locator('polygon')).toHaveAttribute('points', points!)
  await page.setViewportSize(isMobile ? { width: 480, height: 900 } : { width: 1180, height: 850 })
  await expect(overlay.locator('polygon')).toHaveAttribute('points', points!)
  await editor.scrollIntoViewIfNeeded()
  await editor.screenshot({ path: testInfo.outputPath('pinpoint-authoring.png') })
  expect(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)

  await editor.getByRole('button', { name: 'Clear area' }).click()
  await expect(overlay).toHaveCount(0)
  await editor.getByText(/Advanced settings/).click()
  await editor.getByRole('button', { name: 'Create freehand area with keyboard' }).click()
  await expect(overlay).toHaveAttribute('data-shape', 'polygon')
})
