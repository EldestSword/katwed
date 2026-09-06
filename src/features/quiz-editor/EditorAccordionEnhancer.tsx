import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * The editor's question sections are intentionally native <details> elements.
 * This small route-scoped enhancer turns them into a focused accordion without
 * changing their keyboard semantics or moving any question state out of React.
 */
export function EditorAccordionEnhancer() {
  const location = useLocation()
  const editorRoute = /^\/host\/quizzes\/[^/]+\/edit$/u.test(location.pathname)

  useEffect(() => {
    if (!editorRoute) return

    let initialised = false
    const initialise = () => {
      const groups = [...document.querySelectorAll<HTMLDetailsElement>('.question-settings-group')]
      if (!groups.length || initialised) return
      initialised = true
      groups.forEach((group, index) => { group.open = index === 0 })
    }
    const frame = window.requestAnimationFrame(initialise)
    const observer = new MutationObserver(initialise)
    observer.observe(document.body, { childList: true, subtree: true })

    const onToggle = (event: Event) => {
      const current = event.target
      if (!(current instanceof HTMLDetailsElement) || !current.classList.contains('question-settings-group') || !current.open) return
      document.querySelectorAll<HTMLDetailsElement>('.question-settings-group').forEach((group) => {
        if (group !== current) group.open = false
      })
    }
    document.addEventListener('toggle', onToggle, true)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [editorRoute])

  return null
}
