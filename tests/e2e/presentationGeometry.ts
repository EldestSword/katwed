import { expect, type Locator, type Page } from '@playwright/test'

export async function expectWideFontRevealToFit(page: Page, lastItem: Locator) {
  // Exercise wider fallback metrics as well as the native platform font. Keep
  // all content and its normal font size; do not turn overflow into clipping.
  const font = await page.addStyleTag({ content: '.presentation-stage .arrangement-result, .presentation-stage .connection-clues { font-family: monospace; }' })
  try {
    const box = (await lastItem.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(720)
  } finally {
    await font.evaluate(node => (node as unknown as { remove(): void }).remove())
  }
}
