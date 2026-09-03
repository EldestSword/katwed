import { useLayoutEffect, useRef, type ReactNode } from 'react'

const MIN_READABLE_FONT_SIZE_PX = 11.5
const MIN_READABLE_LETTER_SPACING_EM = -0.08
const EMERGENCY_SINGLE_WORD_LETTER_SPACING_EM = -0.16
const FIT_PASSES = 10

function contentFits(element: HTMLSpanElement): boolean {
  return element.scrollWidth <= element.clientWidth
}

function isSingleUnbrokenWord(element: HTMLSpanElement): boolean {
  const text = element.textContent?.trim() ?? ''
  return text.length > 0 && !/\s/.test(text)
}

export function FittedAnswerLabel({ children, onNeedsMoreWidth }: { children: ReactNode; onNeedsMoreWidth?(): void }) {
  const labelRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const label = labelRef.current
    if (!label) return
    let frame = 0
    let active = true
    let wideningRetry = 0

    const scheduleFit = () => {
      if (!active) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(fit)
    }

    const fit = () => {
      if (!active) return
      label.style.width = '100%'
      label.style.removeProperty('font-size')
      label.style.removeProperty('letter-spacing')
      const preferredSize = Number.parseFloat(window.getComputedStyle(label).fontSize)
      if (!Number.isFinite(preferredSize) || preferredSize <= MIN_READABLE_FONT_SIZE_PX || contentFits(label)) {
        label.dataset.answerFit = 'natural'
        return
      }

      let fittingSize = MIN_READABLE_FONT_SIZE_PX
      let overflowingSize = preferredSize
      label.style.fontSize = `${fittingSize}px`
      if (!contentFits(label)) {
        let fittingSpacing = MIN_READABLE_LETTER_SPACING_EM
        let overflowingSpacing = 0
        label.style.letterSpacing = `${fittingSpacing}em`
        if (!contentFits(label)) {
          const grid = label.closest('.answer-grid')
          if (grid?.getAttribute('data-answer-fit-wide') !== 'true' && onNeedsMoreWidth) {
            label.dataset.answerFit = 'widening'
            onNeedsMoreWidth()
            window.cancelAnimationFrame(wideningRetry)
            wideningRetry = window.requestAnimationFrame(() => {
              wideningRetry = window.requestAnimationFrame(fit)
            })
            return
          }

          if (isSingleUnbrokenWord(label)) {
            fittingSpacing = EMERGENCY_SINGLE_WORD_LETTER_SPACING_EM
            label.style.letterSpacing = `${fittingSpacing}em`
          }
          if (!contentFits(label)) {
            label.dataset.answerFit = 'minimum'
            return
          }
        }
        for (let pass = 0; pass < FIT_PASSES; pass += 1) {
          const candidateSpacing = (fittingSpacing + overflowingSpacing) / 2
          label.style.letterSpacing = `${candidateSpacing}em`
          if (contentFits(label)) fittingSpacing = candidateSpacing
          else overflowingSpacing = candidateSpacing
        }
        label.style.letterSpacing = `${fittingSpacing}em`
        if (!contentFits(label)) label.style.letterSpacing = `${fittingSpacing - 0.002}em`
        label.dataset.answerFit = contentFits(label) ? 'scaled' : 'minimum'
        return
      }

      for (let pass = 0; pass < FIT_PASSES; pass += 1) {
        const candidateSize = (fittingSize + overflowingSize) / 2
        label.style.fontSize = `${candidateSize}px`
        if (contentFits(label)) fittingSize = candidateSize
        else overflowingSize = candidateSize
      }

      label.style.fontSize = `${fittingSize}px`
      if (!contentFits(label)) label.style.fontSize = `${Math.max(MIN_READABLE_FONT_SIZE_PX, fittingSize - 0.02)}px`
      label.dataset.answerFit = contentFits(label) ? 'scaled' : 'minimum'
    }

    fit()
    const container = label.closest('.answer-tile__select') ?? label.parentElement
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFit)
    if (container) observer?.observe(container)
    void document.fonts?.ready.then(scheduleFit)

    return () => {
      active = false
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(wideningRetry)
      observer?.disconnect()
    }
  }, [children, onNeedsMoreWidth])

  return <span ref={labelRef} className="answer-tile__label answer-tile__label--fitted">{children}</span>
}
