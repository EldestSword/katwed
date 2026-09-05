import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import type { Quiz } from '../../src/types/domain'

async function section(page: Page, name: string) {
  const panel = page.locator('.question-settings-group').filter({ has: page.locator('summary', { hasText: name }) })
  if (await panel.getAttribute('open') === null) await panel.locator('summary').click()
}

test('RC editor creates and edits all ten formats, preserves shaped image previews and saves round moves', async ({ page, isMobile }, info) => {
  test.setTimeout(150_000)
  // Keep phone emulation at phone width so native focus does not pan a desktop layout.
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto('/host/login')
  await page.getByRole('button', { name: 'Enter demo host area' }).click()
  await expect(page.getByRole('article', { name: 'Katwed! Mixed Quiz' })).toBeVisible()
  await page.evaluate(() => {
    const key = 'katwed.demo.state.v2', data = JSON.parse(localStorage.getItem(key)!) as { quizzes: Quiz[] }
    const quiz = data.quizzes.find(q => q.id === 'quiz-mixed')!
    quiz.questions = []; localStorage.setItem(key, JSON.stringify(data))
  })
  await page.getByRole('article', { name: 'Katwed! Mixed Quiz' }).getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page.getByText('Choose from ten question formats.', { exact: true })).toBeVisible()
  const types = ['Single choice', 'Multiple select', 'True or false', 'Slider', 'Pinpoint', 'Typed answer', 'Ordering', 'Matching', 'Connections', 'Mash-up']
  for (const name of types) {
    await page.getByRole('button', { name: '+ Add', exact: true }).click()
    await page.getByRole('dialog', { name: 'Add question' }).getByRole('button', { name: new RegExp(name) }).click()
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill(`RC ${name}`)
    await page.getByLabel('Supporting text', { exact: true }).fill(`Edited ${name}`)
    if (name === 'Single choice' || name === 'Multiple select') {
      await page.getByLabel('Mark Option 1 correct', { exact: true }).check()
      if (name === 'Multiple select') await page.getByLabel('Mark Option 2 correct', { exact: true }).check()
    }
    if (name === 'Typed answer') await page.getByLabel('Primary answer', { exact: true }).fill('Alex')
    if (name === 'Connections') await page.getByLabel('Correct connection', { exact: true }).fill('Planets')
    if (name === 'True or false') await page.getByRole('combobox', { name: 'Correct answer', exact: true }).selectOption('false')
    if (name === 'Slider') { await page.getByLabel('step', { exact: true }).fill('0.5'); await page.getByLabel('correctValue', { exact: true }).fill('50.5') }
    if (name === 'Ordering') await page.getByLabel('Item 1', { exact: true }).fill('Edited first item')
    if (name === 'Matching') { await page.getByLabel('Left 1', { exact: true }).fill('Edited film'); await page.getByLabel('Right 1', { exact: true }).fill('Edited director') }
    if (name === 'Pinpoint' || name === 'Mash-up' || name === 'Single choice') {
      await section(page, 'Media & presentation')
      if (name === 'Single choice') await page.getByRole('group', { name: 'Media', exact: true }).getByRole('combobox', { name: 'Type', exact: true }).selectOption('image')
      const sizes = name === 'Single choice' ? [[600, 300], [300, 600], [400, 400]] : [[400, 400]]
      for (const [width, height] of sizes) {
        const buffer = await sharp({ create: { width, height, channels: 3, background: '#eecc66' } }).png().toBuffer()
        await page.getByLabel('Choose image', { exact: true }).setInputFiles({ name: `rc-${width}-${height}.png`, mimeType: 'image/png', buffer })
        const preview = page.locator('.editor-preview__media img').first()
        await expect(preview).toBeVisible()
        await expect(preview).toHaveCSS('object-fit', 'contain')
        await expect.poll(() => preview.evaluate(node => {
          const image = node as unknown as { naturalWidth: number; naturalHeight: number }
          return image.naturalWidth / image.naturalHeight
        })).toBe(width / height)
        const box = (await page.locator('.editor-preview__media').boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(120)
        const frame = (await page.locator('.question-preview-card').boundingBox())!
        const heading = (await page.locator('.question-preview-card h1').boundingBox())!
        const image = (await preview.boundingBox())!
        expect(heading.y).toBeGreaterThanOrEqual(frame.y)
        expect(image.y + image.height).toBeLessThanOrEqual(frame.y + frame.height)
      }
      if (name === 'Pinpoint') {
        const target = page.locator('.pinpoint-editor')
        await target.getByRole('button', { name: 'Freehand', exact: true }).click()
        await target.getByText(/Advanced settings/).click()
        await target.getByRole('button', { name: 'Create freehand area with keyboard' }).click()
        await expect(target.getByTestId('pinpoint-correct-target')).toHaveAttribute('data-shape', 'polygon')
      }
      if (name === 'Mash-up') {
        await page.getByRole('combobox', { name: 'Person 1', exact: true }).selectOption({ label: 'Alex' })
        await page.getByRole('combobox', { name: 'Person 2', exact: true }).selectOption({ label: 'Bailey' })
      }
      if (name === 'Single choice') {
        await page.getByRole('combobox', { name: 'Reveal effect', exact: true }).selectOption('blur')
        await page.getByLabel('Reveal duration', { exact: true }).fill('20')
        await section(page, 'Scoring')
        await page.getByLabel('First player to buzz gets the answer').check()
        await page.getByLabel('Score falls as the image becomes clearer').check()
        await expect(page.getByLabel('First player to buzz gets the answer')).toHaveCount(0)
        await expect(page.getByLabel('Score falls as the image becomes clearer')).toBeChecked()
      }
    }
    await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
    await expect(page.getByText('Quiz saved.', { exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Move question 9 up', exact: true }).click()
  await page.getByRole('button', { name: 'Move question 8 down', exact: true }).click()
  await page.getByRole('button', { name: 'Add round', exact: true }).click()
  await page.getByRole('combobox', { name: 'Round', exact: true }).selectOption({ label: 'Round 2' })
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('RC duplicate to delete')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Save quiz', exact: true }).first().click()
  await expect(page.getByText('Quiz saved.', { exact: true })).toBeVisible()
  await page.reload()
  const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('katwed.demo.state.v2')!) as { quizzes: Quiz[] }).quizzes.find(q => q.id === 'quiz-mixed')!)
  expect(new Set(saved.questions.map(q => q.type)).size).toBe(10)
  expect(saved.questions).toHaveLength(10)
  expect(saved.rounds).toHaveLength(2)
  expect(saved.questions.find(q => q.type === 'mashup')?.roundId).toBe(saved.rounds[1].id)
  for (const name of types) {
    await page.locator('.question-navigator').getByRole('button').filter({ hasText: `RC ${name}` }).click()
    await expect(page.getByRole('textbox', { name: 'Supporting text', exact: true })).toHaveValue(`Edited ${name}`)
  }
  expect(saved.questions[0].progressiveRevealEnabled).toBe(true)
  expect(saved.questions[0].buzzInEnabled).toBe(false)
  await page.screenshot({ path: info.outputPath('rc-all-types-editor.png'), fullPage: true })
})
